'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ForgotPasswordSchema } from '@/schemas/auth';
import AuthShell from '@/components/auth/AuthShell';
import { EmailField } from '@/components/auth/AuthFields';
import auth from '@/components/auth/AuthShell.module.css';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validation = ForgotPasswordSchema.safeParse({ email });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/v1/password-recovery', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        // 404 = email no registrado, lo tratamos igual para no revelar existencia
        if (res.status === 404) {
          setSent(true);
          return;
        }
        throw new Error(body.detail ?? 'Error al enviar el correo');
      }
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error inesperado');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <AuthShell
        status="success"
        title="Revisa tu correo"
        subtitle="Si ese correo está registrado, recibirás en unos minutos un enlace para restablecer tu contraseña. Revisa también la carpeta de spam."
      >
        <Link href="/" className={auth.submit}>Ir al inicio de sesión</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="¿Olvidaste tu contraseña?"
      subtitle="Escribe el correo de tu cuenta y te enviaremos un enlace para crear una nueva."
    >
      <form onSubmit={handleSubmit} className={auth.form} noValidate>
        <EmailField
          id="fp-email"
          label="Correo"
          placeholder="tu@empresa.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoFocus
        />
        {error && <p className={auth.error} role="alert">{error}</p>}
        <button type="submit" className={auth.submit} disabled={loading}>
          {loading ? 'Enviando…' : 'Enviar enlace'}
        </button>
      </form>
    </AuthShell>
  );
}
