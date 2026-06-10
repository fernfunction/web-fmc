import type { FmcState } from '../types';
import {
  blankScreen,
  boxes,
  dashes,
  lskData,
  lskLabel,
  put,
  putRight,
  title,
} from '../screenModel';
import { MSG } from '../messages';
import { editPlan, planFor, type PageDef } from '../pageApi';
import { ndb, findAirport } from '../nav/ndb';
import { fmtGmt, fmtLatLon } from '../nav/geo';
import {
  parseCg,
  parseCostIndex,
  parseAltitude,
  parseFlaps,
  parseGmt,
  parseLatLon,
  parseSpeed,
  parseTemp,
  parseVSpeed,
  parseWeight,
  parseWind,
} from '../validation/parsers';
import {
  climbN1,
  isValidCg,
  isValidTakeoffFlaps,
  takeoffN1,
  takeoffSpeeds,
  trimForCg,
  vref,
} from '../perf/model';
import { fmtWt, fmtWind, fmtFL } from './util';

function checkPerfComplete(p: { zfw?: number; reserves?: number; costIndex?: number; crzAlt?: number }): boolean {
  return p.zfw !== undefined && p.reserves !== undefined && p.costIndex !== undefined && p.crzAlt !== undefined;
}

// ---------------------------------------------------------------- IDENT

