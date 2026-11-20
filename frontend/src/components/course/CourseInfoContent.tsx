'use client';

import { useCallback, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import CourseCover from '@/components/shared/CourseCover';
import StudentHeader from '@/components/shared/StudentHeader';
import Toast, { type ToastData } from '@/components/shared/Toast';
import type { CourseInfo, SyllabusLesson } from '@/types/course';
import PayPalCheckout from './PayPalCheckout';
import CourseReviews from './CourseReviews';
import CourseSyllabus, {
  KIND_LABEL,
  KindIcon,
  cleanTitle,
  countKinds,
  findNextLesson,
  formatTotal,
  plural,
  sinPrefijo,
  type LessonKind,
} from './CourseSyllabus';
import styles from './CourseInfoContent.module.css';
import BackLink from '@/components/shared/BackLink';

/** Proceso (curso global) al que pertenece un curso, y su lugar en él. */
export interface CoursePadre {
  id: string;
  titulo: string;
  posicion: number;
  total: number;
  siguiente_id?: string | null;
  siguiente_titulo?: string | null;
  /** Todos los cursos del proceso, en orden, incluido el actual. */
  hermanos?: { id: string; titulo: string }[];
}

/** Avance del alumno inscrito (GET /progreso/curso/{id}). */
export interface CourseProgress {
  completedLessonIds: string[];
  completed: number;
  total: number;
  pct: number;
}

interface CourseInfoContentProps {
  course: CourseInfo;
  isEnrolled?: boolean;
  progress?: CourseProgress | null;
  onInscribirse?: () => void;
  onPaymentSuccess?: () => void;
  enrollLoading?: boolean;
  backHref?: string;
  bloqueadoPorLicencia?: boolean;
  viewOnlyMode?: boolean;
  viewCourseHref?: string;
  viewCourseLabel?: string;
  /** Vista del alumno real: barra de navegación del alumno y ruta al Dashboard. */
  showUserMenu?: boolean;
  /**
   * Proceso al que pertenece (solo lo usa la vista previa del admin). El alumno
   * ve los cursos de un proceso dentro de la página del proceso.
   */
  padre?: CoursePadre | null;
}

const LEVEL_STEPS: Record<string, number> = { Principiante: 1, Intermedio: 2, Avanzado: 3 };

function formatPrice(precio: number | null | undefined, moneda?: string): { label: string; isFree: boolean } {
  if (precio == null || Number(precio) === 0) return { label: 'Gratis', isFree: true };
  const valor = Number(precio);
  const entero = Number.isInteger(valor) ? valor.toString() : valor.toFixed(2);
  return { label: `$${entero} ${moneda || 'MXN'}`, isFree: false };
}

/** Agrega un parámetro a un href que puede o no traer ya "?". */
export const withParam = (href: string, key: string, value: string) =>
  `${href}${href.includes('?') ? '&' : '?'}${key}=${encodeURIComponent(value)}`;

export default function CourseInfoContent({
  course,
  isEnrolled,
  progress,
  onInscribirse,
  onPaymentSuccess,
  enrollLoading,
  backHref = '/cursos',
  bloqueadoPorLicencia,
  viewOnlyMode = false,
  viewCourseHref,
  viewCourseLabel = 'Ver curso',
  showUserMenu,
  padre = null,
}: CourseInfoContentProps) {
  const router = useRouter();
  const [toast, setToast] = useState<ToastData | null>(null);
  const closeToast = useCallback(() => setToast(null), []);
  const displayTitle = padre ? sinPrefijo(course.title, padre.titulo) : cleanTitle(course.title);
  const price = formatPrice(course.precio, course.moneda);
  // Solo se cobra un curso NextGen con precio al que el alumno no tiene acceso por
  // otra vía. Si su empresa lo licenció o ya lo pagó (puedeInscribirse), se inscribe
  // sin pagar; un curso RAM nunca se vende (su acceso es por licencia).
  const requierePago = !price.isFree
    && course.marca !== 'ram'
    && !course.esDeMiOrg
    && !course.puedeInscribirse;
  const completedIds = new Set(progress?.completedLessonIds ?? []);
  const next = isEnrolled ? findNextLesson(course.syllabus, completedIds) : null;
  const nextLessonTitle = next ? cleanTitle(next.lesson.title) : null;
  const [descExpanded, setDescExpanded] = useState(false);
  const reviewHref = viewCourseHref ?? `/curso/${course.id}/videos?from=supervisor`;

  // Clic en una lección del temario: quien tiene acceso entra directo a esa
  // lección; a quien no, se le dice qué hacer para verla.
  const handleLessonClick = (lesson: SyllabusLesson) => {
    if (!lesson.id) return;
    if (viewOnlyMode) {
      router.push(withParam(reviewHref, 'leccion', lesson.id));
      return;
    }
    if (isEnrolled) {
      router.push(`/curso/${course.id}/videos?leccion=${lesson.id}`);
      return;
    }
    const id = Date.now();
    if (requierePago) {
      setToast({ id, title: 'Compra el curso para ver esta lección', message: `Acceso completo por ${price.label}.` });
    } else if (bloqueadoPorLicencia) {
      setToast({ id, title: 'Este curso no está disponible', message: 'Tu organización no lo ha adquirido.' });
    } else if (onInscribirse) {
      setToast({
        id,
        title: 'Inscríbete para ver esta lección',
        message: 'Es gratis y empiezas al instante.',
        actionLabel: 'Inscribirme',
        onAction: onInscribirse,
      });
    }
  };

  const lessonsSec = course.syllabus.reduce(
    (acc, m) => acc + m.lessons.reduce((a, l) => a + (l.durationSec ?? 0), 0),
    0,
  );
  const durationLabel = lessonsSec > 0 ? formatTotal(lessonsSec) : course.duration && course.duration !== '0h' ? course.duration : null;
  const outcomes = course.learningOutcomes.filter((o) => o && o.trim());
  const requirements = (course.requirements ?? '')
    .split('\n')
    .map((r) => r.trim())
    .filter(Boolean);
  const hasReviews = !!course.reviewsCount && course.reviewsCount > 0;
  // La reseña (estrellas y comentario) se pide solo al terminar el curso; antes
  // el alumno ve el puntaje global y las reseñas, pero no el formulario.
  const isStudent = Boolean(isEnrolled) && !viewOnlyMode;
  const courseDone = !!progress && progress.total > 0 && progress.completed >= progress.total;
  const kinds = countKinds(course.syllabus.flatMap((m) => m.lessons));
  const levelSteps = LEVEL_STEPS[course.level] ?? 0;
  const descriptionIsLong = course.description.length > 280;

  // Ruta: el alumno vuelve a la sección del Dashboard de la que viene el curso.
  const section = course.esDeMiOrg
    ? 'Cursos RAM asignados'
    : course.marca === 'nextgen' && (course.esGratis ?? price.isFree)
      ? 'Cursos gratuitos NextGenIA'
      : null;
  const eyebrow = padre
    ? `${cleanTitle(padre.titulo)} · Curso ${padre.posicion} de ${padre.total}`
    : [course.category, course.marca === 'nextgen' ? 'NextGenIA' : course.marca === 'ram' ? 'RAM' : null]
      .filter(Boolean)
      .join(' · ');

  const ArrowIcon = (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );

  const includes = (
    <ul className={styles.includes}>
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><circle cx="12" cy="9" r="5" /><path strokeLinejoin="round" d="M9 13.5L8 21l4-2 4 2-1-7.5" /></svg>
        Certificado al completar el curso
      </li>
      <li>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 7v5l3 2" /></svg>
        A tu ritmo, sin fechas límite
      </li>
      {kinds.quiz > 0 && (
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><rect x="5" y="4.5" width="14" height="16.5" rx="2" /><path strokeLinejoin="round" d="M9 3h6v3H9z" /><path strokeLinecap="round" strokeLinejoin="round" d="M8.5 11.5l1.25 1.25L12 10.5M14 12h2M8.5 16.5l1.25 1.25L12 15.5M14 17h2" /></svg>
          {plural(kinds.quiz, 'cuestionario', 'cuestionarios')} para evaluar tu avance
        </li>
      )}
    </ul>
  );

  let actionBody: ReactNode;
  if (viewOnlyMode) {
    actionBody = (
      <Link href={reviewHref} className={`${styles.btn} ${styles.btnPrimary}`}>
        {viewCourseLabel}
      </Link>
    );
  } else if (isEnrolled) {
    const pct = progress?.pct ?? 0;
    const started = (progress?.completed ?? 0) > 0;
    actionBody = (
      <>
        <div>
          <div className={styles.progressLabel}>
            <span>Tu avance</span>
            <b>{pct} %</b>
          </div>
          <div
            className={styles.track}
            role="progressbar"
            aria-label="Avance del curso"
            aria-valuenow={pct}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className={styles.fill} style={{ width: `${pct}%` }} />
          </div>
          {progress && (
            <p className={styles.progressSub}>
              {progress.completed} de {progress.total} lecciones
            </p>
          )}
        </div>
        {nextLessonTitle && (
          <p className={styles.nextUp}>
            {started ? 'Siguiente' : 'Empieza con'}
            <b>{nextLessonTitle}</b>
          </p>
        )}
        <Link
          href={next?.lesson.id ? `/curso/${course.id}/videos?leccion=${next.lesson.id}` : `/curso/${course.id}/videos`}
          className={`${styles.btn} ${styles.btnPrimary}`}
        >
          {courseDone ? 'Repasar curso' : started ? 'Continuar' : 'Empezar curso'}
          {ArrowIcon}
        </Link>
        {course.esDeMiOrg && <p className={styles.licenseNote}>Incluido en la licencia de tu empresa</p>}
      </>
    );
  } else if (requierePago) {
    // Precio > 0: PayPal tiene prioridad sobre el bloqueo de licencia, ya que
    // RF10 permite que cualquier alumno compre el curso individualmente.
    actionBody = (
      <>
        <div className={styles.price}>
          <b>{price.label}</b>
          <span>{plural(course.lessonsCount, 'lección', 'lecciones')}</span>
        </div>
        <PayPalCheckout
          cursoId={course.id}
          monedaCurso={course.moneda}
          onSuccess={() => {
            if (onPaymentSuccess) onPaymentSuccess();
          }}
        />
        {includes}
      </>
    );
  } else if (bloqueadoPorLicencia) {
    actionBody = (
      <div className={styles.lockedBlock} role="status" aria-live="polite">
        <h3 className={styles.lockedTitle}>Curso no disponible</h3>
        <p className={styles.lockedMessage}>
          Tu organización no ha adquirido este curso. Contacta a tu administrador para más información.
        </p>
      </div>
    );
  } else {
    actionBody = (
      <>
        <div className={styles.price}>
          <b>{price.label}</b>
          <span>{plural(course.lessonsCount, 'lección', 'lecciones')}</span>
        </div>
        {onInscribirse && (
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={onInscribirse} disabled={enrollLoading}>
            {enrollLoading ? 'Inscribiendo…' : 'Inscribirme gratis'}
          </button>
        )}
        {includes}
      </>
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
            {section && (
              <>
                <span aria-hidden="true">/</span>
                <span>{section}</span>
              </>
            )}
          </nav>
        ) : (
          <BackLink href={backHref} className={styles.backLink}>Volver</BackLink>
        )}

        <div className={styles.layout}>
          <section className={styles.hero} aria-labelledby="course-title">
            {eyebrow && <p className={styles.eyebrow}>{eyebrow}</p>}
            <h1 id="course-title" className={styles.courseTitle}>{displayTitle}</h1>
            {course.description && (
              <>
                <p
                  id="course-description"
                  className={`${styles.lead} ${descriptionIsLong && !descExpanded ? styles.leadClamped : ''}`}
                >
                  {course.description}
                </p>
                {descriptionIsLong && (
                  <button
                    type="button"
                    className={styles.moreButton}
                    aria-expanded={descExpanded}
                    aria-controls="course-description"
                    onClick={() => setDescExpanded((v) => !v)}
                  >
                    {descExpanded ? 'Leer menos' : 'Leer más'}
                  </button>
                )}
              </>
            )}

            <div className={styles.facts}>
              {levelSteps > 0 && (
                <span className={styles.fact}>
                  <span className={styles.meter} aria-hidden="true">
                    {[1, 2, 3].map((i) => <i key={i} className={i <= levelSteps ? styles.meterOn : undefined} />)}
                  </span>
                  <b>{course.level}</b>
                </span>
              )}
              {course.syllabus.length > 0 && (
                <span className={styles.fact}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" /></svg>
                  <b>{course.syllabus.length}</b> {course.syllabus.length === 1 ? 'módulo' : 'módulos'}
                </span>
              )}
              {(Object.keys(KIND_LABEL) as LessonKind[]).filter((k) => kinds[k] > 0).map((k) => (
                <span key={k} className={styles.fact}>
                  <KindIcon kind={k} />
                  <b>{kinds[k]}</b> {kinds[k] === 1 ? KIND_LABEL[k][0] : KIND_LABEL[k][1]}
                </span>
              ))}
              {durationLabel && (
                <span className={styles.fact}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 7v5l3 2" /></svg>
                  <b>{durationLabel}</b>
                </span>
              )}
              {hasReviews && (
                <span className={styles.fact}>
                  <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={styles.star}><path d="M12 17.3l-6.2 3.7 1.7-7L2 9.2l7.2-.6L12 2l2.8 6.6 7.2.6-5.5 4.8 1.7 7z" /></svg>
                  <b>{course.rating.toFixed(1)}</b> ({course.reviewsCount})
                </span>
              )}
            </div>

            {course.instructor && (
              <p className={styles.instructor}>
                Impartido por <strong>{course.instructor}</strong>
              </p>
            )}
          </section>

          <aside className={styles.aside} aria-label={isEnrolled ? 'Tu avance' : 'Inscripción'}>
            <div className={styles.actionCard}>
              <div className={styles.cover}>
                <CourseCover
                  src={course.image}
                  title={course.title}
                  caption={course.category}
                  variant="grid"
                  tone={course.marca === 'ram' ? 'ram' : 'nextgen'}
                />
              </div>
              <div className={styles.actionBody}>{actionBody}</div>
            </div>
          </aside>

          <div className={styles.body}>
            {outcomes.length > 0 && (
              <section className={styles.section} aria-labelledby="learn-title">
                <h2 id="learn-title" className={styles.sectionTitle}>Lo que aprenderás</h2>
                <ul className={styles.outcomes}>
                  {outcomes.map((outcome, index) => (
                    <li key={index}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      <span>{outcome}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <CourseSyllabus
              syllabus={course.syllabus}
              completedIds={completedIds}
              showProgress={Boolean(isEnrolled)}
              onLessonClick={handleLessonClick}
              lessonActionLabel={isEnrolled || viewOnlyMode ? 'Abrir lección' : 'Ver cómo acceder'}
            />

            {requirements.length > 0 && (
              <section className={styles.section} aria-labelledby="req-title">
                <h2 id="req-title" className={styles.sectionTitle}>Requisitos</h2>
                <ul className={styles.requirements}>
                  {requirements.map((r) => <li key={r}>{r}</li>)}
                </ul>
              </section>
            )}

            <CourseReviews
              courseId={course.id}
              canReview={isStudent && courseDone}
              reviewLockedHint={
                isStudent && progress && !courseDone
                  ? 'Podrás calificar el curso y escribir tu reseña cuando completes todas las lecciones.'
                  : null
              }
            />
          </div>
        </div>
      </main>
      <Toast toast={toast} onClose={closeToast} />
    </div>
  );
}
