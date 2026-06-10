import { beforeEach, describe, expect, it } from 'vitest';
import { useFmcStore } from '../fmc/store';
import { renderScreen, getPage } from '../fmc/pageRouter';
import type { LskSlot, PageId, ScreenModel } from '../fmc/types';

const store = () => useFmcStore.getState();

function typeText(text: string) {
  for (const c of text) store().typeChar(c);
}

function pressLsk(slot: LskSlot) {
  store().lsk(slot);
}

function screenText(scr: ScreenModel): string {
  return scr.map((row) => row.map((c) => c.ch).join('')).join('\n');
}

function currentScreenText(): string {
  return screenText(renderScreen(store()));
}

describe('preflight flow', () => {
  beforeEach(() => store().loadScenario('preflight'));

  it('starts on IDENT with model and nav data', () => {
    expect(store().ui.page).toBe('IDENT');
    const txt = currentScreenText();
    expect(txt).toContain('737-800');
    expect(txt).toContain('26K');
  });

  it('walks IDENT -> POS INIT -> RTE', () => {
    pressLsk('6R');
    expect(store().ui.page).toBe('POS');
    pressLsk('6R');
    expect(store().ui.page).toBe('RTE');
  });

  it('sets IRS position and goes to NAV', () => {
    store().modeKey('INIT_REF');
    pressLsk('6R');
    typeText('S2326.1W04628.4');
    pressLsk('4R');
    expect(store().aircraft.irsPosSet).toBe(true);
    expect(store().aircraft.irs.status).toBe('NAV');
  });

  it('loads a company route and activates it with EXEC', () => {
    store().modeKey('RTE');
    typeText('GRUSSA01');
    pressLsk('2L');
    expect(store().active.origin).toBe('SBGR');
    expect(store().active.dest).toBe('SBSV');
    expect(store().active.legs.length).toBeGreaterThan(5);
    // activate then exec
    pressLsk('6R');
    expect(store().mod).not.toBeNull();
    store().exec();
    expect(store().mod).toBeNull();
    expect(store().active.activated).toBe(true);
    expect(store().active.executed).toBe(true);
  });

  it('rejects unknown airports with NOT IN DATA BASE', () => {
    store().modeKey('RTE');
    typeText('XXXX');
    pressLsk('1L');
    expect(store().messages[0]?.text).toBe('NOT IN DATA BASE');
  });

  it('computes GW from ZFW bidirectionally on PERF INIT', () => {
    // complete ident + pos init so INIT REF resolves to PERF INIT
    store().modeKey('INIT_REF');
    pressLsk('6R');
    typeText('S2326.1W04628.4');
    pressLsk('4R');
    store().modeKey('RTE');
    typeText('GRUSSA01');
    pressLsk('2L');
    pressLsk('6R');
    store().exec();
    store().modeKey('INIT_REF');
    expect(store().ui.page).toBe('PERF_INIT');
    typeText('114.2');
    pressLsk('3L');
    // perf entry after the executed activation creates a MOD, EXEC makes it active
    expect(store().mod).not.toBeNull();
    store().exec();
    const fuel = store().aircraft.fuel.total;
    expect(store().active.perf.gw).toBeCloseTo(114.2 + fuel, 1);
  });

  it('validates cost index range', () => {
    store().modeKey('INIT_REF');
    store().modeKey('INIT_REF');
    // force the page directly to PERF INIT
    useFmcStore.setState((s) => ({ ...s, ui: { ...s.ui, page: 'PERF_INIT' as PageId, pageIndex: 0 } }));
    typeText('501');
    pressLsk('5L');
    expect(store().messages.some((m) => m.text === 'INVALID ENTRY')).toBe(true);
  });
});

describe('takeoff ref', () => {
  beforeEach(() => store().loadScenario('taxi'));

  it('shows accepted v speeds', () => {
    expect(store().ui.page).toBe('TAKEOFF_REF');
    expect(store().active.takeoff.v1).toBeGreaterThan(100);
  });

  it('deletes takeoff speeds when flaps change', () => {
    typeText('15');
    pressLsk('1L');
    expect(store().active.takeoff.v1).toBeUndefined();
    expect(store().messages.some((m) => m.text === 'TAKEOFF SPEEDS DELETED')).toBe(true);
    expect(store().active.takeoff.flaps).toBe(15);
  });

  it('accepts computed speeds by pressing the LSK with empty scratchpad', () => {
    typeText('5');
    pressLsk('1L');
    store().clr(true);
    expect(store().active.takeoff.v1).toBeUndefined();
    // clear the alert message first
    store().clr(false);
    pressLsk('1R');
    expect(store().active.takeoff.v1).toBeGreaterThan(100);
  });
});

