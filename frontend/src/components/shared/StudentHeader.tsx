'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import StudentUserMenu from './StudentUserMenu';
import styles from './StudentHeader.module.css';

const iconProps = {
  xmlns: 'http://www.w3.org/2000/svg',
  fill: 'none',
  viewBox: '0 0 24 24',
  strokeWidth: 1.75,
  stroke: 'currentColor',
  width: 24,
  height: 24,
  'aria-hidden': true,
  className: styles.navIcon,
} as const;

const NAV_ITEMS: { href: string; label: string; icon: ReactNode }[] = [
  {
    href: '/cursos',
    label: 'Dashboard',
    icon: (
      <svg {...iconProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="m2.25 12 8.954-8.955a1.126 1.126 0 0 1 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25" />
      </svg>
    ),
  },
  {
    href: '/mis-cursos',
    label: 'Mi progreso',
    icon: (
      <svg {...iconProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 0 1 3 19.875v-6.75ZM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V8.625ZM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 0 1-1.125-1.125V4.125Z" />
      </svg>
    ),
  },
  {
    href: '/certificados',
    label: 'Certificados',
    icon: (
      <svg {...iconProps}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.26 10.147a60.438 60.438 0 0 0-.491 6.347A48.62 48.62 0 0 1 12 20.904a48.62 48.62 0 0 1 8.232-4.41 60.46 60.46 0 0 0-.491-6.347m-15.482 0a50.636 50.636 0 0 0-2.658-.813A59.906 59.906 0 0 1 12 3.493a59.903 59.903 0 0 1 10.399 5.84c-.896.248-1.783.52-2.658.814m-15.482 0A50.717 50.717 0 0 1 12 13.489a50.702 50.702 0 0 1 7.74-3.342M6.75 15a.75.75 0 1 0 0-1.5.75.75 0 0 0 0 1.5Zm0 0v-3.675A55.378 55.378 0 0 1 12 8.443m-7.007 11.55A5.981 5.981 0 0 0 6.75 15.75v-1.5" />
      </svg>
    ),
  },
];

/**
 * Barra superior del alumno: logo, navegación principal (Dashboard / Mi progreso /
 * Certificados) y menú de usuario. Compartida por las vistas del alumno.
 * En pantallas angostas (≤640px) la navegación pasa a una barra de pestañas fija abajo,
 * con ícono y texto, para no montarse sobre el avatar y quedar al alcance del pulgar.
 */
export default function StudentHeader() {
  const pathname = usePathname();

  return (
    <header className={styles.header}>
      <div className={styles.inner}>
        <Link href="/cursos" className={styles.logo} aria-label="NextGen Course, ir al dashboard">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="" className={styles.logoImg} />
          <span className={styles.logoTitle}>
            <span className={styles.logoBold}>NextGen</span>
            <span className={styles.logoLight}> Course</span>
          </span>
        </Link>

        <nav className={styles.nav} aria-label="Principal">
          {NAV_ITEMS.map((item) => {
            // La ficha de un curso (/curso/...) cuelga del Dashboard, como en el breadcrumb.
            const active =
              pathname === item.href ||
              pathname?.startsWith(`${item.href}/`) ||
              (item.href === '/cursos' && pathname?.startsWith('/curso/'));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={styles.navLink}
                aria-current={active ? 'page' : undefined}
              >
                {item.icon}
                <span className={styles.navLabel}>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className={styles.user}>
          <StudentUserMenu />
        </div>
      </div>
    </header>
  );
}
