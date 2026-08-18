'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// Preferencia de UI guardada en localStorage: separador de decimales/miles.
// 'comma' → coma decimal, punto de miles (es-VE). 'dot' → punto decimal, coma miles (en-US).
const STORAGE_KEY = 'numberSeparator';

export type SeparatorPreference = 'comma' | 'dot';

export function getSeparatorPref(): SeparatorPreference {
  if (typeof window === 'undefined') return 'comma';
  try {
    return localStorage.getItem(STORAGE_KEY) === 'dot' ? 'dot' : 'comma';
  } catch {
    return 'comma';
  }
}

export function setSeparatorPref(v: SeparatorPreference): void {
  try {
    if (v === 'dot') localStorage.setItem(STORAGE_KEY, 'dot');
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // silencioso: localStorage puede no estar disponible
  }
}

const localeFor = (p: SeparatorPreference) => (p === 'dot' ? 'en-US' : 'es-VE');

export interface NumberFormat {
  separator: SeparatorPreference;
  setSeparator: (v: SeparatorPreference) => void;
  /** Número con separadores y exactamente 2 decimales. */
  formatNumber: (n: number) => string;
  /** Número con separadores sin forzar decimales. */
  formatAmount: (n: number) => string;
  /** Moneda con símbolo y 2 decimales. */
  formatCurrency: (n: number, currency?: string) => string;
}

const Ctx = createContext<NumberFormat | null>(null);

export function NumberFormatProvider({ children }: { children: ReactNode }) {
  const [separator, setSeparatorState] = useState<SeparatorPreference>('comma');

  useEffect(() => {
    setSeparatorState(getSeparatorPref());
  }, []);

  const setSeparator = useCallback((v: SeparatorPreference) => {
    setSeparatorState(v);
    setSeparatorPref(v);
  }, []);

  const value = useMemo<NumberFormat>(() => {
    const loc = localeFor(separator);
    return {
      separator,
      setSeparator,
      formatNumber: (n) =>
        n.toLocaleString(loc, { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      formatAmount: (n) => n.toLocaleString(loc),
      formatCurrency: (n, currency = 'USD') =>
        new Intl.NumberFormat(loc, {
          style: 'currency',
          currency,
          minimumFractionDigits: 2,
        }).format(n),
    };
  }, [separator, setSeparator]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNumberFormat(): NumberFormat {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useNumberFormat debe usarse dentro de <NumberFormatProvider>');
  return ctx;
}