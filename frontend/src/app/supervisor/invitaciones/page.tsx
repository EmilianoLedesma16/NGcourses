'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { supervisorApi } from '@/lib/api/client';
import { logError } from '@/lib/logger';
import type { EstadoInvitacion, InvitacionEnvioResult } from '@/types/admin';
import PageHeader from '@/components/admin/PageHeader';
import ui from '@/components/admin/Panel.module.css';

interface Invitacion {
  id: string;
  curso_id: string;
  curso_titulo: string;
  email: string;
  expira_en: string;
  usado_en: string | null;
  creado_en: string;
  estado: EstadoInvitacion;
}

interface Curso {
  id: string;
  titulo: string;
}

const ESTADO_LABEL: Record<EstadoInvitacion, string> = {
  pendiente: 'Pendiente',
  usada: 'Usada',
  expirada: 'Expirada',
};

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString('es-MX');
  } catch {
    return '—';
  }
}

export default function SupervisorInvitacionesPage() {
  const [cursos, setCursos] = useState<Curso[]>([]);
  const [cursoId, setCursoId] = useState('');
  const [emailsInput, setEmailsInput] = useState('');
  const [sending, setSending] = useState(false);
  const [resultados, setResultados] = useState<InvitacionEnvioResult[]>([]);

  const [invs, setInvs] = useState<Invitacion[]>([]);
  const [loading, setLoading] = useState(true);

  const [reenvying, setReenvying] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [rowMsg, setRowMsg] = useState<{ id: string; ok: boolean; text: string } | null>(null);

  const loadInvitaciones = useCallback(async () => {
    setLoading(true);
    try {
      const data = (await supervisorApi.listarInvitaciones()) as Invitacion[];
      setInvs(data);
    } catch (e) {
      logError('supervisor.listarInvitaciones', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadCursos = useCallback(async () => {
    try {
      const data = (await supervisorApi.cursos()) as Curso[];
      setCursos(data);
    } catch (e) {
      logError('supervisor.cursos', e);
    }
  }, []);

  useEffect(() => {
    loadCursos();
    loadInvitaciones();
  }, [loadCursos, loadInvitaciones]);

  async function handleSend() {
    const emails = emailsInput
      .split('\n')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!cursoId || emails.length === 0) return;

    setSending(true);
    setResultados([]);
    try {
      const res = (await supervisorApi.invitar({
        curso_id: cursoId,
        emails,
      })) as InvitacionEnvioResult[];
      setResultados(res);
      setEmailsInput('');
      await loadInvitaciones();
    } catch (e: unknown) {
      logError('supervisor.invitar', e);
      const err = e as { status?: number; detail?: string };
      const detalle =
        err?.status === 401 || err?.status === 403
          ? 'Tu sesión expiró. Vuelve a iniciar sesión e intenta de nuevo.'
          : err?.detail ?? 'Error al enviar las invitaciones';
      setResultados([{ email: 'Error al enviar', estado: 'error', detalle }]);
    } finally {
      setSending(false);
    }
  }

  async function handleReenviar(id: string) {
    setReenvying(id);
    setRowMsg(null);
    try {
      await supervisorApi.reenviarInvitacion(id);
      setRowMsg({ id, ok: true, text: 'Reenviada' });
      await loadInvitaciones();
    } catch (e) {
      logError('supervisor.reenviarInvitacion', e);
      setRowMsg({ id, ok: false, text: 'Error' });
    } finally {
      setReenvying(null);
      setTimeout(() => setRowMsg((m) => (m?.id === id ? null : m)), 3000);
    }
  }

  async function handleRevocar(id: string) {
    if (!confirm('¿Revocar esta invitación?')) return;
    setRevoking(id);
    try {
      await supervisorApi.revocarInvitacion(id);
      setInvs((prev) => prev.filter((i) => i.id !== id));
    } catch (e) {
      logError('supervisor.revocarInvitacion', e);
    } finally {
      setRevoking(null);
    }
  }

  const puedeEnviar = Boolean(cursoId) && emailsInput.trim().length > 0 && !sending;

  const RESULT_CLS: Record<string, string> = { enviada: ui.badgeOk, ya_inscrito: ui.badgeInfo };
  const ESTADO_CLS: Record<string, string> = { pendiente: ui.badgeWarn, usada: ui.badgeOk, expirada: '' };

  return (
    <div className={ui.page}>
      <PageHeader title="Invitaciones" subtitle="Invita a tus alumnos a un curso de tu organización y revisa el historial" />

      <section className={ui.card} aria-labelledby="inv-nueva">
        <div className={ui.cardHead}>
          <h2 id="inv-nueva" className={ui.cardTitle}>Enviar invitaciones</h2>
        </div>
        <div className={ui.form}>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="curso-select">Curso</label>
            <select id="curso-select" className={ui.select} value={cursoId} onChange={(e) => setCursoId(e.target.value)}>
              <option value="">Selecciona un curso</option>
              {cursos.map((c) => (
                <option key={c.id} value={c.id}>{c.titulo}</option>
              ))}
            </select>
          </div>
          <div className={ui.field}>
            <label className={ui.label} htmlFor="emails-textarea">
              Correos <span className={ui.hint}>· uno por línea</span>
            </label>
            <textarea
              id="emails-textarea"
              className={ui.textarea}
              placeholder={'alumno1@empresa.com\nalumno2@empresa.com'}
              value={emailsInput}
              onChange={(e) => setEmailsInput(e.target.value)}
            />
          </div>
          <div className={ui.actions}>
            <button type="button" className="ng-btn ng-btn-primary" onClick={handleSend} disabled={!puedeEnviar}>
              {sending ? 'Enviando…' : 'Enviar invitaciones'}
            </button>
          </div>
          {resultados.length > 0 && (
            <ul className={ui.resultList}>
              {resultados.map((r) => (
                <li key={r.email}>
                  <span className={ui.strong}>{r.email}</span>
                  <span className={`${ui.badge} ${RESULT_CLS[r.estado] ?? ui.badgeBad}`}>
                    {r.estado === 'enviada'
                      ? 'Enviada'
                      : r.estado === 'ya_inscrito'
                        ? 'Ya inscrito'
                        : r.estado === 'invalido'
                          ? `Correo inválido${r.detalle ? `: ${r.detalle}` : ''}`
                          : `Error${r.detalle ? `: ${r.detalle}` : ''}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section aria-labelledby="inv-historial" className={ui.block}>
        <div className={ui.cardHead}>
          <h2 id="inv-historial" className={ui.cardTitle}>Historial</h2>
          {!loading && <span className={ui.cardMeta}>{invs.length} {invs.length === 1 ? 'invitación' : 'invitaciones'}</span>}
        </div>
        <div className={ui.tableWrap}>
          <table className={ui.table}>
            <thead>
              <tr>
                <th>Correo</th>
                <th>Curso</th>
                <th>Estado</th>
                <th>Enviada</th>
                <th>Expira</th>
                <th aria-label="Acciones" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className={ui.empty}>Cargando…</td></tr>
              ) : invs.length === 0 ? (
                <tr><td colSpan={6} className={ui.empty}>Aún no has enviado invitaciones.</td></tr>
              ) : (
                invs.map((inv) => {
                  const msg = rowMsg?.id === inv.id ? rowMsg : null;
                  return (
                    <tr key={inv.id}>
                      <td className={ui.strong}>{inv.email}</td>
                      <td className={ui.wrapText}>{inv.curso_titulo}</td>
                      <td>
                        <span className={`${ui.badge} ${ESTADO_CLS[inv.estado] ?? ''}`}>{ESTADO_LABEL[inv.estado] || inv.estado}</span>
                      </td>
                      <td className={`${ui.num} ${ui.muted}`}>{formatDate(inv.creado_en)}</td>
                      <td className={`${ui.num} ${ui.muted}`}>{formatDate(inv.expira_en)}</td>
                      <td>
                        <div className={ui.rowActions}>
                          <button
                            type="button"
                            className={ui.rowBtn}
                            disabled={inv.estado === 'usada' || reenvying === inv.id}
                            onClick={() => handleReenviar(inv.id)}
                            title={inv.estado === 'usada' ? 'Ya se usó; no se puede reenviar' : 'Reenviar invitación'}
                          >
                            {reenvying === inv.id ? 'Enviando…' : msg ? msg.text : 'Reenviar'}
                          </button>
                          <button
                            type="button"
                            className={`${ui.rowBtn} ${ui.rowBtnDanger}`}
                            disabled={inv.estado !== 'pendiente' || revoking === inv.id}
                            onClick={() => handleRevocar(inv.id)}
                          >
                            {revoking === inv.id ? 'Revocando…' : 'Revocar'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
