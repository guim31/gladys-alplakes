// -----------------------------------------------------------------------------
// The monitor: which lakes and points are followed, their model series, the
// states published to Gladys and the scene trigger. Everything the SDK
// handlers, the action and the widget need goes through it (src/app.js).
//
// Followed: the lakes and points of the configuration (MAX_LAKES and MAX_POINTS
// at most), plus every lake or point whose device the user created (deleting
// the device stops following it).
//
// Scheduling: the devices are published with should_poll: false (the core does
// not poll external devices reliably, GladysAssistant/Gladys#3198). A tick runs
// every hour: it computes the values at the current time from the series kept
// (the models give one value every 3 hours, past and forecast) and publishes
// what changed. Alplakes is asked again only every 3 hours (the pace of the
// models), one request per lake or point, spaced out; the catalogue of lakes
// once a day. A failed request keeps the last series: a forecast stays usable
// for days, and the values stop when it runs out.
//
// Trigger `threshold_crossed`: the temperature now, or the maximum of the next
// 48 hours, reaches a whole degree between 10 and 28 °C, or falls back 0.3 °C
// below it (hysteresis: a value hovering around 20 °C fires once).
//
// Logs: at info, only the lifecycle (start, lakes followed, Alplakes lost and
// back). A failure that repeats is logged once, then at debug until it
// recovers. LOG_LEVEL=debug shows every tick.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';
import { MAX_LAKES, MAX_POINTS } from './config.js';
import { Alplakes, MAX_POINT_DISTANCE_M, findLakes } from './alplakes.js';
import {
  DEVICE_TYPES,
  buildDevice,
  pointId,
  targetIds,
  targetKey,
  targetName,
  targetOfId,
} from './devices.js';
import { HOUR, summarize } from './forecast.js';
import { STATUS, join, render } from './messages.js';

const logger = createLogger({ name: 'alplakes' });

export const WIDGET_KEY = 'lakes';
export const TRIGGERS = { THRESHOLD_CROSSED: 'threshold_crossed' };
export const SERIES = ['current', 'forecast_48h'];
// Whole degrees offered by the trigger filter: from cool to very warm water.
export const THRESHOLDS = Array.from({ length: 19 }, (_, i) => 10 + i);
export const HYSTERESIS = 0.3;

export const DEFAULT_TIMINGS = {
  tickMs: HOUR,
  // Alplakes is asked again after this (the models run every 3 hours).
  fetchMs: 3 * HOUR,
  catalogueMs: 24 * HOUR,
  // Between two requests of one refresh: the API is rate-limited per client.
  gapMs: 1000,
  // The window asked: 6 hours back (to interpolate now), 54 hours ahead.
  pastMs: 6 * HOUR,
  aheadMs: 54 * HOUR,
  // An unchanged value is published again after this (the front shows "no
  // recent value" after 48 hours).
  heartbeatMs: 12 * HOUR,
  // The side of a threshold older than this is forgotten (a long stop must not
  // fire every crossing at restart).
  memoryMs: 12 * HOUR,
  widgetRefreshMs: 10 * 1000,
};

const FEATURE_VALUES = {
  temperature: 'current',
  max_24h: 'max24',
  max_48h: 'max48',
  trend_24h: 'trend24',
};

// HTTP statuses of a lake or a period the model does not have: the target's
// problem, not an outage of Alplakes.
const NO_DATA_STATUSES = new Set([400, 404, 422]);

