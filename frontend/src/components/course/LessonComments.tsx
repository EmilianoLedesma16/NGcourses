'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  comentariosApi,
  type Comentario,
  type OrdenComentarios,
} from '@/lib/api/client';
import { getCurrentUser } from '@/lib/auth';
import { logError } from '@/lib/logger';
import AnimalAvatar from '@/components/shared/AnimalAvatar';
import styles from './LessonComments.module.css';

const MAX_CHARS = 2000;
const PAGE = 20;

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' });
const UNIDADES: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000],
  ['month', 2_592_000],
  ['week', 604_800],
  ['day', 86_400],
  ['hour', 3_600],
  ['minute', 60],
];

function haceCuanto(iso: string): string {
  const seg = Math.round((new Date(iso).getTime() - Date.now()) / 1000);
  for (const [unidad, s] of UNIDADES) {
    if (Math.abs(seg) >= s) return rtf.format(Math.round(seg / s), unidad);
  }
  return 'hace un momento';
}

const fechaCompleta = new Intl.DateTimeFormat('es-MX', { dateStyle: 'long', timeStyle: 'short' });

function errorDe(e: unknown, fallback: string): string {
  return (e as { detail?: string })?.detail || fallback;
}

function Avatar({ id, nombre, url, small }: { id: string; nombre: string; url: string | null; small?: boolean }) {
  const cls = `${styles.avatar} ${small ? styles.avatarSm : ''}`;
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt="" className={cls} />;
  }
  return (
    <span className={cls} aria-hidden="true">
      <AnimalAvatar seed={id} label={nombre} />
    </span>
  );
}

/** Caja de texto que se expande y muestra Cancelar/Comentar al enfocarla (como YouTube). */
function Composer({
  placeholder,
  submitLabel,
  initial = '',
  autoFocus,
  compact,
  me,
  onSubmit,
  onCancel,
}: {
  placeholder: string;
  submitLabel: string;
  initial?: string;
  autoFocus?: boolean;
  compact?: boolean;
  me: { id: string; nombre: string; avatar_url: string | null } | null;
  onSubmit: (texto: string) => Promise<void>;
  onCancel?: () => void;
}) {
  const [texto, setTexto] = useState(initial);
  const [activo, setActivo] = useState(Boolean(autoFocus || initial));
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const limpio = texto.trim();
  const largo = texto.length;

  const cancelar = () => {
    setTexto(initial);
    setActivo(false);
    setError(null);
    onCancel?.();
  };

  const enviar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!limpio || largo > MAX_CHARS) return;
    setEnviando(true);
    setError(null);
    try {
      await onSubmit(limpio);
      setTexto('');
      setActivo(false);
    } catch (err) {
      setError(errorDe(err, 'No se pudo publicar. Inténtalo de nuevo.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <form className={styles.composer} onSubmit={enviar}>
      {me && <Avatar id={me.id} nombre={me.nombre} url={me.avatar_url} small={compact} />}
      <div className={styles.composerBody}>
        <textarea
          className={styles.input}
          value={texto}
          placeholder={placeholder}
          aria-label={placeholder}
          rows={activo ? 3 : 1}
          autoFocus={autoFocus}
          onFocus={() => setActivo(true)}
          onChange={(e) => setTexto(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) void enviar(e);
            if (e.key === 'Escape') cancelar();
          }}
        />
        {activo && (
          <div className={styles.composerFoot}>
            <span className={`${styles.counter} ${largo > MAX_CHARS ? styles.counterOver : ''}`}>
              {largo > MAX_CHARS * 0.8 ? `${largo}/${MAX_CHARS}` : ''}
            </span>
            <button type="button" className="ng-btn ng-btn-ghost ng-btn-sm" onClick={cancelar} disabled={enviando}>
              Cancelar
            </button>
            <button
              type="submit"
              className="ng-btn ng-btn-primary ng-btn-sm"
              disabled={enviando || !limpio || largo > MAX_CHARS}
            >
              {enviando ? 'Publicando…' : submitLabel}
            </button>
          </div>
        )}
        {error && <p role="alert" className={styles.error}>{error}</p>}
      </div>
    </form>
  );
}

