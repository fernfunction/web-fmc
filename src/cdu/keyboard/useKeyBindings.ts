import { useEffect, useRef } from 'react';
import { useFmcStore } from '../../fmc/store';
import type { LskSlot, ModeKey } from '../../fmc/types';

const CTRL_PAGES: Record<string, ModeKey> = {
  '1': 'INIT_REF',
  '2': 'RTE',
  '3': 'CLB',
  '4': 'CRZ',
  '5': 'DES',
  '6': 'LEGS',
  '7': 'DEP_ARR',
  '8': 'HOLD',
  '9': 'PROG',
  '0': 'MENU',
};

export function useKeyBindings() {
  const backspaceTimer = useRef<number | null>(null);
  const backspaceLongFired = useRef(false);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const s = useFmcStore.getState();

      if (e.ctrlKey && !e.altKey) {
        const page = CTRL_PAGES[e.key];
        if (page) {
          e.preventDefault();
          s.modeKey(page);
          return;
        }
        if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          s.modeKey('N1_LIMIT');
          return;
        }
        if (e.key.toLowerCase() === 'f') {
          e.preventDefault();
          s.modeKey('FIX');
          return;
        }
        return;
      }

      // function keys drive the line select keys
      const fk = e.key.match(/^F(\d{1,2})$/);
      if (fk) {
        e.preventDefault();
        const n = Number(fk[1]);
        if (n >= 1 && n <= 6) {
          s.lsk(`${n}${e.shiftKey ? 'R' : 'L'}` as LskSlot);
        } else if (n >= 7 && n <= 12) {
          s.lsk(`${n - 6}R` as LskSlot);
        }
        return;
      }

      switch (e.key) {
        case 'Enter':
          e.preventDefault();
          s.exec();
          return;
        case 'Delete':
          e.preventDefault();
          s.del();
          return;
        case 'Backspace': {
          e.preventDefault();
          if (e.repeat) return;
          backspaceLongFired.current = false;
          backspaceTimer.current = window.setTimeout(() => {
            backspaceLongFired.current = true;
            useFmcStore.getState().clr(true);
          }, 600);
          return;
        }
        case 'PageUp':
        case '[':
          e.preventDefault();
          s.prevPage();
          return;
        case 'PageDown':
        case ']':
          e.preventDefault();
          s.nextPage();
          return;
        case 'Escape':
          if (s.ui.helpOpen) s.toggleHelp();
          return;
        case '?':
          e.preventDefault();
          s.toggleHelp();
          return;
        case '-':
        case '=':
          e.preventDefault();
          s.plusMinus();
          return;
      }

      if (e.key.length === 1 && /^[a-zA-Z0-9./ ]$/.test(e.key)) {
        e.preventDefault();
        // H with an empty scratchpad toggles the help panel (documented binding)
        if ((e.key === 'h' || e.key === 'H') && s.scratchpad === '') {
          s.toggleHelp();
          return;
        }
        s.typeChar(e.key);
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Backspace') {
        if (backspaceTimer.current !== null) {
          window.clearTimeout(backspaceTimer.current);
          backspaceTimer.current = null;
        }
        if (!backspaceLongFired.current) useFmcStore.getState().clr(false);
        backspaceLongFired.current = false;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);
}
