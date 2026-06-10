import type { FmcState, LskSlot, ModeKey, ScenarioId } from '../fmc/types';

// primitive operations the auto runner can perform against the store
export type ProcOp =
  | { kind: 'type'; text: string }
  | { kind: 'clrAll' }
  | { kind: 'lsk'; slot: LskSlot }
  | { kind: 'mode'; key: ModeKey }
  | { kind: 'exec' }
  | { kind: 'wait'; ms: number };

export interface ProcStep {
  id: string;
  title: string;
  // teaching content shown in the popover
  text: string;
  // imperative instruction for the user (guided mode); omitted on info steps
  task?: string;
  // CSS selector of the element to spotlight
  target: string;
  // advances the procedure when it returns true; undefined makes this an info step
  trigger?: (s: FmcState) => boolean;
  // how the action is performed automatically (auto mode and "do it for me")
  ops?: ProcOp[];
}

export interface Procedure {
  id: string;
  title: string;
  subtitle: string;
  scenario: ScenarioId;
  steps: ProcStep[];
}
