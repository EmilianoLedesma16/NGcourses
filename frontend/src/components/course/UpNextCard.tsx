'use client';

import styles from './UpNextCard.module.css';

interface UpNextCardProps {
  /** "Siguiente lección", "Siguiente módulo", "Siguiente curso". */
  label: string;
  title: string;
  /** Contexto extra (p. ej. el nombre del módulo nuevo). */
  detail?: string | null;
  secondsLeft: number;
  totalSeconds: number;
  onGo: () => void;
  onCancel: () => void;
}

/** Aviso flotante con cuenta atrás para pasar solo a lo que sigue. */
export default function UpNextCard({ label, title, detail, secondsLeft, totalSeconds, onGo, onCancel }: UpNextCardProps) {
  const r = 18;
  const c = 2 * Math.PI * r;
  const frac = Math.max(0, Math.min(1, secondsLeft / totalSeconds));
  return (
    <div className={styles.card} role="status" aria-live="polite">
      <div className={styles.ring} aria-hidden="true">
        <svg viewBox="0 0 44 44">
          <circle cx="22" cy="22" r={r} className={styles.ringTrack} />
          <circle
            cx="22"
            cy="22"
            r={r}
            className={styles.ringFill}
            strokeDasharray={c}
            strokeDashoffset={c * (1 - frac)}
          />
        </svg>
        <span>{secondsLeft}</span>
      </div>
      <div className={styles.text}>
        <p className={styles.done}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          Completada · {label} en {secondsLeft} s
        </p>
        <p className={styles.title}>{title}</p>
        {detail && <p className={styles.detail}>{detail}</p>}
      </div>
      <div className={styles.actions}>
        <button type="button" className={styles.go} onClick={onGo}>Ver ahora</button>
        <button type="button" className={styles.cancel} onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}
