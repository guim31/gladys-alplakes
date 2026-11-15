// -----------------------------------------------------------------------------
// Alplakes client (Eawag, https://www.alplakes.eawag.ch): the lake catalogue and
// the water temperature series of the models. Keyless public API, rate-limited
// per client: an identifying User-Agent (src/http.js), short windows, and no
// request faster than the models change (they run every 3 hours).
//
//   - catalogue: GET /simulations/1d/metadata (the Simstrat lakes, one model per
//     lake or basin) and GET /simulations/metadata (the 3D models, Delft3D-FLOW
//     and MITgcm), plus the lake names of the Alplakes website (a static
//     list.json, with English, French, German and Italian names);
//   - lake temperature: GET /simulations/1d/point/simstrat/<lake>/<from>/<to>/<depth>
//     -> { time: [ISO...], variables: { T: { data: [°C...] } } }, every 3 hours;
//   - point temperature: GET /simulations/point/<model>/<lake>/<from>/<to>/<depth>/<lat>/<lng>
//     ?variables=temperature -> { time, distance: { data: m }, variables:
//     { temperature: { data } } }, the grid cell nearest to the point.
//
// Dates are UTC, YYYYmmddHHMM in the paths.
// -----------------------------------------------------------------------------

import { normalizeName } from './config.js';
import { getJson } from './http.js';

export const API_URL = 'https://alplakes-api.eawag.ch';
export const NAMES_URL =
  'https://alplakes-eawag.s3.eu-central-1.amazonaws.com/static/website/metadata/master/list.json';
export const SITE_URL = 'https://www.alplakes.eawag.ch';

// 3D models, in the order of preference (Delft3D-FLOW covers most lakes).
export const MODELS_3D = ['delft3d-flow', 'mitgcm'];

// A point farther than this from the centre of the nearest grid cell is not on
// the lake (the model answers with its nearest cell, even kilometres away).
export const MAX_POINT_DISTANCE_M = 1500;

// Simstrat lakes split into basins, and a spelling difference: the website
// names one lake for all of them, under another key. Value: [website key,
// basin names in en, fr, de, es] (null: the lake's own name).
const BASINS = {
  aegeri: ['ageri', null],
  upperzurich: ['zurich', ['upper basin', 'bassin supérieur', 'Obersee', 'cuenca superior']],
  lowerzurich: ['zurich', ['lower basin', 'bassin inférieur', 'unteres Becken', 'cuenca inferior']],
  upperconstance: ['constance', ['Obersee', 'Obersee', 'Obersee', 'Obersee']],
  lowerconstance: ['constance', ['Untersee', 'Untersee', 'Untersee', 'Untersee']],
  upperlugano: ['lugano', ['northern basin', 'bassin nord', 'Nordbecken', 'cuenca norte']],
  lowerlugano: ['lugano', ['southern basin', 'bassin sud', 'Südbecken', 'cuenca sur']],
  lucernealpnachersee: [
    'lucerne',
    ['Alpnachersee', 'Alpnachersee', 'Alpnachersee', 'Alpnachersee'],
  ],
  lucerneurnersee: ['lucerne', ['Urnersee', 'Urnersee', 'Urnersee', 'Urnersee']],
  lucernegersauerandtreibbecken: [
    'lucerne',
    ['Gersauerbecken', 'Gersauerbecken', 'Gersauerbecken', 'Gersauerbecken'],
  ],
  lucernekreuztrichterandvitznauerbecken: [
    'lucerne',
    ['Vitznauerbecken', 'Vitznauerbecken', 'Vitznauerbecken', 'Vitznauerbecken'],
  ],
};

// The website has no Spanish names: the few big lakes people know, by hand;
// the others keep their English name ("Lake Thun").
const SPANISH = {
  geneva: 'Lago Lemán',
  constance: 'Lago de Constanza',
  zurich: 'Lago de Zúrich',
  lucerne: 'Lago de Lucerna',
  lugano: 'Lago de Lugano',
  maggiore: 'Lago Mayor',
  como: 'Lago de Como',
  garda: 'Lago de Garda',
  iseo: 'Lago de Iseo',
  neuchatel: 'Lago de Neuchâtel',
  annecy: 'Lago de Annecy',
  bourget: 'Lago del Bourget',
  bled: 'Lago de Bled',
};

const LANGS = ['en', 'fr', 'de', 'es'];

/** "202611150300" (UTC, to the minute). */
export function apiTime(ms) {
  return new Date(ms).toISOString().slice(0, 16).replace(/[-T:]/g, '');
}

/** { time: [...], <values> } -> [{ t, v }] sorted, without the missing values. */
export function parseSeries(times, values) {
  if (!Array.isArray(times) || !Array.isArray(values)) {
    return [];
  }
  const series = [];
  for (let i = 0; i < times.length; i += 1) {
    const t = Date.parse(times[i]);
    const v = values[i];
    if (Number.isFinite(t) && typeof v === 'number' && Number.isFinite(v)) {
      series.push({ t, v });
    }
  }
  return series.sort((a, b) => a.t - b.t);
}

/**
 * The names of a lake in the four languages, from the website entry (if any):
 * `{ names, lakeNames, aliases }`: the second without the basin ("Lake
 * Zurich"), the third the other names searched (Italian: "Lago Lemano").
 */
export function lakeNames(key, websiteEntries) {
  const [websiteKey, basin] = BASINS[key] ?? [key, null];
  const entry = websiteEntries.get(websiteKey);
  const fallback = key.charAt(0).toUpperCase() + key.slice(1);
  const base = {
    en: entry?.name?.EN || fallback,
    fr: entry?.name?.FR || entry?.name?.EN || fallback,
    de: entry?.name?.DE || entry?.name?.EN || fallback,
    es: SPANISH[websiteKey] || entry?.name?.EN || fallback,
  };
  const aliases = entry?.name?.IT ? [entry.name.IT] : [];
  if (!basin) {
    return { names: base, lakeNames: base, aliases };
  }
  return {
    names: Object.fromEntries(LANGS.map((lang, i) => [lang, `${base[lang]} (${basin[i]})`])),
    lakeNames: base,
    aliases,
  };
}

