'use client';

import { useState } from 'react';
import type { SyllabusLesson, SyllabusModule } from '@/types/course';
import LessonThumb from './LessonThumb';
import styles from './CourseInfoContent.module.css';

export type LessonKind = 'video' | 'lectura' | 'quiz';

export const KIND_LABEL: Record<LessonKind, [string, string]> = {
  video: ['video', 'videos'],
  lectura: ['lectura', 'lecturas'],
  quiz: ['cuestionario', 'cuestionarios'],
};

const KIND_NAME: Record<LessonKind, string> = {
  video: 'Video',
  lectura: 'Lectura',
  quiz: 'Cuestionario',
};

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const cleanTitle = (t: string) => t.trim().replace(/\.$/, '');

/** "Testeo: Desensamble" dentro de Testeo → "Desensamble". El título guardado no cambia. */
export function sinPrefijo(titulo: string, padre: string): string {
  const t = cleanTitle(titulo);
  const p = cleanTitle(padre).toLowerCase();
  const idx = t.indexOf(':');
  if (idx > 0 && t.slice(0, idx).trim().toLowerCase() === p) {
    const resto = t.slice(idx + 1).trim();
    return resto ? resto.charAt(0).toLocaleUpperCase('es') + resto.slice(1) : t;
  }
  return t;
}
/** "Módulo 1: Fundamentos de Excel." → "Fundamentos de Excel" (el número ya va en el recuadro). */
const moduleTitle = (t: string) => cleanTitle(t.replace(/^\s*m[oó]dulo\s*\d+\s*[:.\-–]\s*/i, '')) || cleanTitle(t);
export const kindOf = (l: SyllabusLesson): LessonKind =>
  l.tipo === 'quiz' || l.tipo === 'lectura' ? l.tipo : 'video';

function formatDuration(totalSec: number): string {
  const min = Math.floor(totalSec / 60);
  const sec = Math.round(totalSec % 60);
  return `${min}:${sec.toString().padStart(2, '0')}`;
}

/** Duración total legible ("1 h 30 min", "45 min") a partir de segundos. */
export function formatTotal(totalSec: number): string {
  const totalMin = Math.round(totalSec / 60);
  if (totalMin < 60) return `${totalMin} min`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export function countKinds(lessons: SyllabusLesson[]): Record<LessonKind, number> {
  const c: Record<LessonKind, number> = { video: 0, lectura: 0, quiz: 0 };
  lessons.forEach((l) => { c[kindOf(l)] += 1; });
  return c;
}

const mixLabel = (c: Record<LessonKind, number>) =>
  (Object.keys(KIND_LABEL) as LessonKind[])
    .filter((k) => c[k] > 0)
    .map((k) => plural(c[k], ...KIND_LABEL[k]))
    .join(' · ');

export function KindIcon({ kind }: { kind: LessonKind }) {
  if (kind === 'quiz') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
        <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
        <path strokeLinejoin="round" d="M9 3h6v3H9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 11.5l1.25 1.25L12 10.5M14 12h2M8.5 16.5l1.25 1.25L12 15.5M14 17h2" />
      </svg>
    );
  }
  if (kind === 'lectura') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
        <path strokeLinejoin="round" d="M7 3h7l5 5v13H7z" />
        <path strokeLinecap="round" d="M14 3v5h5M10 13h6M10 17h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="M10 9.5v5l4-2.5z" fill="currentColor" />
    </svg>
  );
}

function CheckCircle() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className={styles.lessonDoneIcon}>
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2L6.6 12l1.4-1.4 2.8 2.8 5.2-5.2 1.4 1.4z" />
    </svg>
  );
}

/** Primera lección sin completar (en orden de módulo/lección), como "m-i". */
export function findNextLesson(
  syllabus: SyllabusModule[],
  completedIds: Set<string>,
): { key: string; lesson: SyllabusLesson } | null {
  for (let m = 0; m < syllabus.length; m++) {
    const lessons = syllabus[m].lessons;
    for (let i = 0; i < lessons.length; i++) {
      if (!lessons[i].id || !completedIds.has(lessons[i].id!)) return { key: `${m}-${i}`, lesson: lessons[i] };
    }
  }
  return null;
}

interface CourseSyllabusProps {
  syllabus: SyllabusModule[];
  completedIds: Set<string>;
  /** Muestra avance (x/y por módulo, "Siguiente"). */
  showProgress: boolean;
  /** Clic en una lección. Sin él, las lecciones no son clicables. */
  onLessonClick?: (lesson: SyllabusLesson) => void;
  /** Texto para lectores de pantalla de lo que hace el clic ("Ver lección", "Inscríbete…"). */
  lessonActionLabel?: string;
  title?: string;
  headingId?: string;
}

