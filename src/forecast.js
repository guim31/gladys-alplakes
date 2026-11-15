// -----------------------------------------------------------------------------
// From a model series ([{ t, v }], every 3 hours, past and forecast) to what the
// devices show: the temperature now (linear between the two surrounding steps),
// the maximum of the next 24 and 48 hours, and the change expected in 24 hours.
// Pure functions of the series and of the clock.
// -----------------------------------------------------------------------------

export const HOUR = 60 * 60 * 1000;

// A horizon counts as covered when the series reaches it within one step.
const STEP_SLACK = 3 * HOUR;
// Two steps farther apart than this (missing values) are not interpolated.
const MAX_GAP = 6 * HOUR;

const round1 = (value) => Math.round(value * 10) / 10;

/** The value of the series at `time`, linear between two steps; null outside it or in a gap. */
export function valueAt(series, time) {
  if (series.length === 0 || time < series[0].t || time > series[series.length - 1].t) {
    return null;
  }
  for (let i = 0; i < series.length; i += 1) {
    const point = series[i];
    if (point.t === time) {
      return point.v;
    }
    if (point.t > time) {
      const before = series[i - 1];
      if (point.t - before.t > MAX_GAP) {
        return null;
      }
      return before.v + ((point.v - before.v) * (time - before.t)) / (point.t - before.t);
    }
  }
  return null;
}

/**
 * @param {Array<{t: number, v: number}>} series sorted by time
 * @param {number} now
 * @returns {{ current: number|null, max24: number|null, max48: number|null, trend24: number|null }}
 */
export function summarize(series, now) {
  const current = valueAt(series, now);
  if (current === null) {
    return { current: null, max24: null, max48: null, trend24: null };
  }
  const last = series[series.length - 1].t;
  const maxWithin = (hours) => {
    const end = now + hours * HOUR;
    if (last < end - STEP_SLACK) {
      return null;
    }
    let max = current;
    for (const point of series) {
      if (point.t > now && point.t <= end && point.v > max) {
        max = point.v;
      }
    }
    return round1(max);
  };
  const later = valueAt(series, now + 24 * HOUR);
  return {
    current: round1(current),
    max24: maxWithin(24),
    max48: maxWithin(48),
    // Rounded after the difference, and never "-0".
    trend24: later === null ? null : round1(later - current) || 0,
  };
}

/** 'rising', 'falling' or 'steady' (less than 0.3 °C in 24 hours). */
export function trendOf(trend24) {
  if (trend24 === null || trend24 === undefined) {
    return null;
  }
  if (trend24 >= 0.3) {
    return 'rising';
  }
  return trend24 <= -0.3 ? 'falling' : 'steady';
}
