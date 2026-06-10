import { useFmcStore } from '../fmc/store';
import type { ProcOp } from './types';

export interface OpPacing {
  perChar: number;
  perOp: number;
}

// paced like a human working the keyboard
export const AUTO_PACING: OpPacing = { perChar: 110, perOp: 450 };
// near instant, used by "do it for me" and tests
export const INSTANT: OpPacing = { perChar: 0, perOp: 0 };

const sleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

export async function executeOps(
  ops: ProcOp[],
  pacing: OpPacing,
  isCancelled: () => boolean = () => false,
): Promise<void> {
  const store = () => useFmcStore.getState();
  for (const op of ops) {
    if (isCancelled()) return;
    switch (op.kind) {
      case 'type':
        for (const c of op.text) {
          if (isCancelled()) return;
          store().typeChar(c);
          await sleep(pacing.perChar);
        }
        break;
      case 'clrAll':
        // first press clears a message if one is shown, second clears the scratchpad
        store().clr(true);
        store().clr(true);
        break;
      case 'lsk':
        store().lsk(op.slot);
        break;
      case 'mode':
        store().modeKey(op.key);
        break;
      case 'exec':
        store().exec();
        break;
      case 'wait':
        await sleep(op.ms);
        break;
    }
    await sleep(pacing.perOp);
  }
}
