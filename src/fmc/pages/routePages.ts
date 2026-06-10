import { current, type Draft } from 'immer';
import type { FmcState, Leg, LskSlot, PlanData } from '../types';
import { blankScreen, boxes, dashes, lskData, lskLabel, put, putRight, title } from '../screenModel';
import { MSG } from '../messages';
import { editPlan, planFor, slotNum, slotSide, type LskResult, type PageDef } from '../pageApi';
import {
  findAirport,
  findAirway,
  findCompanyRoute,
  findFixes,
  ndb,
  type FixHit,
} from '../nav/ndb';
import { buildLegs, findLegIndex, legCourseDist } from '../nav/route';
import { distanceNm, fmtLatLon, toMagnetic, bearingDeg } from '../nav/geo';
import { parseCourse, parseIdent, parseLegDist, parseLegTime, parseQuadRadial, parseSpeedAlt, parseTimeHHMM, parseWind } from '../validation/parsers';
import { etaAt, fmtCrs, fmtLegConstraint, fmtWind, fuelAt, fmtFL } from './util';
import { distanceAlongRoute } from '../nav/route';

const DISCO: Leg = { ident: '', lat: 0, lon: 0, isDiscontinuity: true };

function rebuildLegs(plan: Draft<PlanData> | PlanData): void {
  plan.legs = buildLegs({
    origin: plan.origin,
    dest: plan.dest,
    runway: plan.runway,
    sid: plan.sid,
    star: plan.star,
    approach: plan.approach,
    route: plan.routeSpec.filter((r) => r.to),
  });
}

// the first leg shown on LEGS style pages: passed waypoints drop off in flight
function visibleStart(s: FmcState): number {
  const plan = planFor(s);
  return Math.min(s.activeLegIndex, Math.max(0, plan.legs.length - 1));
}

export function insertWaypointAt(plan: Draft<PlanData>, absIdx: number, hit: FixHit): void {
  const leg: Leg = { ident: hit.ident, lat: hit.lat, lon: hit.lon, via: 'DIRECT' };
  const cur = plan.legs[absIdx];
  if (!cur) {
    plan.legs.push(leg);
    return;
  }
  if (cur.isDiscontinuity) {
    const next = plan.legs[absIdx + 1];
    if (next && !next.isDiscontinuity && next.ident === leg.ident) plan.legs.splice(absIdx, 1);
    else plan.legs.splice(absIdx, 1, leg);
    return;
  }
  if (cur.ident === leg.ident) return;
  // entering a downroute waypoint connects direct and drops the bypassed legs
  const ahead = plan.legs.slice(absIdx).findIndex((l) => !l.isDiscontinuity && l.ident === leg.ident);
  if (ahead > 0) {
    plan.legs.splice(absIdx, ahead);
    return;
  }
  plan.legs.splice(absIdx, 0, leg, { ...DISCO });
}

function deleteLegAt(plan: Draft<PlanData>, absIdx: number): void {
  const prev = plan.legs[absIdx - 1];
  const next = plan.legs[absIdx + 1];
  if ((prev && prev.isDiscontinuity) || (next && next.isDiscontinuity) || absIdx === plan.legs.length - 1) {
    plan.legs.splice(absIdx, 1);
  } else {
    plan.legs.splice(absIdx, 1, { ...DISCO });
  }
}

// resolves a fix ident, branching to SELECT DESIRED WPT when the ident is ambiguous
export function resolveFix(
  s: FmcState,
  ident: string,
  context: NonNullable<FmcState['ui']['selectWpt']>['context'],
  apply: (d: Draft<FmcState>, hit: FixHit) => void,
): LskResult {
  const hits = findFixes(ident, s.suppNav);
  if (hits.length === 0) return { message: MSG.notInDataBase };
  if (hits.length === 1) {
    return { mutate: (d) => apply(d, hits[0]), clearScratchpad: true };
  }
  const pos = s.aircraft.position;
  const candidates = hits
    .map((h) => ({ ...h, kind: h.kind as string, distNm: Math.round(distanceNm(pos, h)) }))
    .sort((a, b) => a.distNm - b.distNm);
  return {
    clearScratchpad: true,
    mutate: (d) => {
      d.ui.selectWpt = {
        candidates,
        returnPage: d.ui.page,
        returnIndex: d.ui.pageIndex,
        context,
      };
    },
    goto: { page: 'SELECT_WPT' },
  };
}

export function applyPickedFix(d: Draft<FmcState>, hit: FixHit, ctx: NonNullable<FmcState['ui']['selectWpt']>['context']): void {
  switch (ctx.kind) {
    case 'LEGS_INSERT':
      insertWaypointAt(editPlan(d), ctx.legIndex ?? 0, hit);
      break;
    case 'RTE_TO':
      applyRouteTo(editPlan(d), ctx.specIndex ?? -1, ctx.via, hit);
      break;
    case 'DIR_INTC':
      applyDirectTo(d, hit);
      break;
    case 'FIX_INFO': {
      const fi = d.ui.fixInfo[ctx.fixIndex ?? 0];
      fi.ident = hit.ident;
      fi.lat = hit.lat;
      fi.lon = hit.lon;
      fi.radial = undefined;
      fi.distance = undefined;
      break;
    }
    case 'REF_NAV':
      d.ui.refNavHit = { ...hit };
      break;
  }
}

