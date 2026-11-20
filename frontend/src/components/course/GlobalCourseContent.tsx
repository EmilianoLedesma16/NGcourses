'use client';

import { useCallback, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CourseCover from '@/components/shared/CourseCover';
import StudentHeader from '@/components/shared/StudentHeader';
import Toast, { type ToastData } from '@/components/shared/Toast';
import ProcessCoursePanel from './ProcessCoursePanel';
import { cleanTitle, plural, sinPrefijo } from './CourseSyllabus';
import styles from './CourseInfoContent.module.css';
import own from './GlobalCourseContent.module.css';
import BackLink from '@/components/shared/BackLink';

export { sinPrefijo };

/** Un curso dentro del curso global, con el avance del alumno (GET /cursos/{id}). */
export interface Subcurso {
  id: string;
  titulo: string;
  estado: string;
  total_modulos: number;
  total_lecciones: number;
  lecciones_completadas: number;
  inscrito: boolean;
  completado: boolean;
  modulos: string[];
}

export interface GlobalCourse {
  id: string;
  titulo: string;
  descripcion: string;
  nivel: string;
  image: string;
  marca?: 'ram' | 'nextgen';
  esDeMiOrg?: boolean;
  puedeInscribirse?: boolean;
  subcursos: Subcurso[];
  leccionesTotal: number;
  leccionesCompletadas: number;
  subcursosCompletados: number;
}

interface Props {
  course: GlobalCourse;
  /** Curso del proceso que se muestra (viene en la URL como ?curso=). */
  selectedId?: string | null;
  onSelect?: (subId: string) => void;
  onInscribirse?: () => void;
  enrollLoading?: boolean;
  enrollError?: string | null;
  backHref?: string;
  /** Vista del alumno real (barra del alumno y miga de pan al Dashboard). */
  showUserMenu?: boolean;
  /** Supervisor o admin: solo lectura, cada curso se abre en modo revisión. */
  viewOnlyMode?: boolean;
  /** Algo cambió en el avance: la página vuelve a pedir los contadores del proceso. */
  onProgressChange?: () => void;
}

const LEVEL_STEPS: Record<string, number> = { Principiante: 1, Intermedio: 2, Avanzado: 3 };

const Check = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);

const ArrowIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export default function GlobalCourseContent({
  course,
  selectedId,
  onSelect,
  onInscribirse,
  enrollLoading,
  enrollError,
  backHref = '/cursos',
  showUserMenu,
  viewOnlyMode = false,
  onProgressChange,
}: Props) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastData | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const tabsRef = useRef<HTMLDivElement>(null);

  const subs = course.subcursos;
  const enrolled = subs.some((s) => s.inscrito);
  // El siguiente curso: el primero inscrito que no está terminado.
  const nextIndex = enrolled ? subs.findIndex((s) => s.inscrito && !s.completado) : -1;
  const next = nextIndex >= 0 ? subs[nextIndex] : null;
  // Cursos que se agregaron al global después de que el alumno se inscribió.
  const nuevos = enrolled ? subs.filter((s) => !s.inscrito).length : 0;
  const puedeInscribirse = course.puedeInscribirse !== false && Boolean(onInscribirse);
  const puedeSumarNuevos = nuevos > 0 && puedeInscribirse;
  const started = course.leccionesCompletadas > 0;
  const pct = course.leccionesTotal > 0
    ? Math.round((course.leccionesCompletadas / course.leccionesTotal) * 100)
    : 0;

  // Curso que muestra el selector: el de la URL, si no el siguiente, si no el primero.
  const selectedIndex = Math.max(
    0,
    subs.findIndex((s) => s.id === selectedId) >= 0
      ? subs.findIndex((s) => s.id === selectedId)
      : nextIndex >= 0 ? nextIndex : 0,
  );
  const selected = subs[selectedIndex] ?? null;

  const totalModulos = subs.reduce((a, s) => a + s.total_modulos, 0);
  const levelSteps = LEVEL_STEPS[course.nivel] ?? 0;

  const seleccionar = (i: number, foco = false) => {
    const s = subs[i];
    if (!s) return;
    onSelect?.(s.id);
    if (foco) tabsRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]')[i]?.focus();
  };

  // Flechas izquierda/derecha entre pestañas (patrón de pestañas accesibles).
  const onTabsKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return;
    e.preventDefault();
    const last = subs.length - 1;
    const i = e.key === 'Home' ? 0
      : e.key === 'End' ? last
        : e.key === 'ArrowRight' ? Math.min(last, selectedIndex + 1)
          : Math.max(0, selectedIndex - 1);
    seleccionar(i, true);
  };

  const avisarSinAcceso = (s: { inscrito: boolean }) => {
    const id = Date.now();
    if (enrolled && !s.inscrito) {
      setToast({
        id,
        title: 'Este curso se agregó después de tu inscripción',
        message: 'Inscríbete a los cursos nuevos para ver sus lecciones.',
        ...(puedeSumarNuevos ? { actionLabel: 'Inscribirme', onAction: onInscribirse } : {}),
      });
    } else if (puedeInscribirse) {
      setToast({
        id,
        title: 'Inscríbete al proceso para ver esta lección',
        message: `Te inscribe en los ${plural(subs.length, 'curso', 'cursos')} de ${cleanTitle(course.titulo)}.`,
        actionLabel: 'Inscribirme',
        onAction: onInscribirse,
      });
    } else {
      setToast({ id, title: 'Este proceso no está disponible', message: 'Tu organización no lo ha adquirido.' });
    }
  };

  let actionBody: ReactNode;
  if (viewOnlyMode) {
    actionBody = (
      <p className={styles.nextUp}>
        Proceso con {plural(subs.length, 'curso', 'cursos')}. Elige un curso abajo para revisar su contenido.
      </p>
    );
  } else if (enrolled) {
    actionBody = (
      <>
        <div>
          <div className={styles.progressLabel}>
            <span>Tu avance en el proceso</span>
            <b>{pct} %</b>
          </div>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Avance del proceso"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={styles.fill} style={{ width: `${pct}%` }} />
          </div>
          <p className={styles.progressSub}>
            {course.leccionesCompletadas} de {course.leccionesTotal} lecciones · {course.subcursosCompletados} de {plural(subs.length, 'curso terminado', 'cursos terminados')}
          </p>
        </div>
        {next ? (
          <>
            <p className={styles.nextUp}>
              {started ? 'Continúa con' : 'Empieza con'}
              <b>{sinPrefijo(next.titulo, course.titulo)}</b>
            </p>
            <Link href={`/curso/${next.id}/videos`} className={`${styles.btn} ${styles.btnPrimary}`}>
              {started ? 'Continuar' : 'Empezar'}
              {ArrowIcon}
            </Link>
          </>
        ) : nuevos === 0 ? (
          <p className={styles.nextUp}>
            Terminaste todos los cursos de {cleanTitle(course.titulo)}.
          </p>
        ) : null}
        {puedeSumarNuevos && (
          <div className={own.nuevos} role="status">
            <p>
              {nuevos === 1
                ? 'Se agregó 1 curso nuevo a este proceso.'
                : `Se agregaron ${nuevos} cursos nuevos a este proceso.`}
            </p>
            <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onInscribirse} disabled={enrollLoading}>
              {enrollLoading ? 'Inscribiendo…' : nuevos === 1 ? 'Inscribirme al curso nuevo' : `Inscribirme a los ${nuevos} nuevos`}
            </button>
            {enrollError && <p className={own.error} role="alert">{enrollError}</p>}
          </div>
        )}
      </>
    );
  } else if (puedeInscribirse) {
    actionBody = (
      <>
        <div className={styles.price}>
          <b>{plural(subs.length, 'curso', 'cursos')}</b>
          <span>{plural(course.leccionesTotal, 'lección', 'lecciones')}</span>
        </div>
        <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onInscribirse} disabled={enrollLoading}>
          {enrollLoading ? 'Inscribiendo…' : 'Inscribirme'}
        </button>
        {enrollError && <p className={own.error} role="alert">{enrollError}</p>}
        <ul className={styles.includes}>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
            Te inscribe en los {plural(subs.length, 'curso', 'cursos')}
          </li>
          <li>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><circle cx="12" cy="9" r="5" /><path strokeLinejoin="round" d="M9 13.5L8 21l4-2 4 2-1-7.5" /></svg>
            Un certificado por cada curso
          </li>
        </ul>
      </>
    );
  } else {
    actionBody = (
      <div className={styles.lockedBlock} role="status">
        <h3 className={styles.lockedTitle}>Curso no disponible</h3>
        <p className={styles.lockedMessage}>
          Tu organización no ha adquirido este curso. Contacta a tu administrador para más información.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {showUserMenu ? (
        <StudentHeader />
      ) : (
        <header className={styles.header}>
          <div className={styles.headerContent}>
            <Link href={backHref} className={styles.logoLink}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src="/images/logo.png" alt="NextGen" className={styles.logoImg} />
              <span className={styles.logoTitle}>
                <span className={styles.logoBold}>NextGen</span>
                <span className={styles.logoLight}> Course</span>
              </span>
            </Link>
          </div>
        </header>
      )}

      <main className={styles.page}>
        {showUserMenu ? (
          <nav className={styles.crumbs} aria-label="Ruta">
            <Link href={backHref}>Dashboard</Link>
            {course.esDeMiOrg && (
              <>
                <span aria-hidden="true">/</span>
                <span>Cursos RAM asignados</span>
              </>
            )}
          </nav>
        ) : (
          <BackLink href={backHref} className={styles.backLink}>Volver</BackLink>
        )}

        <div className={styles.layout}>
          <section className={styles.hero} aria-labelledby="course-title">
            <p className={styles.eyebrow}>{course.marca === 'nextgen' ? 'NextGenIA' : 'RAM'} · Proceso</p>
            <h1 id="course-title" className={styles.courseTitle}>{cleanTitle(course.titulo)}</h1>
            {course.descripcion && <p className={styles.lead}>{course.descripcion}</p>}
            <div className={styles.facts}>
              {levelSteps > 0 && (
                <span className={styles.fact}>
                  <span className={styles.meter} aria-hidden="true">
                    {[1, 2, 3].map((i) => <i key={i} className={i <= levelSteps ? styles.meterOn : undefined} />)}
                  </span>
                  <b>{course.nivel}</b>
                </span>
              )}
              <span className={styles.fact}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2" /><path d="M4 9h16M9 9v11" /></svg>
                <b>{subs.length}</b> {subs.length === 1 ? 'curso' : 'cursos'}
              </span>
              {totalModulos > 0 && (
                <span className={styles.fact}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" /></svg>
                  <b>{totalModulos}</b> {totalModulos === 1 ? 'módulo' : 'módulos'}
                </span>
              )}
              <span className={styles.fact}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M10 9.5v5l4-2.5z" fill="currentColor" /></svg>
                <b>{course.leccionesTotal}</b> {course.leccionesTotal === 1 ? 'lección' : 'lecciones'}
              </span>
            </div>
          </section>

          <aside className={styles.aside} aria-label={enrolled ? 'Tu avance' : 'Inscripción'}>
            <div className={styles.actionCard}>
              <div className={styles.cover}>
                <CourseCover
                  src={course.image}
                  title={course.titulo}
                  variant="grid"
                  tone={course.marca === 'ram' ? 'ram' : 'nextgen'}
                />
              </div>
              <div className={styles.actionBody}>{actionBody}</div>
            </div>
          </aside>

          <div className={styles.body}>
            <section className={styles.section} aria-labelledby="subcursos-title">
              <div className={styles.sectionHead}>
                <h2 id="subcursos-title" className={styles.sectionTitle}>Cursos de {cleanTitle(course.titulo)}</h2>
                {subs.length > 1 && <span className={own.stepsHint}>Elige un curso para ver su contenido</span>}
              </div>
              {subs.length === 0 ? (
                <p className={styles.sectionText}>Los cursos se publicarán pronto.</p>
              ) : (
                <>
                  {/* Selector de cursos del proceso: una ruta de pasos (1 → 2 → 3). */}
                  <div
                    ref={tabsRef}
                    className={own.steps}
                    role="tablist"
                    aria-label={`Cursos de ${cleanTitle(course.titulo)}`}
                    onKeyDown={onTabsKey}
                  >
                    {subs.map((s, i) => {
                      const activo = i === selectedIndex;
                      const conAvance = s.inscrito && !viewOnlyMode;
                      const subPct = s.total_lecciones ? Math.round((s.lecciones_completadas / s.total_lecciones) * 100) : 0;
                      const estado = !conAvance
                        ? plural(s.total_lecciones, 'lección', 'lecciones')
                        : s.completado
                          ? 'Terminado'
                          : i === nextIndex
                            ? `Siguiente · ${s.lecciones_completadas}/${s.total_lecciones}`
                            : `${s.lecciones_completadas}/${s.total_lecciones}`;
                      return (
                        <button
                          key={s.id}
                          type="button"
                          role="tab"
                          id={`tab-${s.id}`}
                          aria-selected={activo}
                          aria-controls={`panel-${s.id}`}
                          tabIndex={activo ? 0 : -1}
                          className={`${own.step} ${activo ? own.stepActive : ''} ${conAvance && s.completado ? own.stepDone : ''} ${conAvance && i === nextIndex ? own.stepNext : ''}`}
                          onClick={() => seleccionar(i)}
                        >
                          <span className={own.stepDot} aria-hidden="true">
                            {conAvance && s.completado ? Check : i + 1}
                          </span>
                          <span className={own.stepText}>
                            <span className={own.stepTitle}>{sinPrefijo(s.titulo, course.titulo)}</span>
                            <span className={own.stepMeta}>{estado}</span>
                          </span>
                          {conAvance && !s.completado && subPct > 0 && (
                            <span className={own.stepBar} aria-hidden="true">
                              <span style={{ width: `${subPct}%` }} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>

                  {selected && (
                    <div role="tabpanel" id={`panel-${selected.id}`} aria-labelledby={`tab-${selected.id}`}>
                      <ProcessCoursePanel
                        key={selected.id}
                        sub={selected}
                        titulo={sinPrefijo(selected.titulo, course.titulo)}
                        index={selectedIndex}
                        total={subs.length}
                        viewOnlyMode={viewOnlyMode}
                        onProgressChange={onProgressChange}
                        onLockedLesson={avisarSinAcceso}
                        onLessonOpen={(href) => router.push(href)}
                      />
                      {subs.length > 1 && (
                        <nav className={own.pager} aria-label="Cambiar de curso">
                          {selectedIndex > 0 ? (
                            <button type="button" className={own.pagerBtn} onClick={() => { seleccionar(selectedIndex - 1); tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                              <span className={own.pagerLabel}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" /></svg>Curso anterior</span>
                              <span className={own.pagerTitle}>{sinPrefijo(subs[selectedIndex - 1].titulo, course.titulo)}</span>
                            </button>
                          ) : <span />}
                          {selectedIndex < subs.length - 1 && (
                            <button type="button" className={`${own.pagerBtn} ${own.pagerNext}`} onClick={() => { seleccionar(selectedIndex + 1); tabsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>
                              <span className={own.pagerLabel}>Siguiente curso<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" /></svg></span>
                              <span className={own.pagerTitle}>{sinPrefijo(subs[selectedIndex + 1].titulo, course.titulo)}</span>
                            </button>
                          )}
                        </nav>
                      )}
                    </div>
                  )}
                </>
              )}
            </section>
          </div>
        </div>
      </main>
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
