// core shared types for the FMC model and the CDU screen

export type CduColor = 'white' | 'green' | 'magenta' | 'cyan' | 'amber';
export type CellSize = 'large' | 'small';

export interface Cell {
  ch: string;
  color: CduColor;
  size: CellSize;
  inverse?: boolean;
  blink?: boolean;
}

export const SCREEN_COLS = 24;
export const SCREEN_ROWS = 14;

export type ScreenModel = Cell[][];

export type LskSide = 'L' | 'R';
export type LskSlot = `${1 | 2 | 3 | 4 | 5 | 6}${LskSide}`;

export type ModeKey =
  | 'INIT_REF'
  | 'RTE'
  | 'CLB'
  | 'CRZ'
  | 'DES'
  | 'MENU'
  | 'LEGS'
  | 'DEP_ARR'
  | 'HOLD'
  | 'PROG'
  | 'N1_LIMIT'
  | 'FIX';

export type PageId =
  | 'IDENT'
  | 'POS' // POS INIT 1/3, POS REF 2/3, POS SHIFT 3/3
  | 'RTE'
  | 'RTE_DATA'
  | 'INIT_REF_INDEX'
  | 'PERF_INIT'
  | 'PERF_LIMITS'
  | 'N1_LIMIT'
  | 'TAKEOFF_REF'
  | 'APPROACH_REF'
  | 'LEGS'
  | 'DEP_ARR_INDEX'
  | 'DEPARTURES'
  | 'ARRIVALS'
  | 'DIR_INTC'
  | 'SELECT_WPT'
  | 'HOLD'
  | 'PROG'
  | 'RTA_PROGRESS'
  | 'FIX_INFO'
  | 'REF_NAV_DATA'
  | 'SUPP_NAV_DATA'
  | 'NEAREST_ARPTS'
  | 'ALTN_DEST'
  | 'NAV_STATUS'
  | 'NAV_OPTIONS'
  | 'OFFSET'
  | 'MESSAGE_RECALL'
  | 'MENU'
  | 'SUMMARY'
  | 'CLB'
  | 'CRZ'
  | 'DES'
  | 'DES_FORECASTS'
  | 'ENG_OUT';

export type ScenarioId = 'preflight' | 'taxi' | 'cruise';
export type FlightPhase = 'PREFLIGHT' | 'TAXI' | 'CRUISE';

export interface LatLon {
  lat: number;
  lon: number;
}

export interface AircraftState {
  phase: FlightPhase;
  position: LatLon;
  altitude: number;
  ias: number;
  mach: number;
  tas: number;
  groundSpeed: number;
  heading: number;
  track: number;
  vsFpm: number;
  grossWeight: number; // x1000 lbs
  fuel: {
    total: number; // x1000 lbs
    perTank: [number, number, number]; // main 1, center, main 2
    fuelFlow: number; // lbs/hr total
  };
  sat: number;
  tat: number;
  wind: { dir: number; speed: number };
  irs: { status: 'ALIGN' | 'NAV'; driftNmHr: number };
  irsPosSet: boolean;
  gpsAvailable: boolean;
  onGround: boolean;
  clock: { gmtSeconds: number; date: string };
}

export type AltRestrType = 'AT' | 'A' | 'B' | 'AB'; // at, at-or-above, at-or-below, window

export interface AltRestr {
  type: AltRestrType;
  value: number; // ft
  valueB?: number; // second value for window restrictions
}

export interface Leg {
  ident: string;
  lat: number;
  lon: number;
  isDiscontinuity?: boolean;
  via?: string; // airway, DIRECT or procedure name
  speedRestr?: number;
  altRestr?: AltRestr;
  fromProcedure?: 'SID' | 'STAR' | 'APP';
  isRunway?: boolean;
  // user-entered forecast wind for RTE DATA
  wind?: { dir: number; speed: number };
}

export interface HoldData {
  atIdent: string; // waypoint ident or PPOS
  inboundCourse: number;
  turnDir: 'L' | 'R';
  legTimeMin?: number;
  legDistNm?: number;
  quadRadial?: string;
  efcTime?: string; // HHMM
  exitArmed: boolean;
  speed?: number;
  targetAlt?: number;
}

export interface PerfData {
  zfw?: number;
  gw?: number;
  reserves?: number;
  costIndex?: number;
  crzAlt?: number; // ft
  crzWind?: { dir: number; speed: number };
  isaDev?: number;
  transAlt: number;
  // PERF LIMITS page
  limits: {
    clbMin: number;
    clbMax: number;
    crzMin: number;
    crzMax: number;
    desMin: number;
    desMax: number;
  };
  complete: boolean;
}

export interface TakeoffData {
  flaps?: number;
  v1?: number;
  vr?: number;
  v2?: number;
  // computed candidates shown small until accepted by LSK
  cg?: number;
  trim?: number;
  toShiftFt?: number;
  oatSel?: number; // assumed temp on N1 LIMIT
  n1Rating: 'TO' | 'TO-1' | 'TO-2';
  clbRating: 'CLB' | 'CLB-1' | 'CLB-2';
}

