import type { FmcState, Leg, PlanData } from '../types';
import { planFor } from '../pageApi';
import { fmtGmt, distanceNm, bearingDeg, toMagnetic } from '../nav/geo';
import { findAirport, ndb } from '../nav/ndb';
import { distanceAlongRoute } from '../nav/route';
import { cruiseFuelFlow, descentDistNm } from '../perf/model';

export function fmtWt(v: number | undefined, dashes = '---.-'): string {
  if (v === undefined) return dashes;
  return v.toFixed(1);
}

export function fmtFL(altFt: number): string {
  return `FL${String(Math.round(altFt / 100)).padStart(3, '0')}`;
}

export function fmtAlt(altFt: number, transAlt: number): string {
  return altFt > transAlt ? fmtFL(altFt) : String(Math.round(altFt));
}

export function fmtRestrAlt(leg: Leg, transAlt: number): string {
  const ar = leg.altRestr;
  if (!ar) return '';
  const a = fmtAlt(ar.value, transAlt);
  if (ar.type === 'A') return `${a}A`;
  if (ar.type === 'B') return `${a}B`;
  if (ar.type === 'AB') return `${a}A${fmtAlt(ar.valueB ?? 0, transAlt)}B`;
  return a;
}

// the "250/FL360" style speed/alt cell used on LEGS
export function fmtLegConstraint(leg: Leg, transAlt: number, dflt = ''): string {
  const spd = leg.speedRestr ? String(leg.speedRestr) : '';
  const alt = fmtRestrAlt(leg, transAlt);
  if (!spd && !alt) return dflt;
  if (spd && alt) return `${spd}/${alt}`;
  if (spd) return `${spd}/`;
  return alt;
}

export function fmtMach(m: number): string {
  return `.${String(Math.round(m * 1000)).padStart(3, '0')}`;
}

export function fmtCrs(c: number): string {
  return `${String(Math.round(c)).padStart(3, '0')}°`;
}

export function fmtDist(nm: number): string {
  if (nm >= 100) return String(Math.round(nm));
  return nm.toFixed(0);
}

export function fmtWind(w?: { dir: number; speed: number }): string {
  if (!w) return '---°/--';
  return `${String(Math.round(w.dir)).padStart(3, '0')}°/${String(Math.round(w.speed)).padStart(2, '0')}`;
}

// ground speed used for predictions when the airplane is not actually moving
export function predictedGs(s: FmcState): number {
  if (s.aircraft.groundSpeed > 80) return s.aircraft.groundSpeed;
  const plan = planFor(s);
  const w = plan.perf.crzWind;
  const tas = 450;
  if (!w) return tas;
  // rough along-track component using the overall route direction
  const legs = plan.legs.filter((l) => !l.isDiscontinuity);
  if (legs.length < 2) return tas;
  const crs = bearingDeg(legs[0], legs[legs.length - 1]);
  return Math.round(tas + w.speed * Math.cos(((w.dir + 180 - crs) * Math.PI) / 180));
}

export function etaAt(s: FmcState, distNm: number): string {
  const gs = predictedGs(s);
  if (gs < 50) return '----z';
  const eta = s.aircraft.clock.gmtSeconds + (distNm / gs) * 3600;
  return fmtGmt(eta);
}

// fuel remaining estimate after flying distNm from present position
export function fuelAt(s: FmcState, distNm: number): number {
  const gs = predictedGs(s);
  const ff = s.aircraft.fuel.fuelFlow > 100 ? s.aircraft.fuel.fuelFlow : cruiseFuelFlow(s.aircraft.grossWeight, 36000);
  const burn = (distNm / Math.max(gs, 100)) * (ff / 1000);
  return Math.max(0, s.aircraft.fuel.total - burn);
}

export function destInfo(s: FmcState): { dist: number; eta: string; fuel: number } | null {
  const plan = planFor(s);
  if (!plan.dest || plan.legs.length === 0) return null;
  let dist = distanceAlongRoute(s, plan.legs.length - 1);
  if (s.aircraft.onGround) {
    // on the ground the whole route counts, measured leg to leg
    dist = 0;
    const legs = plan.legs.filter((l) => !l.isDiscontinuity);
    for (let i = 1; i < legs.length; i++) dist += distanceNm(legs[i - 1], legs[i]);
  }
  return { dist: Math.round(dist), eta: etaAt(s, dist), fuel: fuelAt(s, dist) };
}

export function edAltFor(plan: PlanData): number {
  if (plan.vnav.edAlt) return plan.vnav.edAlt;
  const appLeg = plan.legs.find((l) => l.fromProcedure === 'APP' && l.altRestr);
  if (appLeg?.altRestr) return appLeg.altRestr.value;
  const dest = plan.dest ? findAirport(plan.dest) : undefined;
  return dest ? dest.elev + 50 : 1500;
}

export function todDistFromDest(s: FmcState): number {
  const plan = planFor(s);
  const dest = plan.dest ? findAirport(plan.dest) : undefined;
  const base = descentDistNm(plan.perf.crzAlt ?? 36000, dest?.elev ?? 0);
  return plan.desForecast.antiIce ? base + 5 : base;
}

export function magCourse(from: { lat: number; lon: number }, to: { lat: number; lon: number }): number {
  return Math.round(toMagnetic(bearingDeg(from, to), from));
}

export function nearestAirports(s: FmcState, n: number): { ident: string; dist: number; brg: number }[] {
  const pos = s.aircraft.position;
  return ndb.airports
    .map((a) => ({
      ident: a.ident,
      dist: Math.round(distanceNm(pos, a)),
      brg: Math.round(toMagnetic(bearingDeg(pos, a), pos)),
    }))
    .sort((x, y) => x.dist - y.dist)
    .slice(0, n);
}
