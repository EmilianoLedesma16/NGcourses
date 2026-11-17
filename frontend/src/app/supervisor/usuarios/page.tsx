'use client';

import { useCallback, useEffect, useState } from 'react';
import { supervisorApi } from '@/lib/api/client';
import { logError } from '@/lib/logger';
import PageHeader from '@/components/admin/PageHeader';
import ui from '@/components/admin/Panel.module.css';

interface SupervisorUser {
  id: string;
  email: string;
  full_name: string | null;
  telefono: string | null;
  is_active: boolean;
  estado: string;
  rol_org: string;
  progreso_promedio: number;
  cursos_inscritos: number;
}

const ESTADO: Record<string, { label: string; cls: string }> = {
  activo: { label: 'Activo', cls: ui.badgeOk },
  pendiente_activacion: { label: 'Pendiente de activación', cls: ui.badgeWarn },
  suspendido: { label: 'Suspendido', cls: ui.badgeBad },
};

export default function SupervisorUsuariosPage() {
  const [users, setUsers] = useState<SupervisorUser[]>([]);
  const [loading, setLoading] = useState(true);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      setUsers((await supervisorApi.usuarios()) as SupervisorUser[]);
    } catch (e) {
      logError('supervisor.usuarios', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleQuitar = async (u: SupervisorUser) => {
    if (!confirm(`¿Quitar a ${u.full_name || u.email} de la organización? Perderá el acceso a los cursos de la organización.`)) return;
    try {
      await supervisorApi.quitarUsuario(u.id);
      loadUsers();
    } catch (e) {
      logError('supervisor.quitarUsuario', e);
      alert((e as { detail?: string })?.detail || 'No se pudo quitar al usuario.');
    }
  };

  const alumnos = users.filter((u) => u.rol_org !== 'admin_org');

  return (
    <div className={ui.page}>
      <PageHeader
        title="Usuarios"
        subtitle={loading ? 'Alumnos de tu organización' : `${alumnos.length} ${alumnos.length === 1 ? 'alumno' : 'alumnos'} en tu organización`}
      />

      <div className={ui.tableWrap}>
        <table className={ui.table}>
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Correo</th>
              <th>Estado</th>
              <th>Cursos</th>
              <th>Avance</th>
              <th aria-label="Acciones" />
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={6} className={ui.empty}>Cargando…</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={6} className={ui.empty}>Aún no hay usuarios en tu organización.</td></tr>
            ) : (
              users.map((u) => {
                const est = ESTADO[u.estado] ?? { label: u.estado, cls: '' };
                const esSupervisor = u.rol_org === 'admin_org';
                const pct = Math.round(u.progreso_promedio);
                return (
                  <tr key={u.id}>
                    <td className={ui.strong}>{u.full_name || '—'}</td>
                    <td className={ui.muted}>{u.email}</td>
                    <td><span className={`${ui.badge} ${est.cls}`}>{est.label}</span></td>
                    <td className={ui.num}>{esSupervisor ? '—' : u.cursos_inscritos}</td>
                    <td>
                      {esSupervisor ? (
                        <span className={ui.muted}>—</span>
                      ) : (
                        <span className={ui.progress} aria-label={`Avance ${pct}%`}>
                          <span><i style={{ width: `${pct}%` }} /></span>
                          {pct}%
                        </span>
                      )}
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      {esSupervisor ? (
                        <span className={`${ui.badge} ${ui.badgeInfo}`}>Supervisor</span>
                      ) : (
                        <button type="button" className={`${ui.rowBtn} ${ui.rowBtnDanger}`} onClick={() => handleQuitar(u)}>
                          Quitar
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
