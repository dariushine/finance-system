// lib/dataEvents.ts — Invalida los datos del frontend tras crear/editar/borrar.
//
// El FAB "+" (y otras acciones) viven en el layout global y crean transacciones,
// exchanges, etc. Las páginas que muestran listas/balances cargan sus propios
// datos en client components (useEffect), así que `router.refresh()` del App
// Router NO re-ejecuta esos fetches. Emitimos un evento de ventana que cada
// componente de datos escucha para volver a cargar.

export const DATA_CHANGED_EVENT = 'finance:data-changed';

/** Emite el evento que avisa "los datos cambiaron" (billeteras, tx, exchanges, reportes). */
export function notifyDataChanged(): void {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event(DATA_CHANGED_EVENT));
  }
}

/**
 * Hook para suscribirse a cambios de datos y refrescar.
 * Pasa `refetch` (función estable que recarga los datos del componente).
 * El listener se registra al montar y se limpia al desmontar.
 */
import { useEffect, type EffectCallback, type DependencyList } from 'react';

export function useOnDataChanged(refetch: () => void, deps: DependencyList = []): void {
  useEffect(() => {
    const handler = () => refetch();
    window.addEventListener(DATA_CHANGED_EVENT, handler);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

export type { EffectCallback };
