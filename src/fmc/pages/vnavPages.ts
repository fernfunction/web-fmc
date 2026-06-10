import { blankScreen, dashes, lskData, lskLabel, put, putRight, title } from '../screenModel';
import { MSG } from '../messages';
import { editPlan, planFor, type PageDef } from '../pageApi';
import {
  econClbSpeed,
  econCrzMach,
  econDesSpeed,
  engOutMaxAlt,
  engOutSpeed,
  lrcMach,
  maxAlt,
  maxContN1,
  optAlt,
  turbN1,
} from '../perf/model';
import { parseAltitude, parseSpeedAlt, parseWind } from '../validation/parsers';
import { destInfo, edAltFor, fmtFL, fmtMach, fmtWind, todDistFromDest } from './util';

// ---------------------------------------------------------------- CLB

export const clbPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const ci = plan.perf.costIndex ?? 0;
    const mode = plan.vnav.clbMode;
    const head = mode === 'ECON' ? 'ECON CLB' : `${mode} CLB`;
    title(scr, `${s.mod ? 'MOD ' : plan.executed ? 'ACT ' : ''}${head}`);
    lskLabel(scr, 1, 'L', 'CRZ ALT');
    lskData(scr, 1, 'L', plan.perf.crzAlt !== undefined ? fmtFL(plan.perf.crzAlt) : dashes(5));
    const tgt = plan.vnav.clbTgt ?? econClbSpeed(ci);
    lskLabel(scr, 2, 'L', 'TARGET SPD');
    lskData(scr, 2, 'L', tgt.ias ? `${tgt.ias}/${fmtMach(tgt.mach ?? econClbSpeed(ci).mach)}` : fmtMach(tgt.mach ?? 0.78));
    const rest = plan.vnav.clbSpdRestr;
    lskLabel(scr, 3, 'L', 'SPD REST');
    lskData(scr, 3, 'L', rest ? `${rest.ias}/${rest.alt}` : '250/10000');
    // next climb constraint from the legs, if any
    const next = plan.legs.find((l) => l.fromProcedure === 'SID' && l.altRestr);
    if (next?.altRestr) {
      lskLabel(scr, 1, 'R', `AT ${next.ident}`);
      lskData(scr, 1, 'R', `${next.altRestr.value}${next.altRestr.type === 'A' ? 'A' : next.altRestr.type === 'B' ? 'B' : ''}`);
    }
    lskLabel(scr, 2, 'R', 'TO T/C');
    if (s.aircraft.onGround) {
      lskData(scr, 2, 'R', dashes(9), { size: 'small' });
    } else {
      lskData(scr, 2, 'R', 'AT CRZ ALT', { size: 'small', color: 'green' });
    }
    lskData(scr, 4, 'R', 'MAX RATE>');
    lskData(scr, 5, 'R', 'MAX ANGLE>');
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    lskData(scr, 6, 'R', 'ENG OUT>');
    return scr;
  },
  onLsk(s, slot, sp) {
    const plan = planFor(s);
    switch (slot) {
      case '1L': {
        if (sp === '') {
          return plan.perf.crzAlt !== undefined ? { toScratchpad: fmtFL(plan.perf.crzAlt) } : undefined;
        }
        const alt = parseAltitude(sp);
        if (alt === null) return { message: MSG.invalidEntry };
        const gw = plan.perf.gw ?? s.aircraft.grossWeight;
        if (alt > maxAlt(gw)) return { message: MSG.unableCrzAlt };
        return { mutate: (d) => void (editPlan(d).perf.crzAlt = alt), clearScratchpad: true };
      }
      case '2L': {
        if (sp === 'DELETE')
          return {
            mutate: (d) => {
              const p = editPlan(d);
              p.vnav.clbTgt = undefined;
              p.vnav.clbMode = 'ECON';
            },
            clearScratchpad: true,
          };
        const e = parseSpeedAlt(sp);
        if (!e || (!e.speed && !e.mach)) return { message: MSG.invalidEntry };
        const lim = plan.perf.limits;
        if (e.speed && (e.speed < lim.clbMin || e.speed > lim.clbMax)) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const p = editPlan(d);
            p.vnav.clbTgt = { ias: e.speed, mach: e.mach };
          },
          clearScratchpad: true,
        };
      }
      case '3L': {
        if (sp === 'DELETE')
          return { mutate: (d) => void (editPlan(d).vnav.clbSpdRestr = undefined), clearScratchpad: true };
        const e = parseSpeedAlt(sp);
        if (!e?.speed || !e.altRestr) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => void (editPlan(d).vnav.clbSpdRestr = { ias: e.speed!, alt: e.altRestr!.value }),
          clearScratchpad: true,
        };
      }
      case '4R':
        return { mutate: (d) => void (editPlan(d).vnav.clbMode = 'MAX RATE') };
      case '5R':
        return { mutate: (d) => void (editPlan(d).vnav.clbMode = 'MAX ANGLE') };
      case '6L':
        if (s.mod) return { mutate: (d) => void (d.mod = null) };
        return undefined;
      case '6R':
        return { mutate: (d) => void (d.ui.engOut = undefined), goto: { page: 'ENG_OUT' } };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- CRZ