describe('legs editing and MOD/EXEC', () => {
  beforeEach(() => store().loadScenario('cruise'));

  it('starts with an active leg in cruise', () => {
    expect(store().ui.page).toBe('LEGS');
    const leg = store().active.legs[store().activeLegIndex];
    expect(leg.ident).toBe('POKON');
  });

  it('creates a MOD when deleting a downroute waypoint and ERASE drops it', () => {
    store().del();
    pressLsk('2L');
    expect(store().mod).not.toBeNull();
    expect(screenText(renderScreen(store()))).toContain('MOD');
    // erase via 6L
    pressLsk('6L');
    expect(store().mod).toBeNull();
  });

  it('inserts a waypoint with a discontinuity and EXEC promotes the MOD', () => {
    typeText('CUMBI');
    pressLsk('3L');
    expect(store().mod).not.toBeNull();
    const modLegs = store().mod!.legs;
    expect(modLegs.some((l) => l.ident === 'CUMBI')).toBe(true);
    expect(modLegs.some((l) => l.isDiscontinuity)).toBe(true);
    store().exec();
    expect(store().mod).toBeNull();
    expect(store().active.legs.some((l) => l.ident === 'CUMBI')).toBe(true);
  });

  it('sets a speed/alt restriction via the slash rule', () => {
    typeText('250/FL240');
    pressLsk('2R');
    store().exec();
    const leg = store().active.legs[store().activeLegIndex + 1];
    expect(leg.speedRestr).toBe(250);
    expect(leg.altRestr?.value).toBe(24000);
  });

  it('opens SELECT DESIRED WPT for duplicate idents', () => {
    typeText('PIRAT');
    pressLsk('4L');
    expect(store().ui.page).toBe('SELECT_WPT');
    expect(store().ui.selectWpt?.candidates.length).toBe(2);
    // picking the first candidate returns to LEGS with the MOD pending
    pressLsk('1L');
    expect(store().ui.page).toBe('LEGS');
    expect(store().mod?.legs.some((l) => l.ident === 'PIRAT')).toBe(true);
  });
});

describe('direct-to', () => {
  beforeEach(() => store().loadScenario('cruise'));

  it('goes direct to a downroute waypoint and trims the route', () => {
    store().modeKey('LEGS');
    useFmcStore.setState((s) => ({ ...s, ui: { ...s.ui, page: 'DIR_INTC' as PageId, pageIndex: 0 } }));
    typeText('TENPA');
    pressLsk('6L');
    expect(store().mod).not.toBeNull();
    expect(store().mod!.legs[0].ident).toBe('TENPA');
    store().exec();
    expect(store().activeLegIndex).toBe(0);
    expect(store().active.legs[0].ident).toBe('TENPA');
  });
});

describe('hold', () => {
  beforeEach(() => store().loadScenario('cruise'));

  it('creates a hold at a route fix with defaults', () => {
    store().modeKey('HOLD');
    typeText('NUVRA');
    pressLsk('6L');
    expect(store().mod?.hold?.atIdent).toBe('NUVRA');
    expect(store().mod?.hold?.turnDir).toBe('R');
    store().exec();
    expect(store().active.hold?.atIdent).toBe('NUVRA');
    // hold page now renders the hold and EXIT HOLD arms
    store().modeKey('HOLD');
    pressLsk('6R');
    store().exec();
    expect(store().active.hold?.exitArmed).toBe(true);
  });
});

describe('cruise simulation tick', () => {
  beforeEach(() => store().loadScenario('cruise'));

  it('advances position, burns fuel and keeps the clock moving', () => {
    const before = store();
    const fuelBefore = before.aircraft.fuel.total;
    const clockBefore = before.aircraft.clock.gmtSeconds;
    const distBefore = Math.abs(before.aircraft.position.lat - -19.75);
    store().tick(600);
    const after = store();
    expect(after.aircraft.clock.gmtSeconds).toBeGreaterThan(clockBefore);
    expect(after.aircraft.fuel.total).toBeLessThan(fuelBefore);
    expect(Math.abs(after.aircraft.position.lat - -19.75)).toBeLessThan(distBefore);
  });

  it('sequences the active waypoint when passing it', () => {
    const targetBefore = store().active.legs[store().activeLegIndex].ident;
    // 30 minutes at 462 kt covers well past POKON
    store().tick(1800);
    const targetAfter = store().active.legs[store().activeLegIndex].ident;
    expect(targetAfter).not.toBe(targetBefore);
  });
});

