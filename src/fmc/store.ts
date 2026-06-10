import { create } from 'zustand';
import { produce, type Draft } from 'immer';
import type {
  AircraftState,
  FmcState,
  LskSlot,
  ModeKey,
  PageId,
  PlanData,
  ScenarioId,
} from './types';
import { emptyPlan, showMessage } from './pageApi';
import { getPage } from './pageRouter';
import { buildLegs, findLegIndex, type RouteSpecItem } from './nav/route';
import { takeoffSpeeds } from './perf/model';
import { advanceSim } from './sim';
import preflightJson from '../data/scenarios/preflight.json';
import taxiJson from '../data/scenarios/taxi.json';
import cruiseJson from '../data/scenarios/cruise.json';

interface ScenarioJson {
  id: ScenarioId;
  label: string;
  initialPage: PageId;
  identConfirmed: boolean;
  posInitDone: boolean;
  activeLegIdent?: string;
  aircraft: AircraftState;
  plan: {
    origin?: string;
    dest?: string;
    coRoute?: string;
    fltNo?: string;
    runway?: string;
    sid?: string;
    star?: string;
    approach?: string;
    route?: RouteSpecItem[];
    perf: Partial<PlanData['perf']>;
    takeoff: Partial<PlanData['takeoff']> & { acceptSpeeds?: boolean };
    activated: boolean;
    executed: boolean;
  };
}

const scenarios: Record<ScenarioId, ScenarioJson> = {
  preflight: preflightJson as unknown as ScenarioJson,
  taxi: taxiJson as unknown as ScenarioJson,
  cruise: cruiseJson as unknown as ScenarioJson,
};

export const scenarioLabels: { id: ScenarioId; label: string }[] = (
  ['preflight', 'taxi', 'cruise'] as ScenarioId[]
).map((id) => ({ id, label: scenarios[id].label }));

function buildScenarioState(id: ScenarioId): FmcState {
  const sc = scenarios[id];
  const plan = emptyPlan();
  const p = sc.plan;
  plan.origin = p.origin;
  plan.dest = p.dest;
  plan.coRoute = p.coRoute;
  plan.fltNo = p.fltNo;
  plan.runway = p.runway;
  plan.sid = p.sid;
  plan.star = p.star;
  plan.approach = p.approach;
  plan.activated = p.activated;
  plan.executed = p.executed;
  Object.assign(plan.perf, p.perf);
  Object.assign(plan.takeoff, p.takeoff);
  if (p.route) {
    plan.routeSpec = p.route;
    plan.legs = buildLegs({
      origin: p.origin,
      dest: p.dest,
      runway: p.runway,
      sid: p.sid,
      star: p.star,
      approach: p.approach,
      route: p.route,
    });
  }
  if (p.perf.zfw !== undefined) {
    plan.perf.gw = Number((p.perf.zfw + sc.aircraft.fuel.total).toFixed(1));
    plan.perf.complete =
      plan.perf.zfw !== undefined && plan.perf.reserves !== undefined && plan.perf.costIndex !== undefined && plan.perf.crzAlt !== undefined;
  }
  if (p.takeoff.acceptSpeeds && plan.takeoff.flaps && plan.perf.gw) {
    const v = takeoffSpeeds(plan.perf.gw, plan.takeoff.flaps);
    plan.takeoff.v1 = v.v1;
    plan.takeoff.vr = v.vr;
    plan.takeoff.v2 = v.v2;
  }
  const activeLegIndex = sc.activeLegIdent ? Math.max(0, findLegIndex(plan.legs, sc.activeLegIdent)) : 0;

  return {
    scenario: id,
    sim: {
      baseWind: { ...sc.aircraft.wind },
      windDirOfs: 0,
      windSpdOfs: 0,
      satOfs: 0,
      vsTurb: 0,
      holding: false,
    },
    aircraft: structuredClone(sc.aircraft),
    active: plan,
    mod: null,
    ui: {
      page: sc.initialPage,
      pageIndex: 0,
      helpOpen: false,
      debugOpen: false,
      brightness: 0.85,
      timeScale: 1,
      fixInfo: [{}, {}],
    },
    scratchpad: '',
    messages: [],
    activeLegIndex,
    identConfirmed: sc.identConfirmed,
    posInitDone: sc.posInitDone,
    navAidsInhibited: false,
    gpsUpdating: true,
    dmeUpdating: true,
    suppNav: { waypoints: [], navaids: [], airports: [] },
    navDataCycle: 'active',
  };
}

export interface FmcStore extends FmcState {
  loadScenario(id: ScenarioId): void;
  typeChar(c: string): void;
  plusMinus(): void;
  clr(long?: boolean): void;
  del(): void;
  lsk(slot: LskSlot): void;
  modeKey(k: ModeKey): void;
  prevPage(): void;
  nextPage(): void;
  exec(): void;
  tick(dtSeconds: number): void;
  setBrightness(v: number): void;
  toggleHelp(): void;
  toggleDebug(): void;
  setTimeScale(s: 1 | 8 | 60): void;
}

