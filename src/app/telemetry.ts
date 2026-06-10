import { useFmcStore } from '../fmc/store';
import { distanceNm } from '../fmc/nav/geo';
import { distanceAlongRoute } from '../fmc/nav/route';

// ring buffers sampled at 1 Hz outside React; charts read these columns directly
export const SERIES_KEYS = [
  'alt',
  'ias',
  'tas',
  'gs',
  'mach',
  'hdg',
  'trk',
  'vs',
  'gw',
  'fuel',
  'ff',
  'tank1',
  'tankC',
  'tank2',
  'sat',
  'tat',
  'windDir',
  'windSpd',
  'dtgWpt',
  'dtgDest',
  'lat',
  'lon',
] as const;

export type SeriesKey = (typeof SERIES_KEYS)[number];

const MAX_SAMPLES = 600;

const timeCol: number[] = [];
const cols = Object.fromEntries(SERIES_KEYS.map((k) => [k, []])) as unknown as Record<
  SeriesKey,
  (number | null)[]
>;

let version = 0;
const listeners = new Set<() => void>();
let timer: number | null = null;
let lastScenario = '';
let lastGmt = -1;

function emit() {
  version++;
  listeners.forEach((fn) => fn());
}

function reset() {
  timeCol.length = 0;
  for (const k of SERIES_KEYS) cols[k].length = 0;
}

export function sampleOnce(now = Date.now() / 1000): void {
  const s = useFmcStore.getState();
  // scenario swap or a clock jump backwards means a fresh run
  if (s.scenario !== lastScenario || s.aircraft.clock.gmtSeconds < lastGmt - 5) reset();
  lastScenario = s.scenario;
  lastGmt = s.aircraft.clock.gmtSeconds;

  const ac = s.aircraft;
  const legs = s.active.legs;
  const activeLeg = legs[s.activeLegIndex];
  const flying = !ac.onGround && ac.groundSpeed > 50;

  timeCol.push(now);
  cols.alt.push(ac.altitude);
  cols.ias.push(ac.ias);
  cols.tas.push(ac.tas);
  cols.gs.push(ac.groundSpeed);
  cols.mach.push(ac.mach);
  cols.hdg.push(ac.heading);
  cols.trk.push(ac.track);
  cols.vs.push(ac.vsFpm);
  cols.gw.push(ac.grossWeight);
  cols.fuel.push(ac.fuel.total);
  cols.ff.push(ac.fuel.fuelFlow);
  cols.tank1.push(ac.fuel.perTank[0]);
  cols.tankC.push(ac.fuel.perTank[1]);
  cols.tank2.push(ac.fuel.perTank[2]);
  cols.sat.push(ac.sat);
  cols.tat.push(ac.tat);
  cols.windDir.push(ac.wind.dir);
  cols.windSpd.push(ac.wind.speed);
  cols.dtgWpt.push(flying && activeLeg && !activeLeg.isDiscontinuity ? distanceNm(ac.position, activeLeg) : null);
  cols.dtgDest.push(flying && legs.length ? distanceAlongRoute(s, legs.length - 1) : null);
  cols.lat.push(ac.position.lat);
  cols.lon.push(ac.position.lon);

  if (timeCol.length > MAX_SAMPLES) {
    timeCol.shift();
    for (const k of SERIES_KEYS) cols[k].shift();
  }
  emit();
}

export function startTelemetry(): void {
  if (timer !== null) return;
  sampleOnce();
  timer = window.setInterval(() => sampleOnce(), 1000);
}

export function stopTelemetry(): void {
  if (timer !== null) {
    window.clearInterval(timer);
    timer = null;
  }
}

export function subscribeTelemetry(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function telemetryVersion(): number {
  return version;
}

export function getTimeColumn(): number[] {
  return timeCol;
}

export function getSeries(key: SeriesKey): (number | null)[] {
  return cols[key];
}
