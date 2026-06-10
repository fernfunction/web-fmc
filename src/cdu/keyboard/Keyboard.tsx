import { useRef } from 'react';
import { useFmcStore } from '../../fmc/store';
import type { ModeKey } from '../../fmc/types';
import styles from './keyboard.module.css';

const MODE_KEYS_TOP: { label: string; key: ModeKey }[] = [
  { label: 'INIT\nREF', key: 'INIT_REF' },
  { label: 'RTE', key: 'RTE' },
  { label: 'CLB', key: 'CLB' },
  { label: 'CRZ', key: 'CRZ' },
  { label: 'DES', key: 'DES' },
  { label: 'MENU', key: 'MENU' },
];

const MODE_KEYS_MID: { label: string; key: ModeKey }[] = [
  { label: 'LEGS', key: 'LEGS' },
  { label: 'DEP\nARR', key: 'DEP_ARR' },
  { label: 'HOLD', key: 'HOLD' },
  { label: 'PROG', key: 'PROG' },
];

const ALPHA_ROWS = ['ABCDE', 'FGHIJ', 'KLMNO', 'PQRST', 'UVWXY'];

export function Keyboard() {
  const store = useFmcStore();
  const clrTimer = useRef<number | null>(null);
  const clrLongFired = useRef(false);

  const startClr = () => {
    clrLongFired.current = false;
    clrTimer.current = window.setTimeout(() => {
      clrLongFired.current = true;
      store.clr(true);
    }, 600);
  };
  const endClr = () => {
    if (clrTimer.current !== null) window.clearTimeout(clrTimer.current);
    clrTimer.current = null;
    if (!clrLongFired.current) store.clr(false);
  };

  const execLit = store.mod !== null;

  return (
    <div className={styles.keyboard}>
      <div className={styles.modeRows}>
        <div className={styles.modeRow}>
          {MODE_KEYS_TOP.map((k) => (
            <button key={k.key} className={styles.fnKey} data-key={k.key} onClick={() => store.modeKey(k.key)}>
              {k.label.split('\n').map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </button>
          ))}
        </div>
        <div className={styles.modeRow}>
          {MODE_KEYS_MID.map((k) => (
            <button key={k.key} className={styles.fnKey} data-key={k.key} onClick={() => store.modeKey(k.key)}>
              {k.label.split('\n').map((l, i) => (
                <span key={i}>{l}</span>
              ))}
            </button>
          ))}
          <button
            className={`${styles.fnKey} ${styles.execKey}`}
            onClick={() => store.exec()}
            data-testid="exec-key"
          >
            <span className={`${styles.execLight} ${execLit ? styles.execLightOn : ''}`} />
            <span>EXEC</span>
          </button>
        </div>
        <div className={styles.modeRow}>
          <button className={styles.fnKey} data-key="N1_LIMIT" onClick={() => store.modeKey('N1_LIMIT')}>
            <span>N1</span>
            <span>LIMIT</span>
          </button>
          <button className={styles.fnKey} data-key="FIX" onClick={() => store.modeKey('FIX')}>
            <span>FIX</span>
          </button>
          <button className={styles.fnKey} data-key="PREV_PAGE" onClick={() => store.prevPage()}>
            <span>PREV</span>
            <span>PAGE</span>
          </button>
          <button className={styles.fnKey} data-key="NEXT_PAGE" onClick={() => store.nextPage()}>
            <span>NEXT</span>
            <span>PAGE</span>
          </button>
        </div>
      </div>

      <div className={styles.lowerBlock} data-testid="keypad">
        <div className={styles.numPad}>
          {['123', '456', '789'].map((row) => (
            <div className={styles.numRow} key={row}>
              {row.split('').map((d) => (
                <button key={d} className={styles.numKey} onClick={() => store.typeChar(d)}>
                  {d}
                </button>
              ))}
            </div>
          ))}
          <div className={styles.numRow}>
            <button className={styles.numKey} onClick={() => store.typeChar('.')}>
              ·
            </button>
            <button className={styles.numKey} onClick={() => store.typeChar('0')}>
              0
            </button>
            <button className={styles.numKey} onClick={() => store.plusMinus()}>
              +/-
            </button>
          </div>
        </div>

        <div className={styles.alphaPad}>
          {ALPHA_ROWS.map((row) => (
            <div className={styles.alphaRow} key={row}>
              {row.split('').map((c) => (
                <button key={c} className={styles.alphaKey} onClick={() => store.typeChar(c)}>
                  {c}
                </button>
              ))}
            </div>
          ))}
          <div className={styles.alphaRow}>
            <button className={styles.alphaKey} onClick={() => store.typeChar('Z')}>
              Z
            </button>
            <button className={styles.alphaKey} onClick={() => store.typeChar(' ')}>
              SP
            </button>
            <button className={styles.alphaKey} onClick={() => store.del()}>
              DEL
            </button>
            <button className={styles.alphaKey} onClick={() => store.typeChar('/')}>
              /
            </button>
            <button
              className={styles.alphaKey}
              onMouseDown={startClr}
              onMouseUp={endClr}
              onMouseLeave={() => {
                if (clrTimer.current !== null) {
                  window.clearTimeout(clrTimer.current);
                  clrTimer.current = null;
                }
              }}
              data-testid="clr-key"
            >
              CLR
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