function applyRouteTo(plan: Draft<PlanData>, specIndex: number, via: string | undefined, hit: FixHit): void {
  if (specIndex >= 0 && specIndex < plan.routeSpec.length) {
    plan.routeSpec[specIndex].to = hit.ident;
    if (via) plan.routeSpec[specIndex].via = via;
  } else {
    plan.routeSpec.push({ via: via ?? 'DIRECT', to: hit.ident });
  }
  rebuildLegs(plan);
}

export function applyDirectTo(d: Draft<FmcState>, hit: FixHit): void {
  const plan = editPlan(d);
  const fromIdx = findLegIndex(plan.legs.slice(d.activeLegIndex), hit.ident);
  if (fromIdx >= 0) {
    plan.legs = plan.legs.slice(d.activeLegIndex + fromIdx);
    plan.legs[0] = { ...plan.legs[0], via: 'DIRECT' };
  } else {
    plan.legs = [
      { ident: hit.ident, lat: hit.lat, lon: hit.lon, via: 'DIRECT' },
      { ...DISCO },
      ...plan.legs.slice(d.activeLegIndex),
    ];
  }
  plan.directTo = hit.ident;
}

// ---------------------------------------------------------------- RTE

export const rtePage: PageDef = {
  numPages(s) {
    const plan = planFor(s);
    return 1 + Math.max(1, Math.ceil((plan.routeSpec.length + 1) / 5));
  },
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const total = rtePage.numPages(s);
    const act = plan.activated && plan.executed ? 'ACT ' : '';
    title(scr, `${s.mod ? 'MOD ' : act}RTE 1`, s.ui.pageIndex + 1, total);
    if (s.ui.pageIndex === 0) {
      lskLabel(scr, 1, 'L', 'ORIGIN');
      lskData(scr, 1, 'L', plan.origin ?? boxes(4));
      lskLabel(scr, 1, 'R', 'DEST');
      lskData(scr, 1, 'R', plan.dest ?? boxes(4));
      lskLabel(scr, 2, 'L', 'CO ROUTE');
      lskData(scr, 2, 'L', plan.coRoute ?? dashes(10));
      lskLabel(scr, 2, 'R', 'FLT NO');
      lskData(scr, 2, 'R', plan.fltNo ?? dashes(8));
      lskLabel(scr, 3, 'L', 'RUNWAY');
      lskData(scr, 3, 'L', plan.runway ? `RW${plan.runway}` : dashes(5));
      lskLabel(scr, 4, 'R', 'LATERAL OFFSET');
      lskData(scr, 4, 'R', 'OFFSET>');
      if (s.mod) lskData(scr, 6, 'L', '<ERASE');
      if (plan.legs.length > 0 && !plan.activated) lskData(scr, 6, 'R', 'ACTIVATE>');
      else if (plan.activated && plan.executed) lskData(scr, 6, 'R', 'PERF INIT>');
      return scr;
    }
    put(scr, 1, 0, 'VIA', { size: 'small' });
    putRight(scr, 1, 'TO', { size: 'small' });
    const startRow = (s.ui.pageIndex - 1) * 5;
    for (let n = 1; n <= 5; n++) {
      const i = startRow + n - 1;
      if (i < plan.routeSpec.length) {
        const item = plan.routeSpec[i];
        lskData(scr, n, 'L', item.via);
        lskData(scr, n, 'R', item.to || boxes(5));
      } else if (i === plan.routeSpec.length) {
        lskData(scr, n, 'L', dashes(5));
        lskData(scr, n, 'R', dashes(5));
        break;
      }
    }
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    if (plan.legs.length > 0 && !plan.activated) lskData(scr, 6, 'R', 'ACTIVATE>');
    return scr;
  },
  onLsk(s, slot, sp) {
    const plan = planFor(s);
    if (slot === '6L' && s.mod) return { mutate: (d) => void (d.mod = null) };
    if (slot === '6R') {
      if (plan.legs.length > 0 && !plan.activated) {
        // ACTIVATE arms the route, EXEC makes it active
        return {
          mutate: (d) => {
            if (!d.mod) d.mod = structuredClone(current(d).active);
            d.mod!.activated = true;
          },
        };
      }
      if (plan.activated && plan.executed) return { goto: { page: 'PERF_INIT' } };
      return undefined;
    }
    if (s.ui.pageIndex === 0) return rtePage1Lsk(s, slot, sp);
    return rteViaToLsk(s, slot, sp);
  },
};