export const useFmcStore = create<FmcStore>((set, get) => {
  const apply = (fn: (d: Draft<FmcState>) => void) => set((s) => produce(s, fn));

  return {
    ...buildScenarioState('preflight'),

    loadScenario(id) {
      set((s) => {
        const fresh = buildScenarioState(id);
        // keep panel and display preferences across scenario swaps
        fresh.ui.helpOpen = s.ui.helpOpen;
        fresh.ui.debugOpen = s.ui.debugOpen;
        fresh.ui.brightness = s.ui.brightness;
        return { ...s, ...fresh };
      });
    },

    typeChar(c) {
      apply((d) => {
        if (d.scratchpad.length >= 23) return;
        // DELETE is a special token, typing over it starts fresh
        if (d.scratchpad === 'DELETE') d.scratchpad = '';
        d.scratchpad += c.toUpperCase();
      });
    },

    plusMinus() {
      apply((d) => {
        // first press appends a minus, further presses toggle the trailing sign
        const sp = d.scratchpad;
        if (sp.endsWith('-')) d.scratchpad = sp.slice(0, -1) + '+';
        else if (sp.endsWith('+')) d.scratchpad = sp.slice(0, -1) + '-';
        else if (sp.length < 23) d.scratchpad = sp + '-';
      });
    },

    clr(long = false) {
      apply((d) => {
        if (d.messages.length > 0) {
          d.messages.shift();
          return;
        }
        if (d.scratchpad === 'DELETE' || long) d.scratchpad = '';
        else d.scratchpad = d.scratchpad.slice(0, -1);
      });
    },

    del() {
      apply((d) => {
        if (d.scratchpad === '') d.scratchpad = 'DELETE';
      });
    },

    lsk(slot) {
      const s = get();
      const page = getPage(s.ui.page);
      if (!page.onLsk) return;
      const res = page.onLsk(s, slot, s.scratchpad);
      if (!res) return;
      apply((d) => {
        if (res.mutate) res.mutate(d);
        if (res.message) showMessage(d, res.message);
        if (res.toScratchpad !== undefined && d.scratchpad === '') d.scratchpad = res.toScratchpad;
        if (res.clearScratchpad) d.scratchpad = '';
        if (res.goto) {
          d.ui.page = res.goto.page;
          d.ui.pageIndex = res.goto.index ?? 0;
        }
      });
    },

    modeKey(k) {
      apply((d) => {
        d.ui.pageIndex = 0;
        switch (k) {
          case 'INIT_REF': {
            // jump to the most relevant init page for the current flight state
            if (!d.identConfirmed) d.ui.page = 'IDENT';
            else if (!d.posInitDone) d.ui.page = 'POS';
            else if (!d.active.perf.complete) d.ui.page = 'PERF_INIT';
            else if (d.aircraft.onGround) d.ui.page = 'TAKEOFF_REF';
            else d.ui.page = 'APPROACH_REF';
            break;
          }
          case 'RTE':
            d.ui.page = 'RTE';
            break;
          case 'CLB':
            d.ui.page = 'CLB';
            break;
          case 'CRZ':
            d.ui.page = 'CRZ';
            break;
          case 'DES':
            d.ui.page = 'DES';
            break;
          case 'MENU':
            d.ui.page = 'MENU';
            break;
          case 'LEGS':
            d.ui.page = 'LEGS';
            break;
          case 'DEP_ARR':
            d.ui.page = 'DEP_ARR_INDEX';
            break;
          case 'HOLD':
            d.ui.page = 'HOLD';
            break;
          case 'PROG':
            d.ui.page = 'PROG';
            break;
          case 'N1_LIMIT':
            d.ui.page = 'N1_LIMIT';
            break;
          case 'FIX':
            d.ui.page = 'FIX_INFO';
            break;
        }
      });
    },

    prevPage() {
      const s = get();
      const total = getPage(s.ui.page).numPages(s);
      apply((d) => {
        d.ui.pageIndex = (d.ui.pageIndex - 1 + total) % total;
      });
    },

    nextPage() {
      const s = get();
      const total = getPage(s.ui.page).numPages(s);
      apply((d) => {
        d.ui.pageIndex = (d.ui.pageIndex + 1) % total;
      });
    },

    exec() {
      apply((d) => {
        if (!d.mod) return;
        const prevIdent = d.active.legs[d.activeLegIndex]?.ident;
        const directTo = d.mod.directTo;
        delete d.mod.directTo;
        d.mod.executed = true;
        // a pending lateral offset goes live on EXEC
        if (d.mod.offset) d.mod.offset.active = true;
        d.active = d.mod as PlanData;
        d.mod = null;
        if (directTo) {
          d.activeLegIndex = Math.max(0, findLegIndex(d.active.legs, directTo));
          return;
        }
        // keep the sequenced leg pointer on the same fix after route edits
        const byIdent = prevIdent ? findLegIndex(d.active.legs, prevIdent) : -1;
        if (byIdent >= 0) d.activeLegIndex = byIdent;
        else if (d.activeLegIndex >= d.active.legs.length) {
          d.activeLegIndex = Math.max(0, d.active.legs.length - 1);
        }
      });
    },

    tick(dt) {
      apply((d) => advanceSim(d, dt));
    },

    setBrightness(v) {
      apply((d) => {
        d.ui.brightness = Math.min(1, Math.max(0.2, v));
      });
    },

    toggleHelp() {
      apply((d) => {
        d.ui.helpOpen = !d.ui.helpOpen;
        if (d.ui.helpOpen) d.ui.debugOpen = false;
      });
    },

    toggleDebug() {
      apply((d) => {
        d.ui.debugOpen = !d.ui.debugOpen;
        if (d.ui.debugOpen) d.ui.helpOpen = false;
      });
    },

    setTimeScale(ts) {
      apply((d) => {
        d.ui.timeScale = ts;
      });
    },
  };
});
