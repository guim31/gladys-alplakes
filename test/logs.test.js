// -----------------------------------------------------------------------------
// What the integration writes to `docker logs`: at info, only the lifecycle
// (the start, Alplakes lost and back), never one line per tick; a failure that
// repeats at every tick is logged once, plus one line when it is over.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { captureLogs, create, createWorld, tick } from './helpers/world.js';

const strip = (line) => line.text.replace(/^\[[^\]]+\] /, '');

test('the start is one info line', async (t) => {
  const lines = captureLogs(t, 'info');
  const world = await createWorld({ config: { lakes: 'Annecy, Léman' } });
  t.after(() => world.app.stop());
  assert.deepEqual(lines.map(strip), ['[INFO] [alplakes] Started: 2 lake(s) or point(s) followed']);
});

test('normal ticks, refreshes and crossings write nothing at info', async (t) => {
  const world = await createWorld({ config: { lakes: 'Annecy' } });
  t.after(() => world.app.stop());
  await create(world, 'annecy');
  const lines = captureLogs(t, 'info');
  for (let i = 0; i < 8; i += 1) {
    world.api.offset.annecy = i % 2 === 0 ? 2 : 0;
    await tick(world, 1);
  }
  assert.ok(world.fake.sceneEvents.length > 0);
  assert.deepEqual(lines, []);
});

test('an outage: one line when it starts, one when it ends', async (t) => {
  const world = await createWorld({ config: { lakes: 'Annecy' } });
  t.after(() => world.app.stop());
  const lines = captureLogs(t, 'info');
  world.api.down = 'network';
  for (let i = 0; i < 4; i += 1) {
    await tick(world, 3);
  }
  world.api.down = false;
  await tick(world, 3);
  await tick(world, 3);
  assert.deepEqual(lines.map(strip), [
    '[WARN] [alplakes] Alplakes unreachable: the last forecasts are kept',
    '[INFO] [alplakes] Alplakes answers again',
  ]);
});

test('LOG_LEVEL=debug shows the ticks', async (t) => {
  const lines = captureLogs(t, 'debug');
  const world = await createWorld({ config: { lakes: 'Annecy' } });
  t.after(() => world.app.stop());
  await tick(world, 1);
  assert.ok(lines.some((line) => /Tick: 1 lake/.test(line.text)));
});