function rtePage1Lsk(s: FmcState, slot: LskSlot, sp: string): LskResult | undefined {
  const plan = planFor(s);
  switch (slot) {
    case '1L': {
      if (sp === '') return plan.origin ? { toScratchpad: plan.origin } : undefined;
      const apt = findAirport(sp);
      if (!apt) return { message: MSG.notInDataBase };
      return {
        mutate: (d) => {
          const p = editPlan(d);
          p.origin = apt.ident;
          p.runway = undefined;
          p.sid = undefined;
          p.routeSpec = [];
          p.activated = false;
          rebuildLegs(p);
        },
        clearScratchpad: true,
      };
    }
    case '1R': {
      if (sp === '') return plan.dest ? { toScratchpad: plan.dest } : undefined;
      const apt = findAirport(sp);
      if (!apt) return { message: MSG.notInDataBase };
      return {
        mutate: (d) => {
          const p = editPlan(d);
          p.dest = apt.ident;
          p.star = undefined;
          p.approach = undefined;
          rebuildLegs(p);
        },
        clearScratchpad: true,
      };
    }
    case '2L': {
      if (sp === '') return plan.coRoute ? { toScratchpad: plan.coRoute } : undefined;
      const co = findCompanyRoute(sp);
      if (!co) return { message: MSG.notInDataBase };
      return {
        mutate: (d) => {
          const p = editPlan(d);
          p.coRoute = co.name;
          p.origin = co.origin;
          p.dest = co.dest;
          p.fltNo = co.fltNo;
          p.routeSpec = co.route.map((r) => ({ ...r }));
          rebuildLegs(p);
        },
        clearScratchpad: true,
      };
    }
    case '2R': {
      if (sp === '') return plan.fltNo ? { toScratchpad: plan.fltNo } : undefined;
      if (sp.length > 8) return { message: MSG.invalidEntry };
      return { mutate: (d) => void (editPlan(d).fltNo = sp.toUpperCase()), clearScratchpad: true };
    }
    case '3L': {
      if (sp === '') return plan.runway ? { toScratchpad: `RW${plan.runway}` } : undefined;
      const apt = plan.origin ? findAirport(plan.origin) : undefined;
      if (!apt) return { message: MSG.invalidEntry };
      const id = sp.toUpperCase().replace(/^RW/, '');
      const rwy = apt.runways.find((r) => r.id === id);
      if (!rwy) return { message: MSG.notInDataBase };
      return {
        mutate: (d) => {
          const p = editPlan(d);
          p.runway = rwy.id;
          // a runway change drops a SID that does not serve it
          if (p.sid) {
            const sid = ndb.procedures[apt.ident]?.sids.find((x) => x.name === p.sid);
            if (sid?.runways && !sid.runways.includes(rwy.id)) p.sid = undefined;
          }
          rebuildLegs(p);
        },
        clearScratchpad: true,
      };
    }
    case '4R':
      return { goto: { page: 'OFFSET' } };
  }
  return undefined;
}

function rteViaToLsk(s: FmcState, slot: LskSlot, sp: string): LskResult | undefined {
  const plan = planFor(s);
  const n = slotNum(slot);
  if (n === 6) return undefined;
  const i = (s.ui.pageIndex - 1) * 5 + n - 1;
  const side = slotSide(slot);
  const item = i < plan.routeSpec.length ? plan.routeSpec[i] : undefined;
  const prevFix = i > 0 ? plan.routeSpec[i - 1]?.to : plan.legs.find((l) => l.fromProcedure === 'SID' && !l.isDiscontinuity)?.ident;

  if (side === 'L') {
    if (sp === '') return item ? { toScratchpad: item.via } : undefined;
    if (sp === 'DELETE') {
      if (!item) return { message: MSG.invalidDelete };
      return {
        mutate: (d) => {
          const p = editPlan(d);
          p.routeSpec.splice(i, 1);
          rebuildLegs(p);
        },
        clearScratchpad: true,
      };
    }
    const awy = findAirway(sp);
    if (!awy) return { message: MSG.notInDataBase };
    // an airway needs to touch the previous fix to make sense
    const entry = item?.via === 'DIRECT' && i > 0 ? plan.routeSpec[i - 1].to : prevFix;
    const sidEnd = plan.routeSpec[i - 1]?.to ?? entry;
    if (!sidEnd || !awy.fixes.includes(sidEnd.toUpperCase())) return { message: MSG.invalidEntry };
    return {
      mutate: (d) => {
        const p = editPlan(d);
        if (i < p.routeSpec.length) {
          p.routeSpec[i].via = awy.name;
          if (p.routeSpec[i].to && !awy.fixes.includes(p.routeSpec[i].to)) p.routeSpec[i].to = '';
        } else {
          p.routeSpec.push({ via: awy.name, to: '' });
        }
        rebuildLegs(p);
      },
      clearScratchpad: true,
    };
  }

  // TO column
  if (sp === '') return item?.to ? { toScratchpad: item.to } : undefined;
  if (sp === 'DELETE') {
    if (!item) return { message: MSG.invalidDelete };
    return {
      mutate: (d) => {
        const p = editPlan(d);
        p.routeSpec.splice(i, 1);
        rebuildLegs(p);
      },
      clearScratchpad: true,
    };
  }
  const ident = parseIdent(sp);
  if (!ident) return { message: MSG.invalidEntry };
  if (item && item.via !== 'DIRECT') {
    const awy = findAirway(item.via);
    if (awy && !awy.fixes.includes(ident)) return { message: MSG.invalidEntry };
  }
  return resolveFix(s, ident, { kind: 'RTE_TO', specIndex: item ? i : -1, via: item?.via }, (d, hit) => {
    applyRouteTo(editPlan(d), item ? i : -1, item?.via, hit);
  });
}

// ---------------------------------------------------------------- LEGS

