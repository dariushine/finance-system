'use client';

import { useEffect, useState } from 'react';

// Hook genérico de preferencias de UI persistidas en localStorage (navegador).
// Cada instancia usa su propia clave; sigue el mismo patrón que useHideBalances.
// Lee el valor inicial de forma perezosa (evita el error de SSR) y escribe
// silenciosamente cada vez que el valor cambia.

export function usePersistedState<T>(
  key: string,
  initialValue: T,
  serialize: (value: T) => string = (v) => String(v),
  deserialize: (raw: string) => T = (raw) => raw as T,
): [T, (value: T | ((prev: T) => T)) => void] {
  const [value, setValue] = useState<T>(() => {
    if (typeof window === 'undefined') return initialValue;
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) return initialValue;
      return deserialize(raw);
    } catch {
      return initialValue;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, serialize(value));
    } catch {
      // silencioso: localStorage puede no estar disponible
    }
  }, [key, value, serialize]);

  return [value, setValue];
}
