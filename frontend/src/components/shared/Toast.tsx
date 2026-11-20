'use client';

import { useEffect } from 'react';
import styles from './Toast.module.css';

export interface ToastData {
  /** Cambia en cada aviso para reiniciar el temporizador aunque el texto se repita. */
  id: number;
  title: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
}

interface ToastProps {
  toast: ToastData | null;
  onClose: () => void;
  /** Milisegundos antes de cerrarse solo. */
  duration?: number;
}

/** Aviso flotante abajo al centro, con acción opcional. Se cierra solo. */
export default function Toast({ toast, onClose, duration = 6000 }: ToastProps) {
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(onClose, duration);
    return () => window.clearTimeout(t);
  }, [toast, onClose, duration]);

  return (
    <div className={styles.region} aria-live="polite" role="status">
      {toast && (
        <div key={toast.id} className={styles.toast}>
          <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
            <circle cx="12" cy="12" r="9" />
            <path strokeLinecap="round" d="M12 11v5M12 8h.01" />
          </svg>
          <div className={styles.text}>
            <p className={styles.title}>{toast.title}</p>
            {toast.message && <p className={styles.message}>{toast.message}</p>}
          </div>
          {toast.actionLabel && toast.onAction && (
            <button
              type="button"
              className={styles.action}
              onClick={() => {
                toast.onAction?.();
                onClose();
              }}
            >
              {toast.actionLabel}
            </button>
          )}
          <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar aviso">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
