import { beforeEach, describe, expect, it } from 'vitest';
import { useFmcStore } from '../fmc/store';
import { getSeries, getTimeColumn, sampleOnce } from '../app/telemetry';

const store = () => useFmcStore.getState();

describe('telemetry sampler', () => {
  beforeEach(() => {
    store().loadScenario('cruise');
    sampleOnce(1000);
  });

  it('records simulation values column by column', () => {
    store().tick(60);
    sampleOnce(1001);
    const t = getTimeColumn();
    const alt = getSeries('alt');
    const fuel = getSeries('fuel');
    expect(t.length).toBeGreaterThanOrEqual(2);
    expect(alt[alt.length - 1]).toBe(36000);
    expect(fuel[fuel.length - 1]).toBeLessThan(24.0);
  });

  it('tracks distance to go shrinking as the aircraft moves', () => {
    const before = getSeries('dtgDest').at(-1)!;
    store().tick(300);
    sampleOnce(1002);
    const after = getSeries('dtgDest').at(-1)!;
    expect(after).toBeLessThan(before);
  });

  it('resets the buffers when the scenario changes', () => {
    sampleOnce(1003);
    expect(getTimeColumn().length).toBeGreaterThan(1);
    store().loadScenario('preflight');
    sampleOnce(1004);
    expect(getTimeColumn().length).toBe(1);
    // on the ground there is no DTG, the sampler records a gap
    expect(getSeries('dtgWpt').at(-1)).toBeNull();
  });
});