export const identPage: PageDef = {
  numPages: () => 2,
  render(s) {
    const scr = blankScreen();
    if (s.ui.pageIndex === 1) {
      title(scr, 'IDENT', 2, 2);
      lskLabel(scr, 1, 'L', 'CONFIG');
      lskData(scr, 1, 'L', 'WFM-738-26K', { color: 'green' });
      lskLabel(scr, 2, 'L', 'PERF FACTOR');
      lskData(scr, 2, 'L', '+0.0', { color: 'green' });
      lskLabel(scr, 3, 'L', 'ACARS');
      lskData(scr, 3, 'L', 'DISABLED', { color: 'green' });
      lskData(scr, 6, 'L', '<INDEX');
      lskData(scr, 6, 'R', 'POS INIT>');
      return scr;
    }
    title(scr, 'IDENT', 1, 2);
    lskLabel(scr, 1, 'L', 'MODEL');
    lskData(scr, 1, 'L', ndb.model, { color: 'green' });
    lskLabel(scr, 1, 'R', 'ENG RATING');
    lskData(scr, 1, 'R', ndb.engRating, { color: 'green' });
    lskLabel(scr, 2, 'L', 'NAV DATA');
    lskData(scr, 2, 'L', `WFM${ndb.airac.active.cycle}001`, { color: 'green' });
    lskLabel(scr, 2, 'R', 'ACTIVE');
    const a = s.navDataCycle === 'active' ? ndb.airac.active : ndb.airac.next;
    const b = s.navDataCycle === 'active' ? ndb.airac.next : ndb.airac.active;
    lskData(scr, 2, 'R', `${a.from}${a.to}/${a.year}`);
    lskData(scr, 3, 'R', `${b.from}${b.to}/${b.year}`, { size: 'small' });
    lskLabel(scr, 4, 'L', 'OP PROGRAM');
    lskData(scr, 4, 'L', ndb.opProgram, { color: 'green' });
    lskLabel(scr, 5, 'L', 'CO DATA');
    lskData(scr, 5, 'L', ndb.coData, { color: 'green' });
    lskData(scr, 6, 'L', '<INDEX');
    lskData(scr, 6, 'R', 'POS INIT>');
    return scr;
  },
  onLsk(s, slot) {
    if (slot === '6L') {
      return { mutate: (d) => void (d.identConfirmed = true), goto: { page: 'INIT_REF_INDEX' } };
    }
    if (slot === '6R') {
      return { mutate: (d) => void (d.identConfirmed = true), goto: { page: 'POS' } };
    }
    if (slot === '3R' && s.ui.pageIndex === 0) {
      // nav data cycle swap is a ground-only action per the guide
      if (!s.aircraft.onGround) return { message: MSG.groundOnly };
      return {
        mutate: (d) => {
          d.navDataCycle = d.navDataCycle === 'active' ? 'next' : 'active';
        },
      };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- POS INIT / POS REF / POS SHIFT

export const posPage: PageDef = {
  numPages: () => 3,
  render(s) {
    const scr = blankScreen();
    const ac = s.aircraft;
    if (s.ui.pageIndex === 0) {
      title(scr, 'POS INIT', 1, 3);
      lskLabel(scr, 1, 'R', 'LAST POS');
      lskData(scr, 1, 'R', fmtLatLon(ac.position), { size: 'small' });
      lskLabel(scr, 2, 'L', 'REF AIRPORT');
      const refApt = s.ui.refAirport ? findAirport(s.ui.refAirport) : undefined;
      lskData(scr, 2, 'L', s.ui.refAirport ?? dashes(4));
      if (refApt) {
        lskData(scr, 2, 'R', fmtLatLon(refApt), { size: 'small' });
        lskLabel(scr, 3, 'L', 'GATE');
        const gate = refApt.gates.find((g) => g.id === s.ui.refGate);
        lskData(scr, 3, 'L', s.ui.refGate ?? dashes(5));
        if (gate) lskData(scr, 3, 'R', fmtLatLon(gate), { size: 'small' });
      }
      lskLabel(scr, 4, 'R', 'SET IRS POS');
      lskData(scr, 4, 'R', ac.irsPosSet ? fmtLatLon(ac.position) : boxes(13), {
        size: ac.irsPosSet ? 'small' : 'large',
      });
      lskLabel(scr, 5, 'R', 'GMT-MON/DY');
      lskData(scr, 5, 'R', `${fmtGmt(ac.clock.gmtSeconds)} ${ac.clock.date.slice(2, 5)}/${ac.clock.date.slice(0, 2)}`, { size: 'small' });
      if (ac.irs.status === 'ALIGN' && !ac.irsPosSet) {
        put(scr, 11, 0, 'IRS ALIGN', { color: 'amber', size: 'small' });
      }
      lskData(scr, 6, 'L', '<INDEX');
      lskData(scr, 6, 'R', 'ROUTE>');
      return scr;
    }
    if (s.ui.pageIndex === 1) {
      title(scr, 'POS REF', 2, 3);
      lskLabel(scr, 1, 'L', `FMC POS (${ac.gpsAvailable ? 'GPS L' : 'IRS L'})`);
      lskData(scr, 1, 'L', fmtLatLon(ac.position));
      lskLabel(scr, 1, 'R', 'GS');
      lskData(scr, 1, 'R', String(Math.round(ac.groundSpeed)));
      const drift = ac.irs.driftNmHr * 0.01;
      lskLabel(scr, 2, 'L', 'IRS L');
      lskData(scr, 2, 'L', fmtLatLon({ lat: ac.position.lat + drift, lon: ac.position.lon - drift }), { size: 'small' });
      lskLabel(scr, 2, 'R', 'GS');
      lskData(scr, 2, 'R', String(Math.round(ac.groundSpeed)), { size: 'small' });
      lskLabel(scr, 3, 'L', 'GPS L');
      lskData(scr, 3, 'L', ac.gpsAvailable ? fmtLatLon(ac.position) : 'NO DATA', { size: 'small' });
      lskLabel(scr, 4, 'L', 'RADIO');
      lskData(scr, 4, 'L', ac.onGround ? dashes(13) : fmtLatLon(ac.position), { size: 'small' });
      lskData(scr, 6, 'L', '<INDEX');
      lskData(scr, 6, 'R', 'POS SHIFT>');
      return scr;
    }
    title(scr, 'POS SHIFT', 3, 3);
    lskLabel(scr, 1, 'L', 'IRS L');
    lskData(scr, 1, 'L', `${(ac.irs.driftNmHr * 0.3).toFixed(1)}NM/120°`, { size: 'small' });
    lskLabel(scr, 2, 'L', 'IRS R');
    lskData(scr, 2, 'L', `${(ac.irs.driftNmHr * 0.2).toFixed(1)}NM/305°`, { size: 'small' });
    lskLabel(scr, 3, 'L', 'GPS L');
    lskData(scr, 3, 'L', ac.gpsAvailable ? '0.0NM/000°' : 'NO DATA', { size: 'small' });
    lskLabel(scr, 4, 'L', 'RADIO');
    lskData(scr, 4, 'L', dashes(9), { size: 'small' });
    lskData(scr, 6, 'L', '<INDEX');
    return scr;
  },
  onLsk(s, slot, sp) {
    if (slot === '6L') return { goto: { page: 'INIT_REF_INDEX' } };
    if (s.ui.pageIndex === 0) {
      if (slot === '6R') return { goto: { page: 'RTE' } };
      if (slot === '1R') {
        // line select copies the displayed position down to the scratchpad
        if (sp === '') return { toScratchpad: fmtLatLon(s.aircraft.position).replace(/°/g, '') };
        return undefined;
      }
      if (slot === '2L') {
        if (sp === '') return s.ui.refAirport ? { toScratchpad: s.ui.refAirport } : undefined;
        if (sp === 'DELETE')
          return {
            mutate: (d) => {
              d.ui.refAirport = undefined;
              d.ui.refGate = undefined;
            },
            clearScratchpad: true,
          };
        const apt = findAirport(sp);
        if (!apt) return { message: MSG.notInDataBase };
        return {
          mutate: (d) => {
            d.ui.refAirport = apt.ident;
            d.ui.refGate = undefined;
          },
          clearScratchpad: true,
        };
      }
      if (slot === '2R' && s.ui.refAirport) {
        const apt = findAirport(s.ui.refAirport);
        if (sp === '' && apt) return { toScratchpad: fmtLatLon(apt).replace(/°/g, '') };
        return undefined;
      }
      if (slot === '3L' && s.ui.refAirport) {
        const apt = findAirport(s.ui.refAirport);
        if (!apt) return undefined;
        if (sp === '') return s.ui.refGate ? { toScratchpad: s.ui.refGate } : undefined;
        const gate = apt.gates.find((g) => g.id === sp.toUpperCase());
        if (!gate) return { message: MSG.notInDataBase };
        return { mutate: (d) => void (d.ui.refGate = gate.id), clearScratchpad: true };
      }
      if (slot === '3R' && s.ui.refGate && s.ui.refAirport) {
        const gate = findAirport(s.ui.refAirport)?.gates.find((g) => g.id === s.ui.refGate);
        if (sp === '' && gate) return { toScratchpad: fmtLatLon(gate).replace(/°/g, '') };
        return undefined;
      }
      if (slot === '4R') {
        const pos = parseLatLon(sp);
        if (!pos) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            d.aircraft.irsPosSet = true;
            d.aircraft.irs.status = 'NAV';
            d.posInitDone = true;
          },
          clearScratchpad: true,
        };
      }
      if (slot === '5R') {
        const gmt = parseGmt(sp);
        if (gmt === null) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (d.aircraft.clock.gmtSeconds = gmt), clearScratchpad: true };
      }
    }
    if (s.ui.pageIndex === 1 && slot === '6R') {
      return { mutate: (d) => void (d.ui.pageIndex = 2) };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- INIT/REF INDEX

export const initRefIndexPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    title(scr, 'INIT/REF INDEX');
    lskData(scr, 1, 'L', '<IDENT');
    lskData(scr, 2, 'L', '<POS');
    lskData(scr, 3, 'L', '<PERF');
    lskData(scr, 4, 'L', '<TAKEOFF');
    lskData(scr, 5, 'L', '<APPROACH');
    lskData(scr, 6, 'L', '<NAV DATA');
    lskData(scr, 1, 'R', 'MSG RECALL>');
    lskData(scr, 2, 'R', 'ALTN DEST>');
    lskData(scr, 3, 'R', 'NEAREST ARPTS>');
    lskData(scr, 4, 'R', 'SUMMARY>');
    if (s.aircraft.onGround) lskData(scr, 6, 'R', 'MAINT>');
    return scr;
  },
  onLsk(s, slot) {
    const map: Record<string, { page: string } | undefined> = {
      '1L': { page: 'IDENT' },
      '2L': { page: 'POS' },
      '3L': { page: 'PERF_INIT' },
      '4L': { page: 'TAKEOFF_REF' },
      '5L': { page: 'APPROACH_REF' },
      '6L': { page: 'REF_NAV_DATA' },
      '1R': { page: 'MESSAGE_RECALL' },
      '2R': { page: 'ALTN_DEST' },
      '3R': { page: 'NEAREST_ARPTS' },
      '4R': { page: 'SUMMARY' },
    };
    const target = map[slot];
    if (target) return { goto: { page: target.page as never } };
    if (slot === '6R' && s.aircraft.onGround) return { message: MSG.keyInop };
    return undefined;
  },
};

// ---------------------------------------------------------------- PERF INIT (+ PERF LIMITS subpage)

function renderPerfLimits(s: FmcState): ReturnType<typeof blankScreen> {
  const scr = blankScreen();
  const lim = planFor(s).perf.limits;
  title(scr, 'PERF LIMITS', 2, 2);
  put(scr, 1, 6, 'MIN SPD   MAX SPD', { size: 'small' });
  lskLabel(scr, 2, 'L', 'CLB');
  lskData(scr, 2, 'L', `${lim.clbMin}KT`, { size: 'small' });
  lskData(scr, 2, 'R', `${lim.clbMax}KT`, { size: 'small' });
  lskLabel(scr, 3, 'L', 'CRZ');
  lskData(scr, 3, 'L', `${lim.crzMin}KT`, { size: 'small' });
  lskData(scr, 3, 'R', `${lim.crzMax}KT`, { size: 'small' });
  lskLabel(scr, 4, 'L', 'DES');
  lskData(scr, 4, 'L', `${lim.desMin}KT`, { size: 'small' });
  lskData(scr, 4, 'R', `${lim.desMax}KT`, { size: 'small' });
  lskData(scr, 6, 'L', '<INDEX');
  return scr;
}

export const perfInitPage: PageDef = {
  numPages: () => 2,
  render(s) {
    if (s.ui.pageIndex === 1) return renderPerfLimits(s);
    const scr = blankScreen();
    const plan = planFor(s);
    const p = plan.perf;
    title(scr, s.mod ? 'MOD PERF INIT' : 'PERF INIT', 1, 2);
    lskLabel(scr, 1, 'L', 'GW/CRZ CG');
    lskData(scr, 1, 'L', `${fmtWt(p.gw)}/ ${plan.takeoff.cg !== undefined ? plan.takeoff.cg.toFixed(1) + '%' : '23.0%'}`);
    lskLabel(scr, 2, 'L', 'FUEL');
    lskData(scr, 2, 'L', `${s.aircraft.fuel.total.toFixed(1)} SENSED`, { color: 'green' });
    lskLabel(scr, 3, 'L', 'ZFW');
    lskData(scr, 3, 'L', p.zfw !== undefined ? fmtWt(p.zfw) : boxes(5));
    lskLabel(scr, 4, 'L', 'RESERVES');
    lskData(scr, 4, 'L', p.reserves !== undefined ? fmtWt(p.reserves) : boxes(4));
    lskLabel(scr, 5, 'L', 'COST INDEX');
    lskData(scr, 5, 'L', p.costIndex !== undefined ? String(p.costIndex) : boxes(3));
    lskLabel(scr, 1, 'R', 'CRZ ALT');
    lskData(scr, 1, 'R', p.crzAlt !== undefined ? fmtFL(p.crzAlt) : boxes(5));
    lskLabel(scr, 2, 'R', 'CRZ WIND');
    lskData(scr, 2, 'R', fmtWind(p.crzWind), { size: p.crzWind ? 'large' : 'small' });
    lskLabel(scr, 3, 'R', 'ISA DEV');
    lskData(scr, 3, 'R', p.isaDev !== undefined ? `${p.isaDev >= 0 ? '+' : ''}${p.isaDev}°C` : '---', {
      size: p.isaDev !== undefined ? 'large' : 'small',
    });
    lskLabel(scr, 4, 'R', 'TRANS ALT');
    lskData(scr, 4, 'R', String(p.transAlt));
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    else lskData(scr, 6, 'L', '<INDEX');
    if (p.complete) lskData(scr, 6, 'R', 'TAKEOFF>');
    else putRight(scr, 12, 'PERF INIT INCOMPLETE', { size: 'small', color: 'amber' });
    return scr;
  },
  onLsk(s, slot, sp) {
    if (s.ui.pageIndex === 1) {
      if (slot === '6L') return { goto: { page: 'INIT_REF_INDEX' } };
      return undefined;
    }
    switch (slot) {
      case '1L': {
        if (sp === '') {
          const gw = planFor(s).perf.gw;
          return gw !== undefined ? { toScratchpad: gw.toFixed(1) } : undefined;
        }
        const gw = parseWeight(sp);
        if (gw === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const plan = editPlan(d);
            plan.perf.gw = gw;
            plan.perf.zfw = Number((gw - d.aircraft.fuel.total).toFixed(1));
            plan.perf.complete = checkPerfComplete(plan.perf);
          },
          clearScratchpad: true,
        };
      }
      case '3L': {
        if (sp === '') {
          const z = planFor(s).perf.zfw;
          return z !== undefined ? { toScratchpad: z.toFixed(1) } : undefined;
        }
        const zfw = parseWeight(sp, 60, 180);
        if (zfw === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const plan = editPlan(d);
            plan.perf.zfw = zfw;
            plan.perf.gw = Number((zfw + d.aircraft.fuel.total).toFixed(1));
            plan.perf.complete = checkPerfComplete(plan.perf);
          },
          clearScratchpad: true,
        };
      }
      case '4L': {
        if (sp === '') {
          const r = planFor(s).perf.reserves;
          return r !== undefined ? { toScratchpad: r.toFixed(1) } : undefined;
        }
        const res = parseWeight(sp, 1, 30);
        if (res === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const plan = editPlan(d);
            plan.perf.reserves = res;
            plan.perf.complete = checkPerfComplete(plan.perf);
          },
          clearScratchpad: true,
        };
      }
      case '5L': {
        if (sp === '') {
          const ci = planFor(s).perf.costIndex;
          return ci !== undefined ? { toScratchpad: String(ci) } : undefined;
        }
        const ci = parseCostIndex(sp);
        if (ci === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const plan = editPlan(d);
            plan.perf.costIndex = ci;
            plan.perf.complete = checkPerfComplete(plan.perf);
          },
          clearScratchpad: true,
        };
      }
      case '1R': {
        if (sp === '') {
          const c = planFor(s).perf.crzAlt;
          return c !== undefined ? { toScratchpad: fmtFL(c) } : undefined;
        }
        const alt = parseAltitude(sp);
        if (alt === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const plan = editPlan(d);
            plan.perf.crzAlt = alt;
            plan.perf.complete = checkPerfComplete(plan.perf);
          },
          clearScratchpad: true,
        };
      }
      case '2R': {
        if (sp === '') {
          const w = planFor(s).perf.crzWind;
          return w ? { toScratchpad: `${w.dir}/${w.speed}` } : undefined;
        }
        if (sp === 'DELETE')
          return {
            mutate: (d) => void (editPlan(d).perf.crzWind = undefined),
            clearScratchpad: true,
          };
        const wind = parseWind(sp);
        if (!wind) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (editPlan(d).perf.crzWind = wind), clearScratchpad: true };
      }
      case '3R': {
        const t = parseTemp(sp);
        if (t === null) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (editPlan(d).perf.isaDev = t), clearScratchpad: true };
      }
      case '4R': {
        const alt = parseAltitude(sp);
        if (alt === null || alt > 18000) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (editPlan(d).perf.transAlt = alt), clearScratchpad: true };
      }
      case '6L': {
        if (s.mod) return { mutate: (d) => void (d.mod = null) };
        return { goto: { page: 'INIT_REF_INDEX' } };
      }
      case '6R': {
        if (planFor(s).perf.complete) return { goto: { page: 'TAKEOFF_REF' } };
        return undefined;
      }
    }
    return undefined;
  },
};

