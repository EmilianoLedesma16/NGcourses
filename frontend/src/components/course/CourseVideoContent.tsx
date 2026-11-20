'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import VideoPlayer from '@/components/video/VideoPlayer';
import LessonsSidebar from '@/components/course/LessonsSidebar';
import VideoControls from '@/components/course/VideoControls';
import QuizPlayer from '@/components/course/QuizPlayer';
import LessonComments from '@/components/course/LessonComments';
import UpNextCard from '@/components/course/UpNextCard';
import type { Course, Lesson } from '@/types/course';
import { progresoApi, certificadosApi } from '@/lib/api/client';
import { normalizeQuizData } from '@/lib/quizData';
import { logError } from '@/lib/logger';
import { avisarLeccionCompletada, useProgresoEnVivo } from '@/lib/progresoSync';
import StudentUserMenu from '@/components/shared/StudentUserMenu';
import styles from './CourseVideoContent.module.css';
import BackLink from '@/components/shared/BackLink';

/** Proceso (curso global) al que pertenece el curso: para pasar al siguiente curso. */
export interface ProcesoDelCurso {
  id: string;
  titulo: string;
  posicion: number;
  total: number;
  siguiente_id?: string | null;
  siguiente_titulo?: string | null;
}

interface CourseVideoContentProps {
  initialCourse: Course;
  /** Lección con la que se abre (clic en el temario). Sin ella, la primera pendiente. */
  initialLessonId?: string | null;
  proceso?: ProcesoDelCurso | null;
  inscripcionId?: string | null;
  bunnyLibraryId?: string | null;
  backHref?: string;
  navHref?: string;
  /** Vista previa de admin/instructor: el quiz se califica localmente sin inscripción. */
  previewMode?: boolean;
  /** Vista de supervisor: permite revisar contenido sin inscripción ni progreso. */
  readOnlyMode?: boolean;
  /** Muestra el menú de usuario del alumno en la barra superior (solo alumno real). */
  showUserMenu?: boolean;
}

interface CompletionModal {
  folio: string | null;
  loading: boolean;
}

type Destino =
  | { tipo: 'leccion'; leccion: Lesson; moduloNuevo: string | null }
  | { tipo: 'curso'; id: string; titulo: string };

const CUENTA_SEG = 5;

const sinPrefijo = (titulo: string, padre: string) => {
  const t = titulo.trim().replace(/\.$/, '');
  const idx = t.indexOf(':');
  if (idx > 0 && t.slice(0, idx).trim().toLowerCase() === padre.trim().replace(/\.$/, '').toLowerCase()) {
    const resto = t.slice(idx + 1).trim();
    return resto ? resto.charAt(0).toLocaleUpperCase('es') + resto.slice(1) : t;
  }
  return t;
};

function TipoIcon({ tipo }: { tipo?: Lesson['tipo'] }) {
  if (tipo === 'quiz') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
        <rect x="5" y="4.5" width="14" height="16.5" rx="2" />
        <path strokeLinejoin="round" d="M9 3h6v3H9z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.5 12l1.5 1.5L13 10.5M8.5 17l1.5 1.5L13 15.5" />
      </svg>
    );
  }
  if (tipo === 'lectura') {
    return (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
        <path strokeLinejoin="round" d="M7 3h7l5 5v13H7z" />
        <path strokeLinecap="round" d="M14 3v5h5M10 13h6M10 17h6" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.8v6.4l5-3.2z" fill="currentColor" strokeLinejoin="round" />
    </svg>
  );
}

function leccionInicial(course: Course, initialLessonId?: string | null): Lesson | null {
  const todas = course.modules.flatMap((m) => m.lessons);
  return (
    (initialLessonId && todas.find((l) => l.id === initialLessonId))
    || todas.find((l) => !l.completed)
    || todas[0]
    || null
  );
}

