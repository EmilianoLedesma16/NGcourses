import { useEffect, useRef } from 'react';

/**
 * Avance del alumno en tiempo real entre pestañas del mismo navegador.
 *
 * El aula avisa cada vez que se completa una lección; la ficha del curso, la del
 * proceso y otras pestañas del aula escuchan y actualizan sus palomitas sin
 * recargar. Además, al volver a una pestaña (focus) se vuelve a pedir el avance
 * al servidor, así que también se ve lo que se avanzó en otro equipo.
 */

export interface ProgresoEvento {
  cursoId: string;
  leccionId: string;
}

const CANAL = 'ng-progreso';

function canal(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') return null;
  try {
    return new BroadcastChannel(CANAL);
  } catch {
    return null;
  }
}

export function avisarLeccionCompletada(evento: ProgresoEvento): void {
  const c = canal();
  if (!c) return;
  c.postMessage(evento);
  c.close();
}

/**
 * Llama a `onCambio` cuando otra pestaña completa una lección y cuando la
 * pestaña vuelve a estar visible (para traer lo avanzado en otro equipo).
 */
export function useProgresoEnVivo(onCambio: (evento: ProgresoEvento | null) => void): void {
  const ref = useRef(onCambio);
  useEffect(() => {
    ref.current = onCambio;
  });

  useEffect(() => {
    const c = canal();
    if (c) c.onmessage = (e: MessageEvent<ProgresoEvento>) => ref.current(e.data);
    const alVolver = () => {
      if (document.visibilityState === 'visible') ref.current(null);
    };
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      c?.close();
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, []);
}
