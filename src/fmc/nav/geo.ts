import type { LatLon } from '../types';

const R_NM = 3440.065; // earth radius in nautical miles
const D2R = Math.PI / 180;
const R2D = 180 / Math.PI;

export function distanceNm(a: LatLon, b: LatLon): number {
  const dLat = (b.lat - a.lat) * D2R;
  const dLon = (b.lon - a.lon) * D2R;
  const la1 = a.lat * D2R;
  const la2 = b.lat * D2R;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R_NM * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function bearingDeg(a: LatLon, b: LatLon): number {
  const la1 = a.lat * D2R;
  const la2 = b.lat * D2R;
  const dLon = (b.lon - a.lon) * D2R;
  const y = Math.sin(dLon) * Math.cos(la2);
  const x = Math.cos(la1) * Math.sin(la2) - Math.sin(la1) * Math.cos(la2) * Math.cos(dLon);
  return (Math.atan2(y, x) * R2D + 360) % 360;
}

export function destinationPoint(from: LatLon, bearing: number, distNm: number): LatLon {
  const br = bearing * D2R;
  const d = distNm / R_NM;
  const la1 = from.lat * D2R;
  const lo1 = from.lon * D2R;
  const la2 = Math.asin(Math.sin(la1) * Math.cos(d) + Math.cos(la1) * Math.sin(d) * Math.cos(br));
  const lo2 =
    lo1 + Math.atan2(Math.sin(br) * Math.sin(d) * Math.cos(la1), Math.cos(d) - Math.sin(la1) * Math.sin(la2));
  return { lat: la2 * R2D, lon: ((lo2 * R2D + 540) % 360) - 180 };
}

// rough magnetic variation for Brazil, around -21 deg west; good enough for display
export function magVar(p: LatLon): number {
  return -(18 + (p.lon + 38) * -0.3);
}

export function toMagnetic(trueDeg: number, p: LatLon): number {
  return (trueDeg - magVar(p) + 360) % 360;
}

export function fmtLat(lat: number): string {
  const h = lat >= 0 ? 'N' : 'S';
  const abs = Math.abs(lat);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${h}${String(deg).padStart(2, '0')}°${min.toFixed(1).padStart(4, '0')}`;
}

export function fmtLon(lon: number): string {
  const h = lon >= 0 ? 'E' : 'W';
  const abs = Math.abs(lon);
  const deg = Math.floor(abs);
  const min = (abs - deg) * 60;
  return `${h}${String(deg).padStart(3, '0')}°${min.toFixed(1).padStart(4, '0')}`;
}

export function fmtLatLon(p: LatLon): string {
  return `${fmtLat(p.lat)}${fmtLon(p.lon)}`;
}

export function fmtGmt(seconds: number, withZ = true): string {
  const s = Math.floor(seconds) % 86400;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return `${String(h).padStart(2, '0')}${String(m).padStart(2, '0')}${withZ ? 'z' : ''}`;
}

export function fmtGmtTenths(seconds: number): string {
  const s = Math.floor(seconds) % 86400;
  const h = Math.floor(s / 3600);
  const m = (s % 3600) / 60;
  return `${String(h).padStart(2, '0')}${m.toFixed(1).padStart(4, '0')}z`;
}
