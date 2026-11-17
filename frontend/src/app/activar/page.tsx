'use client';

import Link from 'next/link';
import { useState, useEffect, Suspense } from 'react';
import { ActivarCuentaSchema } from '@/schemas/auth';
import AuthShell from '@/components/auth/AuthShell';
import { EmailField, PASSWORD_RULES, PasswordField, PasswordRules } from '@/components/auth/AuthFields';
import auth from '@/components/auth/AuthShell.module.css';

// FastAPI devuelve `detail` como string (HTTPException) o como arreglo de
// errores de validación (422). Extrae siempre un mensaje legible para no
// renderizar "[object Object]".
function parseApiDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    const msg = detail
      .map((e) => (e && typeof e === 'object' && 'msg' in e ? String((e as { msg: unknown }).msg) : ''))
      .filter(Boolean)
      .join('. ');
    return msg;
  }
  return '';
}


function ActivarForm() {
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [tokenExpirado, setTokenExpirado] = useState(false);
  const [emailReenvio, setEmailReenvio] = useState('');
  const [reenvioLoading, setReenvioLoading] = useState(false);
  const [reenvioMsg, setReenvioMsg] = useState('');

  const passwordRules = PASSWORD_RULES(password);
  const isPasswordValid = passwordRules.every((rule) => rule.valid);
  const passwordsMatch = confirm.length > 0 && confirm === password;
  const canSubmit = Boolean(token) && !loading && isPasswordValid && passwordsMatch;

  useEffect(() => {
    const hash = window.location.hash;
    const t = hash.startsWith('#token=') ? decodeURIComponent(hash.slice(7)) : '';
    setToken(t);
    if (!t) setError('El enlace no es válido. Contacta al administrador.');
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validation = ActivarCuentaSchema.safeParse({ password, confirm });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/users/activar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = parseApiDetail(body.detail);
        if (detail === 'Token expirado') { setTokenExpirado(true); return; }
        if (detail === 'Token inválido') throw new Error('El enlace no es válido. Contacta al administrador.');
        throw new Error(detail || 'Error al activar la cuenta.');
      }

      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  const handleSolicitarReenvio = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setReenvioLoading(true);
    try {
      await fetch('/api/v1/users/solicitar-reactivacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailReenvio }),
      });
      setReenvioMsg('Si tu correo está registrado y pendiente de activación, recibirás un nuevo enlace en breve.');
    } catch {
      setReenvioMsg('Ocurrió un error. Intenta de nuevo o contacta al administrador.');
    } finally {
      setReenvioLoading(false);
    }
  };

  if (tokenExpirado) {
    return (
      <AuthShell
        status="warning"
        title="El enlace expiró"
        subtitle="Los enlaces de activación duran 72 horas. Escribe tu correo y te enviaremos uno nuevo."
      >
        {reenvioMsg ? (
          <p className={auth.notice} role="status">{reenvioMsg}</p>
        ) : (
          <form onSubmit={handleSolicitarReenvio} className={auth.form}>
            <EmailField
              id="act-email"
              label="Correo"
              placeholder="tu@empresa.com"
              value={emailReenvio}
              onChange={(e) => setEmailReenvio(e.target.value)}
              required
            />
            <button type="submit" className={auth.submit} disabled={reenvioLoading}>
              {reenvioLoading ? 'Enviando…' : 'Enviarme un enlace nuevo'}
            </button>
          </form>
        )}
      </AuthShell>
    );
  }

  if (done) {
    return (
      <AuthShell
        back={false}
        status="success"
        title="Tu cuenta está activa"
        subtitle="Ya puedes iniciar sesión con tu correo y la contraseña que acabas de crear."
      >
        <Link href="/" className={auth.submit}>Iniciar sesión</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell back={false} title="Activa tu cuenta" subtitle="Crea la contraseña con la que entrarás a NextGen Course.">
      <form onSubmit={handleSubmit} className={auth.form} noValidate>
        <div className={auth.field}>
          <PasswordField
            id="act-pass"
            label="Contraseña"
            placeholder="••••••••"
            autoComplete="new-password"
            value={password}
            invalid={password.length > 0 && !isPasswordValid}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoFocus
          />
          <PasswordRules value={password} />
        </div>
        <div className={auth.field}>
          <PasswordField
            id="act-confirm"
            label="Confirmar contraseña"
            placeholder="••••••••"
            autoComplete="new-password"
            value={confirm}
            invalid={confirm.length > 0 && confirm !== password}
            onChange={(e) => setConfirm(e.target.value)}
            required
          />
          {confirm.length > 0 && confirm !== password && <p className={auth.error}>Las contraseñas no coinciden.</p>}
        </div>
        {error && <p className={auth.error} role="alert">{error}</p>}
        <button type="submit" className={auth.submit} disabled={!canSubmit}>
          {loading ? 'Activando…' : 'Activar cuenta'}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ActivarPage() {
  return (
    <Suspense>
      <ActivarForm />
    </Suspense>
  );
}
