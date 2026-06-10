import type { Draft } from 'immer';
import type { FmcState } from './types';
import { bearingDeg, destinationPoint, distanceNm } from './nav/geo';
import { cruiseFuelFlow, econCrzMach, isaTemp, lrcMach, machToIas, machToTas } from './perf/model';
import { edAltFor } from './pages/util';
import { MSG } from './messages';
import { showMessage } from './pageApi';

const D2R = Math.PI / 180;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const norm = (a: number) => ((a % 360) + 360) % 360;
// signed shortest angle from a to b, in degrees
const angDiff = (a: number, b: number) => ((b - a + 540) % 360) - 180;
const round1 = (v: number) => Math.round(v * 10) / 10;

// bank limited turn rate, about 1.1 deg/s at cruise TAS with 25 deg of bank
function turnRateDegSec(tasKt: number): number {
  return clamp((1091 * Math.tan(25 * D2R)) / Math.max(tasKt, 120), 0.8, 3);
}

function walkNoise(d: Draft<FmcState>, dt: number): void {
  const s = d.sim;
  s.satOfs = clamp(s.satOfs + (Math.random() - 0.5) * 0.08 * dt, -1.5, 1.5);
  s.windDirOfs = clamp(s.windDirOfs + (Math.random() - 0.5) * 0.5 * dt, -15, 15);
  s.windSpdOfs = clamp(s.windSpdOfs + (Math.random() - 0.5) * 0.25 * dt, -8, 8);
  d.aircraft.wind.dir = Math.round(norm(s.baseWind.dir + s.windDirOfs));
  d.aircraft.wind.speed = Math.round(Math.max(0, s.baseWind.speed + s.windSpdOfs));
}

// climbs to a new CRZ ALT after a step climb, or descends when DES NOW is active;
// when level, a toy altitude hold breathes around the target so V/S and altitude stay consistent
function vertical(d: Draft<FmcState>, dt: number): void {
  const ac = d.aircraft;
  const plan = d.active;
  let target = plan.perf.crzAlt ?? ac.altitude;
  if (plan.vnav.desNow) target = Math.min(target, Math.max(edAltFor(plan), 2000));
  const diff = target - ac.altitude;

  if (Math.abs(diff) > 150 || Math.abs(ac.vsFpm) > 200) {
    // transition phase: ramped climb or descent toward the new level
    const cmdVs = Math.abs(diff) > 50 ? (diff > 0 ? Math.min(1400, diff) : Math.max(-1600, diff)) : 0;
    ac.vsFpm += clamp(cmdVs - ac.vsFpm, -600 * dt, 600 * dt);
    ac.altitude += (ac.vsFpm * dt) / 60;
    const overshoot = (diff > 0 && ac.altitude > target) || (diff < 0 && ac.altitude < target);
    if (overshoot) {
      ac.altitude = target;
      ac.vsFpm = 0;
    }
    ac.vsFpm = Math.round(ac.vsFpm);
    return;
  }

  // altitude hold: turbulence pushes, a proportional law pulls back to the target.
  // closed form of the linear ODE keeps it stable at any time warp, and V/S is
  // derived from the actual altitude change so the two never disagree
  d.sim.vsTurb = clamp(d.sim.vsTurb + (Math.random() - 0.5) * 18 * dt, -32, 32);
  const k = 4; // fpm of correction per foot of error
  const settle = d.sim.vsTurb / k;
  const err = ac.altitude - target;
  const newErr = settle + (err - settle) * Math.exp(-(k * dt) / 60);
  ac.vsFpm = Math.round(((newErr - err) / dt) * 60);
  ac.altitude = target + newErr;
}

// the speed target follows the CRZ page: entered mach, LRC or ECON by cost index
function speeds(d: Draft<FmcState>, dt: number): void {
  const ac = d.aircraft;
  const plan = d.active;
  const gw = plan.perf.gw ?? ac.grossWeight;
  let tgtMach = ac.mach;
  if (plan.perf.complete) {
    tgtMach =
      plan.vnav.crzTgt?.mach ??
      (plan.vnav.crzMode === 'LRC' ? lrcMach(gw) : econCrzMach(plan.perf.costIndex ?? 0));
  }
  ac.mach = Number((ac.mach + clamp(tgtMach - ac.mach, -0.0008 * dt, 0.0008 * dt)).toFixed(4));

  const isaDev = plan.perf.isaDev ?? 0;
  ac.sat = round1(isaTemp(ac.altitude) + isaDev + d.sim.satOfs);
  // total air temperature from ram rise at current mach
  const kelvin = ac.sat + 273.15;
  ac.tat = round1(kelvin * (1 + 0.2 * ac.mach * ac.mach) - 273.15);
  ac.tas = machToTas(ac.mach, ac.sat);
  ac.ias = machToIas(ac.mach, ac.altitude);
}

function windComponents(d: Draft<FmcState>): { along: number; cross: number } {
  const ac = d.aircraft;
  const rel = (ac.wind.dir + 180 - ac.track) * D2R;
  return { along: ac.wind.speed * Math.cos(rel), cross: ac.wind.speed * Math.sin(rel) };
}