export const perfLimitsPage: PageDef = {
  numPages: () => 1,
  render: (s) => renderPerfLimits(s),
  onLsk(_s, slot) {
    if (slot === '6L') return { goto: { page: 'INIT_REF_INDEX' } };
    return undefined;
  },
};

// ---------------------------------------------------------------- N1 LIMIT

export const n1LimitPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const to = plan.takeoff;
    const oat = s.aircraft.sat;
    const elev = s.aircraft.altitude;
    title(scr, 'N1 LIMIT');
    lskLabel(scr, 1, 'L', 'SEL/OAT');
    const sel = to.oatSel !== undefined ? `${to.oatSel}°` : '--°';
    lskData(scr, 1, 'L', `${sel}/ ${oat}°C`);
    const selPenalty = to.oatSel !== undefined ? Math.max(0, (to.oatSel - oat) * 0.22) : 0;
    const n1For = (r: 'TO' | 'TO-1' | 'TO-2') => (takeoffN1(oat, elev, r) - selPenalty).toFixed(1);
    lskLabel(scr, 1, 'R', `${ndb.engRating} N1`);
    lskData(scr, 1, 'R', `${n1For(to.n1Rating)}/ ${n1For(to.n1Rating)}`, { color: 'green' });
    const mark = (r: string, cur: string) => (r === cur ? '<SEL>' : '');
    lskLabel(scr, 2, 'L', mark('TO', to.n1Rating) || ' ');
    lskData(scr, 2, 'L', '<TO         26K');
    lskData(scr, 3, 'L', '<TO-1       24K');
    lskData(scr, 4, 'L', '<TO-2       22K');
    lskData(scr, 2, 'R', 'CLB>');
    lskData(scr, 3, 'R', 'CLB-1>');
    lskData(scr, 4, 'R', 'CLB-2>');
    lskLabel(scr, 2, 'R', to.clbRating === 'CLB' ? '<ACT>' : '');
    lskLabel(scr, 3, 'R', to.clbRating === 'CLB-1' ? '<ACT>' : '');
    lskLabel(scr, 4, 'R', to.clbRating === 'CLB-2' ? '<ACT>' : '');
    lskLabel(scr, 2, 'L', to.n1Rating === 'TO' ? '<ACT>' : '');
    lskLabel(scr, 3, 'L', to.n1Rating === 'TO-1' ? '<ACT>' : '');
    lskLabel(scr, 4, 'L', to.n1Rating === 'TO-2' ? '<ACT>' : '');
    lskLabel(scr, 5, 'L', 'BUMP N1');
    lskData(scr, 5, 'L', `${(takeoffN1(oat, elev, 'TO') + 1.4).toFixed(1)}/ ${(takeoffN1(oat, elev, 'TO') + 1.4).toFixed(1)}`, {
      size: 'small',
      color: 'green',
    });
    lskLabel(scr, 5, 'R', 'CLB N1');
    lskData(scr, 5, 'R', `${climbN1(to.clbRating, 10000).toFixed(1)}`, { size: 'small', color: 'green' });
    lskData(scr, 6, 'L', '<INDEX');
    lskData(scr, 6, 'R', 'TAKEOFF>');
    return scr;
  },
  onLsk(s, slot, sp) {
    switch (slot) {
      case '1L': {
        if (sp === 'DELETE')
          return { mutate: (d) => void (d.active.takeoff.oatSel = undefined), clearScratchpad: true };
        const t = parseTemp(sp);
        if (t === null || t < s.aircraft.sat) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (d.active.takeoff.oatSel = t), clearScratchpad: true };
      }
      case '2L':
        return { mutate: (d) => void Object.assign(d.active.takeoff, { n1Rating: 'TO', clbRating: 'CLB' }) };
      case '3L':
        return { mutate: (d) => void Object.assign(d.active.takeoff, { n1Rating: 'TO-1', clbRating: 'CLB-1' }) };
      case '4L':
        return { mutate: (d) => void Object.assign(d.active.takeoff, { n1Rating: 'TO-2', clbRating: 'CLB-2' }) };
      case '2R':
        return { mutate: (d) => void (d.active.takeoff.clbRating = 'CLB') };
      case '3R':
        return { mutate: (d) => void (d.active.takeoff.clbRating = 'CLB-1') };
      case '4R':
        return { mutate: (d) => void (d.active.takeoff.clbRating = 'CLB-2') };
      case '6L':
        return { goto: { page: 'INIT_REF_INDEX' } };
      case '6R':
        return { goto: { page: 'TAKEOFF_REF' } };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- TAKEOFF REF

export const takeoffRefPage: PageDef = {
  numPages: () => 2,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const to = plan.takeoff;
    if (s.ui.pageIndex === 1) {
      title(scr, 'TAKEOFF REF', 2, 2);
      lskLabel(scr, 1, 'L', 'WIND/SLOPE');
      lskData(scr, 1, 'L', `${fmtWind(s.aircraft.wind)} U0.0`, { size: 'small' });
      lskLabel(scr, 2, 'L', 'RWY COND');
      lskData(scr, 2, 'L', 'DRY', { size: 'small' });
      lskLabel(scr, 3, 'L', 'ACCEL HT');
      lskData(scr, 3, 'L', '1000FT', { size: 'small' });
      lskLabel(scr, 4, 'L', 'THR REDUCTION');
      lskData(scr, 4, 'L', '1500FT', { size: 'small' });
      lskData(scr, 6, 'L', '<INDEX');
      return scr;
    }
    title(scr, 'TAKEOFF REF', 1, 2);
    lskLabel(scr, 1, 'L', 'FLAPS');
    lskData(scr, 1, 'L', to.flaps !== undefined ? `${to.flaps}°` : boxes(2));
    const gw = plan.perf.gw;
    const computed = gw && to.flaps !== undefined ? takeoffSpeeds(gw, to.flaps) : null;
    const vCell = (accepted: number | undefined, calc: number | undefined, label: string, n: 1 | 2 | 3) => {
      lskLabel(scr, n, 'R', label);
      if (accepted !== undefined) lskData(scr, n, 'R', `${accepted}KT`);
      else if (calc !== undefined) lskData(scr, n, 'R', `${calc}KT`, { size: 'small' });
      else lskData(scr, n, 'R', dashes(3), { size: 'small' });
    };
    vCell(to.v1, computed?.v1, 'V1', 1);
    vCell(to.vr, computed?.vr, 'VR', 2);
    vCell(to.v2, computed?.v2, 'V2', 3);
    lskLabel(scr, 2, 'L', 'THRUST');
    const n1 = takeoffN1(s.aircraft.sat, s.aircraft.altitude, to.n1Rating);
    lskData(scr, 2, 'L', `${n1.toFixed(1)}/ ${n1.toFixed(1)} N1`, { color: 'green', size: 'small' });
    lskLabel(scr, 3, 'L', 'CG TRIM');
    if (to.cg !== undefined) {
      lskData(scr, 3, 'L', `${to.cg.toFixed(1)}%  ${trimForCg(to.cg).toFixed(2)}`);
    } else {
      lskData(scr, 3, 'L', `${dashes(2)}%`);
    }
    lskLabel(scr, 4, 'L', 'RUNWAY/POS');
    const apt = plan.origin ? findAirport(plan.origin) : undefined;
    const rwy = apt?.runways.find((r) => r.id === plan.runway);
    lskData(scr, 4, 'L', plan.runway ? `RW${plan.runway}${to.toShiftFt ? '+' + to.toShiftFt : ''}` : dashes(5));
    if (rwy) {
      lskLabel(scr, 5, 'L', 'QFU/LENGTH');
      lskData(scr, 5, 'L', `${String(rwy.hdg).padStart(3, '0')}°/${rwy.lengthFt}FT`, { size: 'small', color: 'green' });
    }
    lskLabel(scr, 4, 'R', 'TO SHIFT');
    lskData(scr, 4, 'R', to.toShiftFt !== undefined ? `${to.toShiftFt}FT` : dashes(4), {
      size: to.toShiftFt !== undefined ? 'large' : 'small',
    });
    lskLabel(scr, 5, 'R', 'GROSS WT');
    lskData(scr, 5, 'R', fmtWt(gw), { color: 'green' });
    lskData(scr, 6, 'L', '<INDEX');
    const ready = to.flaps !== undefined && to.v1 !== undefined && to.vr !== undefined && to.v2 !== undefined;
    if (ready) putRight(scr, 11, 'PRE-FLT COMPLETE', { size: 'small', color: 'green' });
    return scr;
  },
  onLsk(s, slot, sp) {
    if (s.ui.pageIndex === 1) {
      if (slot === '6L') return { goto: { page: 'INIT_REF_INDEX' } };
      return undefined;
    }
    const plan = planFor(s);
    const deleteSpeeds = (d: import('immer').Draft<FmcState>) => {
      const t = d.active.takeoff;
      if (t.v1 !== undefined || t.vr !== undefined || t.v2 !== undefined) {
        t.v1 = t.vr = t.v2 = undefined;
        return true;
      }
      return false;
    };
    switch (slot) {
      case '1L': {
        const f = parseFlaps(sp);
        if (f === null || !isValidTakeoffFlaps(f)) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const had = deleteSpeeds(d);
            d.active.takeoff.flaps = f;
            if (had) {
              d.messages.push(MSG.takeoffSpeedsDeleted);
              d.messages.sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'alert' ? -1 : 1));
            }
          },
          clearScratchpad: true,
        };
      }
      case '1R':
      case '2R':
      case '3R': {
        const key = slot === '1R' ? 'v1' : slot === '2R' ? 'vr' : 'v2';
        const gw = plan.perf.gw;
        const computed = gw && plan.takeoff.flaps !== undefined ? takeoffSpeeds(gw, plan.takeoff.flaps) : null;
        if (sp === '') {
          // accepting the small computed value with a bare LSK press
          if (!computed) return undefined;
          return {
            mutate: (d) => void ((d.active.takeoff as Record<string, unknown>)[key] = computed[key as keyof typeof computed]),
          };
        }
        if (sp === 'DELETE') {
          return {
            mutate: (d) => {
              (d.active.takeoff as Record<string, unknown>)[key] = undefined;
            },
            clearScratchpad: true,
          };
        }
        const v = parseVSpeed(sp);
        if (v === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => void ((d.active.takeoff as Record<string, unknown>)[key] = v),
          clearScratchpad: true,
        };
      }
      case '3L': {
        const cg = parseCg(sp);
        if (cg === null || !isValidCg(cg)) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (d.active.takeoff.cg = cg), clearScratchpad: true };
      }
      case '4L': {
        if (sp === '') return plan.runway ? { toScratchpad: `RW${plan.runway}` } : undefined;
        const apt = plan.origin ? findAirport(plan.origin) : undefined;
        if (!apt) return { message: MSG.invalidEntry };
        const id = sp.toUpperCase().replace(/^RW/, '');
        const rwy = apt.runways.find((r) => r.id === id);
        if (!rwy) return { message: MSG.notInDataBase };
        return {
          mutate: (d) => {
            const had = deleteSpeeds(d);
            d.active.runway = rwy.id;
            if (d.mod) d.mod.runway = rwy.id;
            if (had) d.messages.push(MSG.takeoffSpeedsDeleted);
          },
          clearScratchpad: true,
        };
      }
      case '4R': {
        if (sp === 'DELETE')
          return { mutate: (d) => void (d.active.takeoff.toShiftFt = undefined), clearScratchpad: true };
        const m = sp.match(/^(\d{2,4})$/);
        if (!m) return { message: MSG.invalidEntry };
        const ft = Number(m[1]);
        if (ft < 50 || ft > 5000) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (d.active.takeoff.toShiftFt = ft), clearScratchpad: true };
      }
      case '6L':
        return { goto: { page: 'INIT_REF_INDEX' } };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- APPROACH REF