export const legsPage: PageDef = {
  numPages(s) {
    const plan = planFor(s);
    const count = plan.legs.length - visibleStart(s);
    return Math.max(1, Math.ceil(count / 5));
  },
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const total = legsPage.numPages(s);
    const act = plan.activated && plan.executed ? 'ACT ' : '';
    title(scr, `${s.mod ? 'MOD ' : act}RTE 1 LEGS`, s.ui.pageIndex + 1, total);
    const start = visibleStart(s) + s.ui.pageIndex * 5;
    for (let n = 1; n <= 5; n++) {
      const i = start + n - 1;
      const leg = plan.legs[i];
      if (!leg) break;
      if (leg.isDiscontinuity) {
        lskLabel(scr, n, 'L', 'THEN');
        lskData(scr, n, 'L', boxes(5));
        putRight(scr, 2 * n, 'DISCONTINUITY', { size: 'small' });
        continue;
      }
      const isActive = i === s.activeLegIndex && plan.executed && !s.aircraft.onGround;
      const cd = i === s.activeLegIndex && !s.aircraft.onGround
        ? { crs: Math.round(toMagnetic(bearingDeg(s.aircraft.position, leg), s.aircraft.position)), dist: distanceNm(s.aircraft.position, leg) }
        : legCourseDist(plan.legs, i);
      if (cd) {
        lskLabel(scr, n, 'L', `${fmtCrs(cd.crs)}`);
        put(scr, 2 * n - 1, 7, `${cd.dist < 100 ? cd.dist.toFixed(0) : Math.round(cd.dist)}NM`, { size: 'small' });
      }
      lskData(scr, n, 'L', leg.ident, { color: isActive ? 'magenta' : 'white' });
      const constraint = fmtLegConstraint(leg, plan.perf.transAlt);
      if (constraint) {
        lskData(scr, n, 'R', constraint, { color: isActive ? 'magenta' : 'white' });
      } else {
        const crz = plan.perf.crzAlt;
        lskData(scr, n, 'R', crz ? `---/${fmtFL(crz)}` : dashes(5), { size: 'small' });
      }
    }
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    if (!s.mod) lskData(scr, 6, 'R', 'RTE DATA>');
    return scr;
  },
  onLsk(s, slot, sp) {
    const plan = planFor(s);
    const n = slotNum(slot);
    if (slot === '6L' && s.mod) return { mutate: (d) => void (d.mod = null) };
    if (slot === '6R' && !s.mod) return { goto: { page: 'RTE_DATA' } };
    if (n === 6) return undefined;
    const i = visibleStart(s) + s.ui.pageIndex * 5 + n - 1;
    const leg = plan.legs[i];
    if (slotSide(slot) === 'L') {
      if (sp === '') return leg && !leg.isDiscontinuity ? { toScratchpad: leg.ident } : undefined;
      if (sp === 'DELETE') {
        if (!leg || leg.isDiscontinuity) return { message: MSG.invalidDelete };
        if (i === s.activeLegIndex && plan.executed && !s.aircraft.onGround) return { message: MSG.invalidDelete };
        return {
          mutate: (d) => deleteLegAt(editPlan(d), i),
          clearScratchpad: true,
        };
      }
      const ident = parseIdent(sp);
      if (!ident) return { message: MSG.invalidEntry };
      return resolveFix(s, ident, { kind: 'LEGS_INSERT', legIndex: i }, (d, hit) => {
        insertWaypointAt(editPlan(d), i, hit);
      });
    }
    // right side holds the speed/alt constraint
    if (!leg || leg.isDiscontinuity) return undefined;
    if (sp === '') {
      const c = fmtLegConstraint(leg, plan.perf.transAlt);
      return c ? { toScratchpad: c } : undefined;
    }
    if (sp === 'DELETE') {
      if (!leg.speedRestr && !leg.altRestr) return { message: MSG.invalidDelete };
      return {
        mutate: (d) => {
          const p = editPlan(d);
          const l = p.legs[i];
          if (l) {
            l.speedRestr = undefined;
            l.altRestr = undefined;
          }
        },
        clearScratchpad: true,
      };
    }
    const entry = parseSpeedAlt(sp);
    if (!entry || entry.mach) return { message: MSG.invalidEntry };
    return {
      mutate: (d) => {
        const p = editPlan(d);
        const l = p.legs[i];
        if (!l) return;
        if (entry.speed !== undefined) l.speedRestr = entry.speed;
        if (entry.altRestr) l.altRestr = entry.altRestr;
      },
      clearScratchpad: true,
    };
  },
};

// ---------------------------------------------------------------- DEP/ARR

