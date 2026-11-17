'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { supervisorApi } from '@/lib/api/client';
import { logError } from '@/lib/logger';
import PageHeader from '@/components/admin/PageHeader';
import ui from '@/components/admin/Panel.module.css';

interface Comentario {
  comentario: string;
  creado_en: string;
}

interface Solicitud {
  id: string;
  titulo_solicitud: string;
  descripcion: string | null;
  estado: string;
  creado_en: string;
  actualizado_en: string | null;
  comentarios: Comentario[];
}

const ESTADO_LABEL: Record<string, string> = {
  abierta: 'Pendiente',
  en_revision: 'En revisión',
  aprobada: 'Aprobada',
  rechazada: 'Rechazada',
  cerrada: 'Cerrada',
};

export default function SupervisorSolicitudesPage() {
  const [solicitudes, setSolicitudes] = useState<Solicitud[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ titulo_solicitud: '', descripcion: '' });
  const [submitLoading, setSubmitLoading] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await supervisorApi.listarSolicitudes() as Solicitud[];
      setSolicitudes(data);
    } catch (e) {
      logError('supervisor.listarSolicitudes', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setMsg('');
    setErr('');
    try {
      await supervisorApi.crearSolicitud({
        titulo_solicitud: form.titulo_solicitud,
        descripcion: form.descripcion || undefined,
      });
      setMsg('Solicitud enviada. Verás la respuesta de NextGen en el historial.');
      setForm({ titulo_solicitud: '', descripcion: '' });
      load();
    } catch (error: unknown) {
      const apiErr = error as { detail?: string };
      setErr(apiErr?.detail || 'Error al enviar solicitud');
    } finally {
      setSubmitLoading(false);
    }
  };

  const formatDate = (iso: string) => {
    try { return new Date(iso).toLocaleDateString('es-MX'); } catch { return '—'; }
  };

  const ESTADO_CLS: Record<string, string> = {
    abierta: ui.badgeWarn, en_revision: ui.badgeInfo, aprobada: ui.badgeOk, rechazada: ui.badgeBad,
  };

  return (
    <div className={ui.page}>
      <PageHeader title="Solicitudes" subtitle="Pide nuevos cursos a NextGen y sigue el estado de tus solicitudes" />

      <section className={ui.card} aria-labelledby="sol-nueva">
        <div className={ui.cardHead}>
          <h2 id="sol-nueva" className={ui.cardTitle}>Nueva solicitud</h2>
        </div>
        <form onSubmit={handleSubmit} className={ui.form}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="sol-titulo">Curso que necesitas</label>
            <input id="sol-titulo" maxLength={255} type="text" required className={ui.input}
              value={form.titulo_solicitud}
              onChange={(e) => setForm({ ...form, titulo_solicitud: e.target.value })}
              placeholder="Ej. Liderazgo para mandos medios" />
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="sol-desc">Detalles <span className={ui.hint}>· opcional</span></label>
            <textarea id="sol-desc" rows={3} maxLength={2000} className={ui.textarea}
              value={form.descripcion}
              onChange={(e) => setForm({ ...form, descripcion: e.target.value })}
              placeholder="A quién va dirigido, temas que debe cubrir, fechas…" />
          </div>
          {err && <p className={ui.msgError}>{err}</p>}
          {msg && <p className={ui.msgOk}>{msg}</p>}
          <div className={ui.actions}>
            <button type="submit" className="ng-btn ng-btn-primary" disabled={submitLoading}>
              {submitLoading ? 'Enviando…' : 'Enviar solicitud'}
            </button>
          </div>
        </form>
      </section>

      <section aria-labelledby="sol-historial" className={ui.block}>
        <div className={ui.cardHead}>
          <h2 id="sol-historial" className={ui.cardTitle}>Historial</h2>
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Solicitud</th>
                <th>Estado</th>
                <th>Respuesta de NextGen</th>
                <th>Fecha</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className={ui.empty}>Cargando…</td></tr>
              ) : solicitudes.length === 0 ? (
                <tr><td colSpan={4} className={ui.empty}>Aún no has enviado solicitudes.</td></tr>
              ) : (
                solicitudes.map((s) => (
                  <tr key={s.id}>
                    <td className={ui.wrapText}>
                      <span className={ui.strong}>{s.titulo_solicitud}</span>
                      {s.descripcion && <span className={ui.subline}>{s.descripcion}</span>}
                    </td>
                    <td><span className={`${ui.badge} ${ESTADO_CLS[s.estado] ?? ''}`}>{ESTADO_LABEL[s.estado] || s.estado}</span></td>
                    <td className={ui.wrapText}>
                      {s.comentarios && s.comentarios.length > 0 ? (
                        s.comentarios.map((c, i) => (
                          <p key={i} className={ui.comment}>
                            {c.comentario}
                            <span className={ui.subline}>{formatDate(c.creado_en)}</span>
                          </p>
                        ))
                      ) : (
                        <span className={ui.muted}>—</span>
                      )}
                    </td>
                    <td className={`${ui.num} ${ui.muted}`}>{formatDate(s.creado_en)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
