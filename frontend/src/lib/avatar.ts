import { useEffect } from 'react';

/**
 * Foto de perfil. Vive en el servidor (avatar_url del usuario); antes se
 * guardaba en localStorage como data URL. Al leerla se borra la copia vieja del
 * navegador para liberar ese espacio.
 */
export function avatarOf(user: { id: string; avatar_url?: string | null }): string | null {
  try {
    localStorage.removeItem(`avatar_${user.id}`);
  } catch {
    // almacenamiento no disponible: no pasa nada
  }
  return user.avatar_url ?? null;
}

export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const AVATAR_ACCEPT = 'image/jpeg,image/png,image/webp';

/**
 * Cambios de perfil en vivo. Los encabezados leen al usuario una sola vez al
 * montar; cuando la página de perfil sube una foto o cambia el nombre, avisa
 * con este evento para que el encabezado se actualice sin recargar.
 */
const PERFIL_EVENT = 'perfil-actualizado';

export interface PerfilCambio {
  avatar_url?: string | null;
  full_name?: string | null;
  email?: string;
}

export function avisarPerfilActualizado(cambio: PerfilCambio): void {
  window.dispatchEvent(new CustomEvent<PerfilCambio>(PERFIL_EVENT, { detail: cambio }));
}

/** `onCambio` debe ser estable (useCallback o un setState funcional). */
export function useCambiosDePerfil(onCambio: (cambio: PerfilCambio) => void): void {
  useEffect(() => {
    const handler = (e: Event) => onCambio((e as CustomEvent<PerfilCambio>).detail);
    window.addEventListener(PERFIL_EVENT, handler);
    return () => window.removeEventListener(PERFIL_EVENT, handler);
  }, [onCambio]);
}

/** Aplica un cambio de perfil al usuario que muestra un encabezado. */
export function conCambioDePerfil<T extends { name: string; initials: string; avatarUrl?: string | null }>(
  prev: T,
  cambio: PerfilCambio,
): T {
  const next = { ...prev };
  if ('avatar_url' in cambio) next.avatarUrl = cambio.avatar_url ?? null;
  if (cambio.email) {
    next.name = cambio.full_name || cambio.email;
    next.initials = next.name.slice(0, 2).toUpperCase();
  }
  return next;
}

/** Valida en el navegador antes de subir; el backend vuelve a validar. */
export function avatarFileError(file: File): string | null {
  if (!AVATAR_ACCEPT.split(',').includes(file.type)) return 'Usa una imagen JPG, PNG o WEBP.';
  if (file.size > AVATAR_MAX_BYTES) return 'La foto pesa más de 2 MB. Elige una más ligera.';
  return null;
}