export const depArrIndexPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    title(scr, 'DEP/ARR INDEX');
    lskLabel(scr, 1, 'L', ' ');
    if (plan.origin) {
      put(scr, 2, 9, plan.origin, { size: 'large' });
      lskData(scr, 1, 'L', '<DEP');
      lskData(scr, 1, 'R', 'ARR>');
    }
    if (plan.dest) {
      put(scr, 4, 9, plan.dest, { size: 'large' });
      lskData(scr, 2, 'R', 'ARR>');
    }
    return scr;
  },
  onLsk(s, slot) {
    const plan = planFor(s);
    if (slot === '1L' && plan.origin) {
      return {
        mutate: (d) => void (d.ui.depArr = { airport: plan.origin!, mode: 'DEP' }),
        goto: { page: 'DEPARTURES' },
      };
    }
    if (slot === '1R' && plan.origin) {
      return {
        mutate: (d) => void (d.ui.depArr = { airport: plan.origin!, mode: 'ARR' }),
        goto: { page: 'ARRIVALS' },
      };
    }
    if (slot === '2R' && plan.dest) {
      return {
        mutate: (d) => void (d.ui.depArr = { airport: plan.dest!, mode: 'ARR' }),
        goto: { page: 'ARRIVALS' },
      };
    }
    return undefined;
  },
};

function markFor(s: FmcState, selected: boolean): string {
  if (!selected) return '';
  return s.mod || !planFor(s).executed ? '<SEL>' : '<ACT>';
}

export const departuresPage: PageDef = {
  numPages(s) {
    const apt = s.ui.depArr?.airport ? findAirport(s.ui.depArr.airport) : undefined;
    if (!apt) return 1;
    const procs = ndb.procedures[apt.ident];
    return Math.max(1, Math.ceil(Math.max(procs?.sids.length ?? 0, apt.runways.length) / 5));
  },
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const aptId = s.ui.depArr?.airport ?? plan.origin;
    const apt = aptId ? findAirport(aptId) : undefined;
    title(scr, `${aptId ?? ''} DEPARTURES`, s.ui.pageIndex + 1, departuresPage.numPages(s));
    if (!apt) return scr;
    const procs = ndb.procedures[apt.ident];
    let sids = procs?.sids ?? [];
    let runways = apt.runways;
    if (plan.runway) sids = sids.filter((x) => !x.runways || x.runways.includes(plan.runway!));
    if (plan.sid) {
      const sel = procs?.sids.find((x) => x.name === plan.sid);
      if (sel?.runways) runways = runways.filter((r) => sel.runways!.includes(r.id));
    }
    put(scr, 1, 1, 'SIDS', { size: 'small' });
    putRight(scr, 1, 'RUNWAYS', { size: 'small' });
    const off = s.ui.pageIndex * 5;
    for (let n = 1; n <= 5; n++) {
      const sid = sids[off + n - 1];
      if (sid) {
        const mark = markFor(s, plan.sid === sid.name);
        lskData(scr, n, 'L', `${sid.name}${mark ? ' ' + mark : ''}`, { color: mark ? 'cyan' : 'white' });
      }
      const rwy = runways[off + n - 1];
      if (rwy) {
        const mark = markFor(s, plan.runway === rwy.id);
        lskData(scr, n, 'R', `${mark ? mark + ' ' : ''}${rwy.id}`, { color: mark ? 'cyan' : 'white' });
      }
    }
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    else lskData(scr, 6, 'L', '<INDEX');
    lskData(scr, 6, 'R', 'ROUTE>');
    return scr;
  },
  onLsk(s, slot) {
    const plan = planFor(s);
    if (slot === '6L') {
      if (s.mod) return { mutate: (d) => void (d.mod = null) };
      return { goto: { page: 'DEP_ARR_INDEX' } };
    }
    if (slot === '6R') return { goto: { page: 'RTE' } };
    const aptId = s.ui.depArr?.airport ?? plan.origin;
    const apt = aptId ? findAirport(aptId) : undefined;
    if (!apt) return undefined;
    const procs = ndb.procedures[apt.ident];
    let sids = procs?.sids ?? [];
    let runways = apt.runways;
    if (plan.runway) sids = sids.filter((x) => !x.runways || x.runways.includes(plan.runway!));
    if (plan.sid) {
      const sel = procs?.sids.find((x) => x.name === plan.sid);
      if (sel?.runways) runways = runways.filter((r) => sel.runways!.includes(r.id));
    }
    const n = slotNum(slot);
    const idx = s.ui.pageIndex * 5 + n - 1;
    if (slotSide(slot) === 'L') {
      const sid = sids[idx];
      if (!sid) return undefined;
      return {
        mutate: (d) => {
          const p = editPlan(d);
          p.sid = sid.name;
          if (sid.runways?.length === 1) p.runway = sid.runways[0];
          rebuildLegs(p);
        },
      };
    }
    const rwy = runways[idx];
    if (!rwy) return undefined;
    return {
      mutate: (d) => {
        const p = editPlan(d);
        p.runway = rwy.id;
        rebuildLegs(p);
      },
    };
  },
};

