import { describe, expect, it } from 'vitest';
import {
  parseAltitude,
  parseAltRestr,
  parseLatLon,
  parseNavaidClass,
  parseOffset,
  parseSpeedAlt,
  parseWind,
} from '../fmc/validation/parsers';

describe('altitude rule', () => {
  it('reads 3 digit entries as flight levels', () => {
    expect(parseAltitude('360')).toBe(36000);
    expect(parseAltitude('FL240')).toBe(24000);
  });
  it('reads 1000 and above as feet', () => {
    expect(parseAltitude('5000')).toBe(5000);
    expect(parseAltitude('10000')).toBe(10000);
  });
  it('rejects garbage', () => {
    expect(parseAltitude('ABC')).toBeNull();
    expect(parseAltitude('99999')).toBeNull();
  });
});

describe('slash rule', () => {
  it('parses speed/mach', () => {
    expect(parseSpeedAlt('280/.78')).toEqual({ speed: 280, mach: 0.78 });
  });
  it('parses speed/alt', () => {
    const r = parseSpeedAlt('250/10000');
    expect(r?.speed).toBe(250);
    expect(r?.altRestr).toEqual({ type: 'AT', value: 10000 });
  });
  it('accepts one sided entries', () => {
    expect(parseSpeedAlt('250/')?.speed).toBe(250);
    expect(parseSpeedAlt('/10000')?.altRestr?.value).toBe(10000);
  });
  it('parses window restrictions', () => {
    expect(parseAltRestr('8000A12000B')).toEqual({ type: 'AB', value: 8000, valueB: 12000 });
  });
  it('parses above/below suffixes', () => {
    expect(parseAltRestr('10000A')).toEqual({ type: 'A', value: 10000 });
    expect(parseAltRestr('240B')).toEqual({ type: 'B', value: 24000 });
  });
});

describe('lat/lon entry', () => {
  it('parses the full format', () => {
    const p = parseLatLon('S2326.1W04628.4');
    expect(p?.lat).toBeCloseTo(-23.435, 2);
    expect(p?.lon).toBeCloseTo(-46.473, 2);
  });
  it('rejects bad minutes', () => {
    expect(parseLatLon('S2375.0W04628.4')).toBeNull();
  });
});

describe('misc parsers', () => {
  it('parses wind', () => {
    expect(parseWind('250/45')).toEqual({ dir: 250, speed: 45 });
    expect(parseWind('400/45')).toBeNull();
  });
  it('parses offsets within 1-20 NM', () => {
    expect(parseOffset('L10')).toEqual({ side: 'L', nm: 10 });
    expect(parseOffset('R25')).toBeNull();
  });
  it('validates navaid class codes', () => {
    expect(parseNavaidClass('VDHW')).toBe('VDHW');
    expect(parseNavaidClass('XXXX')).toBeNull();
  });
});
