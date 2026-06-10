import { current, type Draft } from 'immer';
import type { FmcMessage, FmcState, LskSlot, PageId, PlanData, ScreenModel } from './types';
import { msgCompare } from './messages';

export interface LskResult {
  message?: FmcMessage;
  toScratchpad?: string;
  clearScratchpad?: boolean;
  mutate?: (d: Draft<FmcState>) => void;
  goto?: { page: PageId; index?: number };
}

export interface PageDef {
  numPages(s: FmcState): number;
  render(s: FmcState): ScreenModel;
  onLsk?(s: FmcState, slot: LskSlot, sp: string): LskResult | void;
}

// the plan a page should display: pending MOD wins over active
export function planFor(s: FmcState | Draft<FmcState>): PlanData {
  return (s.mod ?? s.active) as PlanData;
}

// plan edits before first EXEC hit the active plan directly,
// once executed they spawn a MOD copy (Smiths MOD/EXEC machine)
export function editPlan(d: Draft<FmcState>): Draft<PlanData> {
  if (d.mod) return d.mod;
  if (d.active.executed) {
    d.mod = structuredClone(current(d.active));
    return d.mod!;
  }
  return d.active;
}

export function showMessage(d: Draft<FmcState>, msg: FmcMessage): void {
  if (!d.messages.some((m) => m.text === msg.text)) {
    d.messages.push(msg);
    d.messages.sort(msgCompare);
  }
}

export function eraseMod(d: Draft<FmcState>): void {
  d.mod = null;
}

export function emptyPlan(): PlanData {
  return {
    routeSpec: [],
    legs: [],
    perf: {
      transAlt: 9000,
      limits: { clbMin: 210, clbMax: 340, crzMin: 210, crzMax: 340, desMin: 210, desMax: 340 },
      complete: false,
    },
    takeoff: { n1Rating: 'TO', clbRating: 'CLB' },
    vnav: { clbMode: 'ECON', crzMode: 'ECON' },
    desForecast: { levels: [{}, {}, {}], antiIce: false },
    approachRef: {},
    activated: false,
    executed: false,
  };
}

export function slotNum(slot: LskSlot): number {
  return Number(slot[0]);
}

export function slotSide(slot: LskSlot): 'L' | 'R' {
  return slot[1] as 'L' | 'R';
}
