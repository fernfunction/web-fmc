import { planFor } from '../fmc/pageApi';
import type { Procedure } from './types';

const LATLON_SP = /^[NS]\d{4}\.\d[EW]\d{5}\.\d$/;

// procedure 1: the full preflight flow, cold & dark gate to PRE-FLT COMPLETE
const preflightProc: Procedure = {
  id: 'preflight-setup',
  title: 'PREFLIGHT SETUP',
  subtitle: 'Cold & dark to ready for takeoff (SBGR → SBSV)',
  scenario: 'preflight',
  steps: [
    {
      id: 'welcome',
      title: 'WELCOME TO THE CDU',
      target: '[data-testid="cdu-screen"]',
      text:
        'This is the Control Display Unit, the pilot interface to the Flight Management Computer. ' +
        'The screen has a title line, six label/data line pairs selected by the keys beside them, and the ' +
        'scratchpad at the bottom where everything you type lands first. We start at the IDENT page, ' +
        'exactly what a real 737 shows at power-up.',
    },
    {
      id: 'keyboard-tour',
      title: 'THE KEYBOARD',
      target: '[data-testid="keypad"]',
      text:
        'Letters and digits go into the scratchpad. CLR erases one character (hold it to wipe the line), ' +
        'DEL loads the special DELETE token used to remove data from fields, and the +/- key toggles a trailing sign. ' +
        'Your PC keyboard works too, press ? anytime for the bindings.',
    },
    {
      id: 'ident-review',
      title: 'READING IDENT',
      target: '[data-testid="cdu-screen"]',
      text:
        'IDENT is a verification page: airplane MODEL and ENG RATING come from the program pins, NAV DATA ' +
        'shows the AIRAC cycle with its validity dates (always check the active cycle covers today), and ' +
        'OP PROGRAM is the FMC software part number.',
    },
    {
      id: 'goto-pos',
      title: 'GO TO POS INIT',
      target: '[data-testid="lsk-6R"]',
      task: 'Press LSK 6R (POS INIT>)',
      text:
        'The prompts at line 6 chain the preflight pages in order. Pressing the line select key next to ' +
        'POS INIT> moves on to position initialization.',
      trigger: (s) => s.ui.page === 'POS',
      ops: [{ kind: 'lsk', slot: '6R' }],
    },
    {
      id: 'pos-review',
      title: 'POS INIT',
      target: '[data-testid="cdu-screen"]',
      text:
        'The inertial reference system needs a starting position before it can navigate. The boxes at ' +
        'SET IRS POS are a box prompt: entry is mandatory. Note the IRS ALIGN annunciation, the IRS is ' +
        'waiting for us. LAST POS shows where the FMC believes it shut down.',
    },
    {
      id: 'copy-pos',
      title: 'COPY LAST POS',
      target: '[data-testid="lsk-1R"]',
      task: 'Press LSK 1R with an empty scratchpad',
      text:
        'Data movement: pressing a line select key on a filled field with an empty scratchpad copies the ' +
        'value down to the scratchpad. No retyping coordinates, grab LAST POS directly.',
      trigger: (s) => LATLON_SP.test(s.scratchpad) || s.aircraft.irsPosSet,
      ops: [{ kind: 'clrAll' }, { kind: 'lsk', slot: '1R' }],
    },
    {
      id: 'set-irs',
      title: 'SET IRS POSITION',
      target: '[data-testid="lsk-4R"]',
      task: 'Press LSK 4R (SET IRS POS)',
      text:
        'Now insert the coordinates into the box prompt. The IRS accepts the position and switches from ' +
        'ALIGN to NAV mode, watch the amber annunciation disappear.',
      trigger: (s) => s.aircraft.irsPosSet,
      ops: [{ kind: 'lsk', slot: '4R' }],
    },
    {
      id: 'goto-rte',
      title: 'GO TO ROUTE',
      target: '[data-testid="lsk-6R"]',
      task: 'Press LSK 6R (ROUTE>)',
      text: 'Position done. The 6R prompt now leads to the RTE page where the flight plan is built.',
      trigger: (s) => s.ui.page === 'RTE',
      ops: [{ kind: 'lsk', slot: '6R' }],
    },
    {
      id: 'type-coroute',
      title: 'TYPE THE COMPANY ROUTE',
      target: '[data-testid="keypad"]',
      task: 'Type GRUSSA01',
      text:
        'Airlines store routes in the database so crews do not build them fix by fix. ' +
        'Type the company route code GRUSSA01 into the scratchpad.',
      trigger: (s) => s.scratchpad === 'GRUSSA01' || planFor(s).coRoute === 'GRUSSA01',
      ops: [{ kind: 'clrAll' }, { kind: 'type', text: 'GRUSSA01' }],
    },
    {
      id: 'insert-coroute',
      title: 'LOAD THE ROUTE',
      target: '[data-testid="lsk-2L"]',
      task: 'Press LSK 2L (CO ROUTE)',
      text:
        'Inserting the code at CO ROUTE loads everything at once: ORIGIN SBGR, DEST SBSV, flight number ' +
        'and the full airway routing VURIB UZ44 POKON UZ31 GARIS.',
      trigger: (s) => planFor(s).coRoute === 'GRUSSA01',
      ops: [{ kind: 'lsk', slot: '2L' }],
    },
    {
      id: 'activate',
      title: 'ACTIVATE THE ROUTE',
      target: '[data-testid="lsk-6R"]',
      task: 'Press LSK 6R (ACTIVATE>)',
      text:
        'A loaded route is not flown until activated. Pressing ACTIVATE arms it and lights the EXEC bar: ' +
        'the FMC is asking for confirmation before anything becomes active.',
      trigger: (s) => s.mod?.activated === true || (s.active.activated && s.active.executed),
      ops: [{ kind: 'lsk', slot: '6R' }],
    },
    {
      id: 'exec-route',
      title: 'EXECUTE',
      target: '[data-testid="exec-key"]',
      task: 'Press EXEC',
      text:
        'The lit bar above EXEC means a modification is pending. Pressing it promotes the MOD to the ' +
        'active flight plan. This confirm-then-execute loop guards every route and performance change.',
      trigger: (s) => s.active.activated && s.active.executed && !s.mod,
      ops: [{ kind: 'exec' }],
    },
    {
      id: 'goto-deparr',
      title: 'DEPARTURES',
      target: '[data-key="DEP_ARR"]',
      task: 'Press the DEP ARR key',
      text: 'Time to pick the departure procedure. The DEP ARR mode key opens the departures/arrivals index.',
      trigger: (s) => s.ui.page === 'DEP_ARR_INDEX' || s.ui.page === 'DEPARTURES',
      ops: [{ kind: 'mode', key: 'DEP_ARR' }],
    },
    {
      id: 'goto-dep',
      title: 'OPEN SBGR DEPARTURES',
      target: '[data-testid="lsk-1L"]',
      task: 'Press LSK 1L (<DEP)',
      text: 'The index lists DEP and ARR for each airport of the route. Open the departures for SBGR.',
      trigger: (s) => s.ui.page === 'DEPARTURES',
      ops: [{ kind: 'lsk', slot: '1L' }],
    },
    {
      id: 'select-rwy',
      title: 'SELECT RUNWAY 09R',
      target: '[data-testid="lsk-3R"]',
      task: 'Press LSK 3R (09R)',
      text:
        'SIDs on the left, runways on the right. Selecting runway 09R marks it <SEL> and filters the SID ' +
        'list to procedures serving that runway.',
      trigger: (s) => planFor(s).runway === '09R',
      ops: [{ kind: 'lsk', slot: '3R' }],
    },
    {
      id: 'select-sid',
      title: 'SELECT THE SID',
      target: '[data-testid="lsk-1L"]',
      task: 'Press LSK 1L (VURI1A)',
      text:
        'VURI1A is the standard instrument departure toward VURIB, the first enroute fix of our route. ' +
        'Selecting it splices the SID legs into the flight plan.',
      trigger: (s) => planFor(s).sid === 'VURI1A',
      ops: [{ kind: 'lsk', slot: '1L' }],
    },
    {
      id: 'exec-dep',
      title: 'EXECUTE THE DEPARTURE',
      target: '[data-testid="exec-key"]',
      task: 'Press EXEC',
      text:
        'Because the route is already active, the runway and SID selection created a MOD (see the page ' +
        'title). EXEC makes it part of the active plan.',
      trigger: (s) => s.active.sid === 'VURI1A' && s.active.runway === '09R' && !s.mod,
      ops: [{ kind: 'exec' }],
    },
    {
      id: 'goto-perf',
      title: 'PERF INIT',
      target: '[data-key="INIT_REF"]',
      task: 'Press the INIT REF key',
      text:
        'INIT REF is smart: it opens the most relevant initialization page for the current flight state. ' +
        'With position and route done, that is PERF INIT, the performance initialization.',
      trigger: (s) => s.ui.page === 'PERF_INIT',
      ops: [{ kind: 'mode', key: 'INIT_REF' }],
    },
    {
      id: 'type-zfw',
      title: 'TYPE THE ZERO FUEL WEIGHT',
      target: '[data-testid="keypad"]',
      task: 'Type 114.2',
      text:
        'Weights are entered in thousands of pounds. The zero fuel weight comes from the load sheet, ' +
        '114.2 means 114,200 lb of airplane plus payload, no fuel.',
      trigger: (s) => s.scratchpad === '114.2' || planFor(s).perf.zfw !== undefined,
      ops: [{ kind: 'clrAll' }, { kind: 'type', text: '114.2' }],
    },
    {
      id: 'enter-zfw',
      title: 'ENTER ZFW',
      target: '[data-testid="lsk-3L"]',
      task: 'Press LSK 3L (ZFW)',
      text:
        'The FMC adds the sensed fuel quantity automatically and computes gross weight on line 1, ' +
        'entering either GW or ZFW back-computes the other.',
      trigger: (s) => planFor(s).perf.zfw !== undefined,
      ops: [{ kind: 'lsk', slot: '3L' }],
    },
    {
      id: 'type-reserves',
      title: 'TYPE RESERVES',
      target: '[data-testid="keypad"]',
      task: 'Type 5.2',
      text:
        'Reserve fuel is the minimum you plan to land with. Below it the FMC raises fuel alert messages.',
      trigger: (s) => s.scratchpad === '5.2' || planFor(s).perf.reserves !== undefined,
      ops: [{ kind: 'clrAll' }, { kind: 'type', text: '5.2' }],
    },
    {
      id: 'enter-reserves',
      title: 'ENTER RESERVES',
      target: '[data-testid="lsk-4L"]',
      task: 'Press LSK 4L (RESERVES)',
      text: 'Insert the reserves into the box prompt at 4L.',
      trigger: (s) => planFor(s).perf.reserves !== undefined,
      ops: [{ kind: 'lsk', slot: '4L' }],
    },
    {
      id: 'type-ci',
      title: 'TYPE THE COST INDEX',
      target: '[data-testid="keypad"]',
      task: 'Type 35',
      text:
        'Cost index trades fuel cost against time cost (0 to 500 on the NG). CI 0 flies maximum range speed, ' +
        'high CI pushes toward Vmo/Mmo. Airlines publish a number per route, ours is 35.',
      trigger: (s) => s.scratchpad === '35' || planFor(s).perf.costIndex !== undefined,
      ops: [{ kind: 'clrAll' }, { kind: 'type', text: '35' }],
    },
    {
      id: 'enter-ci',
      title: 'ENTER COST INDEX',
      target: '[data-testid="lsk-5L"]',
      task: 'Press LSK 5L (COST INDEX)',
      text: 'The economy climb, cruise and descent speeds all derive from this number.',
      trigger: (s) => planFor(s).perf.costIndex !== undefined,
      ops: [{ kind: 'lsk', slot: '5L' }],
    },
    {
      id: 'type-crzalt',
      title: 'TYPE THE CRUISE ALTITUDE',
      target: '[data-testid="keypad"]',
      task: 'Type 360',
      text:
        'Altitude entry rule: one to three digits read as a flight level, so 360 means FL360. ' +
        'Four or five digits read as feet (5000 is five thousand feet).',
      trigger: (s) => s.scratchpad === '360' || planFor(s).perf.crzAlt !== undefined,
      ops: [{ kind: 'clrAll' }, { kind: 'type', text: '360' }],
    },
    {
      id: 'enter-crzalt',
      title: 'ENTER CRZ ALT',
      target: '[data-testid="lsk-1R"]',
      task: 'Press LSK 1R (CRZ ALT)',
      text: 'With cruise altitude in, the performance initialization is complete.',
      trigger: (s) => planFor(s).perf.crzAlt !== undefined,
      ops: [{ kind: 'lsk', slot: '1R' }],
    },
    {
      id: 'exec-perf',
      title: 'EXECUTE PERF',
      target: '[data-testid="exec-key"]',
      task: 'Press EXEC',
      text:
        'Performance entries after route activation also go through the MOD machine, the EXEC bar is lit ' +
        'again. Execute to make them active.',
      trigger: (s) => s.active.perf.complete && !s.mod,
      ops: [{ kind: 'exec' }],
    },
    {
      id: 'n1-limit',
      title: 'N1 LIMIT',
      target: '[data-key="N1_LIMIT"]',
      task: 'Press the N1 LIMIT key',
      text:
        'This page manages thrust ratings. TO is the full 26K rating; TO-1 and TO-2 are fixed derates. ' +
        'Entering an assumed temperature at SEL/OAT reduces takeoff N1 further to save engine wear. ' +
        'We keep full rated thrust today.',
      trigger: (s) => s.ui.page === 'N1_LIMIT',
      ops: [{ kind: 'mode', key: 'N1_LIMIT' }],
    },
    {
      id: 'goto-tkoff',
      title: 'TAKEOFF REF',
      target: '[data-testid="lsk-6R"]',
      task: 'Press LSK 6R (TAKEOFF>)',
      text: 'Last page of the preflight chain: takeoff data and V speeds.',
      trigger: (s) => s.ui.page === 'TAKEOFF_REF',
      ops: [{ kind: 'lsk', slot: '6R' }],
    },
    {
      id: 'type-flaps',
      title: 'TYPE TAKEOFF FLAPS',
      target: '[data-testid="keypad"]',
      task: 'Type 5',
      text:
        'Takeoff flap setting for the 737-800 is usually 1, 5, 10, 15 or 25. Flaps 5 is the everyday choice. ' +
        'The V speeds depend on it, so the FMC will not show them before flaps are set.',
      trigger: (s) => s.scratchpad === '5' || s.active.takeoff.flaps === 5,
      ops: [{ kind: 'clrAll' }, { kind: 'type', text: '5' }],
    },
    {
      id: 'enter-flaps',
      title: 'ENTER FLAPS',
      target: '[data-testid="lsk-1L"]',
      task: 'Press LSK 1L (FLAPS)',
      text:
        'With flaps and gross weight known, V1, VR and V2 appear in small font on the right: computed ' +
        'but not yet confirmed by the crew. Changing flaps or runway later deletes accepted speeds ' +
        'and shows TAKEOFF SPEEDS DELETED.',
      trigger: (s) => s.active.takeoff.flaps === 5,
      ops: [{ kind: 'lsk', slot: '1L' }],
    },
    {
      id: 'accept-v1',
      title: 'ACCEPT V1',
      target: '[data-testid="lsk-1R"]',
      task: 'Press LSK 1R with an empty scratchpad',
      text:
        'V1 is the decision speed. Pressing the LSK next to the small computed value accepts it, ' +
        'the figure turns large, meaning crew confirmed.',
      trigger: (s) => s.active.takeoff.v1 !== undefined,
      ops: [{ kind: 'clrAll' }, { kind: 'lsk', slot: '1R' }],
    },
    {
      id: 'accept-vr',
      title: 'ACCEPT VR',
      target: '[data-testid="lsk-2R"]',
      task: 'Press LSK 2R',
      text: 'VR is the rotation speed, where the pilot flying raises the nose.',
      trigger: (s) => s.active.takeoff.vr !== undefined,
      ops: [{ kind: 'lsk', slot: '2R' }],
    },
    {
      id: 'accept-v2',
      title: 'ACCEPT V2',
      target: '[data-testid="lsk-3R"]',
      task: 'Press LSK 3R',
      text: 'V2 is the takeoff safety speed, the minimum climb speed with an engine failed.',
      trigger: (s) => s.active.takeoff.v2 !== undefined,
      ops: [{ kind: 'lsk', slot: '3R' }],
    },
    {
      id: 'complete',
      title: 'PRE-FLT COMPLETE',
      target: '[data-testid="cdu-screen"]',
      text:
        'The FMC confirms PRE-FLT COMPLETE: position initialized, route active, performance loaded, thrust ' +
        'set and V speeds confirmed. This 737 is ready for pushback. Explore PROG, LEGS or switch to the ' +
        'taxi/cruise scenarios to keep practicing.',
    },
  ],
};

