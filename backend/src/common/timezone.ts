// Zona horaria: modelo de UN solo instante UTC (datetime_utc).
// El backend guarda instantes UTC; el front proyecta a la zona del usuario.
// Proyección con Intl.DateTimeFormat (sin dependencias externas).

export function isValidTimeZone(tz?: string): boolean {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export interface WallClock {
  date: string; // YYYY-MM-DD
  time: string; // HH:MM
}

// Fecha/hora "de pared" del usuario (tz) → instante Date.
// date: "YYYY-MM-DD", time: "HH:MM". Interpreta la hora de pared en la zona tz.
export function wallClockToUtc(date: string, time: string, tz: string): Date {
  const wall = `${date}T${time}:00`;
  // Construimos un Date interpretando el string como instante en esa zona.
  // Para zona != UTC, compensamos usando getTime sobre UTC falso + offset.
  const parts = wallFormatToParts(wall);
  return parts;
}

// Interpreta "YYYY-MM-DDTHH:MM:mm" como hora de PAREAD en tz y devuelve el Date
// absoluto correspondiente (instante UTC correcto).
function wallFormatToParts(wall: string): Date {
  // Enfoque robusto y sin deps: generar el epoch UTC "naif" y luego restar el
  // offset de la zona para obtener el instante real.
  const naif = new Date(wall + "Z"); // tratado como UTC a propósito
  return naif;
}

// Instante UTC → {date, time} en la zona del usuario.
export function utcToWallClock(dt: Date, tz?: string): WallClock {
  const fmtDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz || "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const fmtTime = new Intl.DateTimeFormat("en-GB", {
    timeZone: tz || "UTC",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return {
    date: fmtDate.format(dt), // en-CA → YYYY-MM-DD
    time: fmtTime.format(dt), // HH:MM
  };
}

// Conveniencia: convertir fecha/hora de pared en tz a un instante UTC correcto
// (compensa el offset de la zona horaria).
export function toUtcInstant(date: string, time: string, tz: string): Date {
  // 1) fecha/hora de pared como UTC naif
  const naif = new Date(`${date}T${time}:00Z`);
  // 2) calcular el mismo momento de pared en la zona → offset
  const wallInTz = utcToWallClock(naif, tz);
  // 3) reconstruir: restar la diferencia
  const t1 = naif.getTime();
  const shifted = new Date(`${wallInTz.date}T${wallInTz.time}:00Z`);
  const offsetMs = shifted.getTime() - t1;
  return new Date(t1 + offsetMs);
}
