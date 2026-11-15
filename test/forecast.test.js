import { test } from 'node:test';
import assert from 'node:assert/strict';
import { HOUR, summarize, trendOf, valueAt } from '../src/forecast.js';

const T0 = Date.parse('2026-07-01T00:00:00Z');
// Every 3 hours from T0 - 6 h to T0 + 51 h: 18.0 °C rising 0.1 °C per step.
const series = Array.from({ length: 20 }, (_, i) => ({
  t: T0 + (i - 2) * 3 * HOUR,
  v: 18 + i / 10,
}));

test('the value now is linear between the two surrounding steps', () => {
  assert.equal(valueAt(series, T0), 18.2);
  assert.ok(Math.abs(valueAt(series, T0 + HOUR) - (18.2 + 0.1 / 3)) < 1e-9);
  assert.equal(valueAt(series, T0 - 7 * HOUR), null);
  assert.equal(valueAt(series, T0 + 52 * HOUR), null);
  assert.equal(valueAt([], T0), null);
  // A gap of missing values (9 hours) is not bridged.
  const gap = series.filter((_, i) => i !== 2 && i !== 3);
  assert.equal(valueAt(gap, T0 + HOUR), null);
});

test('maximum of the next 24 and 48 hours, change in 24 hours', () => {
  assert.deepEqual(summarize(series, T0), { current: 18.2, max24: 19, max48: 19.8, trend24: 0.8 });
});

test('a horizon the series does not reach gives no value', () => {
  const short = series.slice(0, 12); // up to T0 + 27 h
  assert.deepEqual(summarize(short, T0), { current: 18.2, max24: 19, max48: null, trend24: 0.8 });
  assert.deepEqual(summarize(series, T0 + 60 * HOUR), {
    current: null,
    max24: null,
    max48: null,
    trend24: null,
  });
});

test('a falling lake: the maximum is the value now, the change is negative, never -0', () => {
  const falling = series.map((p) => ({ t: p.t, v: 40 - p.v }));
  const s = summarize(falling, T0);
  assert.equal(s.max24, s.current);
  assert.equal(s.trend24, -0.8);
  const flat = series.map((p) => ({ t: p.t, v: 12.31 }));
  assert.ok(Object.is(summarize(flat, T0).trend24, 0));
});

test('trend names: 0.3 °C in 24 hours makes a trend', () => {
  assert.equal(trendOf(0.3), 'rising');
  assert.equal(trendOf(0.2), 'steady');
  assert.equal(trendOf(-0.3), 'falling');
  assert.equal(trendOf(null), null);
});
