# web-fmc · Boeing 737 FMC/CDU

> [!IMPORTANT]  
> This project is not affiliated with, or endorsed by, Boeing, Smiths/GE Aviation or any airline. It is an educational toy. Do not use it for flight training, planning or any real-world operation.

> [!CAUTION]
> **Not for production/training use.** See disclaimers on ["Adaptations and disclaimers"](https://github.com/fernfunction/web-fmc#adaptations-and-disclaimers).

<img width="1920" height="947" alt="image" src="https://github.com/user-attachments/assets/d8c99a98-5c21-4d9a-a6af-bea1cc29c999" />

A semi-functional, browser-only replica of the Boeing 737 FMC Control Display Unit, modeled
after the Smiths Industries FMCS Guide (FMC U10.2A to 10.4, LCD CDU) and the open documentation
at b737.org.uk. The goal is to reproduce the interaction semantics of the real box: the
scratchpad pipeline, field validation, the MOD/EXEC/ERASE plan machine, page flows and
messages. Numbers are plausible and internally consistent, not accurate.

Everything runs client side. No backend, no network calls after load.

## Commands

```bash
npm install      # install dependencies
npm run dev      # dev server with HMR
npm run build    # type-check and bundle to dist/
npm test         # vitest unit suite (parsers, pages, sim, procedures)
npm run preview  # serve the production build
npm run lint     # eslint over src/
```

`dist/` is a static bundle: serve it from any web server or GitHub Pages. The deploy
workflow in `.github/workflows/deploy.yml` runs tests, builds and publishes to Pages on
every push to `main`.

## Source layout (`src/`)

| Module            | Responsibility                                                    |
| ----------------- | ----------------------------------------------------------------- |
| `app/`            | Shell, top bar, help panel, telemetry panel, speed dial.          |
| `cdu/`            | Screen grid (14x24 cells), 69-key keyboard, annunciators, chassis.|
| `fmc/store.ts`    | Zustand store, key handling, EXEC promotion, scenario loading.    |
| `fmc/sim.ts`      | The 1 Hz flight simulation tick.                                  |
| `fmc/pages/`      | One module per page family: `render(state)` + LSK handler map.    |
| `fmc/pageApi.ts`  | MOD/EXEC machine (`editPlan`), message queue helpers.             |
| `fmc/validation/` | Scratchpad parsers: slash rule, FL rule, lat/lon, navaid class.   |
| `fmc/perf/`       | Simplified 737-800/CFM56-7B26 performance model.                  |
| `fmc/nav/`        | Great-circle geodesy, synthetic nav database access, route build. |
| `procedures/`     | Guided/auto tour engine (driver.js) and procedure definitions.    |
| `data/`           | `ndb.json` (airports, fixes, navaids, airways, SIDs/STARs) and scenario files. |

Every page is a pure projection: `(FmcState) -> ScreenModel` plus an `onLsk(slot, scratchpad)`
handler that returns a state mutation, a message, or a page change. That keeps each page
testable in isolation and the screen always derived from the store.

## Scenarios

Selected in the top bar. Switching resets the FMC state.

| Scenario | Situation | What to exercise |
| -------- | --------- | ---------------- |
| On ground, cold & dark | Gate A12 at SBGR, IRS aligning, FMC just powered | The full preflight chain: IDENT, POS INIT (SET IRS POS), RTE (CO ROUTE `GRUSSA01`), ACTIVATE + EXEC, DEPARTURES, PERF INIT, N1 LIMIT, TAKEOFF REF |
| On ground, taxi | Taxiing to SBGR 09R, preflight complete | Review takeoff data, change runway or flaps and watch `TAKEOFF SPEEDS DELETED`, V-speed re-acceptance |
| In flight, cruise | FL360 between SBGR and SBSV, past T/C | Live LEGS/PROGRESS, direct-to, holds, CRZ ALT step climb, DES NOW, FIX INFO, lateral OFFSET, NEAREST ARPTS |

In the cruise scenario the aircraft actually flies: position integrates along the route,
waypoints sequence, fuel burns and the clock runs. Time can be warped 1x/8x/60x in the top bar.

## Procedures

<img width="1920" height="947" alt="image" src="https://github.com/user-attachments/assets/ad39e51c-fb40-402c-a013-75bd8ed597a0" />

Interactive lessons driven from the PROCEDURE select in the top bar. Each procedure is a list
of steps with a spotlight target, teaching text, a state trigger that detects completion and
the ops to perform the action automatically. Two modes per procedure:

- **GUIDED**: you perform each action on the CDU. The tour highlights where, explains why,
  and advances when the simulation state confirms you did it (any path counts, including
  working ahead). A "DO IT FOR ME" button performs the current step if you are stuck.
- **AUTO**: the same steps and texts, but the FMC operates itself at a human pace after a
  reading delay. PAUSE/RESUME and STOP are always available.

Shipped procedures:

| Procedure | Scenario | Steps | Covers |
| --------- | -------- | ----- | ------ |
| PREFLIGHT SETUP | cold & dark | 35 | CDU anatomy, IDENT, POS INIT and IRS, company route, activation and EXEC, SID/runway selection, PERF INIT field by field, N1 ratings, takeoff flaps and V speeds |
| IN-FLIGHT OPS | cruise | 20 | Reading LEGS and PROGRESS, direct-to on line 1, building a hold with EFC, arming the exit, step climb with OPT/MAX |

Procedure definitions live in `src/procedures/defs.ts`. The unit suite executes every
procedure end to end: each step's ops must satisfy its own trigger, which is exactly the
contract auto mode relies on.

## The CDU

- 14x24 character grid with two font sizes and the LCD CDU palette (white, green, magenta,
  cyan, amber). Box prompts mark required entries, dashes mark optional ones.
- Full keyboard: 12 LSKs, mode keys, alpha/numeric pads, SP/DEL/CLR (hold CLR to wipe the
  scratchpad), +/- sign toggle, brightness knob with a real effect.
- PC keyboard bindings for everything (F1-F12 for LSKs, Ctrl+1..9 for pages, Backspace as
  CLR, Enter as EXEC). Press `?` for the binding map and FMC conventions.
- ~35 pages: IDENT, POS INIT/REF/SHIFT, RTE, DEPARTURES/ARRIVALS, LEGS, RTE DATA, HOLD,
  SELECT DESIRED WPT, PERF INIT, PERF LIMITS, N1 LIMIT, TAKEOFF REF, APPROACH REF, CLB,
  CRZ, DES, DES FORECASTS, ENG OUT, PROGRESS, RTA, FIX INFO, REF/SUPP NAV DATA,
  NEAREST ARPTS, ALTN DEST, NAV STATUS/OPTIONS, LATERAL OFFSET, MESSAGE RECALL, MENU, SUMMARY.
- The Smiths interaction grammar: LSK data movement (copy down on empty scratchpad), DEL
  loads `DELETE`, slash rule for combined fields (`280/.78`, `250/10000`), altitude rule
  (3 digits read as a flight level), prioritized scratchpad messages with the MSG annunciator.

## Telemetry

<img width="1920" height="947" alt="image" src="https://github.com/user-attachments/assets/69a33fac-326b-49fa-8b9d-6775c1ee8b9c" />
<img width="1920" height="947" alt="image" src="https://github.com/user-attachments/assets/922c0738-2c17-4785-8898-65d306bac74b" />

The floating speed dial (top right) opens the help panel or the telemetry panel. Telemetry
shows every simulation feed the FMC consumes as real-time uPlot charts sampled at 1 Hz
(altitude, speeds, mach, heading/track, vertical speed, weights, fuel flow, tanks,
temperatures, wind, DTG, position), each with live counters colored per series, plus
counter chips for the whole FMC state (route, perf, takeoff, VNAV, messages, MOD machine).
The panel sits beside the CDU, never over it.

## Simulation detail

The tick in `fmc/sim.ts` keeps the instruments alive and consistent:

- Bank-limited turns (about 1.1 deg/s at cruise TAS), no heading snaps.
- Wind triangle: ground speed from TAS plus the along-track component, heading crabbed off
  the track by the crosswind.
- SAT follows the ISA lapse rate plus ISA DEV and a bounded noise walk. TAT is computed
  from the ram rise at current mach.
- Mach eases toward the CRZ page target (entered mach, LRC or ECON by cost index).
- Step climbs and DES NOW actually move the airplane, with ramped vertical speed.
- Level flight uses a toy altitude hold: turbulence pushes, a proportional law pulls back,
  and V/S is derived from the actual altitude change so the two never disagree.
- The center tank feeds first, then the wing mains split the load, like the real airplane.
- Fuel flow depends on weight, altitude and phase (climb burns more, descent is near idle).
  Fuel also burns during taxi.
- Reaching a hold fix starts a simplified bank-limited orbit. Arming EXIT HOLD plus EXEC
  resumes navigation.

## What is intentionally non-functional

- MENU: `<DFCS` and `<ACARS` show `KEY/FUNCTION INOP`. Only `<FMC` works.
- INIT/REF INDEX: the `MAINT>` prompt (ground only) is decorative and answers INOP.
- The FAIL annunciator never lights.
- RTA PROGRESS computes and displays the time error but does not control speed.
- ENG OUT pages are advisory only, exactly like the real U10: numbers display, nothing
  executes, ERASE backs out.
- BUMP N1 is display only.
- TO SHIFT accepts the entry but does not shift the FMC position at takeoff.
- POS SHIFT values are representative, not a live sensor comparison.
- IRS alignment completes instantly once a position is set. The real alignment takes minutes.
- OFFSET ABEAM points, ACARS/datalink, FMC COMM, WEATHER MAPS, ALT NAV, dual-FMC source
  select and the maintenance pages (CDU BITE) are out of scope, as planned for v1.
- The DIR INTC page module exists but no panel flow routes to it. Direct-to is done the
  737 way: put the cleared waypoint on LEGS line 1.

## Adaptations and disclaimers

- Behavior baseline is FMC U10.2A to 10.4 as described by the Smiths guide. Later updates
  (U10.6+ page layouts) are intentionally not reproduced.
- The nav database is synthetic. Airports are real Brazilian ICAO codes with approximate
  coordinates, but every waypoint, navaid, airway, SID, STAR, approach, company route and
  the AIRAC cycle are invented for this project. Useless and unsafe for real navigation.
- The performance model is a set of plausible curves tuned to look right at typical
  737-800 operating points (V speeds, VREF, N1, ECON/LRC speeds, OPT/MAX altitudes, fuel
  flow). Change the weight and the numbers move in the right direction, nothing more.
- Holds fly a simplified orbit, not a proper racetrack with entry procedures.
- Wind and temperature variability are bounded random walks, not weather.
- Units are pounds and GMT, matching the guide.
- One binding quirk: `H` with an empty scratchpad toggles the help panel. No ident in the
  database starts with H, so it never conflicts with data entry.
- This project is not affiliated with, or endorsed by, Boeing, Smiths/GE Aviation or any
  airline. It is an educational toy. Do not use it for flight training, planning or any
  real-world operation.

## Requirements

Any modern browser. The screen uses CSS container queries (Chrome 105+, Firefox 110+,
Safari 16+). No WebGL, no workers, no storage.
