import Link from 'next/link';
import type { ReactNode } from 'react';
import BackLink from '@/components/shared/BackLink';
import styles from './LegalPage.module.css';

/**
 * Datos legales en un solo lugar. ANTES DE CONSIDERARLO DEFINITIVO: confirmar con
 * el área legal la razón social y el correo de contacto (ver ncourses.md).
 */
export const LEGAL = {
  responsable: 'NextGen IA',
  plataforma: 'NextGen Course',
  sitio: 'app.nextgenia.lat',
  contacto: 'contacto@nextgenia.lat',
  actualizado: '17 de noviembre de 2026',
};

interface Props {
  title: string;
  intro: ReactNode;
  children: ReactNode;
  /** Enlace a la otra página legal, al pie. */
  sibling: { href: string; label: string };
}

export default function LegalPage({ title, intro, children, sibling }: Props) {
  return (
    <div className={styles.page} data-theme="light">
      <header className={styles.top}>
        <BackLink href="/">Volver al inicio de sesión</BackLink>
      </header>

      <main className={styles.doc}>
        <p className={styles.kicker}>{LEGAL.plataforma}</p>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.updated}>Última actualización: {LEGAL.actualizado}</p>
        <div className={styles.intro}>{intro}</div>
        <article className={styles.body}>{children}</article>
      </main>

      <footer className={styles.foot}>
        <span>
          Dudas: <a href={`mailto:${LEGAL.contacto}`}>{LEGAL.contacto}</a>
        </span>
        <Link href={sibling.href}>{sibling.label}</Link>
      </footer>
    </div>
  );
}