describe('offset', () => {
  beforeEach(() => store().loadScenario('cruise'));

  it('arms an offset as MOD and activates on EXEC, lighting OFST', () => {
    useFmcStore.setState((s) => ({ ...s, ui: { ...s.ui, page: 'OFFSET' as PageId, pageIndex: 0 } }));
    typeText('R10');
    pressLsk('1L');
    expect(store().mod?.offset).toEqual({ side: 'R', nm: 10, active: false });
    store().exec();
    expect(store().active.offset?.active).toBe(true);
  });

  it('erasing a pending offset lands on NEAREST ARPTS (easter egg)', () => {
    useFmcStore.setState((s) => ({ ...s, ui: { ...s.ui, page: 'OFFSET' as PageId, pageIndex: 0 } }));
    typeText('L5');
    pressLsk('1L');
    pressLsk('6L');
    expect(store().mod).toBeNull();
    expect(store().ui.page).toBe('NEAREST_ARPTS');
  });
});

describe('scratchpad behavior', () => {
  beforeEach(() => store().loadScenario('preflight'));

  it('copies a field down with an empty scratchpad (data movement)', () => {
    store().modeKey('RTE');
    typeText('SBGR');
    pressLsk('1L');
    expect(store().scratchpad).toBe('');
    pressLsk('1L');
    expect(store().scratchpad).toBe('SBGR');
  });

  it('DEL loads DELETE and CLR clears it', () => {
    store().del();
    expect(store().scratchpad).toBe('DELETE');
    store().clr(false);
    expect(store().scratchpad).toBe('');
  });

  it('CLR removes the displayed message before touching the scratchpad', () => {
    store().modeKey('RTE');
    typeText('XXXX');
    pressLsk('1L');
    expect(store().messages.length).toBe(1);
    store().clr(false);
    expect(store().messages.length).toBe(0);
    expect(store().scratchpad).toBe('XXXX');
  });

  it('plus/minus toggles the trailing sign', () => {
    typeText('5');
    store().plusMinus();
    expect(store().scratchpad).toBe('5-');
    store().plusMinus();
    expect(store().scratchpad).toBe('5+');
  });
});

describe('every page renders in every scenario', () => {
  const pages: PageId[] = [
    'IDENT',
    'POS',
    'INIT_REF_INDEX',
    'PERF_INIT',
    'PERF_LIMITS',
    'N1_LIMIT',
    'TAKEOFF_REF',
    'APPROACH_REF',
    'RTE',
    'RTE_DATA',
    'LEGS',
    'DEP_ARR_INDEX',
    'DEPARTURES',
    'ARRIVALS',
    'DIR_INTC',
    'SELECT_WPT',
    'HOLD',
    'CLB',
    'CRZ',
    'DES',
    'DES_FORECASTS',
    'ENG_OUT',
    'PROG',
    'RTA_PROGRESS',
    'FIX_INFO',
    'NEAREST_ARPTS',
    'ALTN_DEST',
    'NAV_STATUS',
    'NAV_OPTIONS',
    'OFFSET',
    'REF_NAV_DATA',
    'SUPP_NAV_DATA',
    'MENU',
    'SUMMARY',
    'MESSAGE_RECALL',
  ];

  for (const scenario of ['preflight', 'taxi', 'cruise'] as const) {
    it(`renders all pages and subpages in ${scenario}`, () => {
      store().loadScenario(scenario);
      for (const page of pages) {
        useFmcStore.setState((s) => ({ ...s, ui: { ...s.ui, page, pageIndex: 0 } }));
        const total = getPage(page).numPages(store());
        for (let i = 0; i < total; i++) {
          useFmcStore.setState((s) => ({ ...s, ui: { ...s.ui, pageIndex: i } }));
          const scr = renderScreen(store());
          expect(scr.length).toBe(14);
          expect(scr[0].length).toBe(24);
        }
      }
    });
  }
});
