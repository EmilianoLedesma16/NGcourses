'use client';

import Link from 'next/link';
import { Suspense, useEffect, useState } from 'react';

import AuthShell from '@/components/auth/AuthShell';
import auth from '@/components/auth/AuthShell.module.css';
import { invitacionesApi } from '@/lib/api/client';

interface CanjearResponse {
  inscripcion_id: string;
  curso_id: string;
  curso_titulo: string;
  email: string;
  usuario_creado: boolean;
  requiere_activacion: boolean;
}

type Estado =
  | { type: 'loading' }
  | { type: 'success'; data: CanjearResponse }
  | { type: 'used' }
  | { type: 'expired' }
  | { type: 'invalid' }
  | { type: 'no_token' };

const ERRORES = {
  used: {
    status: 'warning' as const,
    title: 'Esta invitación ya se usó',
    msg: 'El enlace ya fue canjeado y no puede usarse de nuevo. Si ya tienes cuenta, inicia sesión para entrar al curso.',
  },
  expired: {
    status: 'warning' as const,
    title: 'La invitación expiró',
    msg: 'Pide a tu supervisor o al administrador que te envíe una nueva invitación.',
  },
  invalid: {
    status: 'error' as const,
    title: 'Enlace no válido',
    msg: 'Este enlace de invitación no existe o está incompleto. Revisa que lo hayas copiado completo.',
  },
  no_token: {
    status: 'error' as const,
    title: 'Enlace no válido',
    msg: 'El enlace no incluye el código de invitación. Ábrelo directamente desde el correo.',
  },
};

function InvitacionContent() {
  const [token, setToken] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>({ type: 'loading' });

  useEffect(() => {
    const hash = window.location.hash;
    setToken(hash.startsWith('#token=') ? decodeURIComponent(hash.slice(7)) : '');
  }, []);

  useEffect(() => {
    if (token === null) return;
    if (!token) { setEstado({ type: 'no_token' }); return; }
    invitacionesApi.canjear(token)
      .then((res) => setEstado({ type: 'success', data: res as CanjearResponse }))
      .catch((err: unknown) => {
        const s = (err as { status?: number })?.status ?? 0;
        setEstado(s === 409 ? { type: 'used' } : s === 410 ? { type: 'expired' } : { type: 'invalid' });
      });
  }, [token]);

  if (estado.type === 'loading') {
    return (
      <AuthShell back={false} title="Verificando tu invitación…" subtitle="Esto toma solo un momento.">
        <span className="sr-only" role="status">Cargando</span>
      </AuthShell>
    );
  }

  if (estado.type === 'success') {
    const { data } = estado;
    return (
      <AuthShell back={false} status="success" title="Ya estás inscrito" subtitle={<>Tienes acceso al curso <b>{data.curso_titulo}</b>.</>}>
        {data.requiere_activacion ? (
          <p className={auth.notice}>
            Te enviamos un correo a <b>{data.email}</b>. Ábrelo y crea tu contraseña para activar tu cuenta;
            después inicia sesión para empezar el curso.
          </p>
        ) : (
          <p className={auth.notice}>
            Tu cuenta ya existe. Inicia sesión con <b>{data.email}</b> para empezar el curso.
          </p>
        )}
        <Link href="/" className={auth.submit}>Ir a iniciar sesión</Link>
      </AuthShell>
    );
  }

  const err = ERRORES[estado.type];
  return (
    <AuthShell back={false} status={err.status} title={err.title} subtitle={err.msg}>
      <Link href="/" className={auth.submit}>Ir a iniciar sesión</Link>
    </AuthShell>
  );
}

export default function InvitacionPage() {
  return (
    <Suspense>
      <InvitacionContent />
    </Suspense>
  );
}
