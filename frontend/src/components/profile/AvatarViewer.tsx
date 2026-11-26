'use client';

import { useEffect, useRef } from 'react';
import styles from './AvatarViewer.module.css';

interface AvatarViewerProps {
  open: boolean;
  src: string;
  /** Nombre de la persona: título del visor y texto alternativo de la foto. */
  name: string;
  onClose: () => void;
  /** Si llega, el visor ofrece "Cambiar foto" (abre el selector de archivo). */
  onChange?: () => void;
}

/**
 * Visor de la foto de perfil a pantalla completa. Usa <dialog> nativo: atrapa el
 * foco, se cierra con Esc y queda encima de todo sin pelear con z-index.
 */
export default function AvatarViewer({ open, src, name, onClose, onChange }: AvatarViewerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    else if (!open && dlg.open) dlg.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      className={styles.dialog}
      aria-labelledby="avatar-viewer-titulo"
      onClose={onClose}
      // Tocar fuera de la foto (el fondo oscuro) también cierra.
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className={styles.bar}>
        <h2 id="avatar-viewer-titulo" className={styles.title}>{name}</h2>
        <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
            <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>
      </div>

      <div className={styles.stage} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt={`Foto de perfil de ${name}`} className={styles.photo} />
      </div>

      {onChange && (
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.change}
            onClick={() => { onClose(); onChange(); }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
            Cambiar foto
          </button>
        </div>
      )}
    </dialog>
  );
}