export const approachRefPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const gw = plan.approachRef.gwOverride ?? plan.perf.gw ?? s.aircraft.grossWeight;
    title(scr, 'APPROACH REF');
    lskLabel(scr, 1, 'L', 'GROSS WT');
    lskData(scr, 1, 'L', fmtWt(gw));
    lskLabel(scr, 1, 'R', 'FLAPS  VREF');
    lskData(scr, 1, 'R', `15° ${vref(gw, 15)}KT`, { size: 'small' });
    lskData(scr, 2, 'R', `30° ${vref(gw, 30)}KT`, { size: 'small' });
    lskData(scr, 3, 'R', `40° ${vref(gw, 40)}KT`, { size: 'small' });
    const dest = plan.dest ? findAirport(plan.dest) : undefined;
    const app = dest && plan.approach ? ndb.procedures[dest.ident]?.approaches.find((a) => a.name === plan.approach) : undefined;
    const rwy = dest && app ? dest.runways.find((r) => r.id === app.runway) : undefined;
    if (dest && rwy) {
      lskLabel(scr, 2, 'L', `${dest.ident}${rwy.id}`);
      lskData(scr, 2, 'L', `${rwy.lengthFt}FT ${Math.round(rwy.lengthFt * 0.3048)}M`, { size: 'small', color: 'green' });
      if (rwy.ils) {
        lskLabel(scr, 3, 'L', 'ILS FREQ/CRS');
        lskData(scr, 3, 'L', `${rwy.ils.freq.toFixed(2)}/${String(rwy.ils.crs).padStart(3, '0')}°`, { color: 'green' });
      }
    }
    lskLabel(scr, 4, 'R', 'FLAP/SPD');
    const sel = plan.approachRef;
    lskData(scr, 4, 'R', sel.selFlaps !== undefined ? `${sel.selFlaps}°/${sel.selVref}KT` : `${dashes(2)}/${dashes(3)}`);
    lskData(scr, 6, 'L', '<INDEX');
    return scr;
  },
  onLsk(s, slot, sp) {
    const plan = planFor(s);
    const gw = plan.approachRef.gwOverride ?? plan.perf.gw ?? s.aircraft.grossWeight;
    switch (slot) {
      case '1L': {
        if (sp === '') return { toScratchpad: gw.toFixed(1) };
        if (sp === 'DELETE')
          return { mutate: (d) => void (editPlan(d).approachRef.gwOverride = undefined), clearScratchpad: true };
        const w = parseWeight(sp);
        if (w === null) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (editPlan(d).approachRef.gwOverride = w), clearScratchpad: true };
      }
      case '1R':
        if (sp === '') return { toScratchpad: `15/${vref(gw, 15)}` };
        return undefined;
      case '2R':
        if (sp === '') return { toScratchpad: `30/${vref(gw, 30)}` };
        return undefined;
      case '3R':
        if (sp === '') return { toScratchpad: `40/${vref(gw, 40)}` };
        return undefined;
      case '4R': {
        if (sp === 'DELETE')
          return {
            mutate: (d) => {
              editPlan(d).approachRef.selFlaps = undefined;
              editPlan(d).approachRef.selVref = undefined;
            },
            clearScratchpad: true,
          };
        const m = sp.match(/^(\d{2})\/(\d{2,3})$/);
        if (!m) return { message: MSG.invalidEntry };
        const f = Number(m[1]);
        const v = parseSpeed(m[2]) ?? parseVSpeed(m[2]);
        if (![15, 30, 40].includes(f) || v === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const p = editPlan(d);
            p.approachRef.selFlaps = f;
            p.approachRef.selVref = v;
          },
          clearScratchpad: true,
        };
      }
      case '6L':
        return { goto: { page: 'INIT_REF_INDEX' } };
    }
    return undefined;
  },
};
