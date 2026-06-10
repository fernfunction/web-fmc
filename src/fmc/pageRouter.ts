import type { FmcState, PageId, ScreenModel } from './types';
import type { PageDef } from './pageApi';
import { put, putCenter } from './screenModel';
import {
  approachRefPage,
  identPage,
  initRefIndexPage,
  n1LimitPage,
  perfInitPage,
  perfLimitsPage,
  posPage,
  takeoffRefPage,
} from './pages/preflightPages';
import {
  arrivalsPage,
  depArrIndexPage,
  departuresPage,
  dirIntcPage,
  holdPage,
  legsPage,
  rteDataPage,
  rtePage,
  selectWptPage,
} from './pages/routePages';
import { clbPage, crzPage, desForecastsPage, desPage, engOutPage } from './pages/vnavPages';
import {
  altnDestPage,
  fixInfoPage,
  navStatusPage,
  nearestArptsPage,
  offsetPage,
  progPage,
  rtaProgressPage,
} from './pages/monitorPages';
import { menuPage, messageRecallPage, refNavDataPage, summaryPage, suppNavDataPage } from './pages/refPages';

const registry: Record<PageId, PageDef> = {
  IDENT: identPage,
  POS: posPage,
  INIT_REF_INDEX: initRefIndexPage,
  PERF_INIT: perfInitPage,
  PERF_LIMITS: perfLimitsPage,
  N1_LIMIT: n1LimitPage,
  TAKEOFF_REF: takeoffRefPage,
  APPROACH_REF: approachRefPage,
  RTE: rtePage,
  RTE_DATA: rteDataPage,
  LEGS: legsPage,
  DEP_ARR_INDEX: depArrIndexPage,
  DEPARTURES: departuresPage,
  ARRIVALS: arrivalsPage,
  DIR_INTC: dirIntcPage,
  SELECT_WPT: selectWptPage,
  HOLD: holdPage,
  CLB: clbPage,
  CRZ: crzPage,
  DES: desPage,
  DES_FORECASTS: desForecastsPage,
  ENG_OUT: engOutPage,
  PROG: progPage,
  RTA_PROGRESS: rtaProgressPage,
  FIX_INFO: fixInfoPage,
  NEAREST_ARPTS: nearestArptsPage,
  ALTN_DEST: altnDestPage,
  NAV_STATUS: navStatusPage,
  NAV_OPTIONS: navStatusPage,
  OFFSET: offsetPage,
  REF_NAV_DATA: refNavDataPage,
  SUPP_NAV_DATA: suppNavDataPage,
  MENU: menuPage,
  SUMMARY: summaryPage,
  MESSAGE_RECALL: messageRecallPage,
};

export function getPage(id: PageId): PageDef {
  return registry[id];
}

// full screen for the current state: page content plus the scratchpad line
export function renderScreen(s: FmcState): ScreenModel {
  const page = getPage(s.ui.page);
  const scr = page.render(s);
  const msg = s.messages[0];
  if (msg) {
    put(scr, 13, 0, msg.text, { size: 'large', color: msg.priority === 'alert' ? 'amber' : 'white' });
  } else if (s.scratchpad === 'DELETE') {
    putCenter(scr, 13, 'DELETE', { size: 'large', inverse: true });
  } else if (s.scratchpad) {
    put(scr, 13, 0, s.scratchpad, { size: 'large' });
  }
  return scr;
}
