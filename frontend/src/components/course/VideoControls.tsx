'use client';

import { useState } from 'react';
import type { Resource } from '@/types/course';
import { cursosApi } from '@/lib/api/client';
import { logError } from '@/lib/logger';
import styles from './VideoControls.module.css';

interface VideoControlsProps {
  progress: number;
  onMarkComplete: () => void;
  /** La lección actual ya está completada (palomita). */
  completed?: boolean;
  /** Tipo de lección: el video se completa solo al terminarlo. */
  tipo?: 'video' | 'quiz' | 'lectura';
  resources?: Resource[];
  resumen?: string;
  courseId?: string;
  lessonId?: string;
  certFolio?: string | null;
  onDownloadCert?: (folio: string) => void;
  downloading?: boolean;
  readOnlyMode?: boolean;
}

export default function VideoControls({
  progress,
  onMarkComplete,
  completed = false,
  tipo = 'video',
  resources,
  resumen,
  certFolio,
  onDownloadCert,
  downloading,
  readOnlyMode = false,
}: VideoControlsProps) {
  const [activeTab, setActiveTab] = useState<'resumen' | 'recursos'>('resumen');
  const [descargandoRecurso, setDescargandoRecurso] = useState<string | null>(null);

  const handleDescargarRecurso = async (recursoId: string) => {
    setDescargandoRecurso(recursoId);
    try {
      await cursosApi.descargarRecurso(recursoId);
    } catch (e) {
      logError('VideoControls/descargarRecurso', e);
    } finally {
      setDescargandoRecurso(null);
    }
  };


  // Las reseñas viven en la ficha del curso, no en cada lección. Las notas
  // personales se retiraron: vivían solo en el navegador (se perdían al cambiar
  // de equipo o limpiar datos) y el alumno ya toma notas por su cuenta.
  const tabs = ['resumen', 'recursos'] as const;

  const getFileIcon = (type: Resource['type']) => {
    switch (type) {
      case 'docx': return 'W';
      case 'xlsx': return 'X';
      case 'pdf': return 'P';
      default: return 'F';
    }
  };

  const getFileColor = (type: Resource['type']) => {
    switch (type) {
      case 'docx': return styles.iconWord;
      case 'xlsx': return styles.iconExcel;
      case 'pdf': return styles.iconPdf;
      default: return styles.iconOther;
    }
  };

  if (readOnlyMode) {
    return (
      <div className={styles.readOnlyPanel}>
        <h3 className={styles.readOnlyTitle}>Vista de solo lectura</h3>
        <p className={styles.readOnlyText}>
          Puedes revisar esta lección sin marcar avance, publicar reseñas ni generar certificado.
        </p>
        <div className={styles.readOnlyResources}>
          <h4 className={styles.readOnlySubtitle}>Recursos de la lección</h4>
          {resources && resources.length > 0 ? (
            <ul className={styles.resourcesList}>
              {resources.map((resource) => (
                <li key={resource.id} className={styles.resourceItem}>
                  <span className={`${styles.resourceIcon} ${getFileColor(resource.type)}`}>
                    {getFileIcon(resource.type)}
                  </span>
                  <span className={styles.resourceName}>{resource.name}</span>
                  <button
                    type="button"
                    className={styles.downloadButton}
                    disabled={descargandoRecurso === resource.id}
                    onClick={() => handleDescargarRecurso(resource.id)}
                  >
                    {descargandoRecurso === resource.id ? 'Descargando...' : 'Descargar'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyMessage}>No hay recursos disponibles para esta lección.</p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className={styles.tabs}>
        {tabs.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
        <button className={styles.menuButton}>
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 6.75a.75.75 0 110-1.5.75.75 0 010 1.5zm0 6a.75.75 0 110-1.5.75.75 0 010 1.5zm0 6a.75.75 0 110-1.5.75.75 0 010 1.5z" /></svg>
        </button>
      </div>

      {activeTab === 'resumen' && (
        <div className={styles.tabContent}>
          {resumen && resumen.trim() ? (
            <p className={styles.summaryText}>{resumen}</p>
          ) : (
            <p className={styles.emptyMessage}>Esta lección no tiene un resumen disponible.</p>
          )}
        </div>
      )}

      {activeTab === 'recursos' && (
        <div className={styles.tabContent}>
          {resources && resources.length > 0 ? (
            <ul className={styles.resourcesList}>
              {resources.map((resource) => (
                <li key={resource.id} className={styles.resourceItem}>
                  <span className={`${styles.resourceIcon} ${getFileColor(resource.type)}`}>
                    {getFileIcon(resource.type)}
                  </span>
                  <span className={styles.resourceName}>{resource.name}</span>
                  <button
                    type="button"
                    className={styles.downloadButton}
                    disabled={descargandoRecurso === resource.id}
                    onClick={() => handleDescargarRecurso(resource.id)}
                  >
                    {descargandoRecurso === resource.id ? 'Descargando...' : 'Descargar'}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className={styles.emptyMessage}>No hay recursos disponibles para esta lección.</p>
          )}
        </div>
      )}

      <div className={styles.progressSection}>
        <p className={styles.progressLabel}>Progreso del curso</p>
        <div className={styles.progressBar}>
          <div className={styles.progressFill} style={{ width: `${progress}%` }} />
        </div>
        {/* El video se marca solo al terminarlo; el botón queda como respaldo y
            para las lecturas. Ya completada, el botón pasa a "siguiente". */}
        <button
          onClick={onMarkComplete}
          className={`${styles.completeButton} ${completed ? styles.completeButtonSuccess : ''}`}
        >
          {completed && (
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
          )}
          {completed
            ? 'Completada · Ir a lo siguiente'
            : tipo === 'lectura'
              ? 'Terminé la lectura'
              : 'Marcar como completada'}
        </button>
        {!completed && tipo === 'video' && (
          <p className={styles.autoHint}>Se marca sola al terminar el video.</p>
        )}
        {certFolio && (
          <button
            className={styles.certButton}
            disabled={downloading}
            onClick={() => onDownloadCert?.(certFolio)}
          >
            {!downloading && (
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} style={{ flexShrink: 0 }}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            )}
            {downloading ? 'Descargando...' : 'Descargar certificado'}
          </button>
        )}
      </div>
    </div>
  );
}
