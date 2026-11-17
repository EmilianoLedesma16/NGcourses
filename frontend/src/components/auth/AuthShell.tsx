import Link from 'next/link';
import type { ReactNode } from 'react';
import BackLink from '@/components/shared/BackLink';
import styles from './AuthShell.module.css';

interface Props {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
  /** Muestra "Volver al inicio de sesión" arriba a la izquierda. */
  back?: boolean;
  /** Ícono de estado sobre el título (éxito, aviso, error). */
  status?: 'success' | 'warning' | 'error';
}

const ICONS = {
  success: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  warning: <><path d="M12 8v5" /><path d="M12 16.5h.01" /><circle cx="12" cy="12" r="9" /></>,
  error: <path d="M7 7l10 10M17 7L7 17" />,
};

/**
 * Pantallas públicas de acceso (olvidé contraseña, restablecer, activar,
 * invitación) con el mismo lenguaje que el panel del login: fondo neutro,
 * tarjeta blanca con borde fino, campos y botón idénticos. Siempre en tema claro.
 */
export default function AuthShell({ title, subtitle, children, back = true, status }: Props) {
  return (
    <div className={styles.page} data-theme="light">
      <header className={styles.top}>
        {back && <BackLink href="/">Volver al inicio de sesión</BackLink>}
      </header>

      <main className={styles.main}>
        <div className={styles.column}>
          <section className={styles.card}>
            <Link href="/" className={styles.brand} aria-label="NextGen Course, ir al inicio de sesión">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.png" alt="" width={28} height={28} />
              <span><b>NextGen</b> Course</span>
            </Link>
            {status && (
              <span className={`${styles.status} ${styles[status]}`} aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  {ICONS[status]}
                </svg>
              </span>
            )}
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            {children}
          </section>
        </div>
      </main>
    </div>
  );
}
