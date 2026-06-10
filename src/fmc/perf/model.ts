// simplified 737-800/CFM56-7B26 performance model
// numbers aim for plausible and internally consistent, not aerodynamic accuracy

export interface VSpeeds {
  v1: number;
  vr: number;
  v2: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// gw in x1000 lbs, takeoff flaps 1/5/10/15/25
export function takeoffSpeeds(gw: number, flaps: number): VSpeeds {
  const flapShift: Record<number, number> = { 1: 8, 5: 0, 10: -4, 15: -7, 25: -11 };
  const shift = flapShift[flaps] ?? 0;
  const v2 = Math.round(clamp(125 + (gw - 120) * 0.55 + shift, 110, 175));
  const vr = v2 - 5;
  const v1 = vr - 4;
  return { v1, vr, v2 };
}

export function isValidTakeoffFlaps(flaps: number): boolean {
  return [1, 5, 10, 15, 25].includes(flaps);
}

// landing reference speeds, flaps 15/30/40
export function vref(gw: number, flaps: 15 | 30 | 40): number {
  const v40 = 134 + (gw - 130) * 0.52;
  const add = flaps === 40 ? 0 : flaps === 30 ? 7 : 21;
  return Math.round(clamp(v40 + add, 105, 185));
}

// stab trim units from CG %MAC
export function trimForCg(cg: number): number {
  return Math.round((8.8 - 0.23 * cg) * 100) / 100 >= 0 ? Number((8.8 - 0.23 * cg).toFixed(2)) : 0;
}

export function isValidCg(cg: number): boolean {
  return cg >= 5 && cg <= 32;
}

// takeoff N1 for the 26K rating, derated steps knock a couple percent off
export function takeoffN1(oat: number, elevFt: number, rating: 'TO' | 'TO-1' | 'TO-2'): number {
  const derate = rating === 'TO' ? 0 : rating === 'TO-1' ? 2.1 : 4.3;
  const n1 = 94.2 + (oat - 15) * 0.08 + (elevFt / 1000) * 0.25 - derate;
  return Number(clamp(n1, 80, 101).toFixed(1));
}

export function climbN1(rating: 'CLB' | 'CLB-1' | 'CLB-2', altFt: number): number {
  const derate = rating === 'CLB' ? 0 : rating === 'CLB-1' ? 1.8 : 3.6;
  const n1 = 92.5 + (altFt / 1000) * 0.12 - derate;
  return Number(clamp(n1, 80, 101).toFixed(1));
}

// econ speeds driven by cost index
export function econClbSpeed(ci: number): { ias: number; mach: number } {
  const ias = Math.round(clamp(270 + ci * 0.14, 270, 335));
  return { ias, mach: Number(clamp(0.76 + ci * 0.00012, 0.76, 0.81).toFixed(3)) };
}

export function econCrzMach(ci: number): number {
  return Number(clamp(0.776 + ci * 0.00009, 0.776, 0.82).toFixed(3));
}

export function econDesSpeed(ci: number): { mach: number; ias: number } {
  return {
    mach: Number(clamp(0.775 + ci * 0.00008, 0.775, 0.8).toFixed(3)),
    ias: Math.round(clamp(265 + ci * 0.13, 265, 330)),
  };
}

// long range cruise sits just under MRC-holding mach, weight nudges it
export function lrcMach(gw: number): number {
  return Number(clamp(0.788 + (gw - 130) * 0.0003, 0.78, 0.8).toFixed(3));
}

export function optAlt(gw: number): number {
  return Math.round(clamp(41000 - (gw - 100) * 105, 28000, 41000) / 100) * 100;
}

export function maxAlt(gw: number): number {
  return Math.round(clamp(optAlt(gw) + 1900, 29000, 41000) / 100) * 100;
}

// total fuel flow lbs/hr in cruise
export function cruiseFuelFlow(gw: number, altFt: number): number {
  const base = 4900 + (gw - 120) * 21;
  const altPenalty = (36000 - altFt) * 0.02;
  return Math.round(clamp(base + altPenalty, 3800, 7800));
}

export function engOutMaxAlt(gw: number): number {
  return Math.round(clamp(24500 - (gw - 120) * 90, 14000, 26000) / 100) * 100;
}

export function engOutSpeed(gw: number): number {
  return Math.round(clamp(210 + (gw - 110) * 0.35, 200, 240));
}

export function maxContN1(): number {
  return 97.4;
}

export function turbN1(altFt: number): number {
  return Number(clamp(78 + (altFt / 1000) * 0.35, 75, 92).toFixed(1));
}

// distance to climb from origin elev to cruise alt, simple geometry
export function climbDistNm(crzAlt: number, originElev: number): number {
  const deltaFt = Math.max(0, crzAlt - originElev);
  // about 2200 fpm average at 320 kt ground speed
  return Math.round((deltaFt / 2200) * (320 / 60));
}

// idle path descent, roughly 3 NM per 1000 ft
export function descentDistNm(crzAlt: number, destElev: number): number {
  return Math.round(((crzAlt - destElev) / 1000) * 3);
}

export function machToIas(mach: number, altFt: number): number {
  // crude compressible conversion that behaves sanely between FL250 and FL410
  const cs = 661.5 * Math.sqrt(Math.max(0.6, 1 - (altFt / 1000) * 0.0068));
  const tas = mach * cs;
  const sigma = Math.max(0.25, 1 - (altFt / 1000) * 0.0205);
  return Math.round(tas * Math.sqrt(sigma));
}

export function machToTas(mach: number, satC: number): number {
  return Math.round(mach * 38.97 * Math.sqrt(satC + 273.15));
}

export function isaTemp(altFt: number): number {
  return Number((15 - 1.98 * (altFt / 1000)).toFixed(1));
}
