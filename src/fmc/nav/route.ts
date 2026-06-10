import type { FmcState, LatLon, Leg, PlanData, RouteSpecItem } from '../types';
import { bearingDeg, distanceNm, toMagnetic } from './geo';
import { expandAirway, findAirport, findFixes, ndb, procLegToLeg } from './ndb';

export type { RouteSpecItem };

function pushLeg(legs: Leg[], leg: Leg): void {
  const last = [...legs].reverse().find((l) => !l.isDiscontinuity);
  // collapse duplicates where a procedure ends on the same fix the route starts with
  if (last && last.ident === leg.ident) return;
  legs.push(leg);
}

// builds the full leg list: SID legs, enroute spec, STAR legs, approach legs, runway
export function buildLegs(plan: {
  origin?: string;
  dest?: string;
  runway?: string;
  sid?: string;
  star?: string;
  approach?: string;
  route: RouteSpecItem[];
}): Leg[] {
  const legs: Leg[] = [];
  const origin = plan.origin ? findAirport(plan.origin) : undefined;
  const dest = plan.dest ? findAirport(plan.dest) : undefined;

  if (origin && plan.sid) {
    const sid = ndb.procedures[origin.ident]?.sids.find((s) => s.name === plan.sid);
    if (sid) {
      for (const pl of sid.legs) {
        const leg = procLegToLeg(pl, 'SID', sid.name);
        if (leg) pushLeg(legs, leg);
      }
    }
  }

  let prev = legs.length ? legs[legs.length - 1].ident : undefined;
  for (const item of plan.route) {
    const via = item.via.toUpperCase();
    if (via === 'DIRECT' || via === 'DCT') {
      const hit = findFixes(item.to)[0];
      if (hit) pushLeg(legs, { ident: hit.ident, lat: hit.lat, lon: hit.lon, via: 'DIRECT' });
    } else if (prev) {
      const fixes = expandAirway(via, prev, item.to);
      if (fixes) {
        for (const f of fixes) {
          const hit = findFixes(f)[0];
          if (hit) pushLeg(legs, { ident: hit.ident, lat: hit.lat, lon: hit.lon, via });
        }
      }
    }
    prev = item.to.toUpperCase();
  }

  if (dest && plan.star) {
    const star = ndb.procedures[dest.ident]?.stars.find((s) => s.name === plan.star);
    if (star) {
      for (const pl of star.legs) {
        const leg = procLegToLeg(pl, 'STAR', star.name);
        if (leg) pushLeg(legs, leg);
      }
    }
  }

  if (dest && plan.approach) {
    const app = ndb.procedures[dest.ident]?.approaches.find((a) => a.name === plan.approach);
    if (app) {
      for (const pl of app.legs) {
        const leg = procLegToLeg(pl, 'APP', app.name);
        if (leg) pushLeg(legs, leg);
      }
      const rwy = dest.runways.find((r) => r.id === app.runway);
      if (rwy) {
        pushLeg(legs, {
          ident: `RW${app.runway}`,
          lat: dest.lat,
          lon: dest.lon,
          via: app.name,
          fromProcedure: 'APP',
          isRunway: true,
          altRestr: { type: 'AT', value: dest.elev + 50 },
        });
      }
    }
  }

  return legs;
}

export function realLegs(plan: PlanData): Leg[] {
  return plan.legs.filter((l) => !l.isDiscontinuity);
}

// magnetic course and distance into each leg from its predecessor (or given origin)
export function legCourseDist(legs: Leg[], i: number, from?: LatLon): { crs: number; dist: number } | null {
  const leg = legs[i];
  if (!leg || leg.isDiscontinuity) return null;
  let prev: LatLon | undefined = from;
  for (let k = i - 1; k >= 0; k--) {
    if (!legs[k].isDiscontinuity) {
      prev = { lat: legs[k].lat, lon: legs[k].lon };
      break;
    }
  }
  if (!prev) return null;
  const to = { lat: leg.lat, lon: leg.lon };
  return { crs: Math.round(toMagnetic(bearingDeg(prev, to), prev)), dist: distanceNm(prev, to) };
}

// distance from present position to a given leg index, then along remaining legs
export function distanceAlongRoute(s: FmcState, toLegIndex: number): number {
  const legs = (s.mod ?? s.active).legs;
  if (s.activeLegIndex >= legs.length) return 0;
  let dist = 0;
  let pos: LatLon = s.aircraft.position;
  for (let i = s.activeLegIndex; i <= Math.min(toLegIndex, legs.length - 1); i++) {
    const leg = legs[i];
    if (leg.isDiscontinuity) continue;
    dist += distanceNm(pos, leg);
    pos = leg;
  }
  return dist;
}

export function destDistanceNm(s: FmcState): number {
  const plan = s.mod ?? s.active;
  return distanceAlongRoute(s, plan.legs.length - 1);
}

export function etaSeconds(s: FmcState, distNm: number): number | null {
  const gs = s.aircraft.groundSpeed;
  if (gs < 50) return null;
  return s.aircraft.clock.gmtSeconds + (distNm / gs) * 3600;
}

export function findLegIndex(legs: Leg[], ident: string): number {
  return legs.findIndex((l) => !l.isDiscontinuity && l.ident === ident.toUpperCase());
}