// procedure 2: in flight lateral and vertical changes
const cruiseProc: Procedure = {
  id: 'inflight-ops',
  title: 'IN-FLIGHT OPS',
  subtitle: 'Direct-to, holding and step climb at FL360',
  scenario: 'cruise',
  steps: [
    {
      id: 'intro-legs',
      title: 'THE ACTIVE ROUTE',
      target: '[data-testid="cdu-screen"]',
      text:
        'We are in cruise at FL360 between SBGR and SBSV. The LEGS page lists every waypoint: the magenta ' +
        'one is the active leg the autopilot is steering to, with its magnetic course and distance above, ' +
        'and speed/altitude predictions or constraints on the right.',
    },
    {
      id: 'prog',
      title: 'PROGRESS',
      target: '[data-key="PROG"]',
      task: 'Press the PROG key',
      text:
        'PROGRESS is the in-flight overview: last, active and next waypoint plus destination with distance ' +
        'to go, ETA and predicted fuel. It updates live as the airplane moves.',
      trigger: (s) => s.ui.page === 'PROG',
      ops: [{ kind: 'mode', key: 'PROG' }],
    },
    {
      id: 'prog-review',
      title: 'READING PROGRESS',
      target: '[data-testid="cdu-screen"]',
      text:
        'TO shows the active waypoint with live DTG and ETA, DEST sums the whole remaining route. ' +
        'Page 2 has wind components and temperatures, page 3 the fuel totals (try PREV/NEXT PAGE later).',
    },
    {
      id: 'back-legs',
      title: 'BACK TO LEGS',
      target: '[data-key="LEGS"]',
      task: 'Press the LEGS key',
      text: 'ATC just cleared us direct to TENPA, skipping the next waypoints. Route changes happen on LEGS.',
      trigger: (s) => s.ui.page === 'LEGS',
      ops: [{ kind: 'mode', key: 'LEGS' }],
    },
    {
      id: 'type-dirto',
      title: 'TYPE THE DIRECT-TO FIX',
      target: '[data-testid="keypad"]',
      task: 'Type TENPA',
      text: 'Type the cleared waypoint ident into the scratchpad.',
      trigger: (s) => s.scratchpad === 'TENPA' || planFor(s).legs[s.activeLegIndex]?.ident === 'TENPA',
      ops: [{ kind: 'clrAll' }, { kind: 'type', text: 'TENPA' }],
    },
    {
      id: 'insert-dirto',
      title: 'GO DIRECT',
      target: '[data-testid="lsk-1L"]',
      task: 'Press LSK 1L (the active leg line)',
      text:
        'Placing a downroute waypoint on line 1 is the classic direct-to: the FMC connects present position ' +
        'straight to TENPA and drops the bypassed waypoints. The title changes to MOD and EXEC lights.',
      trigger: (s) => planFor(s).legs[s.activeLegIndex]?.ident === 'TENPA',
      ops: [{ kind: 'lsk', slot: '1L' }],
    },
    {
      id: 'exec-dirto',
      title: 'EXECUTE THE DIRECT',
      target: '[data-testid="exec-key"]',
      task: 'Press EXEC',
      text: 'TENPA turns magenta as the new active leg. Watch the course and distance update from present position.',
      trigger: (s) => s.active.legs[s.activeLegIndex]?.ident === 'TENPA' && !s.mod,
      ops: [{ kind: 'exec' }],
    },
    {
      id: 'hold-page',
      title: 'HOLDING',
      target: '[data-key="HOLD"]',
      task: 'Press the HOLD key',
      text:
        'Now ATC asks us to hold at OPLEN. With no hold in the plan, the HOLD key shows the route ' +
        'with a HOLD AT box prompt at 6L asking where to hold.',
      trigger: (s) => s.ui.page === 'HOLD',
      ops: [{ kind: 'mode', key: 'HOLD' }],
    },
    {
      id: 'type-holdfix',
      title: 'TYPE THE HOLD FIX',
      target: '[data-testid="keypad"]',
      task: 'Type OPLEN',
      text: 'Any waypoint of the route works; off-route holds use PPOS at 6R for a hold right here.',
      trigger: (s) => s.scratchpad === 'OPLEN' || planFor(s).hold?.atIdent === 'OPLEN',
      ops: [{ kind: 'clrAll' }, { kind: 'type', text: 'OPLEN' }],
    },
    {
      id: 'enter-holdfix',
      title: 'CREATE THE HOLD',
      target: '[data-testid="lsk-6L"]',
      task: 'Press LSK 6L (HOLD AT)',
      text:
        'The RTE HOLD page opens with sensible defaults: inbound course along the route, right turns, ' +
        '1.5 minute legs above 14000 ft. Quadrant/radial, leg time or distance are all editable.',
      trigger: (s) => planFor(s).hold?.atIdent === 'OPLEN',
      ops: [{ kind: 'lsk', slot: '6L' }],
    },
    {
      id: 'type-efc',
      title: 'TYPE THE EFC TIME',
      target: '[data-testid="keypad"]',
      task: 'Type 1530',
      text:
        'EFC is the expect-further-clearance time ATC gives you, when to expect leaving the hold. ' +
        'Times are entered as HHMM zulu.',
      trigger: (s) => s.scratchpad === '1530' || planFor(s).hold?.efcTime === '1530',
      ops: [{ kind: 'clrAll' }, { kind: 'type', text: '1530' }],
    },
    {
      id: 'enter-efc',
      title: 'ENTER EFC',
      target: '[data-testid="lsk-2R"]',
      task: 'Press LSK 2R (EFC TIME)',
      text: 'The FMC uses it for fuel planning while holding.',
      trigger: (s) => planFor(s).hold?.efcTime === '1530',
      ops: [{ kind: 'lsk', slot: '2R' }],
    },
    {
      id: 'exec-hold',
      title: 'EXECUTE THE HOLD',
      target: '[data-testid="exec-key"]',
      task: 'Press EXEC',
      text: 'The hold becomes part of the active plan, the airplane will enter it when reaching OPLEN.',
      trigger: (s) => s.active.hold?.atIdent === 'OPLEN' && !s.mod,
      ops: [{ kind: 'exec' }],
    },
    {
      id: 'exit-hold',
      title: 'ARM THE EXIT',
      target: '[data-testid="lsk-6R"]',
      task: 'Press LSK 6R (EXIT HOLD>)',
      text:
        'ATC cleared us onward before we even got there. Arming EXIT HOLD tells the FMC to leave the ' +
        'pattern at the fix on the next pass, the prompt changes to EXIT ARMED.',
      trigger: (s) => planFor(s).hold?.exitArmed === true,
      ops: [{ kind: 'lsk', slot: '6R' }],
    },
    {
      id: 'exec-exit',
      title: 'EXECUTE THE EXIT',
      target: '[data-testid="exec-key"]',
      task: 'Press EXEC',
      text: 'Like every plan change, arming the exit needs an EXEC to take effect.',
      trigger: (s) => s.active.hold?.exitArmed === true && !s.mod,
      ops: [{ kind: 'exec' }],
    },
    {
      id: 'crz',
      title: 'STEP CLIMB',
      target: '[data-key="CRZ"]',
      task: 'Press the CRZ key',
      text:
        'As fuel burns off the airplane gets lighter and can fly higher, where the engines are more ' +
        'efficient. The CRZ page shows OPT and MAX altitude for the current weight.',
      trigger: (s) => s.ui.page === 'CRZ',
      ops: [{ kind: 'mode', key: 'CRZ' }],
    },
    {
      id: 'type-fl380',
      title: 'TYPE THE NEW LEVEL',
      target: '[data-testid="keypad"]',
      task: 'Type 380',
      text:
        'Three digits read as a flight level: 380 is FL380. The FMC refuses anything above MAX ALT with ' +
        'an UNABLE CRZ ALT message.',
      trigger: (s) => s.scratchpad === '380' || planFor(s).perf.crzAlt === 38000,
      ops: [{ kind: 'clrAll' }, { kind: 'type', text: '380' }],
    },
    {
      id: 'enter-fl380',
      title: 'ENTER CRZ ALT',
      target: '[data-testid="lsk-1L"]',
      task: 'Press LSK 1L (CRZ ALT)',
      text: 'The cruise altitude change creates a MOD, one more EXEC and the step climb is commanded.',
      trigger: (s) => planFor(s).perf.crzAlt === 38000,
      ops: [{ kind: 'lsk', slot: '1L' }],
    },
    {
      id: 'exec-crz',
      title: 'EXECUTE THE CLIMB',
      target: '[data-testid="exec-key"]',
      task: 'Press EXEC',
      text: 'FL380 is now the active cruise altitude, the target the autoflight system will climb to.',
      trigger: (s) => s.active.perf.crzAlt === 38000 && !s.mod,
      ops: [{ kind: 'exec' }],
    },
    {
      id: 'done',
      title: 'TOUR COMPLETE',
      target: '[data-testid="cdu-screen"]',
      text:
        'You handled a direct-to, built and exited a hold and commanded a step climb, the bread and butter ' +
        'of in-flight FMC work. Tip: set TIME to 60x in the top bar and watch PROGRESS and the telemetry ' +
        'panel while the airplane sequences the route.',
    },
  ],
};

export const procedures: Procedure[] = [preflightProc, cruiseProc];

export function getProcedure(id: string): Procedure | undefined {
  return procedures.find((p) => p.id === id);
}
