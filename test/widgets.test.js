import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { buildDevice } from '../src/devices.js';
import { MAX_STATUS_ITEMS, lakeValue } from '../src/widgets.js';
import { PAQUIS, create, createWorld } from './helpers/world.js';

const LANGS = ['en', 'fr', 'de', 'es'];

async function get(w, options) {
  const ack = await w.fake.widgetGet('lakes', options);
  assert.equal(ack.success, true);
  return ack.data.content;
}

async function world(t) {
  const w = await createWorld({ config: { lakes: 'Annecy, Léman, Thun', points: PAQUIS } });
  t.after(() => w.app.stop());
  return w;
}

/** Every component is valid, within the budget, and its feature links exist. */
function check(content, monitor) {
  assert.deepEqual(validateWidgetContent(content), []);
  assert.ok(content.components.length <= 8);
  assert.ok(content.components.filter((c) => c.type === 'text').length <= 2);
  const features = new Set(
    [...monitor.targets.values()].flatMap((target) =>
      buildDevice(monitor.gladys, target).features.map((f) => f.external_id),
    ),
  );
  for (const component of content.components.filter((c) => c.device_feature)) {
    assert.ok(features.has(component.device_feature), component.device_feature);
  }
  for (const item of content.components.find((c) => c.type === 'status')?.items ?? []) {
    assert.ok(String(item.value).length <= 40, item.value);
  }
}

test('without devices, the widget says what to do', async (t) => {
  const w = await world(t);
  const content = await get(w, { language: 'fr' });
  assert.match(content.components[0].text, /Aucun lac/);
});

test('the overview lists the created lakes with their Gladys name, in every language', async (t) => {
  const w = await world(t);
  await create(w, 'annecy');
  const point = await create(w, 'geneva_46.2107_6.1613');
  await w.fake.deviceUpdated({ ...point, name: 'Pâquis' });
  for (const language of LANGS) {
    const content = await get(w, { language });
    check(content, w.monitor);
    const [status, caption, button] = content.components;
    assert.deepEqual(
      status.items.map((item) => item.label),
      ["Lac d'Annecy", 'Pâquis'],
    );
    assert.match(status.items[0].value, /^12[.,]6 °C · m.x\. 12[.,]7 °C$/);
    assert.match(caption.text, /Alplakes, Eawag \(CC BY 4\.0\) · 15\/11 02:00/);
    assert.equal(button.link.url, 'https://www.alplakes.eawag.ch');
  }
});

test('one lake: its four tiles; the settings hide the forecast and the link', async (t) => {
  const w = await world(t);
  const device = await create(w, 'annecy');
  const full = await get(w, { settings: { lake: device.external_id } });
  check(full, w.monitor);
  assert.deepEqual(
    full.components.map((c) => c.type),
    ['value', 'value', 'value', 'value', 'text', 'button'],
  );
  const bare = await get(w, {
    settings: { lake: device.external_id, show_forecast: false, show_link: false },
  });
  assert.deepEqual(
    bare.components.map((c) => c.type),
    ['value', 'text'],
  );
  const overview = await get(w, { settings: { show_forecast: false } });
  assert.match(overview.components[0].items[0].value, /^12\.6 °C$/);
});

test('a lake no longer followed', async (t) => {
  const w = await world(t);
  const device = await create(w, 'thun');
  await w.fake.deviceDeleted(device);
  const content = await get(w, {
    settings: { lake: device.external_id },
    language: 'de',
  });
  assert.equal(content.components[0].text, 'Dieser See wird nicht mehr verfolgt.');
});

test('status values stay within 40 characters and wait for a series', () => {
  assert.equal(lakeValue({ current: null }, 'es'), 'En espera');
  assert.equal(lakeValue({ current: 21.04, max48: 23.5 }, 'fr'), '21,0 °C · max. 23,5 °C');
  assert.ok(MAX_STATUS_ITEMS <= 10);
});
