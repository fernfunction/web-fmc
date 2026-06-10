import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import { create } from 'zustand';
import { useFmcStore } from '../fmc/store';
import { getProcedure } from './defs';
import { AUTO_PACING, executeOps, INSTANT } from './runner';
import type { Procedure, ProcStep } from './types';

export type ProcMode = 'guided' | 'auto';

interface ProcUiState {
  procId: string | null;
  procTitle: string;
  mode: ProcMode;
  stepIndex: number;
  stepCount: number;
  running: boolean;
  paused: boolean;
}

export const useProcStore = create<ProcUiState>(() => ({
  procId: null,
  procTitle: '',
  mode: 'guided',
  stepIndex: 0,
  stepCount: 0,
  running: false,
  paused: false,
}));

type DriverApi = ReturnType<typeof driver>;

let drv: DriverApi | null = null;
let proc: Procedure | null = null;
let unsub: (() => void) | null = null;
let generation = 0;
let advancing = false;
let acted = false;
const timers: number[] = [];

function schedule(fn: () => void, ms: number): void {
  const gen = generation;
  timers.push(
    window.setTimeout(() => {
      if (gen === generation) fn();
    }, ms),
  );
}

function clearTimers(): void {
  for (const t of timers) window.clearTimeout(t);
  timers.length = 0;
}

function ui(): ProcUiState {
  return useProcStore.getState();
}

function currentStep(): ProcStep | null {
  if (!proc) return null;
  return proc.steps[ui().stepIndex] ?? null;
}

// reading time before auto mode performs the action
function readDelay(step: ProcStep): number {
  const len = step.text.length + (step.task?.length ?? 0);
  return Math.min(9000, Math.max(2600, len * 26));
}

function stepHtml(step: ProcStep): string {
  const task = step.task ? `<div class="wfm-task">▸ ${step.task}</div>` : '';
  const autoNote =
    ui().mode === 'auto' && step.ops ? `<div class="wfm-auto-note">auto mode will do this for you…</div>` : '';
  return `${step.text}${task}${autoNote}`;
}

function makeButton(label: string, onClick: () => void, accent = false): HTMLButtonElement {
  const b = document.createElement('button');
  b.innerText = label;
  b.className = `wfm-tour-btn${accent ? ' wfm-tour-btn-accent' : ''}`;
  b.addEventListener('click', (e) => {
    e.preventDefault();
    onClick();
  });
  return b;
}

function renderButtons(popover: { footer?: HTMLElement; footerButtons?: HTMLElement }): void {
  const host = popover.footerButtons ?? popover.footer;
  if (!host) return;
  host.innerHTML = '';
  if (popover.footer) popover.footer.style.display = 'flex';
  const step = currentStep();
  if (!step) return;
  const isLast = proc !== null && ui().stepIndex === proc.steps.length - 1;

  if (ui().mode === 'guided') {
    if (!step.trigger) {
      host.appendChild(makeButton(isLast ? 'FINISH' : 'NEXT ▸', () => advance(), true));
    } else if (step.ops) {
      host.appendChild(
        makeButton('DO IT FOR ME', () => {
          const gen = generation;
          void executeOps(step.ops!, INSTANT, () => gen !== generation);
        }),
      );
    }
  } else {
    const pauseBtn = makeButton(ui().paused ? 'RESUME' : 'PAUSE', () => {
      pauseResume();
      pauseBtn.innerText = ui().paused ? 'RESUME' : 'PAUSE';
    });
    host.appendChild(pauseBtn);
  }
  host.appendChild(makeButton('STOP', () => stop()));
}

function showStep(index: number): void {
  if (!proc || !drv) return;
  acted = false;
  useProcStore.setState({ stepIndex: index });
  const step = proc.steps[index];
  drv.highlight({
    element: step.target,
    popover: {
      title: `${index + 1}/${proc.steps.length} · ${step.title}`,
      description: stepHtml(step),
      side: 'left',
      align: 'start',
      showButtons: [],
    },
  });

  // a step might already be satisfied (user worked ahead), chain forward
  if (step.trigger && step.trigger(useFmcStore.getState())) {
    schedule(() => advance(), 700);
    return;
  }

  if (ui().mode === 'auto' && !ui().paused) {
    scheduleAutoStep(step);
  }
}

function scheduleAutoStep(step: ProcStep): void {
  schedule(() => {
    if (ui().paused) return;
    if (step.ops && !acted) {
      acted = true;
      const gen = generation;
      void executeOps(step.ops, AUTO_PACING, () => gen !== generation || ui().paused === true).then(() => {
        // ops interrupted by pause rerun from scratch on resume
        if (gen === generation && ui().paused) acted = false;
      });
    } else if (!step.trigger) {
      advance();
    }
  }, readDelay(step));
}

function advance(): void {
  if (!proc || advancing) return;
  advancing = true;
  clearTimers();
  const next = ui().stepIndex + 1;
  if (next >= proc.steps.length) {
    stop();
    advancing = false;
    return;
  }
  showStep(next);
  advancing = false;
}

function onStoreChange(): void {
  if (!proc || !ui().running || ui().paused) return;
  const s = useFmcStore.getState();
  // bail out if the user swapped scenarios mid procedure
  if (s.scenario !== proc.scenario) {
    stop();
    return;
  }
  const step = currentStep();
  if (step?.trigger && step.trigger(s)) {
    if (advancing) return;
    advancing = true;
    schedule(() => {
      advancing = false;
      advanceFromTrigger();
    }, 600);
  }
}

function advanceFromTrigger(): void {
  if (!proc) return;
  const next = ui().stepIndex + 1;
  clearTimers();
  if (next >= proc.steps.length) {
    stop();
    return;
  }
  showStep(next);
}

export function startProcedure(id: string, mode: ProcMode): void {
  stop();
  const p = getProcedure(id);
  if (!p) return;
  generation++;
  proc = p;
  useFmcStore.getState().loadScenario(p.scenario);
  useProcStore.setState({
    procId: p.id,
    procTitle: p.title,
    mode,
    stepIndex: 0,
    stepCount: p.steps.length,
    running: true,
    paused: false,
  });
  drv = driver({
    animate: true,
    overlayOpacity: 0.55,
    stagePadding: 6,
    stageRadius: 8,
    allowClose: false,
    allowKeyboardControl: false,
    disableActiveInteraction: false,
    popoverClass: 'wfm-tour',
    onPopoverRender: (popover) => renderButtons(popover as never),
  });
  unsub = useFmcStore.subscribe(onStoreChange);
  showStep(0);
}

export function stop(): void {
  generation++;
  clearTimers();
  advancing = false;
  if (unsub) {
    unsub();
    unsub = null;
  }
  if (drv) {
    drv.destroy();
    drv = null;
  }
  proc = null;
  useProcStore.setState({ running: false, paused: false, procId: null, procTitle: '' });
}

export function pauseResume(): void {
  if (!ui().running) return;
  const paused = !ui().paused;
  useProcStore.setState({ paused });
  if (paused) {
    clearTimers();
  } else {
    const step = currentStep();
    const s = useFmcStore.getState();
    if (step?.trigger && step.trigger(s)) {
      schedule(() => advance(), 500);
    } else if (ui().mode === 'auto' && step) {
      scheduleAutoStep(step);
    }
  }
}