/** Temario: módulos que se abren y cierran con sus lecciones. */
export default function CourseSyllabus({
  syllabus,
  completedIds,
  showProgress,
  onLessonClick,
  lessonActionLabel = 'Ver lección',
  title = 'Temario',
  headingId = 'syllabus-title',
}: CourseSyllabusProps) {
  const next = showProgress ? findNextLesson(syllabus, completedIds) : null;
  const nextModuleIndex = next ? Number(next.key.split('-')[0]) : 0;
  const [openModules, setOpenModules] = useState<Set<number>>(new Set([nextModuleIndex]));
  // Si algún video trae miniatura, el temario usa el recuadro 16:9 en todas las filas.
  const hasThumbs = syllabus.some((m) => m.lessons.some((l) => !!l.thumbnailUrl));

  const toggleModule = (index: number) => {
    setOpenModules((prev) => {
      const n = new Set(prev);
      if (n.has(index)) n.delete(index);
      else n.add(index);
      return n;
    });
  };
  const allOpen = syllabus.length > 0 && openModules.size === syllabus.length;
  const toggleAll = () => setOpenModules(allOpen ? new Set() : new Set(syllabus.map((_, i) => i)));

  return (
    <section className={styles.section} aria-labelledby={headingId}>
      <div className={styles.sectionHead}>
        <h2 id={headingId} className={styles.sectionTitle}>{title}</h2>
        {syllabus.length > 1 && (
          <button type="button" className={styles.linkButton} onClick={toggleAll}>
            {allOpen ? 'Contraer todo' : 'Expandir todo'}
          </button>
        )}
      </div>
      {syllabus.length === 0 ? (
        <p className={styles.sectionText}>El temario se publicará pronto.</p>
      ) : (
        <div className={styles.modules}>
          {syllabus.map((modulo, index) => {
            const isOpen = openModules.has(index);
            const hasLessons = modulo.lessons.length > 0;
            const doneCount = modulo.lessons.filter((l) => l.id && completedIds.has(l.id)).length;
            const moduleDone = showProgress && hasLessons && doneCount === modulo.lessons.length;
            const listId = `${headingId}-modulo-${index}`;
            return (
              <div key={index} className={`${styles.module} ${moduleDone ? styles.moduleDone : ''}`}>
                <button
                  type="button"
                  className={styles.moduleButton}
                  onClick={() => toggleModule(index)}
                  aria-expanded={isOpen}
                  aria-controls={listId}
                  disabled={!hasLessons}
                >
                  <span className={styles.moduleNum} aria-hidden="true">
                    {moduleDone ? (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.6}><path strokeLinecap="round" strokeLinejoin="round" d="M5 12.5l4.5 4.5L19 7.5" /></svg>
                    ) : (
                      index + 1
                    )}
                  </span>
                  <span className={styles.moduleText}>
                    <span className={styles.moduleTitle}>{moduleTitle(modulo.title)}</span>
                    {hasLessons && <span className={styles.moduleMix}>{mixLabel(countKinds(modulo.lessons))}</span>}
                  </span>
                  {hasLessons && (
                    <span className={styles.moduleCount}>
                      {showProgress
                        ? `${doneCount}/${modulo.lessons.length}`
                        : plural(modulo.lessons.length, 'lección', 'lecciones')}
                    </span>
                  )}
                  <svg className={styles.moduleChevron} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
                  </svg>
                </button>
                {isOpen && hasLessons && (
                  <ul id={listId} className={styles.lessons}>
                    {modulo.lessons.map((leccion, i) => {
                      const kind = kindOf(leccion);
                      const done = !!leccion.id && completedIds.has(leccion.id);
                      const isNext = next?.key === `${index}-${i}`;
                      const rowClass = `${styles.lesson} ${hasThumbs ? styles.lessonThumb : ''} ${done ? styles.lessonDone : ''} ${isNext ? styles.lessonNext : ''}`;
                      const content = (
                        <>
                          <LessonThumb
                            src={kind === 'video' ? leccion.thumbnailUrl : undefined}
                            icon={done ? <CheckCircle /> : <KindIcon kind={kind} />}
                            framed={hasThumbs}
                            done={done && kind === 'video' && !!leccion.thumbnailUrl}
                            active={isNext}
                          />
                          <span className={styles.lessonTitle}>{cleanTitle(leccion.title)}</span>
                          <span className={styles.lessonKind}>
                            {isNext
                              ? 'Siguiente'
                              : leccion.durationSec && kind !== 'quiz'
                                ? formatDuration(leccion.durationSec)
                                : KIND_NAME[kind]}
                          </span>
                        </>
                      );
                      return (
                        <li key={leccion.id ?? i}>
                          {onLessonClick ? (
                            <button
                              type="button"
                              className={`${rowClass} ${styles.lessonButton}`}
                              onClick={() => onLessonClick(leccion)}
                              aria-label={`${cleanTitle(leccion.title)}. ${lessonActionLabel}`}
                            >
                              {content}
                            </button>
                          ) : (
                            <div className={rowClass}>{content}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
