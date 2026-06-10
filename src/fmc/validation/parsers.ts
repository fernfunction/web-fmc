import type { AltRestr } from '../types';

// altitude rule from the guide: short entries read as flight levels,
// anything 1000 or above reads as feet
export function parseAltitude(raw: string): number | null {
  const s = raw.trim().toUpperCase();
  const m = s.match(/^(?:FL)?(\d{1,5})$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (s.startsWith('FL')) {
    if (n < 10 || n > 450) return null;
    return n * 100;
  }
  if (m[1].length <= 3 && n < 1000) {
    if (n < 10 || n > 450) return null;
    return n * 100;
  }
  if (n < 0 || n > 45000) return null;
  return n;
}

export function fmtAltitude(altFt: number, transAlt: number): string {
  if (altFt > transAlt) return `FL${String(Math.round(altFt / 100)).padStart(3, '0')}`;
  return String(Math.round(altFt));
}

export function parseSpeed(raw: string): number | null {
  const m = raw.trim().match(/^(\d{3})$/);
  if (!m) return null;
  const n = Number(m[1]);
  if (n < 100 || n > 400) return null;
  return n;
}

export function parseMach(raw: string): number | null {
  const m = raw.trim().match(/^\.?(\d{1,3})$/);
  if (!m) return null;
  const v = Number(`0.${m[1]}`);
  if (v < 0.4 || v > 0.86) return null;
  return v;
}

// slash rule for combined speed/alt fields like 280/.78 or 250/10000
// either side may be omitted but the slash is required when both could apply
export interface SpeedAltEntry {
  speed?: number;
  mach?: number;
  alt?: number;
  altRestr?: AltRestr;
}

export function parseSpeedAlt(raw: string): SpeedAltEntry | null {
  const s = raw.trim().toUpperCase();
  if (!s.includes('/')) {
    // bare entry: try speed first, then altitude restriction
    const spd = parseSpeed(s);
    if (spd) return { speed: spd };
    const ar = parseAltRestr(s);
    if (ar) return { altRestr: ar };
    return null;
  }
  const [l, r] = s.split('/');
  const out: SpeedAltEntry = {};
  if (l) {
    const spd = parseSpeed(l);
    const mach = spd === null ? parseMach(l) : null;
    if (spd === null && mach === null) return null;
    if (spd !== null) out.speed = spd;
    if (mach !== null) out.mach = mach;
  }
  if (r) {
    // right side is either an altitude restriction or a mach target
    const mach = r.startsWith('.') ? parseMach(r) : null;
    if (mach !== null) {
      out.mach = mach;
    } else {
      const ar = parseAltRestr(r);
      if (!ar) return null;
      out.altRestr = ar;
      out.alt = ar.value;
    }
  }
  if (!l && !r) return null;
  return out;
}

// altitude restriction grammar for LEGS: 10000, 10000A, 10000B, 8000A12000B, FL240
export function parseAltRestr(raw: string): AltRestr | null {
  const s = raw.trim().toUpperCase();
  const win = s.match(/^(\d{3,5})A(\d{3,5})B$/);
  if (win) {
    const a = Number(win[1]);
    const b = Number(win[2]);
    if (a >= b) return null;
    return { type: 'AB', value: a, valueB: b };
  }
  const m = s.match(/^(?:FL)?(\d{1,5})([AB])?$/);
  if (!m) return null;
  let v = Number(m[1]);
  if (s.startsWith('FL') || (m[1].length <= 3 && v < 1000)) {
    if (v < 10 || v > 450) return null;
    v *= 100;
  }
  if (v > 45000) return null;
  const t = m[2] === 'A' ? 'A' : m[2] === 'B' ? 'B' : 'AT';
  return { type: t, value: v };
}

// full lat/lon entry like S2326.1W04628.4
export function parseLatLon(raw: string): { lat: number; lon: number } | null {
  const s = raw.trim().toUpperCase();
  const m = s.match(/^([NS])(\d{2})(\d{2}(?:\.\d)?)([EW])(\d{3})(\d{2}(?:\.\d)?)$/);
  if (!m) return null;
  const latDeg = Number(m[2]);
  const latMin = Number(m[3]);
  const lonDeg = Number(m[5]);
  const lonMin = Number(m[6]);
  if (latDeg > 90 || latMin >= 60 || lonDeg > 180 || lonMin >= 60) return null;
  let lat = latDeg + latMin / 60;
  let lon = lonDeg + lonMin / 60;
  if (m[1] === 'S') lat = -lat;
  if (m[4] === 'W') lon = -lon;
  return { lat, lon };
}

export function parseWind(raw: string): { dir: number; speed: number } | null {
  const m = raw.trim().match(/^(\d{1,3})\/(\d{1,3})$/);
  if (!m) return null;
  const dir = Number(m[1]);
  const speed = Number(m[2]);
  if (dir > 360 || speed > 250) return null;
  return { dir: dir % 360, speed };
}

// weights entered in x1000 lbs, like 138.5
export function parseWeight(raw: string, min = 80, max = 200): number | null {
  const m = raw.trim().match(/^(\d{1,3}(?:\.\d)?)$/);
  if (!m) return null;
  const v = Number(m[1]);
  if (v < min || v > max) return null;
  return v;
}

export function parseCostIndex(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,3})$/);
  if (!m) return null;
  const v = Number(m[1]);
  if (v > 500) return null;
  return v;
}