export const arrivalsPage: PageDef = {
  numPages(s) {
    const aptId = s.ui.depArr?.airport ?? planFor(s).dest;
    const procs = aptId ? ndb.procedures[aptId] : undefined;
    return Math.max(1, Math.ceil(Math.max(procs?.stars.length ?? 0, procs?.approaches.length ?? 0) / 5));
  },
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const aptId = s.ui.depArr?.airport ?? plan.dest;
    title(scr, `${aptId ?? ''} ARRIVALS`, s.ui.pageIndex + 1, arrivalsPage.numPages(s));
    if (!aptId) return scr;
    const procs = ndb.procedures[aptId];
    put(scr, 1, 1, 'STARS', { size: 'small' });
    putRight(scr, 1, 'APPROACHES', { size: 'small' });
    const off = s.ui.pageIndex * 5;
    for (let n = 1; n <= 5; n++) {
      const star = procs?.stars[off + n - 1];
      if (star) {
        const mark = markFor(s, plan.star === star.name);
        lskData(scr, n, 'L', `${star.name}${mark ? ' ' + mark : ''}`, { color: mark ? 'cyan' : 'white' });
      }
      const app = procs?.approaches[off + n - 1];
      if (app) {
        const mark = markFor(s, plan.approach === app.name);
        lskData(scr, n, 'R', `${mark ? mark + ' ' : ''}${app.name}`, { color: mark ? 'cyan' : 'white' });
      }
    }
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    else lskData(scr, 6, 'L', '<INDEX');
    lskData(scr, 6, 'R', 'ROUTE>');
    return scr;
  },
  onLsk(s, slot) {
    const plan = planFor(s);
    if (slot === '6L') {
      if (s.mod) return { mutate: (d) => void (d.mod = null) };
      return { goto: { page: 'DEP_ARR_INDEX' } };
    }
    if (slot === '6R') return { goto: { page: 'RTE' } };
    const aptId = s.ui.depArr?.airport ?? plan.dest;
    if (!aptId) return undefined;
    const procs = ndb.procedures[aptId];
    const n = slotNum(slot);
    const idx = s.ui.pageIndex * 5 + n - 1;
    if (slotSide(slot) === 'L') {
      const star = procs?.stars[idx];
      if (!star) return undefined;
      return {
        mutate: (d) => {
          const p = editPlan(d);
          p.star = star.name;
          rebuildLegs(p);
        },
      };
    }
    const app = procs?.approaches[idx];
    if (!app) return undefined;
    return {
      mutate: (d) => {
        const p = editPlan(d);
        p.approach = app.name;
        rebuildLegs(p);
      },
    };
  },
};

// ---------------------------------------------------------------- DIR/INTC

