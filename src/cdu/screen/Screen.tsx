import { useFmcStore } from '../../fmc/store';
import { renderScreen } from '../../fmc/pageRouter';
import styles from './screen.module.css';

export function Screen() {
  const state = useFmcStore();
  const model = renderScreen(state);
  return (
    <div className={styles.screen} style={{ filter: `brightness(${state.ui.brightness})` }} data-testid="cdu-screen">
      {model.map((row, r) => (
        <div className={styles.row} key={r}>
          {row.map((cell, c) => (
            <span
              key={c}
              className={[
                styles.cell,
                styles[cell.color],
                cell.size === 'small' ? styles.small : styles.large,
                cell.inverse ? styles.inverse : '',
                cell.blink ? styles.blink : '',
              ].join(' ')}
            >
              {cell.ch}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}
