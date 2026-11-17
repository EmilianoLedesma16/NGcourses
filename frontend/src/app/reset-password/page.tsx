'use client';

import { useState, useEffect, Suspense } from 'react';
import Link from 'next/link';
import { ResetPasswordSchema } from '@/schemas/auth';
import AuthShell from '@/components/auth/AuthShell';
import { PasswordField, PasswordRules } from '@/components/auth/AuthFields';
import auth from '@/components/auth/AuthShell.module.css';

// FastAPI devuelve `detail` como string (HTTPException) o como arreglo de
// errores de validación (422). Extrae siempre un mensaje legible para no
// renderizar "[object Object]".
function parseApiDetail(detail: unknown): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((e) => (e && typeof e === 'object' && 'msg' in e ? String((e as { msg: unknown }).msg) : ''))
      .filter(Boolean)
      .join('. ');
  }
  return '';
}

function ResetPasswordForm() {
  const [token, setToken] = useState('');

  useEffect(() => {
    const hash = window.location.hash;
    setToken(hash.startsWith('#token=') ? hash.slice(7) : '');
  }, []);

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) setError('El enlace no es válido. Solicita uno nuevo.');
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validation = ResetPasswordSchema.safeParse({ password, confirm });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/reset-password/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, new_password: password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        const detail = parseApiDetail(body.detail);
        if (detail === 'Token expired') throw new Error('El enlace ha expirado. Solicita uno nuevo.');
        if (detail === 'Invalid token') throw new Error('El enlace no es válido. Solicita uno nuevo.');
        throw new Error(detail || 'Error al restablecer la contraseña.');
      }

      setDone(true);
      // Redirige al login con mensaje de éxito tras 2 segundos
      setTimeout(() => { window.location.replace('/?reset=ok'); }, 2000);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell back={false} status="success" title="Contraseña actualizada" subtitle="Te llevamos al inicio de sesión…">
        <Link href="/" className={auth.submit}>Iniciar sesión</Link>
      </AuthShell>
    );
  }

  const enlaceInvalido = !token || /enlace/i.test(error);

  return (
    <AuthShell title="Nueva contraseña" subtitle="Elige una contraseña segura para tu cuenta.">
      <form onSubmit={handleSubmit} className={auth.form} noValidate>
        <div className={auth.field}>
          <PasswordField
            id="rp-pass"
            label="Nueva contraseña"
            placeholder="••••••••"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <PasswordRules value={password} />
        </div>
        <PasswordField
          id="rp-confirm"
          label="Confirmar contraseña"
          placeholder="••••••••"
          autoComplete="new-password"
          value={confirm}
          invalid={confirm.length > 0 && confirm !== password}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {error && (
          <p className={auth.error} role="alert">
            {error}{' '}
            {enlaceInvalido && <Link href="/forgot-password" className={auth.link}>Solicitar un enlace nuevo</Link>}
          </p>
        )}
        <button type="submit" className={auth.submit} disabled={loading || !token}>
          {loading ? 'Guardando…' : 'Guardar contraseña'}
        </button>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  );
}
