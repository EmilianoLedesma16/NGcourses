'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { cursosApi, progresoApi } from '@/lib/api/client';
import { logError } from '@/lib/logger';
import { toSyllabus } from '@/lib/syllabus';
import { useProgresoEnVivo } from '@/lib/progresoSync';
import type { SyllabusLesson, SyllabusModule } from '@/types/course';
import CourseSyllabus, {
  KIND_LABEL,
  KindIcon,
  countKinds,
  cleanTitle,
  findNextLesson,
  formatTotal,
  plural,
  type LessonKind,
} from './CourseSyllabus';
import CourseReviews from './CourseReviews';
import type { Subcurso } from './GlobalCourseContent';
import styles from './CourseInfoContent.module.css';
import own from './GlobalCourseContent.module.css';

interface ApiLeccion {
  id?: string;
  titulo?: string;
  tipo?: string;
  orden?: number;
  duracion_seg?: number;
  thumbnail_url?: string | null;
  es_visible?: boolean;
}

interface ApiCurso {
  descripcion: string | null;
  lo_que_aprenderas?: string[];
  modulos: { titulo?: string; orden?: number; lecciones: ApiLeccion[] }[];
}

interface ApiProgreso {
  progreso_por_leccion: { leccion_id: string; completado: boolean }[];
}

interface Detalle {
  descripcion: string;
  outcomes: string[];
  syllabus: SyllabusModule[];
}

interface Props {
  sub: Subcurso;
  /** Título ya sin el prefijo del proceso. */
  titulo: string;
  index: number;
  total: number;
  viewOnlyMode: boolean;
  /** Avisa que algo cambió para que la página del proceso actualice sus contadores. */
  onProgressChange?: () => void;
  /** Clic en una lección a la que el alumno todavía no tiene acceso. */
  onLockedLesson: (sub: Subcurso) => void;
  onLessonOpen: (href: string) => void;
}

const ArrowIcon = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

// Lo ya cargado de cada curso: cambiar de pestaña y volver no vuelve a pedirlo.
const cacheDetalle = new Map<string, Detalle>();

