import { blankScreen, boxes, dashes, lskData, lskLabel, put, putRight, title } from '../screenModel';
import { MSG } from '../messages';
import { editPlan, planFor, slotNum, slotSide, type PageDef } from '../pageApi';
import { findAirport, ndb } from '../nav/ndb';
import { bearingDeg, destinationPoint, distanceNm, fmtGmt, fmtLatLon, toMagnetic } from '../nav/geo';
import { distanceAlongRoute, findLegIndex } from '../nav/route';
import { parseIdent, parseOffset, parseRadialDist, parseTimeHHMM } from '../validation/parsers';
import { etaAt, fmtCrs, fmtWind, fuelAt, nearestAirports, predictedGs } from './util';
import { resolveFix } from './routePages';

// ---------------------------------------------------------------- PROGRESS

export const progPage: PageDef = {
  numPages: () => 3,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    const ac = s.aircraft;
    title(scr, `${plan.fltNo ?? ''} PROGRESS`, s.ui.pageIndex + 1, 3);
    if (s.ui.pageIndex === 0) {
      const legs = plan.legs;
      const prev = legs[s.activeLegIndex - 1];
      const cur = legs[s.activeLegIndex];
      const next = legs
        .slice(s.activeLegIndex + 1)
        .find((l) => !l.isDiscontinuity);
      lskLabel(scr, 1, 'L', 'LAST');
      put(scr, 1, 10, 'ALT      ATA', { size: 'small' });
      if (prev && !prev.isDiscontinuity) {
        lskData(scr, 1, 'L', prev.ident, { size: 'small' });
        put(scr, 2, 9, `FL${String(Math.round(ac.altitude / 100)).padStart(3, '0')}`, { size: 'small' });
        putRight(scr, 2, fmtGmt(ac.clock.gmtSeconds - 600), { size: 'small' });
      }
      lskLabel(scr, 2, 'L', 'TO');
      put(scr, 3, 10, 'DTG      ETA', { size: 'small' });
      if (cur && !cur.isDiscontinuity) {
        const dtg = distanceNm(ac.position, cur);
        lskData(scr, 2, 'L', cur.ident, { color: 'magenta' });
        put(scr, 4, 9, String(Math.round(dtg)).padStart(4, ' '), { size: 'large' });
        putRight(scr, 4, etaAt(s, dtg), { size: 'large' });
      }
      lskLabel(scr, 3, 'L', 'NEXT');
      if (next) {
        const dtg = distanceAlongRoute(s, findLegIndex(legs, next.ident));
        lskData(scr, 3, 'L', next.ident, { size: 'small' });
        put(scr, 6, 9, String(Math.round(dtg)).padStart(4, ' '), { size: 'small' });
        putRight(scr, 6, etaAt(s, dtg), { size: 'small' });
      }
      lskLabel(scr, 4, 'L', 'DEST');
      put(scr, 7, 5, 'DTG    ETA    FUEL', { size: 'small' });
      if (plan.dest) {
        const dtg = distanceAlongRoute(s, legs.length - 1);
        lskData(scr, 4, 'L', plan.dest);
        put(scr, 8, 6, String(Math.round(dtg)).padStart(4, ' '), { size: 'large' });
        put(scr, 8, 12, etaAt(s, dtg), { size: 'large' });
        putRight(scr, 8, fuelAt(s, dtg).toFixed(1), { size: 'large' });
      }
      lskLabel(scr, 5, 'L', 'TO T/D');
      const gs = predictedGs(s);
      lskData(scr, 5, 'L', ac.onGround ? dashes(6) : `${gs}KT GS`, { size: 'small', color: 'green' });
      lskData(scr, 6, 'L', '<POS REF');
      lskData(scr, 6, 'R', 'RTA>');
      return scr;
    }
    if (s.ui.pageIndex === 1) {
      lskLabel(scr, 1, 'L', 'WIND');
      lskData(scr, 1, 'L', fmtWind(ac.wind), { color: 'green' });
      const rel = ((ac.wind.dir + 180 - ac.track) * Math.PI) / 180;
      const hw = Math.round(ac.wind.speed * Math.cos(rel));
      const xw = Math.round(ac.wind.speed * Math.sin(rel));
      lskLabel(scr, 1, 'R', 'H/WIND   X/WIND');
      lskData(scr, 1, 'R', `${hw >= 0 ? 'H' : 'T'}${Math.abs(hw)}   ${xw >= 0 ? 'R' : 'L'}${Math.abs(xw)}`, {
        color: 'green',
      });
      lskLabel(scr, 2, 'L', 'XTK ERROR');
      const off = plan.offset;
      lskData(scr, 2, 'L', off?.active ? `${off.side}${off.nm.toFixed(1)}NM` : 'L0.0NM', { color: 'green' });
      lskLabel(scr, 3, 'L', 'TAS');
      lskData(scr, 3, 'L', `${Math.round(ac.tas)}KT`, { color: 'green' });
      lskLabel(scr, 3, 'R', 'SAT/TAT');
      lskData(scr, 3, 'R', `${ac.sat}°C/${ac.tat}°C`, { color: 'green' });
      lskLabel(scr, 4, 'L', 'FUEL QTY');
      lskData(scr, 4, 'L', `${ac.fuel.total.toFixed(1)}`, { color: 'green' });
      lskLabel(scr, 4, 'R', 'FUEL FLOW');
      lskData(scr, 4, 'R', `${Math.round(ac.fuel.fuelFlow)} LB/HR`, { color: 'green' });
      return scr;
    }
    // fuel summary page
    put(scr, 1, 6, 'FUEL', { size: 'small' });
    lskLabel(scr, 2, 'L', 'TOTALS');
    lskData(scr, 2, 'L', `CALC ${ac.fuel.total.toFixed(1)}`, { color: 'green' });
    lskData(scr, 2, 'R', `SENSED ${ac.fuel.total.toFixed(1)}`, { color: 'green' });
    lskLabel(scr, 3, 'L', 'TANK 1');
    lskData(scr, 3, 'L', ac.fuel.perTank[0].toFixed(1), { color: 'green' });
    lskLabel(scr, 4, 'L', 'CTR');
    lskData(scr, 4, 'L', ac.fuel.perTank[1].toFixed(1), { color: 'green' });
    lskLabel(scr, 5, 'L', 'TANK 2');
    lskData(scr, 5, 'L', ac.fuel.perTank[2].toFixed(1), { color: 'green' });
    const planFuel = plan.perf.reserves;
    if (planFuel !== undefined) {
      lskLabel(scr, 3, 'R', 'RESERVES');
      lskData(scr, 3, 'R', planFuel.toFixed(1), { color: 'green' });
    }
    return scr;
  },
  onLsk(s, slot) {
    if (s.ui.pageIndex === 0) {
      if (slot === '6L') return { goto: { page: 'POS', index: 1 } };
      if (slot === '6R') return { goto: { page: 'RTA_PROGRESS' } };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- RTA PROGRESS

export const rtaProgressPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    title(scr, 'RTA PROGRESS');
    const rta = plan.rta;
    lskLabel(scr, 1, 'L', 'RTA WPT');
    lskData(scr, 1, 'L', rta?.ident ?? boxes(5));
    lskLabel(scr, 1, 'R', 'RTA');
    lskData(scr, 1, 'R', rta?.time ? `${rta.time}z` : dashes(4));
    if (rta?.ident && rta.time) {
      const idx = findLegIndex(plan.legs, rta.ident);
      if (idx >= 0) {
        const dist = distanceAlongRoute(s, idx);
        const eta = etaAt(s, dist);
        lskLabel(scr, 2, 'L', 'ETA');
        lskData(scr, 2, 'L', eta, { color: 'green' });
        const etaSec = (Number(eta.slice(0, 2)) * 60 + Number(eta.slice(2, 4))) * 60;
        const rtaSec = (Number(rta.time.slice(0, 2)) * 60 + Number(rta.time.slice(2))) * 60;
        const diff = Math.round((etaSec - rtaSec) / 60);
        lskLabel(scr, 2, 'R', 'TIME ERROR');
        lskData(scr, 2, 'R', diff === 0 ? 'ON TIME' : `${Math.abs(diff)} MIN ${diff > 0 ? 'LATE' : 'EARLY'}`, {
          color: diff === 0 ? 'green' : 'amber',
        });
      }
    }
    lskData(scr, 6, 'L', '<PROGRESS');
    return scr;
  },
  onLsk(s, slot, sp) {
    const plan = planFor(s);
    if (slot === '6L') return { goto: { page: 'PROG' } };
    if (slot === '1L') {
      if (sp === '') return plan.rta?.ident ? { toScratchpad: plan.rta.ident } : undefined;
      if (sp === 'DELETE') return { mutate: (d) => void (editPlan(d).rta = undefined), clearScratchpad: true };
      const ident = parseIdent(sp);
      if (!ident || findLegIndex(plan.legs, ident) < 0) return { message: MSG.notInDataBase };
      return {
        mutate: (d) => {
          const p = editPlan(d);
          p.rta = { ...p.rta, ident };
        },
        clearScratchpad: true,
      };
    }
    if (slot === '1R') {
      const t = parseTimeHHMM(sp);
      if (!t) return { message: MSG.invalidEntry };
      return {
        mutate: (d) => {
          const p = editPlan(d);
          p.rta = { ...p.rta, time: t };
        },
        clearScratchpad: true,
      };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- FIX INFO

export const fixInfoPage: PageDef = {
  numPages: () => 2,
  render(s) {
    const scr = blankScreen();
    const fi = s.ui.fixInfo[s.ui.pageIndex] ?? {};
    title(scr, 'FIX INFO', s.ui.pageIndex + 1, 2);
    lskLabel(scr, 1, 'L', 'FIX');
    lskData(scr, 1, 'L', fi.ident ?? boxes(5));
    if (fi.ident && fi.lat !== undefined && fi.lon !== undefined) {
      lskData(scr, 1, 'R', fmtLatLon({ lat: fi.lat, lon: fi.lon }), { size: 'small', color: 'green' });
      const pos = s.aircraft.position;
      const brgTo = Math.round(toMagnetic(bearingDeg({ lat: fi.lat, lon: fi.lon }, pos), pos));
      const dist = distanceNm(pos, { lat: fi.lat, lon: fi.lon });
      lskLabel(scr, 2, 'L', 'RAD/DIS FR FIX');
      lskData(scr, 2, 'L', `${fmtCrs(brgTo)}/${dist.toFixed(0)}NM`, { size: 'small', color: 'green' });
      lskLabel(scr, 3, 'L', 'RAD');
      lskLabel(scr, 3, 'R', 'DIS');
      lskData(scr, 3, 'L', fi.radial !== undefined ? fmtCrs(fi.radial) : `${dashes(3)}°`);
      lskData(scr, 3, 'R', fi.distance !== undefined ? `${fi.distance}NM` : `${dashes(3)}NM`);
      if (fi.radial !== undefined && fi.distance !== undefined) {
        // build the reference point out along the radial and predict to it
        const ref = destinationPoint({ lat: fi.lat, lon: fi.lon }, fi.radial, fi.distance);
        const refDist = distanceNm(pos, ref);
        lskLabel(scr, 4, 'L', 'ETA');
        lskData(scr, 4, 'L', etaAt(s, refDist), { color: 'green' });
        lskLabel(scr, 4, 'R', 'DTG');
        lskData(scr, 4, 'R', `${Math.round(refDist)}NM`, { color: 'green' });
      }
    }
    lskData(scr, 6, 'L', '<ERASE FIX');
    return scr;
  },
  onLsk(s, slot, sp) {
    const page = s.ui.pageIndex;
    const fi = s.ui.fixInfo[page] ?? {};
    if (slot === '1L') {
      if (sp === '') return fi.ident ? { toScratchpad: fi.ident } : undefined;
      if (sp === 'DELETE')
        return { mutate: (d) => void (d.ui.fixInfo[page] = {}), clearScratchpad: true };
      const ident = parseIdent(sp);
      if (!ident) return { message: MSG.invalidEntry };
      return resolveFix(s, ident, { kind: 'FIX_INFO', fixIndex: page }, (d, hit) => {
        d.ui.fixInfo[page] = { ident: hit.ident, lat: hit.lat, lon: hit.lon };
      });
    }
    if (slot === '3L' || slot === '3R') {
      if (!fi.ident) return { message: MSG.invalidEntry };
      const rd = parseRadialDist(sp);
      if (!rd) return { message: MSG.invalidEntry };
      return {
        mutate: (d) => {
          const f = d.ui.fixInfo[page];
          if (rd.radial !== undefined) f.radial = rd.radial;
          if (rd.dist !== undefined) f.distance = rd.dist;
        },
        clearScratchpad: true,
      };
    }
    if (slot === '6L') {
      return { mutate: (d) => void (d.ui.fixInfo[page] = {}), clearScratchpad: false };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- NEAREST ARPTS / ALTN DEST

export const nearestArptsPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    title(scr, 'NEAREST ARPTS');
    put(scr, 1, 0, 'ARPT  BRG  DIST', { size: 'small' });
    const list = nearestAirports(s, 5);
    list.forEach((a, i) => {
      lskData(scr, i + 1, 'L', `${a.ident}  ${fmtCrs(a.brg)} ${String(a.dist).padStart(4, ' ')}NM`);
      lskData(scr, i + 1, 'R', 'DIVERT>');
    });
    lskData(scr, 6, 'L', '<INDEX');
    return scr;
  },
  onLsk(s, slot) {
    if (slot === '6L') return { goto: { page: 'INIT_REF_INDEX' } };
    const n = slotNum(slot);
    if (slotSide(slot) === 'R' && n <= 5) {
      const list = nearestAirports(s, 5);
      const a = list[n - 1];
      if (!a) return undefined;
      return { mutate: (d) => void (d.ui.altnIdent = a.ident), goto: { page: 'ALTN_DEST' } };
    }
    return undefined;
  },
};

export const altnDestPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const ident = s.ui.altnIdent;
    const apt = ident ? findAirport(ident) : undefined;
    title(scr, `${ident ?? ''} ALTN DEST`);
    lskLabel(scr, 1, 'L', 'ALTN');
    lskData(scr, 1, 'L', ident ?? boxes(4));
    if (apt) {
      const plan = planFor(s);
      const fromMissed = Boolean(s.ui.altnFromMissedApp);
      // missed approach reroutes from the destination approach point instead of PPOS
      const destApt = fromMissed && plan.dest ? findAirport(plan.dest) : undefined;
      const from = destApt ?? s.aircraft.position;
      const extra = fromMissed && plan.dest ? Math.round(distanceNm(s.aircraft.position, from)) : 0;
      const dist = Math.round(distanceNm(from, apt)) + extra;
      lskLabel(scr, 2, 'L', 'VIA');
      lskData(scr, 2, 'L', fromMissed ? 'MISSED APP' : 'DIRECT', { color: 'green' });
      lskLabel(scr, 3, 'L', 'DTG');
      lskData(scr, 3, 'L', `${dist}NM`, { color: 'green' });
      lskLabel(scr, 3, 'R', 'ETA');
      lskData(scr, 3, 'R', etaAt(s, dist), { color: 'green' });
      lskLabel(scr, 4, 'L', 'FUEL AT ALTN');
      lskData(scr, 4, 'L', fuelAt(s, dist).toFixed(1), { color: 'green' });
      lskLabel(scr, 4, 'R', 'ELEV');
      lskData(scr, 4, 'R', `${apt.elev}FT`, { size: 'small', color: 'green' });
      lskData(scr, 5, 'R', fromMissed ? 'DIRECT>' : 'MISSED APP>');
    }
    lskData(scr, 6, 'L', '<NEAREST ARPTS');
    return scr;
  },
  onLsk(s, slot, sp) {
    if (slot === '6L') return { goto: { page: 'NEAREST_ARPTS' } };
    if (slot === '1L') {
      if (sp === '') return s.ui.altnIdent ? { toScratchpad: s.ui.altnIdent } : undefined;
      const apt = findAirport(sp);
      if (!apt) return { message: MSG.notInDataBase };
      return { mutate: (d) => void (d.ui.altnIdent = apt.ident), clearScratchpad: true };
    }
    if (slot === '5R' && s.ui.altnIdent) {
      // recompute from the missed approach point: distance from dest runway instead of PPOS
      return { mutate: (d) => void (d.ui.altnFromMissedApp = !d.ui.altnFromMissedApp) };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- NAV STATUS / NAV OPTIONS

export const navStatusPage: PageDef = {
  numPages: () => 2,
  render(s) {
    const scr = blankScreen();
    if (s.ui.pageIndex === 0) {
      title(scr, 'NAV STATUS', 1, 2);
      const pos = s.aircraft.position;
      const vors = ndb.navaids
        .filter((n) => n.freq < 200)
        .map((n) => ({ ...n, dist: distanceNm(pos, n) }))
        .sort((a, b) => a.dist - b.dist)
        .slice(0, 2);
      vors.forEach((v, i) => {
        lskLabel(scr, i + 1, 'L', i === 0 ? 'VOR L' : 'VOR R');
        lskData(scr, i + 1, 'L', `${v.ident}  ${v.freq.toFixed(2)}`, { color: 'green' });
        lskData(scr, i + 1, 'R', `${Math.round(v.dist)}NM`, { size: 'small', color: 'green' });
      });
      lskLabel(scr, 3, 'L', 'DME');
      lskData(scr, 3, 'L', s.dmeUpdating ? `${vors[0]?.ident ?? '---'} ${vors[1]?.ident ?? ''}` : 'INHIBITED', {
        color: 'green',
      });
      lskLabel(scr, 4, 'L', 'GPS');
      lskData(scr, 4, 'L', s.aircraft.gpsAvailable && s.gpsUpdating ? 'NAV' : 'OFF', { color: 'green' });
      lskLabel(scr, 5, 'L', 'IRS');
      lskData(scr, 5, 'L', s.aircraft.irs.status, { color: s.aircraft.irs.status === 'NAV' ? 'green' : 'amber' });
      return scr;
    }
    title(scr, 'NAV OPTIONS', 2, 2);
    lskLabel(scr, 1, 'L', 'GPS UPDATE');
    lskData(scr, 1, 'L', s.gpsUpdating ? 'ON' : 'OFF');
    lskData(scr, 1, 'R', s.gpsUpdating ? 'OFF>' : 'ON>');
    lskLabel(scr, 2, 'L', 'DME UPDATE');
    lskData(scr, 2, 'L', s.dmeUpdating ? 'ON' : 'OFF');
    lskData(scr, 2, 'R', s.dmeUpdating ? 'OFF>' : 'ON>');
    lskLabel(scr, 3, 'L', 'VOR/DME NAV INHIBIT');
    lskData(scr, 3, 'L', s.navAidsInhibited ? 'INHIBITED' : dashes(5));
    return scr;
  },
  onLsk(s, slot) {
    if (s.ui.pageIndex === 1) {
      if (slot === '1R') return { mutate: (d) => void (d.gpsUpdating = !d.gpsUpdating) };
      if (slot === '2R') return { mutate: (d) => void (d.dmeUpdating = !d.dmeUpdating) };
      if (slot === '3L') return { mutate: (d) => void (d.navAidsInhibited = !d.navAidsInhibited) };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- LATERAL OFFSET

export const offsetPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    title(scr, s.mod ? 'MOD LATERAL OFFSET' : 'LATERAL OFFSET');
    lskLabel(scr, 1, 'L', 'OFFSET DIST');
    const off = plan.offset;
    lskData(scr, 1, 'L', off ? `${off.side}${off.nm}` : dashes(3));
    if (off?.active) {
      put(scr, 4, 2, 'OFFSET ACTIVE', { size: 'small', color: 'green' });
    }
    put(scr, 9, 0, 'ENTRY L OR R + 1-20NM', { size: 'small' });
    if (s.mod) lskData(scr, 6, 'L', '<ERASE');
    lskData(scr, 6, 'R', 'RTE>');
    return scr;
  },
  onLsk(s, slot, sp) {
    const plan = planFor(s);
    if (slot === '1L') {
      if (sp === '') return plan.offset ? { toScratchpad: `${plan.offset.side}${plan.offset.nm}` } : undefined;
      if (sp === 'DELETE') {
        if (!plan.offset) return { message: MSG.invalidDelete };
        return {
          mutate: (d) => {
            const p = editPlan(d);
            p.offset = undefined;
          },
          clearScratchpad: true,
        };
      }
      const off = parseOffset(sp);
      if (!off) return { message: MSG.invalidEntry };
      return {
        mutate: (d) => {
          const p = editPlan(d);
          // active only after EXEC promotes the MOD, immediate when nothing was executed yet
          p.offset = { ...off, active: !p.executed };
        },
        clearScratchpad: true,
      };
    }
    if (slot === '6L' && s.mod) {
      // the guide easter egg: erasing a not yet executed offset drops you on NEAREST ARPTS
      const hadPendingOffset = s.mod.offset && !s.mod.offset.active;
      return {
        mutate: (d) => void (d.mod = null),
        goto: hadPendingOffset ? { page: 'NEAREST_ARPTS' } : undefined,
      };
    }
    if (slot === '6R') return { goto: { page: 'RTE' } };
    return undefined;
  },
};
