// -----------------------------------------------------------------------------
// Gladys devices: one per followed lake (Simstrat, the whole-lake 1D model) and
// one per precise point (the 3D model of the lake, at the grid cell nearest to
// the point: a beach, a harbour).
//
// Features (couples checked against the Gladys front, see
// test/gladys-rules.test.js), all read-only, in °C:
//   - temperature  temperature-sensor/probe: the water temperature now ("probe",
//                  Gladys 5.2+, is kept out of the temperature of a room: a
//                  lake placed in the living room must not change its average);
//   - max_24h      temperature-sensor/max: the warmest value of the next 24 h;
//   - max_48h      temperature-sensor/max: the warmest value of the next 48 h;
//   - trend_24h    temperature-sensor/probe: the change expected in 24 hours
//                  (signed, symmetric bounds for the gauge; probe for the same
//                  reason).
//
// Published with should_poll: false: the refresh runs in the container every
// 3 hours (src/monitor.js). Platform ids: the Alplakes lake key ("geneva"), and
// "<lake key>_<lat>_<lng>" for a point (four decimals).
// -----------------------------------------------------------------------------

import {
  DEVICE_FEATURE_CATEGORIES as C,
  DEVICE_FEATURE_TYPES as TYPES,
  DEVICE_FEATURE_UNITS,
} from '@gladysassistant/integration-sdk';

export const DEVICE_TYPES = { LAKE: 'lake', POINT: 'point' };
export const FEATURE_KEYS = ['temperature', 'max_24h', 'max_48h', 'trend_24h'];

// Display bounds: an Alpine lake stays between 0 and 30 °C (Garda and Iseo
// reach 27 °C in August); the change over 24 hours, a few degrees at most.
export const TEMPERATURE_BOUNDS = [-2, 35];
export const TREND_BOUNDS = [-10, 10];

// Feature names, frozen at creation in Gladys (language of the configuration).
export const NAMES = {
  en: {
    temperature: 'Water temperature',
    max_24h: 'Max. next 24 h',
    max_48h: 'Max. next 48 h',
    trend_24h: 'Change in 24 h',
  },
  fr: {
    temperature: "Température de l'eau",
    max_24h: 'Max. prochaines 24 h',
    max_48h: 'Max. prochaines 48 h',
    trend_24h: 'Évolution sur 24 h',
  },
  de: {
    temperature: 'Wassertemperatur',
    max_24h: 'Max. nächste 24 h',
    max_48h: 'Max. nächste 48 h',
    trend_24h: 'Änderung in 24 h',
  },
  es: {
    temperature: 'Temperatura del agua',
    max_24h: 'Máx. próximas 24 h',
    max_48h: 'Máx. próximas 48 h',
    trend_24h: 'Cambio en 24 h',
  },
};

/** The platform id of a point: "geneva_46.2107_6.1613". */
export const pointId = (lakeKey, lat, lng) => `${lakeKey}_${lat}_${lng}`;

/** External ids of a target (`{ type, id }`) and of its features. */
export function targetIds(gladys, target) {
  const ids = gladys.externalIds(target.type, target.id);
  return {
    device: ids.device,
    ...Object.fromEntries(FEATURE_KEYS.map((key) => [key, ids.feature(key)])),
  };
}

/** The target `{ type, id }` of a device or feature external id (null if not ours). */
export function targetOfId(gladys, externalId) {
  if (typeof externalId !== 'string') {
    return null;
  }
  for (const type of Object.values(DEVICE_TYPES)) {
    const prefix = gladys.externalIds(type, '').device;
    if (externalId.startsWith(prefix)) {
      const id = externalId.slice(prefix.length).split(':')[0];
      return id ? { type, id } : null;
    }
  }
  return null;
}

/** "geneva" or "point:geneva_46.2107_6.1613": the key of a target in maps and /data. */
export const targetKey = (target) =>
  target.type === DEVICE_TYPES.LAKE ? target.id : `${target.type}:${target.id}`;

/** The name of a target in a language: the lake, or the point's own name. */
export function targetName(target, language) {
  const lake = target.names?.[language] ?? target.names?.fr ?? target.lake;
  if (target.type === DEVICE_TYPES.LAKE) {
    return lake;
  }
  return target.label ?? `${lake} (${target.lat}, ${target.lng})`;
}

const sensor = (name, externalId, type, extra) => ({
  name,
  external_id: externalId,
  category: C.TEMPERATURE_SENSOR,
  type,
  read_only: true,
  has_feedback: false,
  unit: DEVICE_FEATURE_UNITS.CELSIUS,
  keep_history: true,
  ...extra,
});

/**
 * The discovery payload of a target.
 * @param {object} gladys
 * @param {object} target `{ type, id, lake, names, model, lat?, lng?, label? }`
 * @param {string} language language of the names
 */
export function buildDevice(gladys, target, language = 'fr') {
  const ids = targetIds(gladys, target);
  const names = NAMES[language] ?? NAMES.fr;
  const [tMin, tMax] = TEMPERATURE_BOUNDS;
  const T = TYPES.TEMPERATURE_SENSOR;
  const params = [
    { name: 'LAKE', value: target.lake },
    { name: 'MODEL', value: target.model },
  ];
  if (target.type === DEVICE_TYPES.POINT) {
    params.push(
      { name: 'LATITUDE', value: String(target.lat) },
      { name: 'LONGITUDE', value: String(target.lng) },
    );
  }
  return {
    name: targetName(target, language),
    external_id: ids.device,
    model: target.type === DEVICE_TYPES.LAKE ? 'Alplakes Simstrat' : `Alplakes ${target.model}`,
    should_poll: false,
    params,
    features: [
      sensor(names.temperature, ids.temperature, T.PROBE, { min: tMin, max: tMax }),
      sensor(names.max_24h, ids.max_24h, T.MAX, { min: tMin, max: tMax }),
      sensor(names.max_48h, ids.max_48h, T.MAX, { min: tMin, max: tMax }),
      sensor(names.trend_24h, ids.trend_24h, T.PROBE, {
        min: TREND_BOUNDS[0],
        max: TREND_BOUNDS[1],
      }),
    ],
  };
}
