'use client';

import { useCallback, useEffect, useState } from 'react';

// Preferencia de UI guardada en localStorage: ocultar los saldos del dashboard
// y de la lista de billeteras (no afecta reportes ni el detalle de una billetera).
const STORAGE_KEY = 'finanzas.ocultarSaldos';
// Evento para mantener sincronizados los componentes que leen esta preferencia
// cuando cambia desde la página de Opciones.
const EVENT_KEY = 'finanzas:ocultarSaldos:change';

export function getHideBalances(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return localStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setHideBalances(value: boolean): void {
  try {
    if (value) localStorage.setItem(STORAGE_KEY, '1');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silencioso: localStorage puede no estar disponible
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(EVENT_KEY, { detail: value }));
  }
}

// Hook que lee el valor actual y se mantiene sincronizado ante cambios.
export function useHideBalances(): boolean {
  const [hidden, setHidden] = useState<boolean>(false);

  useEffect(() => {
    setHidden(getHideBalances());
    const onStorage = (e: Event) => {
      const custom = e as CustomEvent<boolean>;
      setHidden(typeof custom.detail === 'boolean' ? custom.detail : getHideBalances());
    };
    window.addEventListener(EVENT_KEY, onStorage);
    // Sincronizar también entre pestañas (evento nativo storage)
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(EVENT_KEY, onStorage);
      window.removeEventListener('storage', onStorage);
    };
  }, []);

  return hidden;
}

// Formatea el número ocultando el saldo (solo parte numérica); conserva la moneda
// si se pasa el símbolo por separado. Útil para "••••" / "***,***".
export function maskBalance(display: string, hidden: boolean): string {
  if (!hidden) return display;
  // Reemplaza todos los dígitos por "•", manteniendo separadores y símbolo.
  return display.replace(/[0-9]/g, '•');
}
