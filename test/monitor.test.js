// -----------------------------------------------------------------------------
// The monitor against the fake Gladys and the recorded Alplakes answers:
// discovery, states, refresh pace, outages, connection status, the scene
// trigger and the persistence under /data.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/forecast.js';
import { parseSeries } from '../src/alplakes.js';
import { TRIGGERS } from '../src/monitor.js';
import {
  HOUR,
  OFF_LAKE,
  PAQUIS,
  START,
  create,
  createWorld,
  discovered,
  featureId,
  fixture,
  tick,
} from './helpers/world.js';

const SERIES = fixture('alplakes/series.json').answers;
const recorded = (prefix) =>
  Object.entries(SERIES).find(([path]) => path.startsWith(prefix))[1].body;
const ANNECY = summarize(
  parseSeries(
    recorded('/simulations/1d/point/simstrat/annecy/').time,
    recorded('/simulations/1d/point/simstrat/annecy/').variables.T.data,
  ),
  START,
);
const PAQUIS_ID = 'geneva_46.2107_6.1613';

const stateOf = (world, externalId) => world.fake.lastState(externalId);

async function annecy(t, config = {}) {
  const world = await createWorld({ config: { lakes: 'Annecy', ...config } });
  t.after(() => world.app.stop());
  const device = await create(world, 'annecy');
  return { world, device };
}

test('one device per lake and per point, named in the configured language', async (t) => {
  const world = await createWorld({
    config: { lakes: 'Léman, Annecy, Thunersee', points: PAQUIS, language: 'de' },
  });
  t.after(() => world.app.stop());
  const names = world.fake.discoveredDevices.map((device) => device.name);
  assert.deepEqual(names, ['Genfersee', 'Lac d’Annecy', 'Thunersee', 'Bains des Pâquis']);
  const point = discovered(world, PAQUIS_ID);
  assert.equal(point.model, 'Alplakes delft3d-flow');
  assert.deepEqual(
    point.params.map((p) => p.name),
    ['LAKE', 'MODEL', 'LATITUDE', 'LONGITUDE'],
  );
  assert.equal(discovered(world, 'geneva').features[0].name, 'Wassertemperatur');
  assert.equal(world.fake.connectionStatus.connected, true);
});

test('a point without a name is named after its lake and coordinates', async (t) => {
  const world = await createWorld({ config: { points: 'Zurich: 47.3, 8.55' } });
  t.after(() => world.app.stop());
  // "Zurich" is two Simstrat basins, but one 3D model: the point is accepted.
  const [device] = world.fake.discoveredDevices;
  assert.equal(device.name, 'Lac de Zurich (47.3, 8.55)');
  assert.ok(device.external_id.endsWith(':point:zurich_47.3_8.55'));
});

test('creating a device publishes its four values', async (t) => {
  const { world, device } = await annecy(t);
  assert.equal(stateOf(world, featureId(device, 'temperature')), ANNECY.current);
  assert.equal(stateOf(world, featureId(device, 'max_24h')), ANNECY.max24);
  assert.equal(stateOf(world, featureId(device, 'max_48h')), ANNECY.max48);
  assert.equal(stateOf(world, featureId(device, 'trend_24h')), ANNECY.trend24);
  assert.ok(world.fake.widgetRefreshes.includes('lakes'));
});

test('Alplakes is asked every 3 hours; the hourly ticks only compute', async (t) => {
  const { world } = await annecy(t);
  const before = world.api.seriesRequests().length;
  await tick(world, 1);
  await tick(world, 1);
  assert.equal(world.api.seriesRequests().length, before);
  await tick(world, 1);
  assert.equal(world.api.seriesRequests().length, before + 1);
  const [request] = world.api.seriesRequests().slice(-1);
  // The window: 6 hours back, 54 hours ahead, at the configured depth.
  assert.match(request.pathname, /\/annecy\/202611142200\/202611171000\/0$/);
});

test('the container refreshes by itself, without onPoll', async (t) => {
  t.mock.timers.enable({ apis: ['setInterval', 'setTimeout'] });
  const world = await createWorld({ config: { lakes: 'Annecy' }, timers: true });
  t.after(() => world.app.stop());
  await create(world, 'annecy');
  const before = world.api.seriesRequests().length;
  for (let i = 0; i < 3; i += 1) {
    world.clock.advance(HOUR);
    t.mock.timers.tick(HOUR);
    await world.monitor.running;
  }
  assert.equal(world.api.seriesRequests().length, before + 1);
});

test('the depth of the configuration goes into the request, and a change asks again', async (t) => {
  const { world } = await annecy(t, { depth: '5' });
  assert.match(world.api.seriesRequests().at(-1).pathname, /\/5$/);
  await world.fake.configUpdated({ lakes: 'Annecy', depth: '10' });
  await world.monitor.running;
  assert.match(world.api.seriesRequests().at(-1).pathname, /\/10$/);
});

test('an outage keeps the last forecast, says so once, and recovers', async (t) => {
  const { world, device } = await annecy(t);
  world.api.down = 'network';
  await tick(world, 3);
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.match(world.fake.connectionStatus.message.fr, /Alplakes ne répond pas/);
  // The values still come from the series kept.
  assert.equal(typeof stateOf(world, featureId(device, 'temperature')), 'number');
  world.api.down = false;
  await tick(world, 1);
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.equal(world.fake.connectionStatus.message, undefined);
});