/** Contenido de un curso dentro de la página del proceso (lo que muestra el selector). */
export default function ProcessCoursePanel({
  sub,
  titulo,
  index,
  total,
  viewOnlyMode,
  onProgressChange,
  onLockedLesson,
  onLessonOpen,
}: Props) {
  const cacheKey = `${sub.id}:${viewOnlyMode ? 'revision' : 'alumno'}`;
  const [detalle, setDetalle] = useState<Detalle | null>(cacheDetalle.get(cacheKey) ?? null);
  const [completados, setCompletados] = useState<Set<string>>(new Set());
  const [error, setError] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const conAvance = sub.inscrito && !viewOnlyMode;

  useEffect(() => {
    if (cacheDetalle.has(cacheKey)) return;
    let activo = true;
    (cursosApi.get(sub.id) as Promise<ApiCurso>)
      .then((raw) => {
        const d: Detalle = {
          descripcion: raw.descripcion || '',
          outcomes: (raw.lo_que_aprenderas ?? []).filter((o) => o && o.trim()),
          // El alumno no ve lecciones ocultas (su avance tampoco las cuenta).
          syllabus: toSyllabus(
            (raw.modulos ?? []).map((m) => ({
              ...m,
              lecciones: viewOnlyMode ? m.lecciones : m.lecciones.filter((l) => l.es_visible !== false),
            })),
          ),
        };
        cacheDetalle.set(cacheKey, d);
        if (activo) setDetalle(d);
      })
      .catch((e) => {
        logError('ProcessCoursePanel/detalle', e);
        if (activo) setError(true);
      });
    return () => {
      activo = false;
    };
  }, [sub.id, viewOnlyMode, cacheKey]);

  const cargarAvance = useCallback(() => {
    if (!conAvance) return;
    (progresoApi.curso(sub.id) as Promise<ApiProgreso>)
      .then((p) => setCompletados(new Set(p.progreso_por_leccion.filter((x) => x.completado).map((x) => x.leccion_id))))
      .catch((e) => logError('ProcessCoursePanel/progreso', e));
  }, [conAvance, sub.id]);

  useEffect(() => {
    cargarAvance();
  }, [cargarAvance]);

  // Avance en tiempo real: otra pestaña completó una lección, o se volvió a esta.
  useProgresoEnVivo((evento) => {
    if (evento && evento.cursoId !== sub.id) {
      onProgressChange?.(); // otro curso del proceso: solo los contadores
      return;
    }
    // Palomita inmediata con el aviso; luego se confirma con el servidor.
    if (evento) setCompletados((prev) => new Set(prev).add(evento.leccionId));
    cargarAvance();
    onProgressChange?.();
  });

  const lessons = detalle?.syllabus.flatMap((m) => m.lessons) ?? [];
  const totalLecciones = lessons.length;
  const hechas = lessons.filter((l) => l.id && completados.has(l.id)).length;
  const pct = totalLecciones ? Math.round((hechas / totalLecciones) * 100) : 0;
  const terminado = totalLecciones > 0 && hechas >= totalLecciones;
  const next = detalle && conAvance ? findNextLesson(detalle.syllabus, completados) : null;
  const kinds = countKinds(lessons);
  const segundos = lessons.reduce((a, l) => a + (l.durationSec ?? 0), 0);
  const descLarga = (detalle?.descripcion.length ?? 0) > 280;

  const hrefLeccion = (leccionId?: string) => {
    const base = viewOnlyMode ? `/curso/${sub.id}/videos?from=supervisor` : `/curso/${sub.id}/videos`;
    if (!leccionId) return base;
    return `${base}${base.includes('?') ? '&' : '?'}leccion=${leccionId}`;
  };

  const handleLessonClick = (l: SyllabusLesson) => {
    if (viewOnlyMode || sub.inscrito) onLessonOpen(hrefLeccion(l.id));
    else onLockedLesson(sub);
  };

  return (
    <div className={own.panel}>
      <header className={own.panelHead}>
        <p className={styles.eyebrow}>Curso {index + 1} de {total}</p>
        <h2 className={own.panelTitle}>{titulo}</h2>
        {detalle?.descripcion && (
          <>
            <p id={`desc-${sub.id}`} className={`${styles.lead} ${descLarga && !descExpanded ? styles.leadClamped : ''}`}>
              {detalle.descripcion}
            </p>
            {descLarga && (
              <button
                type="button"
                className={styles.moreButton}
                aria-expanded={descExpanded}
                aria-controls={`desc-${sub.id}`}
                onClick={() => setDescExpanded((v) => !v)}
              >
                {descExpanded ? 'Leer menos' : 'Leer más'}
              </button>
            )}
          </>
        )}
        {detalle && (
          <div className={styles.facts}>
            <span className={styles.fact}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h10" /></svg>
              <b>{detalle.syllabus.length}</b> {detalle.syllabus.length === 1 ? 'módulo' : 'módulos'}
            </span>
            {(Object.keys(KIND_LABEL) as LessonKind[]).filter((k) => kinds[k] > 0).map((k) => (
              <span key={k} className={styles.fact}>
                <KindIcon kind={k} />
                <b>{kinds[k]}</b> {kinds[k] === 1 ? KIND_LABEL[k][0] : KIND_LABEL[k][1]}
              </span>
            ))}
            {segundos > 0 && (
              <span className={styles.fact}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true"><circle cx="12" cy="12" r="9" /><path strokeLinecap="round" d="M12 7v5l3 2" /></svg>
                <b>{formatTotal(segundos)}</b>
              </span>
            )}
          </div>
        )}
      </header>

      {/* Avance y acción de ESTE curso (la tarjeta de la derecha es la del proceso). */}
      {conAvance && detalle && (
        <div className={own.panelAction}>
          <div className={own.panelProgress}>
            <div className={styles.progressLabel}>
              <span>{terminado ? 'Curso terminado' : 'Avance de este curso'}</span>
              <b>{pct} %</b>
            </div>
            <div className={styles.track} role="progressbar" aria-label={`Avance de ${titulo}`} aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className={styles.fill} style={{ width: `${pct}%` }} />
            </div>
            <p className={styles.progressSub}>
              {hechas} de {plural(totalLecciones, 'lección', 'lecciones')}
              {next && !terminado && <> · Sigue: <b>{cleanTitle(next.lesson.title)}</b></>}
            </p>
          </div>
          <Link href={hrefLeccion(next?.lesson.id)} className={`${styles.btn} ${styles.btnPrimary} ${own.panelCta}`}>
            {terminado ? 'Repasar' : hechas > 0 ? 'Continuar' : 'Empezar este curso'}
            {ArrowIcon}
          </Link>
        </div>
      )}
      {viewOnlyMode && (
        <div className={own.panelAction}>
          <p className={own.panelNote}>Vista de revisión: puedes abrir cualquier lección sin registrar avance.</p>
          <Link href={hrefLeccion()} className={`${styles.btn} ${styles.btnPrimary} ${own.panelCta}`}>
            Ver contenido
            {ArrowIcon}
          </Link>
        </div>
      )}

      {error ? (
        <p className={styles.sectionText}>No se pudo cargar el temario de este curso. Recarga la página.</p>
      ) : !detalle ? (
        <p className={styles.sectionText}>Cargando temario…</p>
      ) : (
        <>
          {detalle.outcomes.length > 0 && (
            <section className={styles.section} aria-labelledby={`learn-${sub.id}`}>
              <h3 id={`learn-${sub.id}`} className={styles.sectionTitle}>Lo que aprenderás</h3>
              <ul className={styles.outcomes}>
                {detalle.outcomes.map((o, i) => (
                  <li key={i}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <CourseSyllabus
            key={sub.id}
            syllabus={detalle.syllabus}
            completedIds={completados}
            showProgress={conAvance}
            onLessonClick={handleLessonClick}
            lessonActionLabel={viewOnlyMode || sub.inscrito ? 'Abrir lección' : 'Ver cómo acceder'}
            headingId={`temario-${sub.id}`}
          />
          {!viewOnlyMode && (
            <CourseReviews
              courseId={sub.id}
              canReview={conAvance && terminado}
              reviewLockedHint={
                conAvance && !terminado
                  ? 'Podrás calificar este curso cuando completes todas sus lecciones.'
                  : null
              }
            />
          )}
        </>
      )}
    </div>
  );
}
