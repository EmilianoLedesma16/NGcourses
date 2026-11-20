'use client';

import { useState } from 'react';
import type { Module, Lesson } from '@/types/course';
import styles from './LessonsSidebar.module.css';

interface LessonsSidebarProps {
  modules: Module[];
  currentLessonId?: string;
  onLessonSelect: (lesson: Lesson) => void;
  /** Clave para recordar qué módulos dejó abiertos el alumno (por curso). */
  storageKey?: string;
}

const KIND_NAME: Record<NonNullable<Lesson['tipo']>, string> = {
  video: 'Video',
  lectura: 'Lectura',
  quiz: 'Cuestionario',
};

function formatDuration(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = Math.floor(totalSec % 60);
  if (m >= 60) return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function TypeIcon({ tipo }: { tipo?: Lesson['tipo'] }) {
  if (tipo === 'quiz') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
        <path d="M9 3h6v3H9z" />
        <path d="M8.5 11.5l1.25 1.25L12 10.5M14 12h2M8.5 16.5l1.25 1.25L12 15.5M14 17h2" />
      </svg>
    );
  }
  if (tipo === 'lectura') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M7 3h7l5 5v13H7z" />
        <path d="M14 3v5h5M10 13h6M10 17h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.8v6.4l5-3.2z" fill="currentColor" strokeLinejoin="round" />
    </svg>
  );
}

function DoneIcon({ label }: { label: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" role="img" aria-label={label} className={styles.doneIcon}>
      <path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1.2 14.2L6.6 12l1.4-1.4 2.8 2.8 5.2-5.2 1.4 1.4z" />
    </svg>
  );
}

const moduleOf = (modules: Module[], lessonId?: string) =>
  lessonId ? modules.find((m) => m.lessons.some((l) => l.id === lessonId))?.id : undefined;

/**
 * Contenido del curso en la vista de lección (lado del alumno): árbol de dos
 * niveles, módulos que se abren y cierran con sus lecciones anidadas. Por
 * defecto se abre el módulo de la lección actual; lo que el alumno abra o
 * cierre se recuerda en este navegador.
 */
export default function LessonsSidebar({
  modules,
  currentLessonId,
  onLessonSelect,
  storageKey,
}: LessonsSidebarProps) {
  // Lo que el alumno abrió o cerró a mano (módulo → abierto), recordado en este
  // navegador. Sin elección, solo está abierto el módulo de la lección actual.
  // La vista se pinta solo en el cliente (después de cargar el curso), así que
  // leer localStorage aquí no causa diferencias de hidratación.
  const [choices, setChoices] = useState<Record<string, boolean>>(() => {
    if (!storageKey) return {};
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) ?? '{}');
      return saved && typeof saved === 'object' && !Array.isArray(saved) ? saved : {};
    } catch {
      return {};
    }
  });

  const currentModuleId = moduleOf(modules, currentLessonId) ?? modules[0]?.id;
  const isOpen = (id: string) => choices[id] ?? id === currentModuleId;

  const toggle = (id: string) => {
    const next = { ...choices, [id]: !isOpen(id) };
    setChoices(next);
    if (storageKey) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        /* sin almacenamiento: la elección dura mientras siga abierta la página */
      }
    }
  };

  const allLessons = modules.flatMap((m) => m.lessons);
  const total = allLessons.length;
  const done = allLessons.filter((l) => l.completed).length;
  const pct = total ? Math.round((done / total) * 100) : 0;

  return (
    <nav className={styles.container} aria-label="Contenido del curso">
      <div className={styles.head}>
        <div className={styles.headRow}>
          <h2 className={styles.headTitle}>Contenido del curso</h2>
          <span className={styles.headMeta}>
            {done} de {total} completadas
          </span>
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
      </div>

      <ul className={styles.tree}>
        {modules.map((module, idx) => {
          const moduleOpen = isOpen(module.id);
          const count = module.lessons.length;
          const modDone = module.lessons.filter((l) => l.completed).length;
          const moduleComplete = count > 0 && modDone === count;
          const listId = `modulo-${module.id}`;
          return (
            <li key={module.id}>
              <button
                type="button"
                onClick={() => toggle(module.id)}
                className={styles.moduleToggle}
                aria-expanded={moduleOpen}
                aria-controls={listId}
                disabled={count === 0}
              >
                <svg
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                  strokeLinecap="round" strokeLinejoin="round"
                  className={`${styles.chevron} ${moduleOpen ? styles.chevronOpen : ''}`}
                  aria-hidden="true"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
                <span className={styles.moduleText}>
                  <span className={styles.moduleTitle}>{idx + 1}. {module.name}</span>
                  <span className={styles.moduleMeta}>
                    {count === 0
                      ? 'Sin lecciones'
                      : moduleComplete
                        ? `${count} ${count === 1 ? 'lección' : 'lecciones'} · completado`
                        : `${modDone} de ${count} completadas`}
                  </span>
                </span>
                {moduleComplete && <DoneIcon label="Módulo completado" />}
              </button>

              {moduleOpen && count > 0 && (
                <ul id={listId} className={styles.lessons}>
                  {module.lessons.map((lesson) => {
                    const isCurrent = lesson.id === currentLessonId;
                    const tipo = lesson.tipo ?? 'video';
                    const meta = tipo !== 'quiz' && lesson.duration
                      ? `${KIND_NAME[tipo]} · ${formatDuration(lesson.duration)}`
                      : KIND_NAME[tipo];
                    return (
                      <li key={lesson.id}>
                        <button
                          type="button"
                          onClick={() => onLessonSelect(lesson)}
                          className={`${styles.lesson} ${isCurrent ? styles.lessonCurrent : ''}`}
                          aria-current={isCurrent ? 'step' : undefined}
                        >
                          <span className={styles.typeIcon}>
                            <TypeIcon tipo={tipo} />
                          </span>
                          <span className={styles.lessonText}>
                            <span className={styles.lessonName}>{lesson.name}</span>
                            <span className={styles.lessonMeta}>{meta}</span>
                          </span>
                          {lesson.completed ? (
                            <DoneIcon label="Completada" />
                          ) : (
                            <span className={styles.pending} aria-hidden="true" />
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
