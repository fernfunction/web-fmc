import { useState } from 'react';
import { useFmcStore } from '../fmc/store';
import styles from './app.module.css';

export function SpeedDial() {
  const [open, setOpen] = useState(false);
  const toggleHelp = useFmcStore((s) => s.toggleHelp);
  const toggleDebug = useFmcStore((s) => s.toggleDebug);
  const helpOpen = useFmcStore((s) => s.ui.helpOpen);
  const debugOpen = useFmcStore((s) => s.ui.debugOpen);

  return (
    <div className={styles.speedDial}>
      <button
        className={`${styles.fab} ${open ? styles.fabOpen : ''}`}
        onClick={() => setOpen((o) => !o)}
        aria-label="toolbox"
        aria-expanded={open}
        title="Tools"
      >
        ✦
      </button>
      <div className={`${styles.dialItems} ${open ? styles.dialItemsOpen : ''}`}>
        <button
          className={`${styles.fab} ${styles.fabSmall} ${helpOpen ? styles.fabActive : ''}`}
          onClick={toggleHelp}
          aria-label="help"
          title="Shortcuts and FMC help (?)"
        >
          ?
        </button>
        <button
          className={`${styles.fab} ${styles.fabSmall} ${debugOpen ? styles.fabActive : ''}`}
          onClick={toggleDebug}
          aria-label="telemetry"
          title="Telemetry / debug"
          data-testid="debug-fab"
        >
          ⌁
        </button>
      </div>
    </div>
  );
}
