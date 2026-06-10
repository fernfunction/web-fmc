import { useFmcStore } from '../../fmc/store';
import styles from './annunciators.module.css';

export function Annunciators({ side }: { side: 'left' | 'right' }) {
  const mod = useFmcStore((s) => s.mod);
  const messages = useFmcStore((s) => s.messages);
  const offsetActive = useFmcStore((s) => Boolean(s.active.offset?.active));

  const items =
    side === 'left'
      ? [
          { label: 'DSPY', lit: mod !== null },
          { label: 'FAIL', lit: false },
        ]
      : [
          { label: 'MSG', lit: messages.length > 0 },
          { label: 'OFST', lit: offsetActive },
        ];

  return (
    <div className={styles.column}>
      {items.map((a) => (
        <div key={a.label} className={`${styles.ann} ${a.lit ? styles.lit : ''}`}>
          {a.label}
        </div>
      ))}
    </div>
  );
}
