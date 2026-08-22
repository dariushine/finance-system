'use client';

import { usePersistedState } from './usePersistedState';

// Preferencia de tasa para los cálculos (Balance Total y Reportes).
// Se guarda en localStorage del navegador; compartida entre dashboard y reportes.
const STORAGE_KEY = 'finanzas.tasaPref';
export type RatePref = 'bcv' | 'paralelo';

export function useRatePreference(): [RatePref, (v: RatePref) => void] {
  return usePersistedState<RatePref>(
    STORAGE_KEY,
    'bcv',
    (v) => v,
    (raw) => (raw === 'paralelo' ? 'paralelo' : 'bcv'),
  );
}