export function parseCourse(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,3})$/);
  if (!m) return null;
  const v = Number(m[1]);
  if (v > 360) return null;
  return v % 360;
}

export function parseTemp(raw: string): number | null {
  const m = raw.trim().match(/^([+-]?\d{1,2})C?$/);
  if (!m) return null;
  const v = Number(m[1]);
  if (v < -60 || v > 60) return null;
  return v;
}

export function parseTimeHHMM(raw: string): string | null {
  const m = raw.trim().match(/^(\d{2})(\d{2})(?:\.\d)?Z?$/i);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${m[1]}${m[2]}`;
}

export function parseOffset(raw: string): { side: 'L' | 'R'; nm: number } | null {
  const m = raw.trim().toUpperCase().match(/^([LR])(\d{1,2})$/);
  if (!m) return null;
  const nm = Number(m[2]);
  if (nm < 1 || nm > 20) return null;
  return { side: m[1] as 'L' | 'R', nm };
}

// hold leg time like 1.0 or 1.5 (minutes)
export function parseLegTime(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2}(?:\.\d)?)$/);
  if (!m) return null;
  const v = Number(m[1]);
  if (v < 0.5 || v > 9.9) return null;
  return v;
}

export function parseLegDist(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2}(?:\.\d)?)NM?$/i) || raw.trim().match(/^(\d{1,2}(?:\.\d)?)$/);
  if (!m) return null;
  const v = Number(m[1]);
  if (v < 1 || v > 99) return null;
  return v;
}

// quadrant/radial entry like NW/330
export function parseQuadRadial(raw: string): string | null {
  const m = raw.trim().toUpperCase().match(/^(N|NE|E|SE|S|SW|W|NW)\/(\d{3})$/);
  if (!m) return null;
  if (Number(m[2]) > 360) return null;
  return `${m[1]}/${m[2]}`;
}

// place/radial/distance like SVD/180/25 used by FIX INFO
export function parseRadialDist(raw: string): { radial?: number; dist?: number } | null {
  const s = raw.trim().toUpperCase();
  let m = s.match(/^(\d{3})\/(\d{1,3}(?:\.\d)?)$/);
  if (m) return { radial: Number(m[1]) % 360, dist: Number(m[2]) };
  m = s.match(/^(\d{3})\/?$/);
  if (m) return { radial: Number(m[1]) % 360 };
  m = s.match(/^\/(\d{1,3}(?:\.\d)?)$/);
  if (m) return { dist: Number(m[1]) };
  return null;
}

export function parseFlaps(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2})$/);
  if (!m) return null;
  return Number(m[1]);
}

export function parseVSpeed(raw: string): number | null {
  const m = raw.trim().match(/^(\d{2,3})$/);
  if (!m) return null;
  const v = Number(m[1]);
  if (v < 80 || v > 200) return null;
  return v;
}

export function parseCg(raw: string): number | null {
  const m = raw.trim().match(/^(\d{1,2}(?:\.\d)?)$/);
  if (!m) return null;
  return Number(m[1]);
}

export function parseGmt(raw: string): number | null {
  const t = parseTimeHHMM(raw);
  if (t === null) return null;
  return Number(t.slice(0, 2)) * 3600 + Number(t.slice(2)) * 60;
}

// 4 letter navaid class codes from the SUPP NAV DATA table
const VALID_CLASS = /^[VDTN][DHLTWB][HLTU ][WAB ]?$/;
export function parseNavaidClass(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (s.length < 2 || s.length > 4) return null;
  if (!VALID_CLASS.test(s.padEnd(4, ' '))) return null;
  return s;
}

export function parseFreq(raw: string): number | null {
  const m = raw.trim().match(/^(\d{2,3}(?:\.\d{1,2})?)$/);
  if (!m) return null;
  const v = Number(m[1]);
  // vhf navaid band or ndb khz band
  if ((v >= 108 && v <= 118) || (v >= 190 && v <= 535)) return v;
  return null;
}

export function parseIdent(raw: string): string | null {
  const s = raw.trim().toUpperCase();
  if (!/^[A-Z0-9]{1,5}$/.test(s)) return null;
  return s;
}