function lateral(d: Draft<FmcState>, dt: number): void {
  const ac = d.aircraft;
  const legs = d.active.legs;
  const hold = d.active.hold;

  if (d.sim.holding) {
    if (!hold || hold.exitArmed) {
      d.sim.holding = false;
    } else {
      // simplified racetrack: a continuous bank limited orbit near the fix
      const rate = turnRateDegSec(ac.tas) * (hold.turnDir === 'L' ? -1 : 1);
      ac.track = norm(ac.track + rate * dt);
      ac.position = destinationPoint(ac.position, ac.track, (ac.groundSpeed * dt) / 3600);
      return;
    }
  }

  let li = d.activeLegIndex;
  while (li < legs.length && legs[li].isDiscontinuity) li++;
  if (li >= legs.length) return;

  let remainHrs = dt / 3600;
  let pos = ac.position;
  let guard = legs.length + 5;

  while (remainHrs > 1e-6 && li < legs.length && guard-- > 0) {
    const tgt = legs[li];
    if (tgt.isDiscontinuity) {
      li++;
      continue;
    }
    const dToWpt = distanceNm(pos, tgt);
    const stepNm = ac.groundSpeed * remainHrs;
    const desired = bearingDeg(pos, tgt);

    // arriving at the hold fix starts the orbit instead of sequencing past it
    if (hold && !hold.exitArmed && tgt.ident === hold.atIdent && dToWpt < Math.max(2, stepNm)) {
      d.sim.holding = true;
      pos = { lat: tgt.lat, lon: tgt.lon };
      break;
    }

    if (stepNm >= dToWpt - 0.1) {
      // fast path for large time warps: consume the leg and keep going
      pos = { lat: tgt.lat, lon: tgt.lon };
      remainHrs -= dToWpt / Math.max(ac.groundSpeed, 60);
      ac.track = desired;
      li++;
      continue;
    }

    // smooth segment: the track slews toward the leg course at a realistic turn rate
    const diff = angDiff(ac.track, desired);
    const maxTurn = turnRateDegSec(ac.tas) * remainHrs * 3600;
    ac.track = norm(ac.track + clamp(diff, -maxTurn, maxTurn));
    pos = destinationPoint(pos, ac.track, stepNm);
    remainHrs = 0;
  }

  ac.position = pos;
  while (li < legs.length && legs[li].isDiscontinuity) li++;
  if (li >= legs.length) {
    li = legs.length - 1;
    showMessage(d, MSG.endOfRoute);
  }
  d.activeLegIndex = li;
}

function fuel(d: Draft<FmcState>, dt: number, groundFlow?: number): void {
  const ac = d.aircraft;
  let ff: number;
  if (groundFlow !== undefined) {
    ff = groundFlow;
  } else {
    // climbs burn far more than the descent idle
    const phaseFactor = ac.vsFpm > 200 ? 1.42 : ac.vsFpm < -200 ? 0.45 : 1;
    const wobble = 1 + Math.sin(ac.clock.gmtSeconds / 13) * 0.012;
    ff = cruiseFuelFlow(ac.grossWeight, ac.altitude) * phaseFactor * wobble;
  }
  ac.fuel.fuelFlow = Math.round(ff);

  let burn = (ff * dt) / 3600 / 1000;
  ac.fuel.total = Math.max(0, ac.fuel.total - burn);
  ac.grossWeight = Math.max(0, ac.grossWeight - burn);
  // the 737 feeds from the center tank first, then the wing mains split the load
  const [m1, ctr, m2] = ac.fuel.perTank;
  let c = ctr;
  if (c > 0.005) {
    const take = Math.min(c, burn);
    c -= take;
    burn -= take;
  }
  const half = burn / 2;
  ac.fuel.perTank = [Math.max(0, m1 - half), Math.max(0, c), Math.max(0, m2 - half)];
  if (d.active.perf.zfw !== undefined) {
    d.active.perf.gw = Number((d.active.perf.zfw + ac.fuel.total).toFixed(1));
  }
}

export function advanceSim(d: Draft<FmcState>, dt: number): void {
  const ac = d.aircraft;
  ac.clock.gmtSeconds = (ac.clock.gmtSeconds + dt) % 86400;

  if (ac.onGround) {
    // engines or APU still sip fuel while taxiing
    if (ac.phase === 'TAXI') fuel(d, dt, 1450);
    return;
  }

  walkNoise(d, dt);
  vertical(d, dt);
  speeds(d, dt);

  // ground speed for this tick uses the pre movement track, close enough at 1 Hz
  const pre = windComponents(d);
  ac.groundSpeed = Math.max(60, Math.round(ac.tas + pre.along));

  lateral(d, dt);

  // wind triangle after the turn: crab angle keeps heading off the track
  const post = windComponents(d);
  ac.groundSpeed = Math.max(60, Math.round(ac.tas + post.along));
  const crab = Math.asin(clamp(post.cross / Math.max(ac.tas, 1), -0.5, 0.5)) / D2R;
  ac.heading = norm(Math.round((ac.track - crab) * 10) / 10);
  ac.track = Math.round(ac.track * 10) / 10;

  fuel(d, dt);
}
