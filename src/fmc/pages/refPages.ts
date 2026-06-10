import { blankScreen, boxes, dashes, lskData, lskLabel, put, title } from '../screenModel';
import { MSG } from '../messages';
import { planFor, type PageDef } from '../pageApi';
import { fmtLatLon, magVar } from '../nav/geo';
import { parseFreq, parseIdent, parseLatLon, parseNavaidClass } from '../validation/parsers';
import { resolveFix } from './routePages';
import { fmtWt, destInfo, fmtFL } from './util';

// ---------------------------------------------------------------- REF NAV DATA

export const refNavDataPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    title(scr, 'REF NAV DATA');
    const hit = s.ui.refNavHit;
    lskLabel(scr, 1, 'L', 'IDENT');
    lskData(scr, 1, 'L', hit?.ident ?? boxes(5));
    if (hit) {
      lskLabel(scr, 2, 'L', 'LATITUDE');
      lskData(scr, 2, 'L', fmtLatLon({ lat: hit.lat, lon: hit.lon }).slice(0, 9), { color: 'green' });
      lskLabel(scr, 2, 'R', 'LONGITUDE');
      lskData(scr, 2, 'R', fmtLatLon({ lat: hit.lat, lon: hit.lon }).slice(9), { color: 'green' });
      if (hit.freq !== undefined) {
        lskLabel(scr, 3, 'L', 'FREQ');
        lskData(scr, 3, 'L', hit.freq > 200 ? String(hit.freq) : hit.freq.toFixed(2), { color: 'green' });
      }
      if (hit.elev !== undefined) {
        lskLabel(scr, 3, 'R', 'ELEVATION');
        lskData(scr, 3, 'R', `${hit.elev}FT`, { color: 'green' });
      }
      lskLabel(scr, 4, 'L', 'MAG VAR');
      const mv = magVar({ lat: hit.lat, lon: hit.lon });
      lskData(scr, 4, 'L', `${mv < 0 ? 'W' : 'E'}${Math.abs(Math.round(mv))}°`, { color: 'green' });
      if (hit.cls) {
        lskLabel(scr, 4, 'R', 'CLASS');
        lskData(scr, 4, 'R', hit.cls, { color: 'green' });
      }
      if (hit.kind === 'SUPP') {
        put(scr, 9, 0, 'SUPP DATA - ERASED AT', { size: 'small', color: 'cyan' });
        put(scr, 10, 0, 'FLIGHT COMPLETE', { size: 'small', color: 'cyan' });
      }
    }
    lskData(scr, 6, 'L', '<INDEX');
    lskData(scr, 6, 'R', 'SUPP NAV>');
    return scr;
  },
  onLsk(s, slot, sp) {
    if (slot === '6L') return { goto: { page: 'INIT_REF_INDEX' } };
    if (slot === '6R') return { goto: { page: 'SUPP_NAV_DATA' } };
    if (slot === '1L') {
      if (sp === '') return s.ui.refNavHit ? { toScratchpad: s.ui.refNavHit.ident } : undefined;
      if (sp === 'DELETE') return { mutate: (d) => void (d.ui.refNavHit = undefined), clearScratchpad: true };
      const ident = parseIdent(sp);
      if (!ident) return { message: MSG.invalidEntry };
      return resolveFix(s, ident, { kind: 'REF_NAV' }, (d, hit) => {
        d.ui.refNavHit = { ...hit };
      });
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- SUPP NAV DATA

export const suppNavDataPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const e = s.ui.suppEdit ?? {};
    title(scr, 'SUPP NAV DATA');
    lskLabel(scr, 1, 'L', 'IDENT');
    lskData(scr, 1, 'L', e.ident ?? boxes(5));
    lskLabel(scr, 1, 'R', 'TYPE');
    lskData(scr, 1, 'R', `${e.type ?? 'WPT'}>`);
    lskLabel(scr, 2, 'L', 'LAT/LON');
    lskData(scr, 2, 'L', e.lat !== undefined && e.lon !== undefined ? fmtLatLon({ lat: e.lat, lon: e.lon }) : boxes(13), {
      size: e.lat !== undefined ? 'small' : 'large',
    });
    if (e.type === 'NAVAID') {
      lskLabel(scr, 3, 'L', 'FREQ');
      lskData(scr, 3, 'L', e.freq !== undefined ? (e.freq > 200 ? String(e.freq) : e.freq.toFixed(2)) : dashes(6));
      lskLabel(scr, 3, 'R', 'CLASS');
      lskData(scr, 3, 'R', e.cls ?? boxes(4));
    }
    lskLabel(scr, 4, 'L', 'STORED');
    lskData(
      scr,
      4,
      'L',
      `${s.suppNav.waypoints.length}WPT ${s.suppNav.navaids.length}NAV ${s.suppNav.airports.length}ARPT`,
      { size: 'small', color: 'green' },
    );
    put(scr, 9, 0, 'ERASED AT FLT COMPLETE', { size: 'small' });
    const complete =
      e.ident && e.lat !== undefined && (e.type !== 'NAVAID' || (e.freq !== undefined && e.cls));
    if (complete) lskData(scr, 6, 'R', 'STORE>');
    lskData(scr, 6, 'L', '<INDEX');
    return scr;
  },
  onLsk(s, slot, sp) {
    // the guide restricts supp data edits to the ground
    const groundCheck = !s.aircraft.onGround ? { message: MSG.groundOnly } : null;
    const e = s.ui.suppEdit ?? {};
    switch (slot) {
      case '1L': {
        if (groundCheck) return groundCheck;
        const ident = parseIdent(sp);
        if (!ident) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => void (d.ui.suppEdit = { ...e, ident }),
          clearScratchpad: true,
        };
      }
      case '1R': {
        if (groundCheck) return groundCheck;
        const order = ['WPT', 'NAVAID', 'ARPT'] as const;
        const cur = order.indexOf(e.type ?? 'WPT');
        return {
          mutate: (d) => void (d.ui.suppEdit = { ...e, type: order[(cur + 1) % 3] }),
        };
      }
      case '2L': {
        if (groundCheck) return groundCheck;
        const pos = parseLatLon(sp);
        if (!pos) return { message: MSG.invalidEntry };
        return {
          mutate: (d) => void (d.ui.suppEdit = { ...e, lat: pos.lat, lon: pos.lon }),
          clearScratchpad: true,
        };
      }
      case '3L': {
        if (groundCheck) return groundCheck;
        if (e.type !== 'NAVAID') return undefined;
        const f = parseFreq(sp);
        if (f === null) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (d.ui.suppEdit = { ...e, freq: f }), clearScratchpad: true };
      }
      case '3R': {
        if (groundCheck) return groundCheck;
        if (e.type !== 'NAVAID') return undefined;
        // navaid class needs the 4 letter code from the classification table
        const cls = parseNavaidClass(sp);
        if (!cls) return { message: MSG.invalidEntry };
        return { mutate: (d) => void (d.ui.suppEdit = { ...e, cls }), clearScratchpad: true };
      }
      case '6R': {
        if (groundCheck) return groundCheck;
        if (!e.ident || e.lat === undefined || e.lon === undefined) return undefined;
        if (e.type === 'NAVAID' && (e.freq === undefined || !e.cls)) return undefined;
        const limits = { WPT: 40, NAVAID: 40, ARPT: 6 } as const;
        const type = e.type ?? 'WPT';
        const count =
          type === 'WPT' ? s.suppNav.waypoints.length : type === 'NAVAID' ? s.suppNav.navaids.length : s.suppNav.airports.length;
        if (count >= limits[type]) return { message: MSG.dataBaseFull };
        return {
          mutate: (d) => {
            if (type === 'WPT') d.suppNav.waypoints.push({ ident: e.ident!, lat: e.lat!, lon: e.lon! });
            else if (type === 'NAVAID')
              d.suppNav.navaids.push({ ident: e.ident!, lat: e.lat!, lon: e.lon!, freq: e.freq!, cls: e.cls! });
            else d.suppNav.airports.push({ ident: e.ident!, lat: e.lat!, lon: e.lon!, elev: 0 });
            d.ui.suppEdit = {};
          },
        };
      }
      case '6L':
        return { goto: { page: 'INIT_REF_INDEX' } };
    }
    return undefined;
  },
};