/**
 * The catalogue: a Map of the Simstrat lakes, by key, each with its names, its
 * countries, the end of its forecast and its 3D model (null if none):
 * `{ key, names, lakeNames, aliases, countries, endDate, model3d: { model, key } | null }`.
 */
export function buildCatalogue(meta1d, meta3d, websiteList, now) {
  const website = new Map(
    (Array.isArray(websiteList) ? websiteList : [])
      .filter((entry) => entry && typeof entry.key === 'string')
      .map((entry) => [entry.key, entry]),
  );
  const today = new Date(now).toISOString().slice(0, 10);
  // 3D lakes whose simulations still run (Caldonazzo stopped in 2023).
  const live3d = new Map();
  for (const model of MODELS_3D) {
    const group = (Array.isArray(meta3d) ? meta3d : []).find((g) => g?.model === model);
    for (const lake of group?.lakes ?? []) {
      if (
        typeof lake?.name === 'string' &&
        String(lake.end_date) >= today &&
        !live3d.has(lake.name)
      ) {
        live3d.set(lake.name, { model, key: lake.name });
      }
    }
  }
  const simstrat = (Array.isArray(meta1d) ? meta1d : []).find((g) => g?.model === 'simstrat');
  const lakes = new Map();
  for (const lake of simstrat?.lakes ?? []) {
    const key = lake?.name;
    // "geneva_python_enkf"…: research variants of a lake (data assimilation).
    if (typeof key !== 'string' || !/^[a-z]+$/.test(key)) {
      continue;
    }
    const websiteKey = BASINS[key]?.[0] ?? key;
    lakes.set(key, {
      key,
      ...lakeNames(key, website),
      countries: website.get(websiteKey)?.countries ?? [],
      endDate: typeof lake.end_date === 'string' ? lake.end_date : null,
      model3d: live3d.get(key) ?? live3d.get(websiteKey) ?? null,
    });
  }
  return lakes;
}

// Articles and generic words of the lake names, ignored on both sides:
// "Lac Léman", "Le Léman" and "Léman" are the same lake.
const STOP_WORDS = new Set(
  'the le la les l lac lacs lake lago laghetto di de del della d du des see'.split(' '),
);
const meaningful = (text) =>
  normalizeName(text)
    .split(' ')
    .filter((word) => word && !STOP_WORDS.has(word));

/**
 * The lakes a name designates: the key, or a name in any language, Italian
 * included, with or without its article ("Léman", "Lac Léman", "Lake Geneva",
 * "Lago di Garda"). An exact match wins; otherwise every lake whose names hold
 * all the words.
 */
export function findLakes(catalogue, text) {
  const wanted = normalizeName(text);
  if (!wanted) {
    return [];
  }
  const lakes = [...catalogue.values()];
  const allNames = (lake) => [...Object.values(lake.names), ...(lake.aliases ?? [])];
  const core = meaningful(wanted).join(' ');
  const exact = lakes.filter(
    (lake) =>
      lake.key === wanted.replace(/ /g, '') ||
      allNames(lake).some(
        (name) => normalizeName(name) === wanted || (core && meaningful(name).join(' ') === core),
      ),
  );
  if (exact.length > 0) {
    return exact;
  }
  const words = meaningful(wanted);
  if (words.length === 0) {
    return [];
  }
  return lakes.filter((lake) => {
    const haystack = normalizeName(`${lake.key} ${allNames(lake).join(' ')}`);
    return words.every((word) => haystack.includes(word));
  });
}

export class Alplakes {
  /** @param {object} [options] @param {Function} [options.fetch] */
  constructor({ fetch: fetchImpl } = {}) {
    this.fetch = fetchImpl ?? globalThis.fetch;
  }

  async catalogue(now) {
    // The metadata weigh about 200 kB and sometimes take 15 s: a longer timeout.
    const slow = { timeoutMs: 30000 };
    const [meta1d, meta3d] = await Promise.all([
      getJson(this.fetch, `${API_URL}/simulations/1d/metadata`, slow),
      getJson(this.fetch, `${API_URL}/simulations/metadata`, slow),
    ]);
    // The names are a comfort: without them, the keys ("geneva") still work.
    const names = await getJson(this.fetch, NAMES_URL, slow).catch(() => []);
    return buildCatalogue(meta1d, meta3d, names, now);
  }

  /** Simstrat series of a lake: [{ t, v }]. */
  async lakeSeries(key, depth, from, to) {
    const url = `${API_URL}/simulations/1d/point/simstrat/${encodeURIComponent(key)}/${apiTime(from)}/${apiTime(to)}/${depth}`;
    const body = await getJson(this.fetch, url);
    return parseSeries(body?.time, body?.variables?.T?.data);
  }

  /** 3D series at a point: { series: [{ t, v }], distance: metres or null }. */
  async pointSeries({ model, key }, depth, lat, lng, from, to) {
    const url = `${API_URL}/simulations/point/${model}/${encodeURIComponent(key)}/${apiTime(from)}/${apiTime(to)}/${depth}/${lat}/${lng}?variables=temperature`;
    const body = await getJson(this.fetch, url);
    const distance = body?.distance?.data;
    return {
      series: parseSeries(body?.time, body?.variables?.temperature?.data),
      distance: typeof distance === 'number' ? distance : null,
    };
  }
}