export interface OffsetData {
  side: 'L' | 'R';
  nm: number;
  active: boolean;
}

export interface RouteSpecItem {
  via: string;
  to: string;
}

export interface SpeedTarget {
  ias?: number;
  mach?: number;
}

export interface VnavData {
  clbMode: 'ECON' | 'MAX RATE' | 'MAX ANGLE';
  clbTgt?: SpeedTarget;
  clbSpdRestr?: { ias: number; alt: number };
  crzMode: 'ECON' | 'LRC';
  crzTgt?: SpeedTarget;
  desTgt?: SpeedTarget;
  desSpdRestr?: { ias: number; alt: number };
  desNow?: boolean;
  edAlt?: number; // end of descent altitude
}

export interface DesForecastData {
  transLvl?: number;
  levels: { altFt?: number; wind?: { dir: number; speed: number } }[];
  antiIce: boolean;
}

export interface ApproachRefData {
  gwOverride?: number;
  selFlaps?: number;
  selVref?: number;
}

// everything EXEC-able lives here so MOD can be a deep copy
export interface PlanData {
  origin?: string;
  dest?: string;
  coRoute?: string;
  fltNo?: string;
  runway?: string;
  sid?: string;
  sidTrans?: string;
  star?: string;
  starTrans?: string;
  approach?: string;
  routeSpec: RouteSpecItem[];
  legs: Leg[];
  perf: PerfData;
  takeoff: TakeoffData;
  vnav: VnavData;
  desForecast: DesForecastData;
  approachRef: ApproachRefData;
  rta?: { ident?: string; time?: string };
  hold?: HoldData;
  offset?: OffsetData;
  // transient marker set by DIR INTC so EXEC knows where to point the active leg
  directTo?: string;
  activated: boolean;
  executed: boolean;
}

export type MsgPriority = 'alert' | 'advisory';

export interface FmcMessage {
  text: string;
  priority: MsgPriority;
}

export interface FixInfoEntry {
  ident?: string;
  lat?: number;
  lon?: number;
  radial?: number;
  distance?: number;
}

export interface UiState {
  page: PageId;
  pageIndex: number; // 0-based subpage
  helpOpen: boolean;
  debugOpen: boolean;
  brightness: number; // 0..1
  timeScale: 1 | 8 | 60;
  // SELECT DESIRED WPT support: where to return and what to do with the pick
  selectWpt?: {
    candidates: {
      ident: string;
      lat: number;
      lon: number;
      kind: string;
      distNm: number;
      freq?: number;
      elev?: number;
      cls?: string;
      name?: string;
    }[];
    returnPage: PageId;
    returnIndex: number;
    // tells the consumer which action triggered disambiguation
    context: {
      kind: 'LEGS_INSERT' | 'RTE_TO' | 'DIR_INTC' | 'FIX_INFO' | 'REF_NAV';
      slot?: LskSlot;
      legIndex?: number;
      specIndex?: number;
      via?: string;
      fixIndex?: number;
    };
  };
  // REF NAV DATA current lookup result
  refNavHit?: {
    ident: string;
    lat: number;
    lon: number;
    kind: string;
    freq?: number;
    cls?: string;
    elev?: number;
    name?: string;
  };
  // DIR INTC scratch state
  dirIntc?: { ident?: string; interceptCourse?: number };
  // SUPP NAV DATA edit buffer
  suppEdit?: {
    ident?: string;
    type?: 'WPT' | 'NAVAID' | 'ARPT';
    lat?: number;
    lon?: number;
    freq?: number;
    cls?: string;
  };
  fixInfo: [FixInfoEntry, FixInfoEntry];
  // ALTN DEST page target airport
  altnIdent?: string;
  altnFromMissedApp?: boolean;
  // POS INIT reference airport and gate
  refAirport?: string;
  refGate?: string;
  engOut?: { side: 'LT' | 'RT' };
  // dep/arr browsing target (which airport / which role)
  depArr?: { airport: string; mode: 'DEP' | 'ARR' };
}

export interface SuppNavData {
  waypoints: { ident: string; lat: number; lon: number }[];
  navaids: { ident: string; lat: number; lon: number; freq: number; cls: string }[];
  airports: { ident: string; lat: number; lon: number; elev: number }[];
}

// internal simulation state: noise walks and hold orbiting
export interface SimInternals {
  baseWind: { dir: number; speed: number };
  windDirOfs: number;
  windSpdOfs: number;
  satOfs: number;
  vsTurb: number;
  holding: boolean;
}

export interface FmcState {
  scenario: ScenarioId;
  sim: SimInternals;
  aircraft: AircraftState;
  active: PlanData;
  mod: PlanData | null;
  ui: UiState;
  scratchpad: string;
  // message currently shown on the scratchpad line (highest priority first)
  messages: FmcMessage[];
  activeLegIndex: number;
  identConfirmed: boolean;
  posInitDone: boolean;
  navAidsInhibited: boolean;
  gpsUpdating: boolean;
  dmeUpdating: boolean;
  suppNav: SuppNavData;
  navDataCycle: 'active' | 'next';
}
