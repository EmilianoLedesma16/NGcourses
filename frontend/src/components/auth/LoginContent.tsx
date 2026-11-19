'use client';

import { useState, useEffect } from 'react';
import styles from './LoginContent.module.css';
import { login } from '@/lib/auth';
import { cursosApi } from '@/lib/api/client';
import { logError } from '@/lib/logger';
import { LoginSchema } from '@/schemas/auth';
import CourseCover from '@/components/shared/CourseCover';

interface ApiCursoDestacado {
  id: string;
  titulo: string;
  portada_url?: string | null;
  marca?: string | null;
  nivel?: string | null;
}

interface DestacadosResp {
  data: ApiCursoDestacado[];
  count: number;
}

interface Destacado {
  id: string;
  titulo: string;
  portada: string | null;
  meta: string;
  marca: 'ram' | 'nextgen';
}

const NIVEL_LABEL: Record<string, string> = {
  principiante: 'Principiante',
  intermedio: 'Intermedio',
  avanzado: 'Avanzado',
};

export default function LoginContent() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState('');
  const [destacados, setDestacados] = useState<Destacado[]>([]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const errorParam = params.get('error');
    if (errorParam === 'auth') setNotice('Debes iniciar sesión para acceder a esa página.');
    if (errorParam === 'role') setNotice('No tienes permisos para acceder a esa sección.');
    if (params.get('reset') === 'ok') setNotice('✓ Contraseña actualizada. Ya puedes iniciar sesión.');
  }, []);

  useEffect(() => {
    let cancelled = false;
    cursosApi
      .destacados(12)
      .then((response) => {
        if (cancelled) return;
        const items = (response as DestacadosResp).data
          .filter((c) => c.titulo)
          .map((c): Destacado => {
            const marca = c.marca === 'ram' ? 'ram' : 'nextgen';
            const nivel = c.nivel ? NIVEL_LABEL[c.nivel] : null;
            return {
              id: c.id,
              titulo: c.titulo.trim().replace(/\.$/, ''),
              portada: c.portada_url ?? null,
              meta: [marca === 'ram' ? 'RAM' : 'NextGen', nivel].filter(Boolean).join(' · '),
              marca,
            };
          });
        setDestacados(items);
      })
      .catch((e) => {
        logError('LoginContent/destacados', e);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const validation = LoginSchema.safeParse({ email, password });
    if (!validation.success) {
      setError(validation.error.issues[0].message);
      return;
    }
    setLoading(true);
    try {
      const user = await login(email, password, rememberMe);
      if (user.is_superuser || user.rol === 'administrador') {
        window.location.replace('/admin');
      } else if (user.rol === 'instructor') {
        window.location.replace('/instructor');
      } else if (user.rol === 'supervisor') {
        window.location.replace('/supervisor');
      } else {
        window.location.replace('/cursos');
      }
    } catch (e) {
      // 403 = acceso deshabilitado (p. ej. rol instructor apagado): mostrar el
      // motivo real del backend. Para el resto, mensaje genérico de credenciales.
      const err = e as { detail?: string; status?: number };
      setError(err?.status === 403 && err.detail ? err.detail : 'Correo o contraseña incorrectos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.shell} data-theme="light">
      {/* Panel izquierdo: marca + cursos destacados */}
      <section className={styles.brandPanel} aria-label="NextGen Course">
        <div className={styles.brand}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/images/icono_invertido.png" alt="" className={styles.brandIcon} />
          <p className={styles.brandName}>
            <b>NextGen</b> <span>Course</span>
          </p>
        </div>

        <div className={styles.hero}>
          <h1 className={styles.heroTitle}>La capacitación de tu empresa, a tu ritmo.</h1>
          <p className={styles.heroText}>Cursos en video, evaluaciones y certificados en un solo lugar.</p>
        </div>

        {destacados.length > 0 && (
          <div className={styles.featured}>
            <p className={styles.featuredLabel}>Cursos destacados</p>
            <div className={styles.reel} role="region" aria-label="Cursos destacados" tabIndex={0}>
              <ul className={styles.srOnly}>
                {destacados.map((c) => (
                  <li key={`sr-${c.id}`}>{c.titulo}</li>
                ))}
              </ul>
              <div className={styles.track} aria-hidden="true">
                {[0, 1].map((group) =>
                  destacados.map((c) => (
                    <figure className={styles.reelCard} key={`${group}-${c.id}`}>
                      <div className={styles.reelCover}>
                        <CourseCover src={c.portada} title={c.titulo} />
                      </div>
                      <figcaption className={styles.reelCaption}>
                        <span className={styles.reelTitle}>{c.titulo}</span>
                        <span className={styles.reelMeta}>{c.meta}</span>
                      </figcaption>
                    </figure>
                  )),
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Panel derecho: formulario */}
      <main className={styles.formPanel}>
        <div className={styles.aura} aria-hidden="true">
          <span className={styles.orb} />
          <span className={styles.orb} />
          <span className={styles.orb} />
        </div>

        <section className={styles.card} aria-labelledby="login-title">
          <h2 id="login-title" className={styles.cardTitle}>Inicia sesión</h2>
          <p className={styles.cardSubtitle}>Usa el correo con el que te invitó tu empresa.</p>

          {notice && (
            <div className={styles.notice} role="status">
              <span className={styles.noticeText}>
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" width="16" height="16" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
                {notice}
              </span>
              <button type="button" className={styles.noticeClose} onClick={() => setNotice('')} aria-label="Cerrar aviso">
                <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" width="16" height="16" aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <div className={styles.field}>
              <label htmlFor="login-email" className={styles.label}>Correo</label>
              <input
                id="login-email"
                type="email"
                autoComplete="username"
                placeholder="nombre@empresa.com"
                className={styles.input}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <div className={styles.labelRow}>
                <label htmlFor="login-password" className={styles.label}>Contraseña</label>
                <a href="/forgot-password" className={styles.link}>¿Olvidaste tu contraseña?</a>
              </div>
              <div className={styles.passwordWrap}>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className={`${styles.input} ${styles.inputPassword}`}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  className={styles.togglePassword}
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                  aria-pressed={showPassword}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
                    {showPassword && <line x1="3" y1="3" x2="21" y2="21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />}
                  </svg>
                </button>
              </div>
            </div>

            <label className={styles.remember}>
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className={styles.checkbox}
              />
              Mantener la sesión iniciada en este equipo
            </label>

            {error && (
              <p className={styles.error} role="alert">
                {error}
              </p>
            )}

            <button type="submit" className={styles.submit} disabled={loading}>
              {loading ? 'Ingresando...' : 'Iniciar sesión'}
            </button>
          </form>

          <p className={styles.cardFoot}>¿No tienes cuenta? Tu empresa te envía una invitación por correo.</p>
        </section>

        <p className={styles.legal}>
          Al iniciar sesión aceptas los <a href="/terminos">Términos y condiciones</a> y el{' '}
          <a href="/privacidad">Aviso de privacidad</a>.
        </p>
        <p className={styles.copy}>© NextGen Course. Todos los derechos reservados.</p>
      </main>
    </div>
  );
}