// ---------------------------------------------------------------- MENU

export const menuPage: PageDef = {
  numPages: () => 1,
  render() {
    const scr = blankScreen();
    title(scr, 'MENU');
    lskData(scr, 1, 'L', '<FMC');
    put(scr, 2, 12, '<ACT>', { size: 'small', color: 'cyan' });
    lskData(scr, 2, 'L', '<DFCS');
    lskData(scr, 3, 'L', '<ACARS');
    return scr;
  },
  onLsk(_s, slot) {
    if (slot === '1L') return { goto: { page: 'IDENT' } };
    if (slot === '2L' || slot === '3L') return { message: MSG.keyInop };
    return undefined;
  },
};

// ---------------------------------------------------------------- SUMMARY

export const summaryPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    const plan = planFor(s);
    title(scr, 'SUMMARY');
    lskLabel(scr, 1, 'L', 'FLT NO');
    lskData(scr, 1, 'L', plan.fltNo ?? dashes(6), { color: 'green' });
    lskLabel(scr, 1, 'R', 'ORIG/DEST');
    lskData(scr, 1, 'R', plan.origin && plan.dest ? `${plan.origin}/${plan.dest}` : dashes(9), { color: 'green' });
    lskLabel(scr, 2, 'L', 'GW');
    lskData(scr, 2, 'L', fmtWt(plan.perf.gw), { color: 'green' });
    lskLabel(scr, 2, 'R', 'FUEL');
    lskData(scr, 2, 'R', s.aircraft.fuel.total.toFixed(1), { color: 'green' });
    lskLabel(scr, 3, 'L', 'ZFW');
    lskData(scr, 3, 'L', fmtWt(plan.perf.zfw), { color: 'green' });
    lskLabel(scr, 3, 'R', 'CRZ ALT');
    lskData(scr, 3, 'R', plan.perf.crzAlt !== undefined ? fmtFL(plan.perf.crzAlt) : dashes(5), { color: 'green' });
    const dest = destInfo(s);
    if (dest) {
      lskLabel(scr, 4, 'L', 'DEST ETA');
      lskData(scr, 4, 'L', dest.eta, { color: 'green' });
      lskLabel(scr, 4, 'R', 'DEST FUEL');
      lskData(scr, 4, 'R', dest.fuel.toFixed(1), { color: 'green' });
    }
    lskLabel(scr, 5, 'L', 'GMT');
    lskData(scr, 5, 'L', `${String(Math.floor(s.aircraft.clock.gmtSeconds / 3600)).padStart(2, '0')}${String(Math.floor((s.aircraft.clock.gmtSeconds % 3600) / 60)).padStart(2, '0')}z`, { color: 'green' });
    lskData(scr, 6, 'L', '<INDEX');
    return scr;
  },
  onLsk(_s, slot) {
    if (slot === '6L') return { goto: { page: 'INIT_REF_INDEX' } };
    return undefined;
  },
};

// ---------------------------------------------------------------- MESSAGE RECALL

export const messageRecallPage: PageDef = {
  numPages: () => 1,
  render(s) {
    const scr = blankScreen();
    title(scr, 'MESSAGE RECALL');
    if (s.messages.length === 0) {
      put(scr, 6, 4, 'NO ACTIVE MESSAGES', { size: 'small' });
    }
    s.messages.slice(0, 5).forEach((m, i) => {
      lskData(scr, i + 1, 'L', m.text, { size: 'small', color: m.priority === 'alert' ? 'amber' : 'white' });
    });
    lskData(scr, 6, 'L', '<INDEX');
    return scr;
  },
  onLsk(_s, slot) {
    if (slot === '6L') return { goto: { page: 'INIT_REF_INDEX' } };
    return undefined;
  },
};
