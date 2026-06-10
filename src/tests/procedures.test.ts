import { describe, expect, it } from 'vitest';
import { useFmcStore } from '../fmc/store';
import { procedures } from '../procedures/defs';
import { executeOps, INSTANT } from '../procedures/runner';

// runs every procedure end to end: for each action step, performing its ops
// must satisfy its own trigger, exactly what auto mode relies on
describe('procedures', () => {
  for (const proc of procedures) {
    it(`${proc.id} runs end to end in auto mode`, async () => {
      useFmcStore.getState().loadScenario(proc.scenario);
      for (const step of proc.steps) {
        if (!step.trigger) continue;
        if (step.trigger(useFmcStore.getState())) continue;
        expect(step.ops, `step ${step.id} needs ops or an already satisfied trigger`).toBeDefined();
        await executeOps(step.ops!, INSTANT);
        expect(step.trigger(useFmcStore.getState()), `trigger of step ${step.id}`).toBe(true);
      }
    });

    it(`${proc.id} steps have valid targets and texts`, () => {
      for (const step of proc.steps) {
        expect(step.target.length, `target of ${step.id}`).toBeGreaterThan(0);
        expect(step.text.length, `text of ${step.id}`).toBeGreaterThan(40);
        if (step.trigger) {
          expect(step.ops, `ops of ${step.id}`).toBeDefined();
        }
      }
    });
  }

  it('data entry triggers stay satisfied when the user works ahead', async () => {
    const proc = procedures[0];
    useFmcStore.getState().loadScenario(proc.scenario);
    // user runs through position setup and on to the RTE page on their own
    for (const step of proc.steps.slice(0, 8)) {
      if (step.ops) await executeOps(step.ops, INSTANT);
    }
    const s = useFmcStore.getState();
    // persistent state triggers keep reporting done so the engine can chain past them
    const copyPos = proc.steps.find((st) => st.id === 'copy-pos')!;
    const setIrs = proc.steps.find((st) => st.id === 'set-irs')!;
    expect(copyPos.trigger!(s)).toBe(true);
    expect(setIrs.trigger!(s)).toBe(true);
    expect(s.ui.page).toBe('RTE');
  });
});
