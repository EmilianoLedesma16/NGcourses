import styles from './BrandLoader.module.css';

interface Props {
  /** Texto para lectores de pantalla y bajo el logo, p. ej. "Cargando cursos". */
  label?: string;
  /** Ocupa toda la pantalla (por defecto) o solo el espacio del contenedor. */
  fullScreen?: boolean;
}

/** Carga con la marca: el logo de NextGen con un brillo que lo recorre. */
export default function BrandLoader({ label = 'Cargando', fullScreen = true }: Props) {
  return (
    <div className={`${styles.wrap} ${fullScreen ? styles.full : ''}`} role="status" aria-live="polite">
      <span className={styles.logo}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/images/logo.png" alt="" width={56} height={56} />
        <span className={styles.shine} aria-hidden="true" />
      </span>
      <span className={styles.bar} aria-hidden="true"><i /></span>
      <span className={styles.label}>{label}</span>
    </div>
  );
}
