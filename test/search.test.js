import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createApi, createWorld } from './helpers/world.js';

async function search(world, fields) {
  const ack = await world.fake.action('search_lakes', fields);
  assert.equal(ack.success, true);
  return ack.data.message;
}

test('"Find lakes" lists names and keys, in the four languages', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const message = await search(world, { query: 'zurich' });
  assert.deepEqual(Object.keys(message).sort(), ['de', 'en', 'es', 'fr']);
  assert.match(message.fr, /^2 lac\(s\)\./);
  assert.match(message.fr, /Lac de Zurich \(bassin supérieur\) — upperzurich \(modèle 3D/);
  assert.match(message.de, /Zürichsee \(Obersee\) — upperzurich/);
});

test('empty, it lists the lakes with a 3D model; nothing found; Alplakes down', async (t) => {
  const world = await createWorld();
  t.after(() => world.app.stop());
  const all = await search(world, {});
  assert.match(all.en, /15 of 21 lake\(s\)/);
  assert.match(all.en, /Lake Annecy — annecy \(3D model/);
  assert.equal((await search(world, { query: 'Atlantis' })).en, 'No lake found.');

  const api = createApi();
  api.down = 'network';
  const down = await createWorld({ api });
  t.after(() => down.app.stop());
  const message = await search(down, { query: 'Annecy' });
  assert.match(message.fr, /Alplakes ne répond pas/);
});
