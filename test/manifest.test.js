// -----------------------------------------------------------------------------
// Consistency checks between `gladys-assistant-integration.json` and the code:
// handlers, defaults, options, trigger payloads, and the rules of the core
// that the store validator cannot know.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { DEFAULT_CONFIG, DEPTHS, LANGUAGES } from '../src/config.js';
import { SERIES, THRESHOLDS, TRIGGERS, WIDGET_KEY } from '../src/monitor.js';
import { WIDGETS } from '../src/widgets.js';
import { create, createWorld, tick } from './helpers/world.js';

const manifest = JSON.parse(
  await readFile(new URL('../gladys-assistant-integration.json', import.meta.url), 'utf8'),
);
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));

// Every list of form fields the manifest can declare (same field grammar).
const allFields = [
  ...(manifest.config_schema ?? []),
  ...[...(manifest.actions ?? []), ...(manifest.scene_triggers ?? [])].flatMap(
    (item) => item.fields ?? [],
  ),
  ...(manifest.widgets ?? []).flatMap((widget) => widget.settings ?? []),
];

// The handlers the integration actually registers on the SDK.
const { gladys: registered, app } = await createWorld({ connect: false });
await app.stop();
const handlerKeys = (prefix) =>
  Object.keys(registered.handlers)
    .filter((key) => key.startsWith(prefix))
    .map((key) => key.slice(prefix.length));

const keysOf = (list) => (list ?? []).map((entry) => entry.key);
const optionValues = (field) => field.options.map((option) => option.value);
const field = (list, key) => list.find((entry) => entry.key === key);

test('identity: name, image, cover, cloud transport, environment category', () => {
  assert.equal(manifest.name, 'Alplakes');
  assert.equal(manifest.type, 'device');
  assert.match(manifest.docker_image, /^ghcr\.io\/guim31\/gladys-alplakes:/);
  assert.equal(
    manifest.cover_image,
    'https://raw.githubusercontent.com/guim31/gladys-alplakes/main/cover.png',
  );
  assert.deepEqual(manifest.transports, ['cloud']);
  assert.deepEqual(manifest.categories, ['environment']);
});

test('the countries of the lakes, which need Gladys >= 5.3.0 (also for temperature-sensor/probe)', () => {
  assert.deepEqual(manifest.countries, ['CH', 'FR', 'IT', 'DE', 'AT', 'SI']);
  assert.match(manifest.gladys_version, /^>=\s*5\.3\.0$/);
});

test('every manifest action has a handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.actions).sort(), handlerKeys('action:').sort());
});

test('no scene action: the states and the trigger cover the use', () => {
  assert.equal(manifest.scene_actions, undefined);
  assert.deepEqual(handlerKeys('sceneAction:'), []);
});

test('every widget has its handler, and vice versa', () => {
  assert.deepEqual(keysOf(manifest.widgets), [WIDGET_KEY]);
  assert.deepEqual(Object.keys(WIDGETS), [WIDGET_KEY]);
  assert.deepEqual(handlerKeys('widget:'), [WIDGET_KEY]);
});

test('the trigger the monitor fires is declared, with its filters and variables', async (t) => {
  assert.deepEqual(keysOf(manifest.scene_triggers), Object.values(TRIGGERS));
  const trigger = field(manifest.scene_triggers, TRIGGERS.THRESHOLD_CROSSED);
  assert.deepEqual(optionValues(field(trigger.fields, 'series')), SERIES);
  assert.deepEqual(optionValues(field(trigger.fields, 'threshold')), THRESHOLDS.map(String));
  assert.deepEqual(optionValues(field(trigger.fields, 'direction')), ['rising', 'falling']);

  const world = await createWorld({ config: { lakes: 'Annecy' } });
  t.after(() => world.app.stop());
  const device = await create(world, 'annecy');
  world.api.offset.annecy = 2;
  await tick(world, 3);
  assert.ok(world.fake.sceneEvents.length > 0);
  for (const event of world.fake.sceneEvents) {
    const declared = [...new Set([...keysOf(trigger.fields), ...keysOf(trigger.variables)])];
    assert.deepEqual(Object.keys(event.data).sort(), declared.sort());
    assert.equal(event.data.lake, device.external_id, 'the lake filter is the device');
    for (const entry of trigger.fields.filter((f) => f.options)) {
      // The core turns a number into its decimal string for a select filter.
      assert.ok(optionValues(entry).includes(String(event.data[entry.key])), entry.key);
    }
  }
});

test('config_schema defaults and options are the ones of the code', () => {
  for (const entry of manifest.config_schema) {
    if (entry.default !== undefined) {
      assert.equal(DEFAULT_CONFIG[entry.key], entry.default, entry.key);
    }
  }
  assert.deepEqual(
    Object.keys(DEFAULT_CONFIG).sort(),
    manifest.config_schema
      .filter((entry) => entry.type !== 'section')
      .map((entry) => entry.key)
      .sort(),
  );
  assert.deepEqual(optionValues(field(manifest.config_schema, 'language')), LANGUAGES);
  assert.deepEqual(optionValues(field(manifest.config_schema, 'depth')), DEPTHS);
});

test('section fields are purely presentational', () => {
  for (const section of manifest.config_schema.filter((entry) => entry.type === 'section')) {
    assert.equal(section.required, undefined);
    assert.equal(section.default, undefined);
    for (const link of section.links ?? []) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('dynamic selects declare the devices source and no static options', () => {
  const dynamic = allFields.filter((entry) => entry.source !== undefined);
  assert.equal(dynamic.length, 2);
  for (const entry of dynamic) {
    assert.equal(entry.source, 'devices');
    assert.equal(entry.options, undefined, entry.key);
  }
});

test('actions: no secret field, no default, no required field (the core applies no default)', () => {
  // GladysAssistant/Gladys#3154 and #3155.
  for (const action of manifest.actions) {
    for (const entry of action.fields ?? []) {
      assert.notEqual(entry.type, 'secret', `${action.key}.${entry.key}`);
      assert.equal(entry.default, undefined, `${action.key}.${entry.key}`);
      assert.notEqual(entry.required, true, `${action.key}.${entry.key}`);
    }
  }
});

test('the manifest version is the package version, and the image is tagged with it', () => {
  assert.equal(manifest.version, pkg.version);
  assert.ok(manifest.docker_image.endsWith(`:${manifest.version}`));
});

test('the catalog description holds 10 to 100 characters per language', () => {
  for (const [lang, text] of Object.entries(manifest.description)) {
    assert.ok(text.length >= 10 && text.length <= 100, `description.${lang}: ${text.length}`);
  }
});
