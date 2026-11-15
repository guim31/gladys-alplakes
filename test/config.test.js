import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeConfig, normalizeName, parseLakes, parsePoints } from '../src/config.js';

test('lakes: commas, semicolons and line breaks, duplicates removed', () => {
  assert.deepEqual(parseLakes(' Léman, annecy;\nLEMAN,, Lac du Bourget '), [
    'Léman',
    'annecy',
    'Lac du Bourget',
  ]);
  assert.deepEqual(parseLakes(undefined), []);
});

test('names compare without case, accents nor punctuation', () => {
  assert.equal(normalizeName("Lac d'Annecy"), 'lac d annecy');
  assert.equal(normalizeName('ZÜRICHSEE'), 'zurichsee');
  assert.equal(normalizeName('Léman'), normalizeName('leman'));
});

test('points: lake, coordinates and an optional name', () => {
  const { points, invalid } = parsePoints(
    'Léman: 46.21074, 6.16131 Bains des Pâquis; annecy:45.86 6.17\nLéman: 46.21074, 6.16131; nowhere; Léman: 95, 6; Léman: 46,2107, 6,1613',
  );
  assert.deepEqual(points, [
    { lake: 'Léman', lat: 46.2107, lng: 6.1613, label: 'Bains des Pâquis' },
    { lake: 'annecy', lat: 45.86, lng: 6.17, label: null },
  ]);
  assert.deepEqual(invalid, ['nowhere', 'Léman: 95, 6', 'Léman: 46,2107, 6,1613']);
});

test('normalized configuration: defaults and unknown values', () => {
  assert.deepEqual(normalizeConfig({}), {
    lakes: [],
    points: [],
    invalidPoints: [],
    depth: 0,
    language: 'fr',
  });
  const config = normalizeConfig({ depth: '5', language: 'de', lakes: 'Thun' });
  assert.equal(config.depth, 5);
  assert.equal(config.language, 'de');
  assert.equal(normalizeConfig({ depth: '3', language: 'it' }).depth, 0);
  assert.equal(normalizeConfig({ language: 'it' }).language, 'fr');
});
