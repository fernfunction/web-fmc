import raw from '../../data/ndb.json';
import type { AltRestr, LatLon, Leg } from '../types';

export interface Runway {
  id: string;
  hdg: number;
  lengthFt: number;
  ils?: { freq: number; crs: number };
}

export interface Gate {
  id: string;
  lat: number;
  lon: number;
}

export interface Airport {
  ident: string;
  name: string;
  lat: number;
  lon: number;
  elev: number;
  runways: Runway[];
  gates: Gate[];
}

export interface Waypoint {
  ident: string;
  lat: number;
  lon: number;
}

export interface Navaid {
  ident: string;
  name: string;
  freq: number;
  lat: number;
  lon: number;
  cls: string;
}

export interface ProcLeg {
  ident: string;
  spd?: number;
  alt?: string; // encoded like A7000, B12000, AT5000
}

export interface Procedure {
  name: string;
  runways?: string[];
  runway?: string;
  legs: ProcLeg[];
}

export interface CompanyRoute {
  name: string;
  origin: string;
  dest: string;
  fltNo: string;
  route: { via: string; to: string }[];
}

export interface AiracCycle {
  cycle: string;
  from: string;
  to: string;
  year: string;
}

export const ndb = {
  airac: raw.airac as { active: AiracCycle; next: AiracCycle },
  opProgram: raw.opProgram,
  coData: raw.coData,
  model: raw.model,
  engRating: raw.engRating,
  airports: raw.airports as Airport[],
  waypoints: raw.waypoints as Waypoint[],
  navaids: raw.navaids as Navaid[],
  airways: raw.airways as { name: string; fixes: string[] }[],
  procedures: raw.procedures as Record<
    string,
    { sids: Procedure[]; stars: Procedure[]; approaches: Procedure[] }
  >,
  companyRoutes: raw.companyRoutes as CompanyRoute[],
};

export interface FixHit {
  ident: string;
  lat: number;
  lon: number;
  kind: 'WPT' | 'NAVAID' | 'ARPT' | 'SUPP';
  freq?: number;
  cls?: string;
  elev?: number;
  name?: string;
}

export function findAirport(ident: string): Airport | undefined {
  return ndb.airports.find((a) => a.ident === ident.toUpperCase());
}

export function findAirway(name: string): { name: string; fixes: string[] } | undefined {
  return ndb.airways.find((a) => a.name === name.toUpperCase());
}

export function findCompanyRoute(name: string): CompanyRoute | undefined {
  return ndb.companyRoutes.find((r) => r.name === name.toUpperCase());
}

// returns all database hits for an ident; more than one means SELECT DESIRED WPT
export function findFixes(identRaw: string, supp?: { waypoints: Waypoint[]; navaids: { ident: string; lat: number; lon: number; freq: number; cls: string }[] }): FixHit[] {
  const ident = identRaw.toUpperCase();
  const hits: FixHit[] = [];
  for (const w of ndb.waypoints) {
    if (w.ident === ident) hits.push({ ident, lat: w.lat, lon: w.lon, kind: 'WPT' });
  }
  for (const n of ndb.navaids) {
    if (n.ident === ident)
      hits.push({ ident, lat: n.lat, lon: n.lon, kind: 'NAVAID', freq: n.freq, cls: n.cls, name: n.name });
  }
  for (const a of ndb.airports) {
    if (a.ident === ident) hits.push({ ident, lat: a.lat, lon: a.lon, kind: 'ARPT', elev: a.elev, name: a.name });
  }
  if (supp) {
    for (const w of supp.waypoints) {
      if (w.ident === ident) hits.push({ ident, lat: w.lat, lon: w.lon, kind: 'SUPP' });
    }
    for (const n of supp.navaids) {
      if (n.ident === ident) hits.push({ ident, lat: n.lat, lon: n.lon, kind: 'SUPP', freq: n.freq, cls: n.cls });
    }
  }
  return hits;
}

export function parseProcAlt(code?: string): AltRestr | undefined {
  if (!code) return undefined;
  if (code.startsWith('AT')) return { type: 'AT', value: Number(code.slice(2)) };
  if (code.startsWith('A')) return { type: 'A', value: Number(code.slice(1)) };
  if (code.startsWith('B')) return { type: 'B', value: Number(code.slice(1)) };
  return undefined;
}

export function procLegToLeg(pl: ProcLeg, from: 'SID' | 'STAR' | 'APP', via: string): Leg | null {
  const hit = findFixes(pl.ident)[0];
  if (!hit) return null;
  return {
    ident: pl.ident,
    lat: hit.lat,
    lon: hit.lon,
    via,
    fromProcedure: from,
    speedRestr: pl.spd,
    altRestr: parseProcAlt(pl.alt),
  };
}

// expands an airway segment between entry and exit fixes (exclusive of entry, inclusive of exit)
export function expandAirway(name: string, entry: string, exit: string): string[] | null {
  const awy = findAirway(name);
  if (!awy) return null;
  const i = awy.fixes.indexOf(entry.toUpperCase());
  const j = awy.fixes.indexOf(exit.toUpperCase());
  if (i < 0 || j < 0 || i === j) return null;
  const out: string[] = [];
  const step = j > i ? 1 : -1;
  for (let k = i + step; step > 0 ? k <= j : k >= j; k += step) out.push(awy.fixes[k]);
  return out;
}

export function airportFixes(airport: Airport): LatLon {
  return { lat: airport.lat, lon: airport.lon };
}
