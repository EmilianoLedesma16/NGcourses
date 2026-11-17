'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { adminApi } from '@/lib/api/client';
import PageHeader from '@/components/admin/PageHeader';
import styles from '@/components/dashboard/Dashboard.module.css';
import { Actividad, Embudo, Ranking } from '@/components/dashboard/Charts';

interface Stats {
  cursos_por_estado: Record<string, number>;
  usuarios: number;
  alumnos: number;
  organizaciones: number;
  embudo: { inscritos: number; sin_iniciar: number; en_curso: number; terminaron: number; certificados: number };
  semanas: { inicio: string; inscripciones: number; lecciones_completadas: number }[];
  top_cursos: { id: string; titulo: string; inscritos: number; terminaron: number; avance_promedio: number }[];
  por_organizacion: { id: string; nombre: string; alumnos: number; inscripciones: number; avance_promedio: number }[];
}

const n = (v: number) => v.toLocaleString('es-MX');

/* ── Catálogo: anillo por estado de curso ──────────────────────────────── */
function Catalogo({ porEstado }: { porEstado: Record<string, number> }) {
  const orden = [
    { key: 'publicado', label: 'Publicados', cls: styles.ringPub },
    { key: 'revision', label: 'En revisión', cls: styles.ringRev },
    { key: 'borrador', label: 'Borradores', cls: styles.ringDraft },
    { key: 'rechazado', label: 'Rechazados', cls: styles.ringRej },
    // Sin esta fila el centro (total) no cuadraba con la suma de la leyenda.
    { key: 'archivado', label: 'Archivados', cls: styles.ringArch },
  ].filter((o) => (porEstado[o.key] ?? 0) > 0);
  const total = Object.values(porEstado).reduce((a, b) => a + b, 0);
  const r = 46, c = 2 * Math.PI * r;
  let acc = 0;
  const revision = porEstado.revision ?? 0;

  return (
    <section className={styles.panel} aria-labelledby="catalogo-titulo">
      <div className={styles.panelHead}>
        <h2 id="catalogo-titulo" className={styles.panelTitle}>Catálogo</h2>
        <Link href="/admin/cursos" className={styles.link}>Ver cursos</Link>
      </div>
      <div className={styles.catalog}>
        <svg viewBox="0 0 120 120" className={styles.ring} role="img"
          aria-label={orden.map((o) => `${o.label}: ${porEstado[o.key]}`).join(', ')}>
          <circle cx="60" cy="60" r={r} className={styles.ringTrack} />
          {orden.map((o) => {
            const len = (c * (porEstado[o.key] ?? 0)) / Math.max(1, total);
            const el = (
              <circle key={o.key} cx="60" cy="60" r={r} className={`${styles.ringSeg} ${o.cls}`}
                strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-acc} transform="rotate(-90 60 60)" />
            );
            acc += len;
            return el;
          })}
          <text x="60" y="58" textAnchor="middle" className={styles.ringNum}>{total}</text>
          <text x="60" y="76" textAnchor="middle" className={styles.ringCap}>cursos</text>
        </svg>
        <ul className={styles.catalogList}>
          {orden.map((o) => (
            <li key={o.key}>
              <i className={`${styles.swatch} ${o.cls}`} aria-hidden="true" />
              <span>{o.label}</span>
              <b>{porEstado[o.key]}</b>
            </li>
          ))}
        </ul>
      </div>
      {revision > 0 && (
        <Link href="/admin/solicitudes" className={styles.callout}>
          <span><b>{revision}</b> {revision === 1 ? 'curso espera' : 'cursos esperan'} tu revisión</span>
          <span className={styles.calloutGo}>Revisar</span>
        </Link>
      )}
    </section>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    (adminApi.stats() as Promise<Stats>).then(setStats).catch(() => setError(true));
  }, []);

  const hoy = new Intl.DateTimeFormat('es-MX', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());

  return (
    <div className={styles.dashboard}>
      <PageHeader
        title="Inicio"
        subtitle={stats ? `${hoy.charAt(0).toUpperCase()}${hoy.slice(1)} · ${n(stats.alumnos)} alumnos en ${n(stats.organizaciones)} empresas` : hoy}
        actions={<Link href="/admin/cursos/crear" className="ng-btn ng-btn-primary">Crear curso</Link>}
      />

      {error && <p className={styles.empty}>No se pudieron cargar las cifras. Recarga la página.</p>}
      {!stats && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Cargando cifras" />}

      {stats && (
        <>
          <Embudo e={stats.embudo} />
          <div className={styles.row}>
            <Actividad semanas={stats.semanas} />
            <Catalogo porEstado={stats.cursos_por_estado} />
          </div>
          <div className={styles.rowEven}>
            <Ranking
              title="Cursos con más alumnos" id="top-cursos" href="/admin/cursos"
              rows={stats.top_cursos.map((c) => ({
                key: c.id, name: c.titulo, href: `/admin/cursos/${c.id}/editar`, avance: c.avance_promedio,
                meta: `${n(c.inscritos)} inscritos · ${n(c.terminaron)} terminaron`,
              }))}
            />
            <Ranking
              title="Empresas" id="empresas" href="/admin/organizaciones"
              rows={stats.por_organizacion.map((o) => ({
                key: o.id, name: o.nombre, href: `/admin/organizaciones/${o.id}`, avance: o.avance_promedio,
                meta: `${n(o.alumnos)} alumnos · ${n(o.inscripciones)} inscripciones`,
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
