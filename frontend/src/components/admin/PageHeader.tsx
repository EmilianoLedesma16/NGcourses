import type { ReactNode } from 'react';
import styles from './PageHeader.module.css';
import BackLink from '@/components/shared/BackLink';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** Botones de acción a la derecha (acción principal al final). */
  actions?: ReactNode;
  /** Enlace "volver" solo para pantallas de segundo nivel (editar, detalle). */
  back?: { href: string; label: string };
}

/**
 * Encabezado común de las pantallas de los paneles: título a la izquierda,
 * subtítulo gris y acciones a la derecha. La navegación general vive en la
 * barra lateral, así que no se agregan botones de "Inicio".
 */
export default function PageHeader({ title, subtitle, actions, back }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.text}>
        {back && (
          <BackLink href={back.href} className={styles.back}>
            Volver a {back.label.toLowerCase()}
          </BackLink>
        )}
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  );
}
