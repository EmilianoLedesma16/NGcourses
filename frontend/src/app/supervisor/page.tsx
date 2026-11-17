'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supervisorApi } from '@/lib/api/client';
import { logError } from '@/lib/logger';
import PageHeader from '@/components/admin/PageHeader';
import { Actividad, Embudo, Kpis, Ranking, n, type EmbudoData, type SemanaData } from '@/components/dashboard/Charts';
import styles from '@/components/dashboard/Dashboard.module.css';

interface Stats {
  usuarios_totales: number;
  usuarios_activos: number;
  progreso_promedio: number;
  cursos_disponibles: number;
  inscripciones_totales: number;
}

interface Dashboard {
  embudo: EmbudoData;
  semanas: SemanaData[];
  cursos: { id: string; titulo: string; inscritos: number; terminaron: number; avance_promedio: number }[];
  alumnos: { id: string; nombre: string; cursos: number; terminados: number; avance_promedio: number }[];
  alumnos_sin_inscripcion: number;
}

export default function SupervisorDashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [orgName, setOrgName] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      supervisorApi.stats() as Promise<Stats>,
      supervisorApi.dashboard() as Promise<Dashboard>,
    ])
      .then(([s, d]) => { setStats(s); setDash(d); })
      .catch((e) => { logError('supervisor.dashboard', e); setError(true); });
    (supervisorApi.miOrganizacion() as Promise<{ nombre: string }>)
      .then((o) => setOrgName(o.nombre))
      .catch(() => {});
  }, []);

  const sinCursos = dash?.alumnos_sin_inscripcion ?? 0;

  return (
    <div className={styles.dashboard}>
      <PageHeader
        title="Inicio"
        subtitle={orgName ?? 'Avance de tu organización'}
        actions={<Link href="/supervisor/invitaciones" className="ng-btn ng-btn-primary">Invitar alumnos</Link>}
      />

      {error && <p className={styles.empty}>No se pudieron cargar las cifras. Recarga la página.</p>}
      {!dash && !error && <div className={styles.skeleton} aria-busy="true" aria-label="Cargando cifras" />}

      {stats && dash && (
        <>
          <Kpis
            items={[
              { label: 'Alumnos', value: n(stats.usuarios_totales), hint: `${n(stats.usuarios_activos)} con cuenta activa` },
              { label: 'Cursos asignados', value: n(stats.cursos_disponibles) },
              { label: 'Inscripciones', value: n(stats.inscripciones_totales) },
              { label: 'Avance promedio', value: `${Math.round(stats.progreso_promedio)}%` },
            ]}
          />
          <Embudo e={dash.embudo} sub={`${n(dash.embudo.inscritos)} inscripciones en los cursos de tu organización`} />
          <div className={styles.rowEven}>
            <Actividad semanas={dash.semanas} />
            <Ranking
              title="Avance por curso" id="avance-cursos" href="/supervisor/cursos"
              empty="Tus alumnos aún no se inscriben a ningún curso."
              rows={dash.cursos.map((c) => ({
                key: c.id, name: c.titulo, avance: c.avance_promedio,
                meta: `${n(c.inscritos)} ${c.inscritos === 1 ? 'alumno' : 'alumnos'} · ${n(c.terminaron)} terminaron`,
              }))}
            />
          </div>
          <Ranking
            title="Avance por alumno" id="avance-alumnos" href="/supervisor/usuarios"
            empty="Todavía no hay alumnos inscritos."
            rows={dash.alumnos.map((a) => ({
              key: a.id, name: a.nombre, avance: a.avance_promedio,
              meta: `${n(a.cursos)} ${a.cursos === 1 ? 'curso' : 'cursos'} · ${n(a.terminados)} terminados`,
            }))}
          />
          {sinCursos > 0 && (
            <p className={styles.empty} style={{ margin: 0 }}>
              {sinCursos === 1 ? '1 alumno aún no se inscribe' : `${sinCursos} alumnos aún no se inscriben`} a ningún curso.{' '}
              <Link href="/supervisor/invitaciones" className={styles.link}>Enviar invitaciones</Link>
            </p>
          )}
        </>
      )}
    </div>
  );
}
