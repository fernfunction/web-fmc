import { useFmcStore } from '../fmc/store';
import type { LskSlot } from '../fmc/types';
import { Screen } from './screen/Screen';
import { Keyboard } from './keyboard/Keyboard';
import { Annunciators } from './annunciators/Annunciators';
import styles from './cdu.module.css';

function LskColumn({ side }: { side: 'L' | 'R' }) {
  const lsk = useFmcStore((s) => s.lsk);
  return (
    <div className={styles.lskColumn}>
      {[1, 2, 3, 4, 5, 6].map((n) => (
        <button
          key={n}
          className={styles.lsk}
          onClick={() => lsk(`${n}${side}` as LskSlot)}
          aria-label={`LSK ${n}${side}`}
          data-testid={`lsk-${n}${side}`}
        >
          —
        </button>
      ))}
    </div>
  );
}

function BrightnessKnob() {
  const brightness = useFmcStore((s) => s.ui.brightness);
  const setBrightness = useFmcStore((s) => s.setBrightness);
  const angle = -120 + (brightness - 0.2) * (240 / 0.8);
  return (
    <div
      className={styles.knob}
      title="BRT (click + / scroll to adjust)"
      onClick={() => setBrightness(brightness >= 1 ? 0.4 : brightness + 0.15)}
      onWheel={(e) => setBrightness(brightness + (e.deltaY < 0 ? 0.08 : -0.08))}
    >
      <div className={styles.knobMark} style={{ transform: `rotate(${angle}deg)` }} />
      <span className={styles.knobLabel}>BRT</span>
    </div>
  );
}

export function Cdu() {
  return (
    <div className={styles.chassis}>
      <div className={styles.screenBlock}>
        <Annunciators side="left" />
        <div className={styles.screenWithLsk}>
          <LskColumn side="L" />
          <div className={styles.screenWrap}>
            <Screen />
          </div>
          <LskColumn side="R" />
        </div>
        <Annunciators side="right" />
      </div>
      <div className={styles.brtRow}>
        <BrightnessKnob />
      </div>
      <Keyboard />
    </div>
  );
}
