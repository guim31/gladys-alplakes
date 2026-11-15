// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Alplakes serving the
// answers recorded on 15/11/2026 (test/fixtures/alplakes), a manual clock, a
// temporary /data, and the integration wired on top through registerHandlers.
// Nothing touches the network.
// -----------------------------------------------------------------------------

import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { API_URL, NAMES_URL } from '../../src/alplakes.js';
import { Store } from '../../src/store.js';

process.env.LOG_LEVEL ??= 'silent';
process.env.TZ = 'Europe/Zurich';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

const SERIES = fixture('alplakes/series.json');

// The answers were recorded for this time (the window runs 6 hours back, 54
// hours ahead): the clock starts there.
export const START = Date.parse(SERIES.recorded_at);
export const HOUR = 60 * 60 * 1000;

// Bains des Pâquis, Geneva (public beach): 5 m from a cell of the 3D model.
export const PAQUIS = 'Léman: 46.2107, 6.1613 Bains des Pâquis';
// The middle of the Swiss shore, 11 km from the nearest cell: off the lake.
export const OFF_LAKE = 'Léman: 46.5, 6.2';

/** "202611142200" -> ms. */
const parseApiTime = (text) =>
  Date.UTC(
    +text.slice(0, 4),
    +text.slice(4, 6) - 1,
    +text.slice(6, 8),
    +text.slice(8, 10),
    +text.slice(10, 12),
  );

/** The recorded answer of a lake (1D) or of a point (3D), by its path start. */
const recorded = (prefix) =>
  Object.entries(SERIES.answers).find(([path]) => path.startsWith(prefix))?.[1];

/**
 * Fake Alplakes. `api.down`: 'network' (connection refused), a status (503)
 * or false. `api.offset[lake]`: degrees added to every value of a lake (its 1D
 * series and its 3D points), to move a lake through a threshold.
 */
export function createApi() {
  const api = {
    down: false,
    namesDown: false,
    requests: [],
    offset: {},

    async fetch(input) {
      const url = new URL(input);
      api.requests.push(url);
      const json = (status, body) => ({ status, text: async () => JSON.stringify(body) });
      if (api.down === 'network') {
        throw new TypeError('fetch failed');
      }
      if (url.href === NAMES_URL) {
        return api.namesDown ? json(403, {}) : json(200, fixture('alplakes/list.json'));
      }
      if (api.down) {
        return { status: api.down, text: async () => 'Service Unavailable' };
      }
      const path = url.href.slice(API_URL.length);
      if (path === '/simulations/1d/metadata') {
        return json(200, fixture('alplakes/metadata-1d.json'));
      }
      if (path === '/simulations/metadata') {
        return json(200, fixture('alplakes/metadata-3d.json'));
      }
      let match = /^\/simulations\/1d\/point\/simstrat\/([a-z]+)\//.exec(path);
      if (match) {
        const answer = recorded(`/simulations/1d/point/simstrat/${match[1]}/`);
        if (!answer) {
          return json(400, {
            detail: `simstrat simulation results are not available for ${match[1]}`,
          });
        }
        return json(200, api.shift(answer.body, match[1], 'T', path));
      }
      match =
        /^\/simulations\/point\/([a-z0-9-]+)\/([a-z]+)\/\d+\/\d+\/[\d.]+\/([\d.]+)\/([\d.]+)/.exec(
          path,
        );
      if (match) {
        const [, model, lake, lat] = match;
        const answer = Object.entries(SERIES.answers).find(
          ([p]) => p.startsWith(`/simulations/point/${model}/${lake}/`) && p.includes(`/${lat}/`),
        )?.[1];
        // Any other point of a lake: the Pâquis series, 300 m from a cell.
        const body = answer?.body ?? {
          ...recorded(`/simulations/point/${model}/${lake}/`)?.body,
          distance: { data: 300, unit: 'm' },
        };
        if (!body.time) {
          return json(400, { detail: 'Apologies data is not available for your requested period' });
        }
        return json(200, api.shift(body, lake, 'temperature', path));
      }
      return json(404, { detail: 'Not Found' });
    },

    /**
     * The recorded answer moved to the window asked (the models run on: a
     * request 9 hours later gets a series 9 hours later), plus the offset.
     */
    shift(body, lake, variable, path) {
      const asked = /\/(\d{12})\/\d{12}\//.exec(path)[1];
      const delta = parseApiTime(asked) - parseApiTime(SERIES.from);
      const offset = api.offset[lake] ?? 0;
      const copy = structuredClone(body);
      copy.time = copy.time.map((time) => new Date(Date.parse(time) + delta).toISOString());
      copy.variables[variable].data = copy.variables[variable].data.map((v) => v + offset);
      return copy;
    },

    /** Requests of the series (not the catalogue). */
    seriesRequests() {
      return api.requests.filter((url) => url.pathname.includes('/point/'));
    },
  };
  return api;
}

/** A manual clock. */
export function createClock(start = START) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

/**
 * @param {object} [options]
 * @param {object} [options.config] raw integration config
 * @param {Array} [options.devices] devices already created in Gladys
 * @param {object} [options.api] from createApi
 * @param {boolean} [options.connect]
 * @param {boolean} [options.timers] true: the monitor's own timer runs (mock it)
 */
export async function createWorld({
  config = {},
  devices = [],
  api = createApi(),
  connect = true,
  timers = false,
  clock = createClock(),
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-alplakes-')),
} = {}) {
  const gladys = createFakeGladys({ config, devices });
  const store = new Store(dataDir);
  const app = registerHandlers(gladys, {
    store,
    fetch: api.fetch,
    timers,
    now: clock.now,
    timings: { gapMs: 0 },
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
    await app.monitor.running;
  }
  return { gladys, fake: gladys.fake, app, monitor: app.monitor, api, clock, store, dataDir };
}

/** The device published for a lake key or a point id, from the last discovery list. */
export const discovered = (world, id) =>
  world.fake.discoveredDevices.find((device) => device.external_id.endsWith(`:${id}`));

/** Create the device of a lake or point in Gladys, as the user would. */
export async function create(world, id) {
  const device = discovered(world, id);
  if (!device) {
    throw new Error(`${id} is not in the discovered devices`);
  }
  await world.fake.deviceCreated(device);
  return device;
}

/** External id of one feature of a device. */
export const featureId = (device, key) =>
  device.features.find((feature) => feature.external_id.endsWith(`:${key}`))?.external_id;

/** Run one tick, `hours` later. */
export async function tick(world, hours = 1) {
  world.clock.advance(hours * HOUR);
  await world.monitor.runTick();
}

/**
 * Capture the integration's log lines at `level` and above (LOG_LEVEL is read
 * at every call). Returns the lines as `{ level, text }`.
 */
export function captureLogs(t, level = 'info') {
  const previous = process.env.LOG_LEVEL;
  process.env.LOG_LEVEL = level;
  const lines = [];
  const record = (...args) => {
    const text = args.map((arg) => (arg instanceof Error ? arg.message : String(arg))).join(' ');
    const match = /^\[[^\]]+\] \[(\w+)\]/.exec(text);
    lines.push({ level: match ? match[1].toLowerCase() : 'raw', text });
  };
  t.mock.method(console, 'log', record);
  t.mock.method(console, 'error', record);
  t.after(() => {
    process.env.LOG_LEVEL = previous;
  });
  return lines;
}