export const crzPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const ci = plan.perf.costIndex ?? 0;
    const gw = plan.perf.gw ?? s.aircraft.grossWeight;
    const mode = plan.vnav.crzMode;
    title(scr, `${s.mod ? 'MOD ' : plan.executed ? 'ACT ' : ''}${mode === 'LRC' ? 'LRC' : 'ECON'} CRZ`);
    lskLabel(scr, 1, 'L', 'CRZ ALT');
    lskData(scr, 1, 'L', plan.perf.crzAlt !== undefined ? fmtFL(plan.perf.crzAlt) : dashes(5), { color: 'magenta' });
    const tgtMach = plan.vnav.crzTgt?.mach ?? (mode === 'LRC' ? lrcMach(gw) : econCrzMach(ci));
    lskLabel(scr, 2, 'L', 'TARGET SPD');
    lskData(scr, 2, 'L', plan.vnav.crzTgt?.ias ? `${plan.vnav.crzTgt.ias}KT` : fmtMach(tgtMach));
    lskLabel(scr, 3, 'L', 'TURB N1');
    lskData(scr, 3, 'L', `${turbN1(s.aircraft.altitude).toFixed(1)}%`, { size: 'small', color: 'green' });
    const dest = destInfo(s);
    if (dest && plan.dest) {
      lskLabel(scr, 1, 'R', `AT ${plan.dest}`);
      lskData(scr, 1, 'R', `${dest.eta}/${dest.fuel.toFixed(1)}`, { size: 'small', color: 'green' });
    }
    lskLabel(scr, 2, 'R', 'OPT/MAX');
    lskData(scr, 2, 'R', `${fmtFL(optAlt(gw))}/${fmtFL(maxAlt(gw))}`, { size: 'small', color: 'green' });
    if (!s.aircraft.onGround) {
      lskLabel(scr, 3, 'R', 'WIND');
      lskData(scr, 3, 'R', fmtWind(s.aircraft.wind), { size: 'small', color: 'green' });
    }
    lskData(scr, 5, 'L', mode === 'LRC' ? '<ECON' : '<LRC');
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    lskData(scr, 6, 'R', 'ENG OUT>');
    return scr;
  },
  onLsk(s, slot, sp) {
    const plan = planFor(s);
    switch (slot) {
      case '1L': {
        if (sp === '') {
          return plan.perf.crzAlt !== undefined ? { toScratchpad: fmtFL(plan.perf.crzAlt) } : undefined;
        }
        const alt = parseAltitude(sp);
        if (alt === null) return { message: MSG.invalidEntry };
        const gw = plan.perf.gw ?? s.aircraft.grossWeight;
        if (alt > maxAlt(gw)) return { message: MSG.unableCrzAlt };
        return { mutate: (d) => void (editPlan(d).perf.crzAlt = alt), clearScratchpad: true };
      }
      case '2L': {
        if (sp === 'DELETE')
          return { mutate: (d) => void (editPlan(d).vnav.crzTgt = undefined), clearScratchpad: true };
        const e = parseSpeedAlt(sp);
        if (!e || (!e.speed && !e.mach)) return { message: MSG.invalidEntry };
        const lim = plan.perf.limits;
        if (e.speed && (e.speed < lim.crzMin || e.speed > lim.crzMax)) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => void (editPlan(d).vnav.crzTgt = { ias: e.speed, mach: e.mach }),
          clearScratchpad: true,
        };
      }
      case '5L':
        return {
          mutate: (d) => {
            const p = editPlan(d);
            p.vnav.crzMode = p.vnav.crzMode === 'LRC' ? 'ECON' : 'LRC';
            p.vnav.crzTgt = undefined;
          },
        };
      case '6L':
        if (s.mod) return { mutate: (d) => void (d.mod = null) };
        return undefined;
      case '6R':
        return { mutate: (d) => void (d.ui.engOut = undefined), goto: { page: 'ENG_OUT' } };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- ENG OUT (advisory only)

export const engOutPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const gw = plan.perf.gw ?? s.aircraft.grossWeight;
    title(scr, 'ENG OUT CRZ');
    if (!s.ui.engOut) {
      lskData(scr, 1, 'L', '<LT ENG OUT');
      lskData(scr, 1, 'R', 'RT ENG OUT>');
      lskData(scr, 6, 'L', '<ERASE');
      return scr;
    }
    lskLabel(scr, 1, 'L', 'ENG OUT SIDE');
    lskData(scr, 1, 'L', s.ui.engOut.side, { color: 'amber' });
    lskLabel(scr, 2, 'L', 'MAX ALT');
    lskData(scr, 2, 'L', fmtFL(engOutMaxAlt(gw)), { color: 'green' });
    lskLabel(scr, 3, 'L', 'TGT SPD');
    lskData(scr, 3, 'L', `${engOutSpeed(gw)}KT`, { color: 'green' });
    lskLabel(scr, 2, 'R', 'MAX CONT N1');
    lskData(scr, 2, 'R', `${maxContN1().toFixed(1)}%`, { color: 'green' });
    put(scr, 9, 2, 'ADVISORY ONLY', { size: 'small', color: 'amber' });
    lskData(scr, 6, 'L', '<ERASE');
    return scr;
  },
  onLsk(s, slot) {
    if (slot === '1L' && !s.ui.engOut) return { mutate: (d) => void (d.ui.engOut = { side: 'LT' }) };
    if (slot === '1R' && !s.ui.engOut) return { mutate: (d) => void (d.ui.engOut = { side: 'RT' }) };
    if (slot === '6L') {
      // advisory only, ERASE backs out without touching the plan
      return { mutate: (d) => void (d.ui.engOut = undefined), goto: { page: 'CRZ' } };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- DES

export const desPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const ci = plan.perf.costIndex ?? 0;
    title(scr, `${s.mod ? 'MOD ' : plan.executed ? 'ACT ' : ''}ECON DES`);
    const ed = edAltFor(plan);
    lskLabel(scr, 1, 'L', 'E/D ALT');
    lskData(scr, 1, 'L', String(ed), { color: 'magenta' });
    const appFix = plan.legs.find((l) => l.fromProcedure === 'APP');
    if (appFix) {
      lskLabel(scr, 1, 'R', 'AT');
      lskData(scr, 1, 'R', appFix.ident, { size: 'small' });
    }
    const tgt = plan.vnav.desTgt ?? econDesSpeed(ci);
    lskLabel(scr, 2, 'L', 'TGT SPD');
    lskData(scr, 2, 'L', `${fmtMach(tgt.mach ?? 0.78)}/${tgt.ias ?? econDesSpeed(ci).ias}`);
    const rest = plan.vnav.desSpdRestr;
    lskLabel(scr, 3, 'L', 'SPD REST');
    lskData(scr, 3, 'L', rest ? `${rest.ias}/${rest.alt}` : '250/10000');
    // path data toward the end of descent point
    const dest = destInfo(s);
    if (dest && !s.aircraft.onGround) {
      const tod = todDistFromDest(s);
      const toTod = Math.max(0, dest.dist - tod);
      lskLabel(scr, 2, 'R', 'TO T/D');
      lskData(scr, 2, 'R', `${Math.round(toTod)}NM`, { size: 'small', color: 'green' });
      const altDiff = s.aircraft.altitude - ed;
      const distToEd = Math.max(1, dest.dist - 8);
      const vb = Math.atan2(altDiff / 6076, distToEd) * (180 / Math.PI);
      const fpa = s.aircraft.vsFpm !== 0 ? Math.atan2(-s.aircraft.vsFpm / 6076 * 60, s.aircraft.groundSpeed) * (180 / Math.PI) : 0;
      const vsReq = Math.round((-altDiff / ((distToEd / Math.max(s.aircraft.groundSpeed, 100)) * 60)) / 10) * 10;
      lskLabel(scr, 3, 'R', 'FPA   V/B   V/S');
      lskData(scr, 3, 'R', `${fpa.toFixed(1)}° ${vb.toFixed(1)}° ${vsReq}`, { size: 'small', color: 'green' });
    }
    lskData(scr, 5, 'R', 'FORECAST>');
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    if (!s.aircraft.onGround && !plan.vnav.desNow) lskData(scr, 6, 'R', 'DES NOW>');
    if (plan.vnav.desNow) putRight(scr, 12, 'DES NOW ACTIVE', { size: 'small', color: 'green' });
    return scr;
  },
  onLsk(s, slot, sp) {
    const plan = planFor(s);
    switch (slot) {
      case '1L': {
        if (sp === '') return { toScratchpad: String(edAltFor(plan)) };
        const alt = parseAltitude(sp);
        if (alt === null) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (editPlan(d).vnav.edAlt = alt), clearScratchpad: true };
      }
      case '2L': {
        if (sp === 'DELETE')
          return { mutate: (d) => void (editPlan(d).vnav.desTgt = undefined), clearScratchpad: true };
        const e = parseSpeedAlt(sp);
        if (!e || (!e.speed && !e.mach)) return { message: MSG.invalidEntry };
        const lim = plan.perf.limits;
        if (e.speed && (e.speed < lim.desMin || e.speed > lim.desMax)) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => void (editPlan(d).vnav.desTgt = { ias: e.speed, mach: e.mach }),
          clearScratchpad: true,
        };
      }
      case '3L': {
        if (sp === 'DELETE')
          return { mutate: (d) => void (editPlan(d).vnav.desSpdRestr = undefined), clearScratchpad: true };
        const e = parseSpeedAlt(sp);
        if (!e?.speed || !e.altRestr) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => void (editPlan(d).vnav.desSpdRestr = { ias: e.speed!, alt: e.altRestr!.value }),
          clearScratchpad: true,
        };
      }
      case '5R':
        return { goto: { page: 'DES_FORECASTS' } };
      case '6L':
        if (s.mod) return { mutate: (d) => void (d.mod = null) };
        return undefined;
      case '6R': {
        if (s.aircraft.onGround || plan.vnav.desNow) return undefined;
        return {
          mutate: (d) => {
            editPlan(d).vnav.desNow = true;
          },
        };
      }
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- DES FORECASTS