function ComentarioItem({
  c,
  me,
  esRespuesta,
  onResponder,
  onCambio,
  onBorrado,
}: {
  c: Comentario;
  me: { id: string; nombre: string; avatar_url: string | null } | null;
  esRespuesta?: boolean;
  onResponder: (raizId: string, texto: string) => Promise<void>;
  onCambio: (c: Comentario) => void;
  onBorrado: (c: Comentario) => void;
}) {
  const [editando, setEditando] = useState(false);
  const [respondiendo, setRespondiendo] = useState(false);
  const [verRespuestas, setVerRespuestas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const n = c.respuestas.length;

  const toggleLike = async () => {
    setError(null);
    const antes = c;
    // Optimista: se ve al instante y se corrige si el servidor dice otra cosa.
    onCambio({ ...c, me_gusta: !c.me_gusta, likes: c.likes + (c.me_gusta ? -1 : 1) });
    try {
      const r = c.me_gusta ? await comentariosApi.unlike(c.id) : await comentariosApi.like(c.id);
      onCambio({ ...antes, likes: r.likes, me_gusta: r.me_gusta });
    } catch (e) {
      onCambio(antes);
      setError(errorDe(e, 'No se pudo registrar el like.'));
    }
  };

  const borrar = async () => {
    const msg = !esRespuesta && n > 0
      ? `¿Eliminar este comentario y sus ${n} ${n === 1 ? 'respuesta' : 'respuestas'}?`
      : '¿Eliminar este comentario?';
    if (!window.confirm(msg)) return;
    try {
      await comentariosApi.remove(c.id);
      onBorrado(c);
    } catch (e) {
      setError(errorDe(e, 'No se pudo eliminar el comentario.'));
    }
  };

  return (
    <li className={styles.item}>
      <Avatar id={c.autor.id} nombre={c.autor.nombre} url={c.autor.avatar_url} small={esRespuesta} />
      <div className={styles.itemBody}>
        <div className={styles.meta}>
          <span className={styles.author}>{c.autor.nombre}</span>
          <time dateTime={c.creado_en} title={fechaCompleta.format(new Date(c.creado_en))} className={styles.time}>
            {haceCuanto(c.creado_en)}
          </time>
          {c.editado_en && <span className={styles.time}>(editado)</span>}
        </div>

        {editando ? (
          <Composer
            me={null}
            placeholder="Edita tu comentario"
            submitLabel="Guardar"
            initial={c.contenido}
            autoFocus
            onSubmit={async (texto) => {
              onCambio({ ...(await comentariosApi.update(c.id, texto)), respuestas: c.respuestas });
              setEditando(false);
            }}
            onCancel={() => setEditando(false)}
          />
        ) : (
          <p className={styles.text}>{c.contenido}</p>
        )}

        {!editando && (
          <div className={styles.actions}>
            <button
              type="button"
              className={`${styles.action} ${c.me_gusta ? styles.liked : ''}`}
              onClick={toggleLike}
              aria-pressed={c.me_gusta}
              aria-label={c.me_gusta ? 'Quitar me gusta' : 'Me gusta'}
            >
              <svg viewBox="0 0 24 24" fill={c.me_gusta ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth={1.8} aria-hidden="true">
                <path strokeLinejoin="round" d="M7 10v11H3V10h4zm0 0l4-7a2 2 0 012 2v4h5.5a2 2 0 012 2.3l-1.4 8A2 2 0 0117.1 21H7" />
              </svg>
              {c.likes > 0 && <span>{c.likes}</span>}
            </button>
            <button type="button" className={styles.action} onClick={() => setRespondiendo(true)}>
              Responder
            </button>
            {c.es_mio && (
              <button type="button" className={styles.action} onClick={() => setEditando(true)}>
                Editar
              </button>
            )}
            {c.puede_borrar && (
              <button type="button" className={`${styles.action} ${styles.danger}`} onClick={borrar}>
                Eliminar
              </button>
            )}
          </div>
        )}
        {error && <p role="alert" className={styles.error}>{error}</p>}

        {respondiendo && (
          <Composer
            me={me}
            compact
            autoFocus
            placeholder={`Responder a ${c.autor.nombre}`}
            submitLabel="Responder"
            onSubmit={async (texto) => {
              await onResponder(c.parent_id ?? c.id, texto);
              setRespondiendo(false);
              setVerRespuestas(true);
            }}
            onCancel={() => setRespondiendo(false)}
          />
        )}

        {!esRespuesta && n > 0 && (
          <>
            <button
              type="button"
              className={styles.toggleReplies}
              onClick={() => setVerRespuestas((v) => !v)}
              aria-expanded={verRespuestas}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} aria-hidden="true"
                className={verRespuestas ? styles.chevronUp : undefined}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
              </svg>
              {verRespuestas ? 'Ocultar respuestas' : `${n} ${n === 1 ? 'respuesta' : 'respuestas'}`}
            </button>
            {verRespuestas && (
              <ul className={styles.replies}>
                {c.respuestas.map((r) => (
                  <ComentarioItem
                    key={r.id}
                    c={r}
                    me={me}
                    esRespuesta
                    onResponder={onResponder}
                    onCambio={onCambio}
                    onBorrado={onBorrado}
                  />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Comentarios bajo la lección (estilo YouTube). Solo los ve quien tiene acceso
 * al contenido del curso; el backend aplica la misma regla que el reproductor.
 */
export default function LessonComments({ lessonId }: { lessonId: string }) {
  const [items, setItems] = useState<Comentario[] | null>(null);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [orden, setOrden] = useState<OrdenComentarios>('recientes');
  const [cargandoMas, setCargandoMas] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [me, setMe] = useState<{ id: string; nombre: string; avatar_url: string | null } | null>(null);

  useEffect(() => {
    getCurrentUser()
      .then((u) => setMe({ id: u.id, nombre: u.full_name || u.email, avatar_url: u.avatar_url ?? null }))
      .catch(() => setMe(null));
  }, []);

  const cargar = useCallback(async (skip: number) => {
    const r = await comentariosApi.list(lessonId, { skip, limit: PAGE, orden });
    setCount(r.count);
    setTotal(r.total);
    return r.data;
  }, [lessonId, orden]);

  useEffect(() => {
    let activo = true;
    setItems(null);
    setError(null);
    cargar(0)
      .then((data) => activo && setItems(data))
      .catch((e) => {
        if (!activo) return;
        logError('LessonComments/list', e);
        setError(errorDe(e, 'No se pudieron cargar los comentarios.'));
        setItems([]);
      });
    return () => {
      activo = false;
    };
  }, [cargar]);

  const cargarMas = async () => {
    if (!items) return;
    setCargandoMas(true);
    try {
      const nuevos = await cargar(items.length);
      setItems((prev) => {
        const ya = new Set((prev ?? []).map((c) => c.id));
        return [...(prev ?? []), ...nuevos.filter((c) => !ya.has(c.id))];
      });
    } catch (e) {
      setError(errorDe(e, 'No se pudieron cargar más comentarios.'));
    } finally {
      setCargandoMas(false);
    }
  };

  const publicar = async (texto: string) => {
    const nuevo = await comentariosApi.create(lessonId, texto);
    setItems((prev) => [nuevo, ...(prev ?? [])]);
    setCount((n) => n + 1);
    setTotal((n) => n + 1);
  };

  const responder = async (raizId: string, texto: string) => {
    const nueva = await comentariosApi.create(lessonId, texto, raizId);
    setItems((prev) =>
      (prev ?? []).map((c) => (c.id === nueva.parent_id ? { ...c, respuestas: [...c.respuestas, nueva] } : c)),
    );
    setTotal((n) => n + 1);
  };

  const cambiar = (actualizado: Comentario) => {
    setItems((prev) =>
      (prev ?? []).map((c) =>
        c.id === actualizado.id
          ? { ...actualizado, respuestas: c.respuestas }
          : { ...c, respuestas: c.respuestas.map((r) => (r.id === actualizado.id ? actualizado : r)) },
      ),
    );
  };

  const borrado = (b: Comentario) => {
    if (b.parent_id) {
      setItems((prev) =>
        (prev ?? []).map((c) => (c.id === b.parent_id ? { ...c, respuestas: c.respuestas.filter((r) => r.id !== b.id) } : c)),
      );
      setTotal((n) => n - 1);
    } else {
      setItems((prev) => (prev ?? []).filter((c) => c.id !== b.id));
      setCount((n) => n - 1);
      setTotal((n) => n - 1 - b.respuestas.length);
    }
  };

  return (
    <section className={styles.comments} aria-labelledby={`comentarios-${lessonId}`}>
      <div className={styles.head}>
        <h2 id={`comentarios-${lessonId}`} className={styles.title}>
          {total > 0 ? `${total} ${total === 1 ? 'comentario' : 'comentarios'}` : 'Comentarios'}
        </h2>
        {count > 1 && (
          <label className={styles.sort}>
            <span className={styles.srOnly}>Ordenar comentarios</span>
            <select value={orden} onChange={(e) => setOrden(e.target.value as OrdenComentarios)}>
              <option value="recientes">Más recientes</option>
              <option value="populares">Más populares</option>
            </select>
          </label>
        )}
      </div>

      <Composer me={me} placeholder="Agrega un comentario…" submitLabel="Comentar" onSubmit={publicar} />

      {error && <p role="alert" className={styles.error}>{error}</p>}

      {items === null ? (
        <p className={styles.empty}>Cargando comentarios…</p>
      ) : items.length === 0 ? (
        !error && <p className={styles.empty}>Todavía no hay comentarios. ¡Sé el primero en preguntar o compartir algo!</p>
      ) : (
        <ul className={styles.list}>
          {items.map((c) => (
            <ComentarioItem
              key={c.id}
              c={c}
              me={me}
              onResponder={responder}
              onCambio={cambiar}
              onBorrado={borrado}
            />
          ))}
        </ul>
      )}

      {items && items.length < count && (
        <button type="button" className={`ng-btn ng-btn-secondary ${styles.more}`} onClick={cargarMas} disabled={cargandoMas}>
          {cargandoMas ? 'Cargando…' : 'Mostrar más comentarios'}
        </button>
      )}
    </section>
  );
}
