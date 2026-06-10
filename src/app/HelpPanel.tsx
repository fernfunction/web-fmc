import { useFmcStore } from '../fmc/store';
import styles from './app.module.css';

const SHORTCUTS: [string, string][] = [
  ['A-Z 0-9 . / Space', 'Scratchpad characters'],
  ['- or =', '+/- key (toggles sign)'],
  ['Backspace', 'CLR · hold to clear scratchpad'],
  ['Delete', 'DEL (loads DELETE)'],
  ['Enter', 'EXEC'],
  ['F1-F6', 'LSK 1L-6L'],
  ['F7-F12 / Shift+F1-F6', 'LSK 1R-6R'],
  ['PgUp PgDn or [ ]', 'PREV / NEXT PAGE'],
  ['Ctrl+1..9', 'INIT REF · RTE · CLB · CRZ · DES · LEGS · DEP ARR · HOLD · PROG'],
  ['Ctrl+0 / Ctrl+N / Ctrl+F', 'MENU · N1 LIMIT · FIX'],
  ['? or H (empty scratchpad)', 'Toggle this panel'],
];

export function HelpPanel() {
  const open = useFmcStore((s) => s.ui.helpOpen);
  const toggle = useFmcStore((s) => s.toggleHelp);
  if (!open) return null;
  return (
    <aside className={styles.helpPanel}>
      <header className={styles.helpHeader}>
        <h2>CDU SHORTCUTS</h2>
        <button onClick={toggle} aria-label="close help">
          ✕
        </button>
      </header>
      <table className={styles.helpTable}>
        <tbody>
          {SHORTCUTS.map(([k, v]) => (
            <tr key={k}>
              <td>{k}</td>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>FMC CONVENTIONS</h3>
      <ul className={styles.helpList}>
        <li>
          <b>□□□□□ box prompts</b> mark required entries; <b>----- dashes</b> mark optional ones.
        </li>
        <li>
          <b>Slash rule:</b> combined fields take both parts around a slash, e.g. <code>280/.78</code> (spd/mach) or{' '}
          <code>250/10000</code> (spd/alt). One side may be omitted: <code>250/</code> or <code>/10000</code>.
        </li>
        <li>
          <b>Altitudes:</b> 3 digits read as a flight level (<code>360</code> → FL360); 1000 or more reads as feet.
        </li>
        <li>
          <b>MOD/EXEC:</b> route or performance changes create a MOD plan; the title shows MOD, the EXEC bar lights and{' '}
          <code>&lt;ERASE</code> appears at 6L. EXEC makes the MOD active; ERASE discards it.
        </li>
        <li>
          <b>Data movement:</b> pressing an LSK on a filled field with an empty scratchpad copies the value down; DEL
          loads <code>DELETE</code>, then an LSK removes that field.
        </li>
        <li>
          <b>Easter egg:</b> on the OFFSET page, erase a not yet executed offset to land on NEAREST ARPTS.
        </li>
      </ul>
      <h3>SUGGESTED FLOWS</h3>
      <ul className={styles.helpList}>
        <li>
          <b>Preflight:</b> IDENT → POS INIT (set IRS pos via 4R) → RTE (try CO ROUTE <code>GRUSSA01</code>) → ACTIVATE
          + EXEC → DEPARTURES → PERF INIT → N1 LIMIT → TAKEOFF REF (flaps 5, accept V speeds).
        </li>
        <li>
          <b>In flight:</b> LEGS direct-to via DIR INTC, HOLD at a route fix, CRZ ALT changes, DES forecasts, FIX INFO,
          PROGRESS. Try waypoint <code>PIRAT</code> for SELECT DESIRED WPT.
        </li>
      </ul>
    </aside>
  );
}
