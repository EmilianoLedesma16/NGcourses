import type { ReactNode } from 'react';

/**
 * Avatar por defecto para quien no ha subido foto: un animal ilustrado (dibujo
 * propio en SVG, sin derechos de terceros). Siempre el mismo animal para la misma
 * persona: se elige con un hash de `seed` (id o correo).
 */

interface Animal {
  nombre: string;
  fondo: string;
  dibujo: ReactNode;
}

const OJO = '#2b2b2b';

const ANIMALES: Animal[] = [
  {
    nombre: 'Zorro',
    fondo: '#fde7d6',
    dibujo: (
      <>
        <path d="M12 22 20 8l8 12h8l8-12 8 14-6 22-14 10-14-10Z" fill="#e8743b" />
        <path d="m18 36 14 18 14-18-8 4-6 6-6-6Z" fill="#fff" />
        <path d="M20 12l5 8h-7Z M44 12l-5 8h7Z" fill="#b8532a" />
        <circle cx="25" cy="32" r="2.4" fill={OJO} />
        <circle cx="39" cy="32" r="2.4" fill={OJO} />
        <circle cx="32" cy="49" r="2.6" fill={OJO} />
      </>
    ),
  },
  {
    nombre: 'Búho',
    fondo: '#e3ecf7',
    dibujo: (
      <>
        <path d="M14 18l8 6M50 18l-8 6" stroke="#5e4532" strokeWidth="4" strokeLinecap="round" />
        <ellipse cx="32" cy="38" rx="19" ry="20" fill="#7a5c43" />
        <ellipse cx="32" cy="46" rx="11" ry="10" fill="#a8896c" />
        <circle cx="24" cy="32" r="7.5" fill="#fff" />
        <circle cx="40" cy="32" r="7.5" fill="#fff" />
        <circle cx="24" cy="32" r="3.2" fill={OJO} />
        <circle cx="40" cy="32" r="3.2" fill={OJO} />
        <path d="M29.5 38h5L32 43Z" fill="#f2a541" />
      </>
    ),
  },
  {
    nombre: 'Gato',
    fondo: '#ede7f6',
    dibujo: (
      <>
        <path d="M15 30 17 11l13 10M49 30 47 11 34 21" fill="#8c7b6b" />
        <circle cx="32" cy="37" r="18" fill="#8c7b6b" />
        <path d="M18 14l3 7h-4Z M46 14l-3 7h4Z" fill="#f4b6c2" />
        <ellipse cx="25" cy="34" rx="3" ry="3.6" fill="#7cb342" />
        <ellipse cx="39" cy="34" rx="3" ry="3.6" fill="#7cb342" />
        <ellipse cx="25" cy="34" rx="1.1" ry="2.6" fill={OJO} />
        <ellipse cx="39" cy="34" rx="1.1" ry="2.6" fill={OJO} />
        <path d="M30 41h4l-2 2.4Z" fill="#f48fb1" />
        <path d="M14 40l9 1M14 45l9-2M50 40l-9 1M50 45l-9-2" stroke="#e8e0d8" strokeWidth="1.2" strokeLinecap="round" />
      </>
    ),
  },
  {
    nombre: 'Oso',
    fondo: '#f3eadf',
    dibujo: (
      <>
        <circle cx="17" cy="20" r="7.5" fill="#8b5e3c" />
        <circle cx="47" cy="20" r="7.5" fill="#8b5e3c" />
        <circle cx="17" cy="20" r="3.5" fill="#c99a70" />
        <circle cx="47" cy="20" r="3.5" fill="#c99a70" />
        <circle cx="32" cy="36" r="19" fill="#8b5e3c" />
        <ellipse cx="32" cy="43" rx="9.5" ry="7.5" fill="#d9b38c" />
        <ellipse cx="32" cy="39.5" rx="3.4" ry="2.4" fill="#3b2416" />
        <circle cx="24.5" cy="31" r="2.4" fill={OJO} />
        <circle cx="39.5" cy="31" r="2.4" fill={OJO} />
      </>
    ),
  },
  {
    nombre: 'Panda',
    fondo: '#e6f4ea',
    dibujo: (
      <>
        <circle cx="17" cy="20" r="7" fill="#262626" />
        <circle cx="47" cy="20" r="7" fill="#262626" />
        <circle cx="32" cy="36" r="19" fill="#fff" />
        <ellipse cx="24" cy="34" rx="5" ry="6.5" fill="#262626" transform="rotate(-25 24 34)" />
        <ellipse cx="40" cy="34" rx="5" ry="6.5" fill="#262626" transform="rotate(25 40 34)" />
        <circle cx="24.5" cy="33.5" r="1.8" fill="#fff" />
        <circle cx="39.5" cy="33.5" r="1.8" fill="#fff" />
        <ellipse cx="32" cy="42" rx="3" ry="2.2" fill="#262626" />
      </>
    ),
  },
  {
    nombre: 'Conejo',
    fondo: '#fce4ec',
    dibujo: (
      <>
        <ellipse cx="24" cy="17" rx="5.5" ry="13" fill="#f5f5f5" />
        <ellipse cx="40" cy="17" rx="5.5" ry="13" fill="#f5f5f5" />
        <ellipse cx="24" cy="18" rx="2.5" ry="9" fill="#f8bbd0" />
        <ellipse cx="40" cy="18" rx="2.5" ry="9" fill="#f8bbd0" />
        <circle cx="32" cy="41" r="16" fill="#f5f5f5" />
        <circle cx="26" cy="38" r="2.2" fill={OJO} />
        <circle cx="38" cy="38" r="2.2" fill={OJO} />
        <path d="M30 44h4l-2 2.2Z" fill="#f48fb1" />
        <circle cx="22" cy="45" r="2.6" fill="#f8bbd0" opacity=".7" />
        <circle cx="42" cy="45" r="2.6" fill="#f8bbd0" opacity=".7" />
      </>
    ),
  },
  {
    nombre: 'Pingüino',
    fondo: '#e0f2f1',
    dibujo: (
      <>
        <ellipse cx="32" cy="38" rx="18" ry="21" fill="#263238" />
        <ellipse cx="32" cy="42" rx="12" ry="15" fill="#fff" />
        <circle cx="26.5" cy="33" r="2.2" fill={OJO} />
        <circle cx="37.5" cy="33" r="2.2" fill={OJO} />
        <path d="M28.5 37.5h7L32 42Z" fill="#ffb300" />
      </>
    ),
  },
  {
    nombre: 'Koala',
    fondo: '#eceff1',
    dibujo: (
      <>
        <circle cx="15" cy="26" r="9" fill="#90a4ae" />
        <circle cx="49" cy="26" r="9" fill="#90a4ae" />
        <circle cx="15" cy="26" r="5" fill="#cfd8dc" />
        <circle cx="49" cy="26" r="5" fill="#cfd8dc" />
        <circle cx="32" cy="37" r="17" fill="#90a4ae" />
        <ellipse cx="32" cy="40" rx="4.5" ry="6" fill="#37474f" />
        <circle cx="25" cy="33" r="2.2" fill={OJO} />
        <circle cx="39" cy="33" r="2.2" fill={OJO} />
      </>
    ),
  },
  {
    nombre: 'Ajolote',
    fondo: '#fff0f3',
    dibujo: (
      <>
        <path d="M14 26l-6-5M13 33H5M14 40l-6 5M50 26l6-5M51 33h8M50 40l6 5" stroke="#e57399" strokeWidth="3.2" strokeLinecap="round" />
        <ellipse cx="32" cy="35" rx="19" ry="15" fill="#f7a8c4" />
        <circle cx="24" cy="32" r="2.4" fill={OJO} />
        <circle cx="40" cy="32" r="2.4" fill={OJO} />
        <path d="M27 39q5 4 10 0" stroke={OJO} strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <circle cx="21" cy="37" r="2.2" fill="#f48fb1" />
        <circle cx="43" cy="37" r="2.2" fill="#f48fb1" />
      </>
    ),
  },
];

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function animalDe(seed: string): Animal {
  return ANIMALES[hash(seed || 'nextgen') % ANIMALES.length];
}

interface Props {
  /** Id o correo del usuario: determina el animal. */
  seed: string;
  className?: string;
  /** Texto accesible; por defecto el nombre del animal. */
  label?: string;
}

export default function AnimalAvatar({ seed, className, label }: Props) {
  const a = animalDe(seed);
  return (
    <svg
      viewBox="0 0 64 64"
      className={className}
      role="img"
      aria-label={label ?? `Avatar: ${a.nombre}`}
      style={{ display: 'block', width: '100%', height: '100%' }}
    >
      <title>{a.nombre}</title>
      <rect width="64" height="64" fill={a.fondo} />
      {a.dibujo}
    </svg>
  );
}