export const dirIntcPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    title(scr, s.mod ? 'MOD RTE 1 LEGS' : 'ACT RTE 1 LEGS', 1, 1);
    const start = visibleStart(s);
    for (let n = 1; n <= 5; n++) {
      const leg = plan.legs[start + n - 1];
      if (!leg) break;
      if (leg.isDiscontinuity) {
        lskLabel(scr, n, 'L', 'THEN');
        lskData(scr, n, 'L', boxes(5));
        continue;
      }
      const isActive = start + n - 1 === s.activeLegIndex && !s.aircraft.onGround;
      lskData(scr, n, 'L', leg.ident, { color: isActive ? 'magenta' : 'white' });
    }
    lskLabel(scr, 6, 'L', 'DIR TO');
    lskData(scr, 6, 'L', boxes(5));
    lskLabel(scr, 6, 'R', 'INTC CRS');
    lskData(scr, 6, 'R', s.ui.dirIntc?.interceptCourse !== undefined ? fmtCrs(s.ui.dirIntc.interceptCourse) : dashes(3) + '°');
    return scr;
  },
  onLsk(s, slot, sp) {
    if (slot === '6L') {
      const ident = parseIdent(sp);
      if (!ident) return { message: MSG.invalidEntry };
      return resolveFix(s, ident, { kind: 'DIR_INTC' }, (d, hit) => {
        applyDirectTo(d, hit);
        d.ui.dirIntc = { ident: hit.ident };
      });
    }
    if (slot === '6R') {
      const crs = parseCourse(sp);
      if (crs === null) return { message: MSG.invalidEntry };
      if (!s.ui.dirIntc?.ident && !s.mod) return { message: MSG.notOnIntercept };
      return { mutate: (d) => void (d.ui.dirIntc = { ...d.ui.dirIntc, interceptCourse: crs }), clearScratchpad: true };
    }
    // picking a displayed leg with an empty scratchpad copies it down
    const n = slotNum(slot);
    if (n <= 5 && slotSide(slot) === 'L') {
      const leg = planFor(s).legs[visibleStart(s) + n - 1];
      if (leg && !leg.isDiscontinuity && sp === '') return { toScratchpad: leg.ident };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- SELECT DESIRED WPT

export const selectWptPage: PageDef = {
  numPages(s) {
    return Math.max(1, Math.ceil((s.ui.selectWpt?.candidates.length ?? 0) / 5));
  },
  render(s) {
    const scr = blankScreen();
    title(scr, 'SELECT DESIRED WPT', s.ui.pageIndex + 1, selectWptPage.numPages(s));
    const sel = s.ui.selectWpt;
    if (!sel) return scr;
    const off = s.ui.pageIndex * 5;
    for (let n = 1; n <= 5; n++) {
      const c = sel.candidates[off + n - 1];
      if (!c) break;
      const kind = c.kind === 'NAVAID' ? (c.freq && c.freq > 200 ? 'NDB' : 'VOR') : c.kind;
      lskLabel(scr, n, 'L', `${c.ident} ${kind}${c.freq ? ' ' + c.freq.toFixed(c.freq > 200 ? 0 : 1) : ''}  ${c.distNm}NM`);
      lskData(scr, n, 'L', fmtLatLon(c));
    }
    return scr;
  },
  onLsk(s, slot) {
    const sel = s.ui.selectWpt;
    if (!sel) return undefined;
    const n = slotNum(slot);
    if (n === 6) return undefined;
    const c = sel.candidates[s.ui.pageIndex * 5 + n - 1];
    if (!c) return undefined;
    return {
      mutate: (d) => {
        applyPickedFix(d, c as FixHit, sel.context);
        d.ui.selectWpt = undefined;
      },
      goto: { page: sel.returnPage, index: sel.returnIndex },
    };
  },
};

// ---------------------------------------------------------------- RTE HOLD

export const holdPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const hold = plan.hold;
    if (!hold) {
      title(scr, s.mod ? 'MOD RTE 1 LEGS' : 'ACT RTE 1 LEGS', 1, 1);
      const start = visibleStart(s);
      for (let n = 1; n <= 5; n++) {
        const leg = plan.legs[start + n - 1];
        if (!leg) break;
        if (leg.isDiscontinuity) {
          lskLabel(scr, n, 'L', 'THEN');
          lskData(scr, n, 'L', boxes(5));
          continue;
        }
        lskData(scr, n, 'L', leg.ident, {
          color: start + n - 1 === s.activeLegIndex && !s.aircraft.onGround ? 'magenta' : 'white',
        });
      }
      lskLabel(scr, 6, 'L', 'HOLD AT');
      lskData(scr, 6, 'L', boxes(5));
      if (!s.aircraft.onGround) {
        lskLabel(scr, 6, 'R', 'HOLD AT');
        lskData(scr, 6, 'R', 'PPOS>');
      }
      return scr;
    }
    title(scr, s.mod ? 'MOD RTE HOLD' : 'ACT RTE HOLD');
    lskLabel(scr, 1, 'L', 'FIX');
    lskData(scr, 1, 'L', hold.atIdent, { color: 'magenta' });
    lskLabel(scr, 1, 'R', 'FIX ETA');
    const legIdx = findLegIndex(plan.legs, hold.atIdent);
    const distTo = hold.atIdent === 'PPOS' || legIdx < 0 ? 0 : distanceAlongRoute(s, legIdx);
    lskData(scr, 1, 'R', hold.atIdent === 'PPOS' ? fmtCrs(s.aircraft.track) : etaAt(s, distTo), { size: 'small' });
    lskLabel(scr, 2, 'L', 'QUAD/RADIAL');
    lskData(scr, 2, 'L', hold.quadRadial ?? `${dashes(2)}/${dashes(3)}`);
    lskLabel(scr, 3, 'L', 'INBD CRS/DIR');
    lskData(scr, 3, 'L', `${fmtCrs(hold.inboundCourse)}/${hold.turnDir} TURN`);
    lskLabel(scr, 4, 'L', 'LEG TIME');
    lskData(scr, 4, 'L', hold.legTimeMin !== undefined ? `${hold.legTimeMin.toFixed(1)} MIN` : `${dashes(3)} MIN`);
    lskLabel(scr, 5, 'L', 'LEG DIST');
    lskData(scr, 5, 'L', hold.legDistNm !== undefined ? `${hold.legDistNm.toFixed(1)} NM` : `${dashes(4)} NM`);
    lskLabel(scr, 2, 'R', 'EFC TIME');
    lskData(scr, 2, 'R', hold.efcTime ? `${hold.efcTime}z` : dashes(4));
    lskLabel(scr, 4, 'R', 'BEST SPEED');
    lskData(scr, 4, 'R', `${Math.round(225 + (s.aircraft.altitude / 1000) * 1.2)}KT`, { size: 'small', color: 'green' });
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    if (!s.aircraft.onGround && plan.executed) {
      lskData(scr, 6, 'R', hold.exitArmed ? 'EXIT ARMED' : 'EXIT HOLD>', {
        inverse: hold.exitArmed,
      });
    }
    return scr;
  },
  onLsk(s, slot, sp) {
    const plan = planFor(s);
    const hold = plan.hold;
    if (!hold) {
      if (slot === '6L') {
        const ident = parseIdent(sp);
        if (!ident) return { message: MSG.invalidEntry };
        const legIdx = findLegIndex(plan.legs, ident);
        if (legIdx < 0) return { message: MSG.notInDataBase };
        return {
          mutate: (d) => {
            const p = editPlan(d);
            const cd = legCourseDist(p.legs, legIdx);
            p.hold = {
              atIdent: ident,
              inboundCourse: cd?.crs ?? Math.round(s.aircraft.track),
              turnDir: 'R',
              legTimeMin: (p.legs[legIdx]?.altRestr?.value ?? s.aircraft.altitude) > 14000 ? 1.5 : 1.0,
              exitArmed: false,
            };
          },
          clearScratchpad: true,
        };
      }
      if (slot === '6R' && !s.aircraft.onGround) {
        return {
          mutate: (d) => {
            const p = editPlan(d);
            p.hold = {
              atIdent: 'PPOS',
              inboundCourse: Math.round(s.aircraft.track),
              turnDir: 'R',
              legTimeMin: s.aircraft.altitude > 14000 ? 1.5 : 1.0,
              exitArmed: false,
            };
          },
        };
      }
      const n = slotNum(slot);
      if (n <= 5 && slotSide(slot) === 'L' && sp === '') {
        const leg = plan.legs[visibleStart(s) + n - 1];
        if (leg && !leg.isDiscontinuity) return { toScratchpad: leg.ident };
      }
      return undefined;
    }
    switch (slot) {
      case '1L': {
        if (sp === 'DELETE') {
          const id = hold.atIdent;
          return {
            mutate: (d) => {
              editPlan(d).hold = undefined;
              d.messages.push({ text: `HOLD AT ${id} DELETED`, priority: 'advisory' });
            },
            clearScratchpad: true,
          };
        }
        if (sp === '') return { toScratchpad: hold.atIdent };
        return undefined;
      }
      case '2L': {
        const qr = parseQuadRadial(sp);
        if (!qr) return { message: MSG.invalidEntry };
        const radial = Number(qr.split('/')[1]);
        return {
          mutate: (d) => {
            const h = editPlan(d).hold;
            if (h) {
              h.quadRadial = qr;
              h.inboundCourse = (radial + 180) % 360;
            }
          },
          clearScratchpad: true,
        };
      }
      case '3L': {
        // crs/dir entry like 270/L, or just a course
        const m = sp.toUpperCase().match(/^(\d{1,3})(?:\/([LR]))?$/);
        if (!m) return { message: MSG.invalidEntry };
        const crs = parseCourse(m[1]);
        if (crs === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const h = editPlan(d).hold;
            if (h) {
              h.inboundCourse = crs;
              if (m[2]) h.turnDir = m[2] as 'L' | 'R';
            }
          },
          clearScratchpad: true,
        };
      }
      case '4L': {
        const t = parseLegTime(sp);
        if (t === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const h = editPlan(d).hold;
            if (h) {
              h.legTimeMin = t;
              h.legDistNm = undefined;
            }
          },
          clearScratchpad: true,
        };
      }
      case '5L': {
        const nm = parseLegDist(sp);
        if (nm === null) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const h = editPlan(d).hold;
            if (h) {
              h.legDistNm = nm;
              h.legTimeMin = undefined;
            }
          },
          clearScratchpad: true,
        };
      }
      case '2R': {
        const t = parseTimeHHMM(sp);
        if (!t) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => {
            const h = editPlan(d).hold;
            if (h) h.efcTime = t;
          },
          clearScratchpad: true,
        };
      }
      case '6L':
        if (s.mod) return { mutate: (d) => void (d.mod = null) };
        return undefined;
      case '6R': {
        if (s.aircraft.onGround || !plan.executed) return undefined;
        return {
          mutate: (d) => {
            const h = editPlan(d).hold;
            if (h) h.exitArmed = true;
          },
        };
      }
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- RTE DATA

