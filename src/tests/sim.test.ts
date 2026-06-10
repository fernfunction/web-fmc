import { beforeEach, describe, expect, it } from 'vitest';
import { useFmcStore } from '../fmc/store';
import { bearingDeg } from '../fmc/nav/geo';
import { isaTemp } from '../fmc/perf/model';

const store = () => useFmcStore.getState();
const ang = (a: number, b: number) => Math.abs(((b - a + 540) % 360) - 180);

describe('simulation detail', () => {
  beforeEach(() => store().loadScenario('cruise'));

  it('turns gradually toward the leg course instead of snapping', () => {
    useFmcStore.setState((s) => ({ ...s, aircraft: { ...s.aircraft, track: 120, heading: 120 } }));
    store().tick(1);
    const moved = ang(120, store().aircraft.track);
    // bank limited turn rate sits near 1.1 deg per second at cruise TAS
    expect(moved).toBeGreaterThan(0.3);
    expect(moved).toBeLessThan(3.5);
    for (let i = 0; i < 300; i++) store().tick(1);
    const s = store();
    const leg = s.active.legs[s.activeLegIndex];
    expect(ang(s.aircraft.track, bearingDeg(s.aircraft.position, leg))).toBeLessThan(5);
  });

  it('keeps temperatures alive and consistent with altitude and mach', () => {
    const sats: number[] = [];
    for (let i = 0; i < 90; i++) {
      store().tick(1);
      sats.push(store().aircraft.sat);
    }
    const s = store();
    const expected = isaTemp(s.aircraft.altitude) + (s.active.perf.isaDev ?? 0);
    expect(Math.abs(s.aircraft.sat - expected)).toBeLessThanOrEqual(2);
    // ram rise puts TAT well above SAT at cruise mach
    expect(s.aircraft.tat).toBeGreaterThan(s.aircraft.sat + 20);
    expect(s.aircraft.tat).toBeLessThan(s.aircraft.sat + 35);
    // and the reading drifts instead of freezing
    expect(new Set(sats).size).toBeGreaterThan(1);
  });

  it('flies a step climb gradually after the new CRZ ALT is active', () => {
    useFmcStore.setState((s) => ({
      ...s,
      active: { ...s.active, perf: { ...s.active.perf, crzAlt: 38000 } },
    }));
    const satBefore = store().aircraft.sat;
    store().tick(10);
    const climbed = store().aircraft.altitude - 36000;
    expect(climbed).toBeGreaterThan(1);
    expect(climbed).toBeLessThan(300);
    expect(store().aircraft.vsFpm).toBeGreaterThan(200);
    store().tick(600);
    expect(Math.abs(store().aircraft.altitude - 38000)).toBeLessThan(40);
    expect(store().aircraft.sat).toBeLessThan(satBefore - 2);
  });

  it('keeps V/S consistent with the altitude change while holding level', () => {
    // settle into the hold law first
    store().tick(5);
    const vsSamples: number[] = [];
    let prevAlt = store().aircraft.altitude;
    for (let i = 0; i < 120; i++) {
      store().tick(1);
      const ac = store().aircraft;
      // the indicated V/S must match the altitude actually gained or lost
      expect(Math.abs(ac.altitude - prevAlt - ac.vsFpm / 60)).toBeLessThan(0.6);
      // and the excursion stays a gentle breath around the target
      expect(Math.abs(ac.altitude - 36000)).toBeLessThan(40);
      vsSamples.push(ac.vsFpm);
      prevAlt = ac.altitude;
    }
    // turbulence is an aperiodic walk, not a frozen needle or a clean sine
    expect(new Set(vsSamples).size).toBeGreaterThan(3);
    expect(Math.max(...vsSamples.map(Math.abs))).toBeLessThanOrEqual(100);
  });

  it('descends when DES NOW is active', () => {
    useFmcStore.setState((s) => ({
      ...s,
      active: { ...s.active, vnav: { ...s.active.vnav, desNow: true } },
    }));
    store().tick(120);
    expect(store().aircraft.altitude).toBeLessThan(35000);
    expect(store().aircraft.vsFpm).toBeLessThan(-500);
  });

  it('burns the center tank before the wing mains', () => {
    const [m1Before, ctrBefore] = store().aircraft.fuel.perTank;
    store().tick(600);
    const [m1, ctr] = store().aircraft.fuel.perTank;
    expect(ctr).toBeLessThan(ctrBefore - 0.5);
    expect(m1).toBeCloseTo(m1Before, 1);
  });

  it('derives ground speed and crab angle from the wind triangle', () => {
    store().tick(5);
    const ac = store().aircraft;
    const rel = ((ac.wind.dir + 180 - ac.track) * Math.PI) / 180;
    const along = ac.wind.speed * Math.cos(rel);
    expect(Math.abs(ac.groundSpeed - (ac.tas + along))).toBeLessThanOrEqual(1.5);
    // crosswind keeps the nose crabbed off the track
    expect(ang(ac.heading, ac.track)).toBeGreaterThan(0.5);
  });

  it('orbits in the hold and resumes after the exit is armed', () => {
    const s0 = store();
    const leg = s0.active.legs[s0.activeLegIndex];
    useFmcStore.setState((s) => ({
      ...s,
      active: {
        ...s.active,
        hold: {
          atIdent: leg.ident,
          inboundCourse: 36,
          turnDir: 'R' as const,
          legTimeMin: 1.5,
          exitArmed: false,
        },
      },
      aircraft: { ...s.aircraft, position: { lat: leg.lat - 0.02, lon: leg.lon } },
    }));
    store().tick(10);
    expect(store().sim.holding).toBe(true);
    const trk0 = store().aircraft.track;
    store().tick(30);
    expect(store().sim.holding).toBe(true);
    expect(ang(trk0, store().aircraft.track)).toBeGreaterThan(10);
    useFmcStore.setState((s) => ({
      ...s,
      active: { ...s.active, hold: { ...s.active.hold!, exitArmed: true } },
    }));
    store().tick(5);
    expect(store().sim.holding).toBe(false);
  });

  it('still burns fuel while taxiing', () => {
    store().loadScenario('taxi');
    const before = store().aircraft.fuel.total;
    store().tick(600);
    expect(store().aircraft.fuel.total).toBeLessThan(before);
    expect(store().aircraft.fuel.fuelFlow).toBe(1450);
  });
});
