import { useEffect } from 'react';
import { Cdu } from '../cdu/Cdu';
import { useKeyBindings } from '../cdu/keyboard/useKeyBindings';
import { useFmcStore } from '../fmc/store';
import { HelpPanel } from './HelpPanel';
import { TopBar } from './TopBar';
import styles from './app.module.css';

export function App() {
  useKeyBindings();
  const toggleHelp = useFmcStore((s) => s.toggleHelp);

  useEffect(() => {
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
      <main className={styles.main}>
        <Cdu />
        <button className={styles.helpFab} onClick={toggleHelp} aria-label="help" title="Shortcuts and FMC help (?)">
          ?
        </button>
        <HelpPanel />
      </main>
    </div>
  );
}
