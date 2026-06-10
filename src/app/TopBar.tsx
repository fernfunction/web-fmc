import { scenarioLabels, useFmcStore } from '../fmc/store';
import type { ScenarioId } from '../fmc/types';
import { ProcMenu } from './ProcMenu';
import styles from './app.module.css';

export function TopBar() {
  const scenario = useFmcStore((s) => s.scenario);
  const loadScenario = useFmcStore((s) => s.loadScenario);
  const timeScale = useFmcStore((s) => s.ui.timeScale);
  const setTimeScale = useFmcStore((s) => s.setTimeScale);
  const phase = useFmcStore((s) => s.aircraft.phase);

  return (
    <div className={styles.topBar}>
      <span className={styles.brand}><a href="https://github.com/fernfunction/web-fmc" target="_blank" rel="noopener noreferrer">web-fmc</a> · 737 FMC/CDU · <strong>not for training use</strong> ·</span>
      <label className={styles.scenario}>
        SCENARIO
        <select value={scenario} onChange={(e) => loadScenario(e.target.value as ScenarioId)}>
          {scenarioLabels.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
      </label>
      <ProcMenu />
      {phase === 'CRUISE' && (
        <div className={styles.timeScale}>
          TIME
          {([1, 8, 60] as const).map((t) => (
            <button key={t} className={timeScale === t ? styles.tsActive : ''} onClick={() => setTimeScale(t)}>
              {t}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
