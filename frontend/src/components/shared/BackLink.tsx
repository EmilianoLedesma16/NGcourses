import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './BackLink.module.css';

interface BackLinkBaseProps {
  /** Texto visible, p. ej. "Volver a cursos". */
  children: ReactNode;
  /** `onDark`: sobre barras de color (vista previa admin). */
  tone?: 'default' | 'onDark';
  className?: string;
}

type BackLinkProps = BackLinkBaseProps &
  ({ href: string; onClick?: never } | { onClick: () => void; href?: never });

/**
 * Regreso único para toda la app: flecha completa + destino explícito, sin
 * caja. Sustituye los "<" sueltos, las
 * casitas y los estilos inline que había en cada pantalla.
 */
export default function BackLink({ children, tone = 'default', className, ...rest }: BackLinkProps) {
  const cls = [styles.back, tone === 'onDark' ? styles.onDark : '', className ?? ''].filter(Boolean).join(' ');
  const content = (
    <>
      <span className={styles.icon} aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="M11 6l-6 6 6 6" />
        </svg>
      </span>
      <span className={styles.label}>{children}</span>
    </>
  );

  if ('href' in rest && rest.href) {
    return (
      <Link href={rest.href} className={cls}>
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={rest.onClick} className={cls}>
      {content}
    </button>
  );
}
