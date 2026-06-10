import { useEffect } from 'react';
import { Cdu } from '../cdu/Cdu';
import { useKeyBindings } from '../cdu/keyboard/useKeyBindings';
import { useFmcStore } from '../fmc/store';
import { HelpPanel } from './HelpPanel';
import { DebugPanel } from './DebugPanel';
import { SpeedDial } from './SpeedDial';
import { TopBar } from './TopBar';
import { startTelemetry } from './telemetry';
import styles from './app.module.css';

export function App() {
  useKeyBindings();
  const debugOpen = useFmcStore((s) => s.ui.debugOpen);

  useEffect(() => {
    startTelemetry();
    // 1 Hz simulation tick, scaled by the time warp selector
    const id = window.setInterval(() => {
      const s = useFmcStore.getState();
      s.tick(1 * s.ui.timeScale);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <div className={styles.app}>
      <TopBar />
      <main className={`${styles.main} ${debugOpen ? styles.mainSplit : ''}`}>
        <Cdu />
        <SpeedDial />
        <HelpPanel />
        <DebugPanel />
      </main>
    </div>
  );
}
