// -----------------------------------------------------------------------------
// Integration configuration: defaults (they mirror the `default` values of the
// manifest `config_schema`, see test/manifest.test.js) and normalization, so
// the rest of the code never deals with strings, blanks or `undefined`.
//
// Select values are strings in the manifest (stored by Gladys as typed); the
// normalized config holds numbers.
// -----------------------------------------------------------------------------

export const LANGUAGES = ['en', 'fr', 'de', 'es'];

// Depth of the temperature, in metres: '0' is the surface (the top grid cell of
// the models: 0 m for Simstrat, 0.01 to 1 m for the 3D models).
export const DEPTHS = ['0', '1', '2', '5', '10'];

// Upper bounds of the lakes and of the points: one Alplakes request each per
// refresh, spaced out (the API is rate-limited per client).
export const MAX_LAKES = 10;
export const MAX_POINTS = 10;

export const DEFAULT_CONFIG = {
  lakes: '',
  points: '',
  depth: '0',
  language: 'fr',
};

/**
 * A name reduced for comparison: case, accents, apostrophes and punctuation
 * ignored, so "Léman", "leman" and "LÉMAN" match.
 */
export function normalizeName(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/ß/g, 'ss')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** The names of the "Lakes" field: separated by commas, semicolons or line breaks. */
export function parseLakes(text) {
  const seen = new Set();
  const lakes = [];
  for (const raw of String(text ?? '').split(/[,;\n]+/)) {
    const name = raw.trim();
    if (name && !seen.has(normalizeName(name))) {
      seen.add(normalizeName(name));
      lakes.push(name);
    }
  }
  return lakes;
}

// "Léman: 46.2107, 6.1613 Bains des Pâquis": the lake, a colon, the latitude and
// the longitude (a comma or spaces between them, a dot for the decimals), then
// an optional name.
const POINT = /^(.+?)\s*:\s*(-?\d{1,2}(?:\.\d+)?)\s*[,\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*(.*)$/;

/**
 * The points of the "Precise points" field, separated by semicolons or line
 * breaks (a comma separates the coordinates). Returns `{ points, invalid }`:
 * `invalid` holds the entries that cannot be read, for the connection status.
 */
export function parsePoints(text) {
  const points = [];
  const invalid = [];
  const seen = new Set();
  for (const raw of String(text ?? '').split(/[;\n]+/)) {
    const entry = raw.trim();
    if (!entry) {
      continue;
    }
    const match = POINT.exec(entry);
    const lat = match ? Number(match[2]) : NaN;
    const lng = match ? Number(match[3]) : NaN;
    if (!match || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      invalid.push(entry);
      continue;
    }
    // Four decimals: about 10 m, far below the grid of the models (100 m and more).
    const point = {
      lake: match[1].trim(),
      lat: Math.round(lat * 1e4) / 1e4,
      lng: Math.round(lng * 1e4) / 1e4,
      label: match[4].trim() || null,
    };
    const key = `${normalizeName(point.lake)}|${point.lat}|${point.lng}`;
    if (!seen.has(key)) {
      seen.add(key);
      points.push(point);
    }
  }
  return { points, invalid };
}

/**
 * @param {Record<string, unknown>} raw the configuration returned by the SDK
 */
export function normalizeConfig(raw = {}) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const { points, invalid } = parsePoints(source.points);
  return {
    lakes: parseLakes(source.lakes),
    points,
    invalidPoints: invalid,
    depth: Number(DEPTHS.includes(String(source.depth)) ? source.depth : DEFAULT_CONFIG.depth),
    language: LANGUAGES.includes(source.language) ? source.language : DEFAULT_CONFIG.language,
  };
}
