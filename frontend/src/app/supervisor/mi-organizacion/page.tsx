'use client';

import { useEffect, useState } from 'react';
import { supervisorApi } from '@/lib/api/client';
import { logError } from '@/lib/logger';
import PageHeader from '@/components/admin/PageHeader';
import ui from '@/components/admin/Panel.module.css';

interface Organizacion {
  id: string;
  nombre: string;
  email_contacto: string | null;
  telefono_contacto: string | null;
  plan_de_cursos: string | null;
  fecha_compra: string | null;
}

const fecha = (iso: string | null) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
};

export default function MiOrganizacionPage() {
  const [org, setOrg] = useState<Organizacion | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supervisorApi.miOrganizacion()
      .then((o) => setOrg(o as Organizacion))
      .catch((e) => logError('supervisor.miOrganizacion', e))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className={ui.page}>
      <PageHeader title="Mi organización" subtitle="Datos de tu organización registrados en NextGen" />

      {loading ? (
        <p className={ui.empty}>Cargando…</p>
      ) : !org ? (
        <div className={`${ui.card} ${ui.empty}`}>Tu cuenta aún no tiene una organización asignada. Contacta a NextGen.</div>
      ) : (
        <section className={ui.card}>
          <dl className={ui.dl}>
            <dt>Nombre</dt><dd>{org.nombre}</dd>
            <dt>Correo de contacto</dt><dd>{org.email_contacto || '—'}</dd>
            <dt>Teléfono</dt><dd>{org.telefono_contacto || '—'}</dd>
            <dt>Plan de cursos</dt><dd style={{ whiteSpace: 'pre-line' }}>{org.plan_de_cursos || '—'}</dd>
            <dt>Fecha de compra</dt><dd>{fecha(org.fecha_compra)}</dd>
          </dl>
        </section>
      )}
    </div>
  );
}
