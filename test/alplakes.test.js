import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiTime, buildCatalogue, findLakes, parseSeries } from '../src/alplakes.js';
import { START, fixture } from './helpers/world.js';

const catalogue = buildCatalogue(
  fixture('alplakes/metadata-1d.json'),
  fixture('alplakes/metadata-3d.json'),
  fixture('alplakes/list.json'),
  START,
);

test('the catalogue: the Simstrat lakes, without the research variants', () => {
  assert.ok(catalogue.size > 100, `${catalogue.size} lakes`);
  assert.ok([...catalogue.keys()].every((key) => /^[a-z]+$/.test(key)));
  assert.equal(catalogue.has('geneva_python_enkf'), false);
  const geneva = catalogue.get('geneva');
  assert.deepEqual(geneva.names, {
    en: 'Lake Geneva',
    fr: 'Le Léman',
    de: 'Genfersee',
    es: 'Lago Lemán',
  });
  assert.deepEqual(geneva.countries, ['CH', 'FR']);
  assert.deepEqual(geneva.model3d, { model: 'delft3d-flow', key: 'geneva' });
});

test('3D models: by key, by basin, and only while they run', () => {
  assert.deepEqual(catalogue.get('upperzurich').model3d, { model: 'delft3d-flow', key: 'zurich' });
  assert.deepEqual(catalogue.get('lucerneurnersee').model3d, { model: 'mitgcm', key: 'lucerne' });
  assert.deepEqual(catalogue.get('aegeri').model3d, { model: 'delft3d-flow', key: 'ageri' });
  assert.equal(catalogue.get('thun').model3d, null);
  // Caldonazzo's 3D model stopped in December 2023.
  assert.equal(catalogue.get('caldonazzo').model3d, null);
});

test('basins carry the name of their lake and of the basin', () => {
  assert.equal(catalogue.get('upperzurich').names.fr, 'Lac de Zurich (bassin supérieur)');
  assert.equal(catalogue.get('upperzurich').lakeNames.fr, 'Lac de Zurich');
  assert.equal(catalogue.get('lowerconstance').names.de, 'Bodensee (Untersee)');
});

test('without the website names, the keys still work', () => {
  const bare = buildCatalogue(
    fixture('alplakes/metadata-1d.json'),
    fixture('alplakes/metadata-3d.json'),
    [],
    START,
  );
  assert.equal(bare.get('geneva').names.fr, 'Geneva');
  assert.deepEqual(
    findLakes(bare, 'geneva').map((lake) => lake.key),
    ['geneva'],
  );
});

test('lakes are found by key or by name, in any language, with or without the article', () => {
  const keys = (text) => findLakes(catalogue, text).map((lake) => lake.key);
  assert.deepEqual(keys('Léman'), ['geneva']);
  assert.deepEqual(keys('le leman'), ['geneva']);
  assert.deepEqual(keys('Genfersee'), ['geneva']);
  assert.deepEqual(keys('Lake Geneva'), ['geneva']);
  assert.deepEqual(keys('geneva'), ['geneva']);
  assert.deepEqual(keys("lac d'Annecy"), ['annecy']);
  assert.deepEqual(keys('Bourget'), ['bourget']);
  assert.deepEqual(keys('Thunersee'), ['thun']);
  assert.deepEqual(keys('Zurich').sort(), ['lowerzurich', 'upperzurich']);
  assert.deepEqual(keys('upperzurich'), ['upperzurich']);
  assert.deepEqual(keys('Lac Léman'), ['geneva']);
  assert.deepEqual(keys('Lago Lemano'), ['geneva']);
  assert.deepEqual(keys('Lago di Garda'), ['garda']);
  assert.deepEqual(keys("Lago d'Iseo"), ['iseo']);
  assert.deepEqual(keys('Lac des Quatre-Cantons').length, 4);
  assert.deepEqual(keys('lac'), []);
  assert.deepEqual(keys('Atlantis'), []);
  assert.deepEqual(keys('  '), []);
});

test('dates of the paths, and the series as served', () => {
  assert.equal(apiTime(Date.parse('2026-11-15T01:00:00Z')), '202611150100');
  assert.deepEqual(
    parseSeries(['2026-11-15T04:00:02.88+00:00', '2026-11-15T01:00:02.88+00:00', 'x'], [2, 1, 3]),
    [
      { t: Date.parse('2026-11-15T01:00:02.88Z'), v: 1 },
      { t: Date.parse('2026-11-15T04:00:02.88Z'), v: 2 },
    ],
  );
  assert.deepEqual(parseSeries(['2026-11-15T01:00:00Z'], [null]), []);
  assert.deepEqual(parseSeries(undefined, undefined), []);
});