export const rteDataPage: PageDef = {
  numPages(s) {
    const plan = planFor(s);
    const count = plan.legs.length - visibleStart(s);
    return Math.max(1, Math.ceil(count / 5));
  },
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    title(scr, `${plan.activated && plan.executed ? 'ACT ' : ''}RTE DATA`, s.ui.pageIndex + 1, rteDataPage.numPages(s));
    put(scr, 1, 0, 'ETA', { size: 'small' });
    put(scr, 1, 6, 'WPT', { size: 'small' });
    putRight(scr, 1, 'FUEL  WIND', { size: 'small' });
    const start = visibleStart(s) + s.ui.pageIndex * 5;
    for (let n = 1; n <= 5; n++) {
      const i = start + n - 1;
      const leg = plan.legs[i];
      if (!leg) break;
      if (leg.isDiscontinuity) {
        lskData(scr, n, 'L', '-DISCONTINUITY-', { size: 'small' });
        continue;
      }
      const dist = distanceAlongRoute(s, i);
      put(scr, 2 * n, 0, etaAt(s, dist), { size: 'small' });
      put(scr, 2 * n, 6, leg.ident, { size: 'large' });
      putRight(scr, 2 * n, `${fuelAt(s, dist).toFixed(1)}  ${leg.wind ? fmtWind(leg.wind) : 'W>'}`, {
        size: 'small',
      });
    }
    lskData(scr, 6, 'L', '<LEGS');
    return scr;
  },
  onLsk(s, slot, sp) {
    if (slot === '6L') return { goto: { page: 'LEGS' } };
    const n = slotNum(slot);
    if (n === 6 || slotSide(slot) !== 'R') return undefined;
    const i = visibleStart(s) + s.ui.pageIndex * 5 + n - 1;
    const leg = planFor(s).legs[i];
    if (!leg || leg.isDiscontinuity) return undefined;
    if (sp === '') {
      return leg.wind ? { toScratchpad: `${leg.wind.dir}/${leg.wind.speed}` } : undefined;
    }
    if (sp === 'DELETE') {
      return {
        mutate: (d) => {
          const l = editPlan(d).legs[i];
          if (l) l.wind = undefined;
        },
        clearScratchpad: true,
      };
    }
    const wind = parseWind(sp);
    if (!wind) return { message: MSG.invalidEntry };
    return {
      mutate: (d) => {
        const l = editPlan(d).legs[i];
        if (l) l.wind = wind;
      },
      clearScratchpad: true,
    };
  },
};
