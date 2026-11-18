'use client';

import Link from 'next/link';
import CourseCover from '@/components/shared/CourseCover';
import type { CourseCard as CourseCardType } from '@/types/course';
import styles from './CourseCard.module.css';

interface CourseCardProps {
  course: CourseCardType;
}

const LEVEL_STEPS: Record<string, number> = {
  Principiante: 1,
  Intermedio: 2,
  Avanzado: 3,
};

function formatPrice(precio: number | null | undefined, moneda?: string): string | null {
  if (precio == null || Number(precio) === 0) return null;
  const valor = Number(precio);
  const entero = Number.isInteger(valor) ? valor.toString() : valor.toFixed(2);
  return `$${entero} ${moneda || 'MXN'}`;
}

/** "Ventas · 1 Prospección" dentro de "Ventas" → "Prospección". */
function sinPrefijo(titulo: string, padre: string): string {
  const t = titulo.trim();
  const p = padre.trim().replace(/\.$/, '');
  const resto = t.toLowerCase().startsWith(p.toLowerCase()) ? t.slice(p.length) : t;
  const limpio = resto.replace(/^\s*[:·\-–—]\s*/, '').replace(/^\d+[.)]?\s+/, '').trim();
  return limpio || t;
}

const MAX_TITULOS = 3;

export default function CourseCard({ course }: CourseCardProps) {
  // Solo se marca el precio cuando hay que pagar: en el catálogo del alumno casi
  // todo es gratuito y un badge "Gratis" en cada tarjeta es ruido.
  // Tampoco se muestra si ya está inscrito o si su empresa lo cubre: no lo va a pagar.
  const priceLabel = course.esGratis || course.enrolled || course.esDeMiOrg
    ? null
    : formatPrice(course.precio, course.moneda);
  const steps = LEVEL_STEPS[course.level] ?? 0;
  const title = course.title.trim().replace(/\.$/, '');
  const isGlobal = course.tipo === 'global';
  const subTotal = course.subcursosTotal ?? 0;
  const subDone = course.subcursosCompletados ?? 0;
  // Inscrito al global, pero el admin agregó cursos después: quedan por inscribir.
  const subNuevos = isGlobal && course.enrolled ? Math.max(0, subTotal - (course.subcursosInscritos ?? subTotal)) : 0;
  const lecTotal = course.leccionesTotal ?? 0;
  const titulos = course.subcursosTitulos ?? [];
  const pct = lecTotal > 0 ? Math.round(((course.leccionesCompletadas ?? 0) / lecTotal) * 100) : 0;

  return (
    <Link href={`/curso/${course.id}`} className={styles.card}>
      <div className={styles.imageContainer}>
        <CourseCover
          src={course.image}
          title={course.title}
          caption={course.category}
          variant="grid"
          tone={course.marca === 'ram' ? 'ram' : 'nextgen'}
        />
        <div className={styles.badges}>
          {isGlobal && subTotal > 0 && (
            <span className={`${styles.badge} ${styles.badgeProgram}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3 3 8l9 5 9-5-9-5Z" />
                <path d="m3 13 9 5 9-5" />
              </svg>
              {subTotal} {subTotal === 1 ? 'curso' : 'cursos'}
            </span>
          )}
          {course.bloqueadoPorLicencia && (
            <span className={`${styles.badge} ${styles.badgeLocked}`}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true">
                <rect x="5" y="11" width="14" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 018 0v4" />
              </svg>
              Requiere licencia
            </span>
          )}
          {course.enrolled && (
            <span className={styles.badge}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.4} aria-hidden="true" className={styles.badgeCheck}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
              </svg>
              Inscrito
            </span>
          )}
          {priceLabel && <span className={styles.badge}>{priceLabel}</span>}
        </div>
      </div>

      <div className={styles.content}>
        {course.tag && <span className={styles.tag}>{course.tag}</span>}

        <h3 className={styles.title}>{title}</h3>

        {isGlobal ? (
          <>
            <p className={styles.meta}>
              Programa · {lecTotal} {lecTotal === 1 ? 'lección' : 'lecciones'}
            </p>
            {titulos.length > 0 && (
              <ol className={styles.programList} aria-label="Cursos del programa">
                {titulos.slice(0, MAX_TITULOS).map((sub, i) => (
                  <li key={`${i}-${sub}`}>
                    <span className={styles.programNum} aria-hidden="true">{i + 1}</span>
                    <span className={styles.programTitle}>{sinPrefijo(sub, course.title)}</span>
                  </li>
                ))}
                {titulos.length > MAX_TITULOS && (
                  <li className={styles.programMore}>
                    y {titulos.length - MAX_TITULOS} {titulos.length - MAX_TITULOS === 1 ? 'curso más' : 'cursos más'}
                  </li>
                )}
              </ol>
            )}
          </>
        ) : (
          course.category && <p className={styles.meta}>{course.category}</p>
        )}

        {isGlobal && course.enrolled && (
          <div className={styles.progressRow}>
            <span
              className={styles.track}
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={pct}
              aria-label={`Avance ${pct} %`}
            >
              <span className={styles.fill} style={{ width: `${pct}%` }} />
            </span>
            <span>{subDone} de {subTotal}</span>
          </div>
        )}

        <div className={styles.footer}>
          {steps > 0 ? (
            <span className={styles.level}>
              <span className={styles.meter} aria-hidden="true">
                {[1, 2, 3].map((i) => (
                  <i key={i} className={i <= steps ? styles.meterOn : undefined} />
                ))}
              </span>
              {course.level}
            </span>
          ) : (
            <span />
          )}

          {course.rating > 0 && (course.reviews ?? 0) > 0 && (
            <span
              className={styles.rating}
              aria-label={`Calificación ${course.rating.toFixed(1)} de 5, ${course.reviews} reseñas`}
            >
              <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <path d="M12 17.3l-6.2 3.7 1.7-7L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.5 4.8 1.7 7z" />
              </svg>
              {course.rating.toFixed(1)} <span className={styles.ratingCount}>({course.reviews})</span>
            </span>
          )}
        </div>
      </div>

      {subNuevos > 0 && (
        <span className={styles.enroll}>
          <span className={styles.enrollHint}>
            {subNuevos === 1 ? '1 curso nuevo en este programa' : `${subNuevos} cursos nuevos en este programa`}
          </span>
          <span className={styles.enrollAction}>
            Inscribirme
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </span>
        </span>
      )}

      {!course.enrolled && !course.bloqueadoPorLicencia && (
        <span className={`${styles.enroll} ${isGlobal ? styles.enrollBundle : ''}`}>
          {isGlobal && subTotal > 0 ? (
            /* Vista previa del avance que tendrá al inscribirse: un segmento por
               curso incluido; al pasar el cursor se "llenan" en cascada. */
            <span className={styles.bundle} aria-hidden="true">
              <span className={styles.segments}>
                {Array.from({ length: Math.min(subTotal, 12) }, (_, i) => (
                  <i key={i} style={{ transitionDelay: `${i * 45}ms` }} />
                ))}
              </span>
            </span>
          ) : (
            <span className={styles.enrollHint}>Empieza a tu ritmo</span>
          )}
          <span className={styles.enrollAction}>
            {isGlobal ? `Inscribirme a los ${subTotal}` : 'Inscribirme'}
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 12h14" />
              <path d="M13 6l6 6-6 6" />
            </svg>
          </span>
        </span>
      )}
    </Link>
  );
}