export class Monitor {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK fake)
   * @param {object} options.store see src/store.js
   * @param {Function} [options.fetch] fetch, for Alplakes
   * @param {boolean} [options.timers] false: no background timer (tests drive the ticks)
   * @param {Function} [options.now] clock in ms
   * @param {object} [options.timings] overrides of DEFAULT_TIMINGS
   */
  constructor({ gladys, store, fetch: fetchImpl, timers = true, now, timings }) {
    this.gladys = gladys;
    this.store = store;
    this.api = new Alplakes({ fetch: fetchImpl });
    this.timers = timers;
    this.now = now ?? (() => Date.now());
    this.timings = { ...DEFAULT_TIMINGS, ...timings };
    this.config = null;
    this.data = emptyData();
    this.catalogue = null;
    this.targets = new Map();
    this.problems = emptyProblems();
    this.statusMessage = undefined;
    this.tickTimer = null;
    this.running = null;
    this.rerun = null;
    this.lastRefreshAt = -Infinity;
    this.refreshTimer = null;
    this.stopped = false;
    this.failing = new Set();
  }

  /** Log a failure once (warn or error), then at debug until `recovered(key)`. */
  failed(key, level, message, err) {
    const details = err ? [message, err] : [message];
    if (this.failing.has(key)) {
      logger.debug(...details);
      return;
    }
    this.failing.add(key);
    logger[level](...details);
  }

  /** One line when a failure logged by `failed(key)` is over. */
  recovered(key, message) {
    if (this.failing.delete(key)) {
      logger.info(message);
    }
  }

  // --- Lifecycle ---------------------------------------------------------------

  async start(config) {
    this.config = config;
    const saved = await this.store.load();
    if (saved?.version === 1) {
      this.data = { ...emptyData(), ...saved };
    }
    // Scheduled first: a failure below must not leave the integration without ticks.
    this.schedule();
    await this.runTick();
    logger.info(`Started: ${this.targets.size} lake(s) or point(s) followed`);
  }

  /** Reconnection: Gladys may have restarted, publish everything again. */
  async resync(config) {
    this.config = config;
    if (!this.tickTimer) {
      this.schedule();
    }
    await this.publishDiscovered();
    this.statusMessage = undefined;
    await this.updateConnectionStatus();
    this.gladys.forgetPublishedStates?.();
    await this.publishStates(this.createdKeys());
    this.requestRefresh();
  }

  async reconfigure(config) {
    const before = [...this.targets.keys()].join(',');
    const depthChanged = this.config && this.config.depth !== config.depth;
    this.config = config;
    if (depthChanged) {
      // The series of the old depth are worthless: ask everything again.
      this.data.forecasts = {};
      this.data.sides = {};
    }
    // A tick already running reads the old configuration: run another one after it.
    await this.runTick({ again: true });
    const after = [...this.targets.keys()];
    if (after.join(',') !== before) {
      logger.info(`Configuration saved: ${after.length} lake(s) or point(s) followed`);
    }
    this.requestRefresh();
  }

  async stop() {
    this.stopped = true;
    clearInterval(this.tickTimer);
    clearTimeout(this.refreshTimer);
    this.tickTimer = null;
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    if (!this.timers || this.stopped) {
      return;
    }
    clearInterval(this.tickTimer);
    this.tickTimer = setInterval(() => this.runTick(), this.timings.tickMs);
    this.tickTimer.unref?.();
  }

  save() {
    return this.store.save(this.data);
  }

  // --- Catalogue and targets -----------------------------------------------------

  /** The catalogue of lakes, downloaded again once a day; null if never obtained. */
  async ensureCatalogue({ force = false } = {}) {
    const now = this.now();
    if (!this.catalogue && this.data.catalogue?.lakes) {
      this.catalogue = new Map(this.data.catalogue.lakes.map((lake) => [lake.key, lake]));
    }
    const age = now - (this.data.catalogue?.at ?? -Infinity);
    if (this.catalogue && !force && age < this.timings.catalogueMs) {
      return this.catalogue;
    }
    try {
      const catalogue = await this.api.catalogue(now);
      if (catalogue.size > 0) {
        this.catalogue = catalogue;
        this.data.catalogue = { at: now, lakes: [...catalogue.values()] };
      }
      this.recovered('catalogue', 'The list of Alplakes lakes is available again');
    } catch (err) {
      // An old catalogue stays good: lakes are rarely added or removed.
      this.failed(
        'catalogue',
        'warn',
        `Cannot download the list of Alplakes lakes: ${err.message}`,
      );
    }
    return this.catalogue;
  }

  /** Keys of the targets whose device exists in Gladys. */
  createdKeys() {
    return (this.gladys.devices ?? [])
      .map((device) => targetOfId(this.gladys, device.external_id))
      .filter(Boolean)
      .map(targetKey);
  }

  isCreated(key) {
    return this.createdKeys().includes(key);
  }

  /** The Gladys device of a target, if created. */
  device(key) {
    const target = this.targets.get(key) ?? this.data.known[key];
    if (!target) {
      return null;
    }
    const deviceId = targetIds(this.gladys, target).device;
    return (this.gladys.devices ?? []).find((device) => device.external_id === deviceId) ?? null;
  }

  /** The name shown for a target: its name in Gladys, else the lake's. */
  displayName(key, language = this.config.language) {
    const target = this.targets.get(key) ?? this.data.known[key];
    return this.device(key)?.name || (target ? targetName(target, language) : key);
  }

  /** The lakes and points of the configuration, then the created devices. */
  resolveTargets() {
    const problems = emptyProblems();
    problems.invalidPoint = [...this.config.invalidPoints];
    const targets = new Map();
    const add = (target) => targets.set(targetKey(target), target);
    const catalogue = this.catalogue;
    if (catalogue) {
      let lakes = 0;
      for (const name of this.config.lakes) {
        const found = findLakes(catalogue, name);
        if (found.length === 0) {
          problems.unknown.push(name);
        } else if (found.length > 1) {
          problems.ambiguous.push(name);
        } else if (lakes >= MAX_LAKES) {
          problems.tooMany = true;
        } else {
          lakes += 1;
          const lake = found[0];
          add({
            type: DEVICE_TYPES.LAKE,
            id: lake.key,
            lake: lake.key,
            model: 'simstrat',
            names: lake.names,
          });
        }
      }
      let points = 0;
      for (const point of this.config.points) {
        const found = findLakes(catalogue, point.lake);
        const models = new Set(found.map((lake) => lake.model3d?.key ?? null));
        const label = `${point.lake}: ${point.lat}, ${point.lng}`;
        if (found.length === 0) {
          problems.unknown.push(point.lake);
        } else if (models.has(null)) {
          // A basin of a lake with a 3D model ("Zurich") is fine: one model for all.
          if (found.length > 1) {
            problems.ambiguous.push(point.lake);
          } else {
            problems.no3d.push(point.lake);
          }
        } else if (models.size > 1) {
          problems.ambiguous.push(point.lake);
        } else if (points >= MAX_POINTS) {
          problems.tooMany = true;
        } else {
          points += 1;
          const { model3d, lakeNames } = found[0];
          add({
            type: DEVICE_TYPES.POINT,
            id: pointId(model3d.key, point.lat, point.lng),
            lake: model3d.key,
            model: model3d.model,
            names: lakeNames,
            lat: point.lat,
            lng: point.lng,
            label: point.label,
            source: label,
          });
        }
      }
    }
    // Created devices stay followed, rebuilt from what is known of them.
    for (const device of this.gladys.devices ?? []) {
      const target = targetOfId(this.gladys, device.external_id);
      if (!target || targets.has(targetKey(target))) {
        continue;
      }
      const known = this.data.known[targetKey(target)];
      const param = (name) => device.params?.find((p) => p.name === name)?.value;
      if (known) {
        add(known);
      } else if (target.type === DEVICE_TYPES.LAKE) {
        const lake = catalogue?.get(target.id);
        add({ ...target, lake: target.id, model: 'simstrat', names: lake?.names ?? null });
      } else if (param('LAKE') && param('MODEL')) {
        add({
          ...target,
          lake: param('LAKE'),
          model: param('MODEL'),
          names: null,
          lat: Number(param('LATITUDE')),
          lng: Number(param('LONGITUDE')),
          label: device.name ?? null,
        });
      }
    }
    for (const [key, target] of targets) {
      this.data.known[key] = target;
    }
    // Forget what belongs to targets no longer followed.
    for (const map of [this.data.known, this.data.forecasts, this.data.sides]) {
      for (const key of Object.keys(map)) {
        if (!targets.has(key)) {
          delete map[key];
        }
      }
    }
    this.targets = targets;
    this.problems = { ...problems, offLake: this.problems.offLake, noData: this.problems.noData };
  }

  // --- Discovery and connection status --------------------------------------------

  discoveredDevices() {
    return [...this.targets.values()]
      .filter((target) => !this.problems.offLake.includes(targetKey(target)))
      .map((target) => buildDevice(this.gladys, target, this.config.language));
  }

  async publishDiscovered() {
    await this.gladys.publishDiscoveredDevices(this.discoveredDevices());
  }

  async updateConnectionStatus() {
    const p = this.problems;
    const names = (keys) => keys.map((key) => this.displayName(key)).join(', ');
    const parts = [];
    const down = this.failing.has('readings') || !this.catalogue;
    if (down) {
      parts.push(render(STATUS, 'down'));
    }
    const lists = [
      ['unknown', p.unknown.join(', ')],
      ['ambiguous', p.ambiguous.join(', ')],
      ['invalidPoint', p.invalidPoint.join(' ; ')],
      ['no3d', p.no3d.join(', ')],
      ['offLake', names(p.offLake.filter((key) => this.targets.has(key)))],
      ['noData', names(p.noData.filter((key) => this.targets.has(key)))],
    ];
    for (const [key, text] of lists) {
      if (text) {
        parts.push(render(STATUS, key, { names: text }));
      }
    }
    if (p.tooMany) {
      parts.push(render(STATUS, 'tooMany', { max: Math.min(MAX_LAKES, MAX_POINTS) }));
    }
    const configured = this.config.lakes.length + this.config.points.length;
    if (this.catalogue && this.targets.size === 0 && configured === 0) {
      parts.push(render(STATUS, 'none'));
    }
    const message = parts.length > 0 ? join(...parts) : undefined;
    const connected = !down;
    const key = JSON.stringify([connected, message]);
    if (key === this.statusMessage) {
      return;
    }
    this.statusMessage = key;
    await this.gladys.setConnectionStatus(connected, message).catch(() => {});
  }

  // --- Gladys events ---------------------------------------------------------------

  async onDeviceCreated(device) {
    const target = targetOfId(this.gladys, device.external_id);
    if (!target) {
      return;
    }
    const key = targetKey(target);
    if (!this.targets.has(key) || !this.data.forecasts[key]) {
      // Not followed yet (a device kept from an older configuration) or no series yet.
      await this.runTick({ again: true });
    }
    // The SDK forgot the states of the device: everything is published again.
    await this.publishStates([key]);
    this.requestRefresh();
  }

  async onDeviceDeleted() {
    // A target only followed through its device is no longer followed.
    await this.runTick({ again: true });
    this.requestRefresh();
  }

  /** onPoll fallback: should_poll is false, but a Gladys polling anyway gets an answer. */
  async poll(device) {
    const target = targetOfId(this.gladys, device.external_id);
    if (target) {
      await this.publishStates([targetKey(target)]);
    }
  }

  // --- Ticks -------------------------------------------------------------------------

  /** Run a tick; `again`: if one is running, run a new one once it is over. */
  runTick({ again = false } = {}) {
    if (this.stopped) {
      return this.running;
    }
    if (this.running) {
      if (again) {
        this.rerun ??= this.running.then(() => {
          this.rerun = null;
          return this.runTick();
        });
        return this.rerun;
      }
      return this.running;
    }
    this.running = this.tick()
      .then(() => this.recovered('tick', 'Refresh works again'))
      .catch((err) => this.failed('tick', 'error', 'Refresh failed', err))
      .finally(() => {
        this.running = null;
      });
    return this.running;
  }

  async tick() {
    const before = JSON.stringify(this.discoveredDevices());
    await this.ensureCatalogue();
    this.resolveTargets();
    await this.fetchDue();
    if (JSON.stringify(this.discoveredDevices()) !== before) {
      await this.publishDiscovered();
    }
    const created = this.createdKeys();
    await this.publishStates(created);
    const changed = await this.thresholdEvents(created);
    await this.updateConnectionStatus();
    await this.save();
    logger.debug(`Tick: ${this.targets.size} lake(s) or point(s)`);
    if (changed) {
      this.requestRefresh();
    }
  }

  /** Ask Alplakes again for the targets whose series is older than 3 hours (or missing). */
  async fetchDue() {
    const now = this.now();
    // A minute of slack: the hourly ticks drift by a few milliseconds.
    const due = [...this.targets.entries()].filter(([key]) => {
      const forecast = this.data.forecasts[key];
      return !forecast || now - forecast.at >= this.timings.fetchMs - 60000;
    });
    if (due.length === 0) {
      return;
    }
    // Rounded to the hour: the same window for every target of a refresh.
    const from = Math.floor((now - this.timings.pastMs) / HOUR) * HOUR;
    const to = Math.ceil((now + this.timings.aheadMs) / HOUR) * HOUR;
    let outages = 0;
    for (const [index, [key, target]] of due.entries()) {
      if (index > 0 && this.timings.gapMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, this.timings.gapMs));
      }
      try {
        const depth = this.config.depth;
        let series;
        if (target.type === DEVICE_TYPES.LAKE) {
          series = await this.api.lakeSeries(target.lake, depth, from, to);
        } else {
          const answer = await this.api.pointSeries(
            { model: target.model, key: target.lake },
            depth,
            target.lat,
            target.lng,
            from,
            to,
          );
          const off = answer.distance !== null && answer.distance > MAX_POINT_DISTANCE_M;
          this.note('offLake', key, off);
          series = off ? [] : answer.series;
        }
        this.note('noData', key, series.length === 0 && !this.problems.offLake.includes(key));
        if (series.length > 0) {
          this.data.forecasts[key] = { at: now, series };
        }
        this.recovered(`target:${key}`, `${this.displayName(key, 'en')}: temperatures again`);
      } catch (err) {
        if (NO_DATA_STATUSES.has(err.status)) {
          this.note('noData', key, true);
          this.failed(`target:${key}`, 'warn', `${this.displayName(key, 'en')}: ${err.message}`);
        } else {
          outages += 1;
          logger.debug(`${this.displayName(key, 'en')}: ${err.message}`);
        }
      }
    }
    if (outages === due.length) {
      this.failed('readings', 'warn', 'Alplakes unreachable: the last forecasts are kept');
    } else {
      this.recovered('readings', 'Alplakes answers again');
    }
  }

  /** Adds or removes a target from a problem list. */
  note(problem, key, present) {
    const list = this.problems[problem].filter((item) => item !== key);
    this.problems[problem] = present ? [...list, key] : list;
  }

  // --- Values, states, triggers ---------------------------------------------------------

  /** The values of a target now: { current, max24, max48, trend24 } (nulls if unknown). */
  summary(key) {
    const series = this.data.forecasts[key]?.series ?? [];
    return summarize(series, this.now());
  }

  statesOf(keys) {
    const states = [];
    for (const key of keys) {
      const target = this.targets.get(key);
      if (!target || !this.isCreated(key)) {
        continue;
      }
      const ids = targetIds(this.gladys, target);
      const summary = this.summary(key);
      for (const [feature, field] of Object.entries(FEATURE_VALUES)) {
        if (summary[field] !== null) {
          states.push({ device_feature_external_id: ids[feature], state: summary[field] });
        }
      }
    }
    return states;
  }

  async publishStates(keys) {
    const states = this.statesOf(keys);
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishChangedStates(states, { heartbeat: this.timings.heartbeatMs });
      this.recovered('publish', 'Publishing the states works again');
    } catch (err) {
      // Sent again at the next tick (the SDK forgets what Gladys refused).
      this.failed('publish', 'warn', `Publishing the states failed: ${err.message}`);
    }
  }

  /** Fires `threshold_crossed`; returns true when a shown value changed side. */
  async thresholdEvents(created) {
    const now = this.now();
    let changed = false;
    for (const key of this.targets.keys()) {
      const summary = this.summary(key);
      const values = { current: summary.current, forecast_48h: summary.max48 };
      const memory = (this.data.sides[key] ??= {});
      for (const series of SERIES) {
        const value = values[series];
        if (value === null) {
          continue;
        }
        const previous = memory[series];
        const fresh = previous && now - previous.at <= this.timings.memoryMs;
        const sides = {};
        const events = [];
        for (const threshold of THRESHOLDS) {
          const side = fresh ? previous.sides[threshold] : undefined;
          if (side === 'below' && value >= threshold) {
            sides[threshold] = 'above';
            events.push({ threshold, direction: 'rising' });
          } else if (side === 'above' && value <= threshold - HYSTERESIS) {
            sides[threshold] = 'below';
            events.push({ threshold, direction: 'falling' });
          } else {
            sides[threshold] = side ?? (value >= threshold ? 'above' : 'below');
          }
        }
        memory[series] = { at: now, sides };
        // Falling through several degrees at once: the highest first, as it happened.
        events.sort((a, b) =>
          a.direction === 'falling' ? b.threshold - a.threshold : a.threshold - b.threshold,
        );
        if (events.length === 0) {
          continue;
        }
        changed = true;
        if (!created.includes(key)) {
          continue;
        }
        const target = this.targets.get(key);
        for (const event of events) {
          logger.debug(
            `${this.displayName(key, 'en')}: ${series} ${event.direction} through ${event.threshold} °C (${value} °C)`,
          );
          await this.gladys
            .publishSceneEvent(TRIGGERS.THRESHOLD_CROSSED, {
              lake: targetIds(this.gladys, target).device,
              series,
              threshold: event.threshold,
              direction: event.direction,
              lake_name: this.displayName(key),
              temperature: value,
            })
            .catch((err) =>
              logger.warn(`${TRIGGERS.THRESHOLD_CROSSED} event refused: ${err.message}`),
            );
        }
      }
    }
    return changed;
  }

  // --- Widget -----------------------------------------------------------------------------

  requestRefresh() {
    if (this.stopped) {
      return;
    }
    const now = this.now();
    const wait = this.lastRefreshAt + this.timings.widgetRefreshMs - now;
    if (wait <= 0) {
      this.lastRefreshAt = now;
      this.gladys.requestWidgetRefresh(WIDGET_KEY);
    } else if (this.timers && !this.refreshTimer) {
      this.refreshTimer = setTimeout(() => {
        this.refreshTimer = null;
        this.requestRefresh();
      }, wait);
      this.refreshTimer.unref?.();
    }
  }

  /** The date of the series of a target (when Alplakes was last asked), or null. */
  fetchedAt(key) {
    return this.data.forecasts[key]?.at ?? null;
  }
}

function emptyData() {
  return { version: 1, catalogue: null, known: {}, forecasts: {}, sides: {} };
}

function emptyProblems() {
  return {
    unknown: [],
    ambiguous: [],
    invalidPoint: [],
    no3d: [],
    offLake: [],
    noData: [],
    tooMany: false,
  };
}