test('the connection status names what cannot be followed', async (t) => {
  const world = await createWorld({
    config: {
      lakes: 'Atlantis, Zurich, Annecy',
      points: `Thun: 46.7, 7.7; ${OFF_LAKE}; nowhere`,
    },
  });
  t.after(() => world.app.stop());
  const { connected, message } = world.fake.connectionStatus;
  assert.equal(connected, true);
  assert.match(message.en, /Unknown lake: Atlantis\./);
  assert.match(message.en, /Several lakes match Zurich/);
  assert.match(message.en, /No 3D model for Thun/);
  assert.match(message.en, /Unreadable point: nowhere\./);
  assert.match(message.en, /Point too far from the lake: Le Léman \(46\.5, 6\.2\)/);
  assert.deepEqual(Object.keys(message), ['en', 'fr', 'de', 'es']);
  // Only Annecy is offered; the off-lake point is not.
  assert.deepEqual(
    world.fake.discoveredDevices.map((device) => device.name),
    ["Lac d'Annecy"],
  );
});

test('a lake the model does not serve says so', async (t) => {
  const world = await createWorld({ config: { lakes: 'Garda' } });
  t.after(() => world.app.stop());
  // No answer recorded for Garda: the fake answers 400, as Alplakes for a missing lake.
  assert.equal(world.fake.connectionStatus.connected, true);
  assert.match(world.fake.connectionStatus.message.fr, /Pas de température d'Alplakes pour/);
});

test('without the catalogue nor anything saved, the status says Alplakes is down', async (t) => {
  const api = (await import('./helpers/world.js')).createApi();
  api.down = 503;
  const world = await createWorld({ config: { lakes: 'Annecy' }, api });
  t.after(() => world.app.stop());
  assert.equal(world.fake.connectionStatus.connected, false);
  assert.deepEqual(world.fake.discoveredDevices, []);
});

test('the trigger fires once per crossing, with a hysteresis, and only for created devices', async (t) => {
  const world = await createWorld({ config: { lakes: 'Annecy, Léman' } });
  t.after(() => world.app.stop());
  const device = await create(world, 'annecy');
  // Annecy is at 12.6 °C: +1 °C crosses 13 °C, now and in the 48 h maximum.
  world.api.offset.annecy = 1;
  world.api.offset.geneva = 3;
  await tick(world, 3);
  const events = world.fake.sceneEvents.filter((e) => e.key === TRIGGERS.THRESHOLD_CROSSED);
  assert.deepEqual(
    events.map((e) => [e.data.series, e.data.threshold, e.data.direction]),
    [
      ['current', 13, 'rising'],
      ['forecast_48h', 13, 'rising'],
    ],
  );
  assert.equal(events[0].data.lake, device.external_id);
  assert.equal(events[0].data.lake_name, "Lac d'Annecy");
  assert.equal(typeof events[0].data.temperature, 'number');
  // 0.2 °C lower: within the hysteresis, nothing.
  world.api.offset.annecy = 0.8;
  await tick(world, 3);
  assert.equal(world.fake.sceneEvents.length, 2);
  // Back to the recorded values: falling below 13 °C.
  world.api.offset.annecy = 0;
  await tick(world, 3);
  assert.deepEqual(
    world.fake.sceneEvents.slice(2).map((e) => [e.data.series, e.data.direction]),
    [
      ['current', 'falling'],
      ['forecast_48h', 'falling'],
    ],
  );
});

test('a restart keeps the series and the threshold sides (/data)', async (t) => {
  const first = await createWorld({ config: { lakes: 'Annecy' } });
  const device = await create(first, 'annecy');
  await first.app.stop();
  const world = await createWorld({
    config: { lakes: 'Annecy' },
    devices: [device],
    dataDir: first.dataDir,
  });
  t.after(() => world.app.stop());
  assert.equal(world.api.seriesRequests().length, 0, 'the saved series is recent');
  assert.equal(stateOf(world, featureId(device, 'temperature')), ANNECY.current);
  assert.deepEqual(world.fake.sceneEvents, []);
});

test('a created device stays followed when removed from the configuration, until deleted', async (t) => {
  const { world, device } = await annecy(t);
  await world.fake.configUpdated({ lakes: '' });
  await world.monitor.running;
  assert.deepEqual(
    world.fake.discoveredDevices.map((d) => d.external_id),
    [device.external_id],
  );
  await world.fake.deviceDeleted(device);
  await world.monitor.running;
  assert.deepEqual(world.fake.discoveredDevices, []);
});

test('a reconnection publishes everything again', async (t) => {
  const { world, device } = await annecy(t);
  const before = world.fake.states.length;
  world.monitor.resync(world.monitor.config);
  await world.monitor.running;
  await new Promise((resolve) => setImmediate(resolve));
  const again = world.fake.states.slice(before).map((s) => s.device_feature_external_id);
  assert.ok(again.includes(featureId(device, 'temperature')));
});
