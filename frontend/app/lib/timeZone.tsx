'use client';

// Proveedor de zona horaria del usuario (user_timezone).
// El backend SIEMPRE guarda en UTC (datetime_utc); la zona del usuario solo
// controla cómo se muestran las fechas/horas en el front. Se carga desde
// GET /api/settings y se persiste con PUT (tabla `settings`).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { getSettings, setUserTimeZone } from './api';

export type TimeZoneState = {
  userTimeZone: string;
  loaded: boolean;
  setUserTimeZone: (tz: string) => Promise<void>;
};

const TimeZoneContext = createContext<TimeZoneState | null>(null);

// Lista de zonas horarias comunes para el select.
export const TIME_ZONE_OPTIONS: { value: string; label: string }[] = [
  { value: 'America/Caracas', label: 'Venezuela (Caracas) UTC-4' },
  { value: 'America/Bogota', label: 'Colombia (Bogotá) UTC-5' },
  { value: 'America/Mexico_City', label: 'México (Ciudad de México) UTC-6' },
  { value: 'America/Argentina/Buenos_Aires', label: 'Argentina (Buenos Aires) UTC-3' },
  { value: 'America/Sao_Paulo', label: 'Brasil (São Paulo) UTC-3' },
  { value: 'America/New_York', label: 'EE. UU. (Nueva York) UTC-5 / UTC-4' },
  { value: 'America/Los_Angeles', label: 'EE. UU. (Los Ángeles) UTC-8 / UTC-7' },
  { value: 'Europe/Madrid', label: 'España (Madrid) UTC+1 / UTC+2' },
  { value: 'UTC', label: 'UTC' },
];

// Detecta la zona del navegador; si es inválida o no detectable → Caracas.
export function detectTimeZone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (tz) return tz;
  } catch {
    /* noop */
  }
  return 'America/Caracas';
}

const pad2 = (n: number) => String(n).padStart(2, '0');

// Fecha "hoy" (YYYY-MM-DD) en la zona indicada.
export function todayInZone(tz: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(now);
  } catch {
    return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  }
}

// Hora actual (HH:MM) en la zona indicada.
export function nowTimeInZone(tz: string, now: Date = new Date()): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    }).format(now);
  } catch {
    return `${pad2(now.getUTCHours())}:${pad2(now.getUTCMinutes())}`;
  }
}

export function TimeZoneProvider({ children }: { children: ReactNode }) {
  const [userTimeZone, setUserTzState] = useState<string>(detectTimeZone());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    getSettings()
      .then((s) => {
        if (!active) return;
        if (s.user_timezone) setUserTzState(s.user_timezone);
        setLoaded(true);
      })
      .catch(() => {
        if (!active) return;
        setLoaded(true); // seguir con el default local si falla
      });
    return () => {
      active = false;
    };
  }, []);

  const updateUser = useCallback(async (tz: string) => {
    setUserTzState(tz);
    try {
      const r = await setUserTimeZone(tz);
      if (r?.user_timezone) setUserTzState(r.user_timezone);
    } catch {
      /* mantiene el valor local */
    }
  }, []);

  const value = useMemo(
    () => ({
      userTimeZone,
      loaded,
      setUserTimeZone: updateUser,
    }),
    [userTimeZone, loaded, updateUser]
  );

  return <TimeZoneContext.Provider value={value}>{children}</TimeZoneContext.Provider>;
}

// Hook para acceder a la zona horaria desde los componentes.
export function useTimeZone(): TimeZoneState {
  const ctx = useContext(TimeZoneContext);
  if (!ctx) throw new Error('useTimeZone debe usarse dentro de <TimeZoneProvider>');
  return ctx;
}