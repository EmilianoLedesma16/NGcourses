'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supervisorApi } from '@/lib/api/client';
import { logError } from '@/lib/logger';
import PageHeader from '@/components/admin/PageHeader';
import ui from '@/components/admin/Panel.module.css';

interface Curso {
  id: string;
  titulo: string;
  descripcion: string | null;
  portada_url: string | null;
  marca: string;
}

function descripcionVisible(c: Curso): string | null {
  const d = c.descripcion?.trim();
  if (!d || d.toLowerCase() === c.titulo.trim().toLowerCase()) return null;
  return d;
}

export default function SupervisorCursosPage() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supervisorApi.cursos()
      .then((data) => setCursos(data as Curso[]))
      .catch((e) => logError('supervisor.cursos', e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={ui.page}>
      <PageHeader
        title="Cursos"
        subtitle="Cursos con licencia vigente para tu organización"
        actions={<Link href="/supervisor/solicitudes" className="ng-btn ng-btn-secondary">Solicitar un curso</Link>}
      />

      {loading ? (
        <p className={ui.empty}>Cargando…</p>
      ) : cursos.length === 0 ? (
        <div className={`${ui.card} ${ui.empty}`}>Aún no tienes cursos asignados.</div>
      ) : (
        <div className={ui.grid}>
          {cursos.map((c) => {
            const desc = descripcionVisible(c);
            return (
              <Link key={c.id} href={`/curso/${c.id}`} className={ui.tile}>
                <span className={`${ui.badge} ${ui.badgeInfo}`} style={{ alignSelf: 'flex-start' }}>
                  {c.marca === 'ram' ? 'RAM' : 'NextGen'}
                </span>
                <h2 className={ui.tileTitle}>{c.titulo}</h2>
                {desc && <p className={ui.tileText}>{desc}</p>}
                <span className={ui.tileFoot}>
                  Revisar contenido <b aria-hidden="true">→</b>
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