export default function CourseVideoContent({
  initialCourse,
  initialLessonId,
  proceso,
  inscripcionId,
  bunnyLibraryId,
  backHref,
  navHref,
  previewMode,
  readOnlyMode,
  showUserMenu,
}: CourseVideoContentProps) {
  const router = useRouter();
  const [course, setCourse] = useState<Course>(initialCourse);
  const [currentLessonId, setCurrentLessonId] = useState<string | null>(
    () => leccionInicial(initialCourse, initialLessonId)?.id ?? null,
  );
  const [completionModal, setCompletionModal] = useState<CompletionModal | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [certFolio, setCertFolio] = useState<string | null>(null);
  const [cuenta, setCuenta] = useState<{ destino: Destino; restante: number } | null>(null);
  // Al llegar por la cuenta atrás o por "Siguiente", el video arranca solo.
  const [autoReproducir, setAutoReproducir] = useState(false);
  const videoSectionRef = useRef<HTMLDivElement>(null);
  // El curso se completó con el umbral (a mitad del último video): el aviso de
  // "¡Felicidades!" espera a que el video termine para no interrumpirlo.
  const modalPendiente = useRef(false);

  const resolvedBackHref = backHref
    ?? (proceso ? `/curso/${proceso.id}?curso=${initialCourse.id}` : `/curso/${initialCourse.id}`);
  const resolvedNavHref = navHref ?? (readOnlyMode ? '/supervisor/cursos' : '/cursos');
  const esAlumno = !previewMode && !readOnlyMode;

  // Para throttle del tracking: cada 10 segundos
  const lastSentTime = useRef<number>(0);
  const videoDuration = useRef<number>(0);

  const lecciones = course.modules.flatMap((m) => m.lessons);
  const currentLesson = lecciones.find((l) => l.id === currentLessonId) ?? null;
  const idxActual = currentLesson ? lecciones.findIndex((l) => l.id === currentLesson.id) : -1;
  const anterior = idxActual > 0 ? lecciones[idxActual - 1] : null;
  const siguiente = idxActual >= 0 && idxActual < lecciones.length - 1 ? lecciones[idxActual + 1] : null;
  const progress = lecciones.length
    ? Math.round((lecciones.filter((l) => l.completed).length / lecciones.length) * 100)
    : 0;
  const siguienteCurso = esAlumno && proceso?.siguiente_id
    ? { id: proceso.siguiente_id, titulo: sinPrefijo(proceso.siguiente_titulo ?? '', proceso.titulo) }
    : null;
  const nombreModulo = (lesson: Lesson) => {
    const i = course.modules.findIndex((m) => m.lessons.some((l) => l.id === lesson.id));
    return i >= 0 ? `Módulo ${i + 1}: ${course.modules[i].name}` : '';
  };

  useEffect(() => {
    if (!esAlumno || initialCourse.progress !== 100) return;
    (certificadosApi.mis() as Promise<{ data: { curso_id: string; folio: string; url_pdf: string | null }[] }>)
      .then((resp) => {
        const cert = resp.data.find((c) => c.curso_id === initialCourse.id);
        if (cert) setCertFolio(cert.folio);
      })
      .catch(() => {});
  }, [initialCourse.id, initialCourse.progress, esAlumno]);

  const resolvedLibraryId = bunnyLibraryId || process.env.NEXT_PUBLIC_BUNNY_LIBRARY_ID || '';
  const bunnyConfig = currentLesson && !currentLesson.videoUrl && currentLesson.videoId && resolvedLibraryId
    ? {
        libraryId: resolvedLibraryId,
        videoId: currentLesson.videoId,
      }
    : undefined;

  const irALeccion = (lesson: Lesson, { auto = false } = {}) => {
    setCuenta(null);
    setAutoReproducir(auto);
    setCurrentLessonId(lesson.id);
    lastSentTime.current = 0;
    videoDuration.current = 0;
    // Que el reproductor quede a la vista al cambiar de lección.
    const el = videoSectionRef.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const handleLessonSelect = (lesson: Lesson) => irALeccion(lesson);

  /** Pone la palomita en una lección (también la que llega de otra pestaña). */
  const aplicarCompletada = useCallback((leccionIds: string[]) => {
    const ids = new Set(leccionIds);
    setCourse((prev) => {
      const modules = prev.modules.map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => (ids.has(l.id) && !l.completed ? { ...l, completed: true } : l)),
      }));
      const todas = modules.flatMap((m) => m.lessons);
      const hechas = todas.filter((l) => l.completed).length;
      return { ...prev, modules, progress: todas.length ? Math.round((hechas / todas.length) * 100) : 0 };
    });
  }, []);

  const abrirModalFinal = async (registrar: (() => Promise<unknown>) | null) => {
    // El certificado se emite de forma síncrona al registrar el 100 %; basta
    // con leer el folio. La descarga regenera el PDF si hiciera falta.
    setCuenta(null);
    setCompletionModal({ folio: null, loading: true });
    try {
      if (registrar) await registrar();
      const resp = await (certificadosApi.mis() as Promise<{ data: { curso_id: string; folio: string; url_pdf: string | null }[] } | undefined>);
      // El certificado puede no existir aún (p.ej. el perfil no tiene un nombre
      // válido — CP20). En ese caso el modal se muestra sin folio de descarga.
      const cert = resp?.data?.find((c) => c.curso_id === course.id);
      setCompletionModal({ folio: cert?.folio ?? null, loading: false });
      if (cert?.folio) setCertFolio(cert.folio);
    } catch (e) {
      logError('CourseVideoContent/completionModal', e);
      setCompletionModal({ folio: null, loading: false });
    }
  };

  /**
   * Marca la lección como completada: palomita inmediata, aviso a otras pestañas
   * y registro en el servidor. Devuelve true si abrió el aviso de curso terminado.
   * `silencioso`: viene del umbral a mitad del video; no abre avisos.
   */
  const marcarCompletada = async (lesson: Lesson, silencioso = false): Promise<boolean> => {
    if (readOnlyMode) return false;
    const yaEstaba = lecciones.find((l) => l.id === lesson.id)?.completed ?? false;
    const pendientesOtras = lecciones.filter((l) => !l.completed && l.id !== lesson.id).length;
    const terminaElCurso = !yaEstaba && pendientesOtras === 0;

    if (!yaEstaba) aplicarCompletada([lesson.id]);
    if (!inscripcionId) return false; // vista previa: solo en pantalla

    // Las otras pestañas se avisan cuando el servidor ya lo guardó: así, al
    // volver a pedir el avance, ya viene con esta lección.
    const registrar = async () => {
      await progresoApi.registrar({
        inscripcion_id: inscripcionId,
        leccion_id: lesson.id,
        visto_seg: Math.round(videoDuration.current || 0),
        progreso_pct: 100,
      });
      if (!yaEstaba) avisarLeccionCompletada({ cursoId: course.id, leccionId: lesson.id });
    };

    if (!yaEstaba) {
      if (terminaElCurso && !silencioso) {
        await abrirModalFinal(registrar);
        return true;
      }
      if (terminaElCurso) modalPendiente.current = true;
      registrar().catch((e) => logError('CourseVideoContent/marcarCompletada', e));
      return false;
    }
    if (!silencioso && modalPendiente.current) {
      modalPendiente.current = false;
      await abrirModalFinal(null);
      return true;
    }
    return false;
  };

  const iniciarCuenta = () => {
    if (!currentLesson) return;
    if (siguiente) {
      const moduloNuevo = siguiente.moduleId !== currentLesson.moduleId ? nombreModulo(siguiente) : null;
      setCuenta({ destino: { tipo: 'leccion', leccion: siguiente, moduloNuevo }, restante: CUENTA_SEG });
    } else if (siguienteCurso) {
      setCuenta({ destino: { tipo: 'curso', ...siguienteCurso }, restante: CUENTA_SEG });
    }
  };

  /** La lección terminó (video al final, lectura leída, quiz aprobado o botón). */
  const terminarLeccion = async () => {
    if (!currentLesson) return;
    const abrioAviso = await marcarCompletada(currentLesson);
    if (!abrioAviso) iniciarCuenta();
  };

  const irADestino = (destino: Destino) => {
    setCuenta(null);
    if (destino.tipo === 'leccion') irALeccion(destino.leccion, { auto: true });
    else router.push(`/curso/${destino.id}/videos`);
  };
  const irADestinoRef = useRef(irADestino);
  useEffect(() => {
    irADestinoRef.current = irADestino;
  });

  // Cuenta atrás: un tic por segundo; al llegar a cero, pasa a lo siguiente.
  useEffect(() => {
    if (!cuenta) return;
    const t = window.setTimeout(() => {
      if (cuenta.restante <= 1) irADestinoRef.current(cuenta.destino);
      else setCuenta({ ...cuenta, restante: cuenta.restante - 1 });
    }, 1000);
    return () => window.clearTimeout(t);
  }, [cuenta]);

  const markCompleteRef = useRef<((silencioso?: boolean) => void) | null>(null);
  useEffect(() => {
    markCompleteRef.current = (silencioso = false) => {
      if (currentLesson) void marcarCompletada(currentLesson, silencioso);
    };
  });

  const handleTimeUpdate = useCallback((currentTime: number, duration?: number) => {
    if (!inscripcionId || !currentLesson) return;
    // Duración real: la que reporta el reproductor o, si no, la guardada en la lección.
    if (duration && duration > 0) videoDuration.current = duration;
    else if (!videoDuration.current && currentLesson.duration) videoDuration.current = currentLesson.duration;

    const now = Date.now();
    if (now - lastSentTime.current < 10_000) return; // throttle 10s
    lastSentTime.current = now;

    // Sin duración conocida no se puede calcular el porcentaje; antes se usaba 1 s
    // y cualquier reproducción contaba como 100 %.
    const total = videoDuration.current;
    const pct = total > 0 ? Math.min(100, Math.round((currentTime / total) * 100)) : 0;

    progresoApi.registrar({
      inscripcion_id: inscripcionId,
      leccion_id: currentLesson.id,
      visto_seg: Math.round(currentTime),
      progreso_pct: pct,
    }).catch((e) => logError('CourseVideoContent/handleTimeUpdate', e));

    // Al pasar el umbral el backend ya la da por completada: reflejarlo en la
    // lista (palomita) sin esperar a que el video termine.
    if (pct >= (currentLesson.umbralPct ?? 90) && !currentLesson.completed) markCompleteRef.current?.(true);
  }, [inscripcionId, currentLesson]);

  // Tiempo real: otra pestaña completó una lección de este curso, o el alumno
  // volvió a esta pestaña (puede haber avanzado en otro equipo).
  useProgresoEnVivo((evento) => {
    if (evento) {
      if (evento.cursoId === course.id) aplicarCompletada([evento.leccionId]);
      return;
    }
    if (!inscripcionId) return;
    (progresoApi.curso(course.id) as Promise<{ progreso_por_leccion: { leccion_id: string; completado: boolean }[] }>)
      .then((p) => aplicarCompletada(p.progreso_por_leccion.filter((x) => x.completado).map((x) => x.leccion_id)))
      .catch((e) => logError('CourseVideoContent/progresoEnVivo', e));
  });

  const handleDescargarCert = async (folio: string) => {
    setDownloading(true);
    try {
      await certificadosApi.descargar(folio);
    } catch (e) {
      logError('CourseVideoContent/handleDescargarCert', e);
    } finally {
      setDownloading(false);
    }
  };

  const header = (
    <header className={styles.header}>
      <div className={styles.headerContent}>
        <Link href={resolvedNavHref} className={styles.logoLink}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/logo.png" alt="NextGen" className={styles.logoImg} />
          <span className={styles.logoTitle}>
            <span className={styles.logoBold}>NextGen</span>
            <span className={styles.logoLight}> Course</span>
          </span>
        </Link>
        {showUserMenu && <StudentUserMenu />}
      </div>
    </header>
  );

  if (!currentLesson) {
    return (
      <div className={styles.container}>
        {header}
        <div className={styles.main}>
          <div className={styles.backButtonContainer}>
            <BackLink href={resolvedBackHref}>Información del curso</BackLink>
          </div>
          <p style={{ textAlign: 'center', padding: '3rem', color: 'var(--color-text-secondary)' }}>
            Este curso aún no tiene lecciones disponibles.
          </p>
        </div>
      </div>
    );
  }

  const cursoCompleto = lecciones.length > 0 && lecciones.every((l) => l.completed);
  const tituloCurso = proceso ? sinPrefijo(course.title, proceso.titulo) : course.title;

  return (
    <div className={styles.container}>
      {header}

      <div className={styles.main}>
        <div className={styles.backButtonContainer}>
          <BackLink href={resolvedBackHref}>{proceso ? `Información de ${proceso.titulo}` : 'Información del curso'}</BackLink>
        </div>
        {proceso && (
          <p className={styles.processEyebrow}>
            {proceso.titulo} · Curso {proceso.posicion} de {proceso.total}
          </p>
        )}
        <h1 className={styles.pageTitle}>{tituloCurso}</h1>

        {readOnlyMode && (
          <div className={styles.readOnlyBanner}>
            Vista de supervisor: puedes revisar módulos, videos, recursos y preguntas sin inscribirte ni modificar progreso.
          </div>
        )}

        {esAlumno && cursoCompleto && (
          <div className={styles.certBanner}>
            <div className={styles.certBannerText}>
              <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="8" r="6" /><path d="M8.21 13.89L7 23l5-3 5 3-1.21-9.12" /></svg>
              <span>{certFolio ? '¡Curso completado! Tu certificado está listo.' : '¡Curso completado!'}</span>
            </div>
            <div className={styles.certBannerActions}>
              <Link
                href={proceso ? `/curso/${proceso.id}?curso=${course.id}#resenas` : `/curso/${course.id}#resenas`}
                className={styles.certBannerLink}
              >
                Calificar el curso
              </Link>
              {certFolio && (
                <button
                  className={styles.certBannerBtn}
                  disabled={downloading}
                  onClick={() => handleDescargarCert(certFolio)}
                >
                  {downloading ? 'Descargando...' : 'Descargar certificado'}
                </button>
              )}
              {siguienteCurso && (
                <Link href={`/curso/${siguienteCurso.id}/videos`} className={styles.certBannerLink}>
                  Ir a {siguienteCurso.titulo}
                </Link>
              )}
            </div>
          </div>
        )}

        <div className={styles.contentGrid}>
          <LessonsSidebar
            modules={course.modules}
            currentLessonId={currentLesson.id}
            onLessonSelect={handleLessonSelect}
            storageKey={`aula-modulos-${course.id}`}
          />

          <div className={styles.videoSection} ref={videoSectionRef}>
            {currentLesson.tipo === 'quiz' ? (
              <QuizPlayer
                key={currentLesson.id}
                leccionId={currentLesson.id}
                inscripcionId={inscripcionId ?? null}
                quizData={normalizeQuizData(currentLesson.contenido ?? currentLesson)}
                onAprobado={readOnlyMode ? undefined : () => { void terminarLeccion(); }}
                previewMode={previewMode}
                readOnlyMode={readOnlyMode}
              />
            ) : (
              <>
                {currentLesson.tipo === 'lectura' && (
                  <article className={styles.readingCard}>
                    <span className={styles.readingTag}>Lectura</span>
                    <h2 className={styles.readingTitle}>{currentLesson.name}</h2>
                    {currentLesson.resumen && currentLesson.resumen.trim() ? (
                      <div className={styles.readingBody}>{currentLesson.resumen}</div>
                    ) : (
                      <p className={styles.readingEmpty}>Esta lectura aún no tiene contenido. Revisa los recursos de la lección.</p>
                    )}
                  </article>
                )}
                {currentLesson.tipo !== 'lectura' && (
                  <VideoPlayer
                    key={currentLesson.id}
                    config={bunnyConfig}
                    videoUrl={currentLesson.videoUrl}
                    autoPlay={autoReproducir}
                    onTimeUpdate={handleTimeUpdate}
                    onEnded={() => {
                      handleTimeUpdate(videoDuration.current);
                      void terminarLeccion();
                    }}
                  />
                )}
              </>
            )}

            {/* Anterior / siguiente: con el nombre real de la lección (y el
                siguiente curso del proceso al final), no botones genéricos. */}
            <nav className={styles.lessonNav} aria-label="Moverse entre lecciones">
              {anterior ? (
                <button type="button" className={styles.navLink} onClick={() => irALeccion(anterior)}>
                  <span className={styles.navLabel}>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M15 6l-6 6 6 6" /></svg>
                    Anterior
                  </span>
                  <span className={styles.navTitle}>
                    <TipoIcon tipo={anterior.tipo} />
                    {anterior.name}
                  </span>
                </button>
              ) : (
                <span />
              )}
              <span className={styles.navPos} aria-label={`Lección ${idxActual + 1} de ${lecciones.length}`}>
                {idxActual + 1}<span aria-hidden="true"> / </span>{lecciones.length}
              </span>
              {siguiente ? (
                <button
                  type="button"
                  className={`${styles.navLink} ${styles.navNext}`}
                  onClick={() => irALeccion(siguiente, { auto: true })}
                >
                  <span className={styles.navLabel}>
                    {siguiente.moduleId !== currentLesson.moduleId ? 'Siguiente módulo' : 'Siguiente'}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" /></svg>
                  </span>
                  <span className={styles.navTitle}>
                    <TipoIcon tipo={siguiente.tipo} />
                    {siguiente.name}
                  </span>
                </button>
              ) : siguienteCurso ? (
                <Link href={`/curso/${siguienteCurso.id}/videos`} className={`${styles.navLink} ${styles.navNext}`}>
                  <span className={styles.navLabel}>
                    Siguiente curso · {proceso?.titulo} {(proceso?.posicion ?? 0) + 1}/{proceso?.total}
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M9 6l6 6-6 6" /></svg>
                  </span>
                  <span className={styles.navTitle}>{siguienteCurso.titulo}</span>
                </Link>
              ) : (
                <span />
              )}
            </nav>

            {currentLesson.tipo !== 'quiz' && (
              <>
                <VideoControls
                  progress={progress}
                  completed={currentLesson.completed}
                  tipo={currentLesson.tipo}
                  onMarkComplete={() => { void terminarLeccion(); }}
                  resources={currentLesson.resources}
                  resumen={currentLesson.resumen}
                  courseId={course.id}
                  lessonId={currentLesson.id}
                  certFolio={certFolio}
                  onDownloadCert={handleDescargarCert}
                  downloading={downloading}
                  readOnlyMode={readOnlyMode}
                />
                <LessonComments key={`comentarios-${currentLesson.id}`} lessonId={currentLesson.id} />
              </>
            )}
          </div>
        </div>
      </div>

      {cuenta && (
        <UpNextCard
          label={
            cuenta.destino.tipo === 'curso'
              ? 'Siguiente curso'
              : cuenta.destino.moduloNuevo
                ? 'Siguiente módulo'
                : 'Siguiente lección'
          }
          title={cuenta.destino.tipo === 'curso' ? cuenta.destino.titulo : cuenta.destino.leccion.name}
          detail={cuenta.destino.tipo === 'leccion' ? cuenta.destino.moduloNuevo : proceso ? `${proceso.titulo} · Curso ${proceso.posicion + 1} de ${proceso.total}` : null}
          secondsLeft={cuenta.restante}
          totalSeconds={CUENTA_SEG}
          onGo={() => irADestino(cuenta.destino)}
          onCancel={() => setCuenta(null)}
        />
      )}

      {completionModal && (
        <div className={styles.modalOverlay} onClick={() => setCompletionModal(null)}>
          <div className={styles.modalCard} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-labelledby="modal-fin-titulo">
            <button className={styles.modalClose} onClick={() => setCompletionModal(null)} aria-label="Cerrar">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
            <div className={styles.modalIcon}><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg></div>
            <h2 id="modal-fin-titulo" className={styles.modalTitle}>¡Felicidades!</h2>
            <p className={styles.modalSubtitle}>
              {siguienteCurso
                ? `Terminaste ${tituloCurso}. Sigue con el curso ${(proceso?.posicion ?? 0) + 1} de ${proceso?.total} de ${proceso?.titulo}.`
                : 'Completaste el curso. Cuéntale a otros qué te pareció.'}
            </p>
            <div className={styles.modalActions}>
              {siguienteCurso && (
                <button
                  className={styles.modalBtnPrimary}
                  onClick={() => router.push(`/curso/${siguienteCurso.id}/videos`)}
                >
                  Siguiente curso: {siguienteCurso.titulo}
                </button>
              )}
              <button
                className={siguienteCurso ? styles.modalBtnSecondary : styles.modalBtnPrimary}
                disabled={completionModal.loading || !completionModal.folio || downloading}
                onClick={() => completionModal.folio && handleDescargarCert(completionModal.folio)}
              >
                {completionModal.loading
                  ? 'Generando certificado...'
                  : downloading
                  ? 'Descargando...'
                  : completionModal.folio
                  ? 'Descargar certificado'
                  : 'Certificado no disponible'}
              </button>
              <button
                className={styles.modalBtnSecondary}
                onClick={() => router.push(proceso ? `/curso/${proceso.id}?curso=${course.id}#resenas` : `/curso/${course.id}#resenas`)}
              >
                Calificar el curso
              </button>
              {!siguienteCurso && (
                <button
                  className={styles.modalBtnSecondary}
                  onClick={() => router.push(proceso ? `/curso/${proceso.id}` : '/mis-cursos')}
                >
                  {proceso ? `Volver a ${proceso.titulo}` : 'Ir a Mis cursos'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