export const desForecastsPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const f = plan.desForecast;
    title(scr, 'DES FORECASTS');
    lskLabel(scr, 1, 'L', 'TRANS LVL');
    lskData(scr, 1, 'L', f.transLvl !== undefined ? fmtFL(f.transLvl) : 'FL040');
    put(scr, 3, 0, 'ALT', { size: 'small' });
    put(scr, 3, 10, 'WIND DIR/SPD', { size: 'small' });
    for (let n = 0; n < 3; n++) {
      const lv = f.levels[n];
      const row = 2 * (n + 2);
      put(scr, row, 0, lv.altFt !== undefined ? fmtFL(lv.altFt) : dashes(5), { size: 'large' });
      put(scr, row, 10, lv.wind ? fmtWind(lv.wind) : `${dashes(3)}°/${dashes(2)}`, { size: 'large' });
    }
    lskLabel(scr, 1, 'R', 'ANTI-ICE');
    lskData(scr, 1, 'R', f.antiIce ? 'ON' : 'OFF');
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    lskData(scr, 6, 'R', 'DES>');
    return scr;
  },
  onLsk(s, slot, sp) {
    const plan = planFor(s);
    if (slot === '1L') {
      const alt = parseAltitude(sp);
      if (alt === null) return { message: MSG.invalidEntry };
      return { mutate: (d) => void (editPlan(d).desForecast.transLvl = alt), clearScratchpad: true };
    }
    if (slot === '1R') {
      return {
        mutate: (d) => {
          const f = editPlan(d).desForecast;
          f.antiIce = !f.antiIce;
        },
      };
    }
    if (slot === '6L' && s.mod) return { mutate: (d) => void (d.mod = null) };
    if (slot === '6R') return { goto: { page: 'DES' } };
    // rows 2..4 take ALT on the left and WIND on the right
    const n = Number(slot[0]);
    if (n >= 2 && n <= 4) {
      const idx = n - 2;
      if (slot.endsWith('L')) {
        const alt = parseAltitude(sp);
        if (alt === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => void (editPlan(d).desForecast.levels[idx].altFt = alt),
          clearScratchpad: true,
        };
      }
      if (sp === 'DELETE')
        return {
          mutate: (d) => void (editPlan(d).desForecast.levels[idx] = {}),
          clearScratchpad: true,
        };
      const w = parseWind(sp);
      if (!w) return { message: MSG.invalidEntry };
      if (plan.desForecast.levels[idx].altFt === undefined) return { message: MSG.invalidEntry };
      return {
        mutate: (d) => void (editPlan(d).desForecast.levels[idx].wind = w),
        clearScratchpad: true,
      };
    }
    return undefined;
  },
};
