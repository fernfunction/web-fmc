import { procedures } from '../procedures/defs';
import { startProcedure, stop, useProcStore, type ProcMode } from '../procedures/engine';
import styles from './app.module.css';

export function ProcMenu() {
  const running = useProcStore((s) => s.running);
  const procId = useProcStore((s) => s.procId);
  const mode = useProcStore((s) => s.mode);
  const stepIndex = useProcStore((s) => s.stepIndex);
  const stepCount = useProcStore((s) => s.stepCount);

  const value = running && procId ? `${procId}|${mode}` : '';

  return (
    <label className={styles.scenario} data-testid="proc-menu">
      PROCEDURE
      <select
        value={value}
        onChange={(e) => {
          const v = e.target.value;
          if (!v) {
            stop();
            return;
          }
          const [id, m] = v.split('|');
          startProcedure(id, m as ProcMode);
        }}
      >
        <option value="">NONE</option>
        {procedures.map((p) => (
          <optgroup key={p.id} label={`${p.title} - ${p.subtitle}`}>
            <option value={`${p.id}|guided`}>{p.title} · GUIDED</option>
            <option value={`${p.id}|auto`}>{p.title} · AUTO</option>
          </optgroup>
        ))}
      </select>
      {running && (
        <>
          <span className={styles.procProgress}>
            {stepIndex + 1}/{stepCount}
          </span>
          <button className={styles.procStop} onClick={stop}>
            ■ STOP
          </button>
        </>
      )}
    </label>
  );
}
