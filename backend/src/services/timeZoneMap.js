// src/services/timeZoneMap.js — Conversión entre instante UTC y reloj de pared.
//
// Modelo (decisión de Freddy, 18 ago 2026): UNA sola columna guarda el instante
// absoluto en UTC (`datetime_utc`, ISO 8601 con Z). La fecha/hora que ve el
// usuario se DERIVA de ese instante proyectándolo a la zona configurada.
//
// Al escribir: el frontend manda lo que el usuario VE (date YYYY-MM-DD + time
// HH:MM) en su zona + el tz. Convertimos pared→instante y guardamos eso.
// Al leer: dado un tz, instante→{date, time}.
//
// El backend SIEMPRE corre en UTC (estándar de la industria): la BD guarda
// instantes UTC y no existe una "zona del servidor" configurable. La zona del
// usuario (user_timezone) se aplica solo en la capa de presentación.

// Offset (en ms) de `tz` en el instante `ms`. Maneja DST en dos pasadas.
function offsetMs(tz, ms) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    timeZoneName: 'longOffset', // ej: "GMT-04:00" / "GMT+05:30"
  });
  const parts = dtf.formatToParts(new Date(ms));
  const name = parts.find((p) => p.type === 'timeZoneName')?.value || '';
  const m = /GMT([+-]\d{2}):(\d{2})/.exec(name);
  if (!m) return 0;
  const sign = m[1].startsWith('-') ? -1 : 1;
  const h = Number(m[1].slice(1));
  const min = Number(m[2]);
  return sign * (h * 3600 + min * 60) * 1000;
}

const pad2 = (n) => String(n).padStart(2, '0');

// Valida tz IANA; si no es válida, devuelve false.
function isValidTimeZone(tz) {
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Convierte reloj de pared (date YYYY-MM-DD, time HH:MM, en zona tz) a instante
// UTC ISO con Z. time opcional → 00:00. Si tz no es válida, se interpreta la
// fecha/hora literalmente como UTC.
function wallClockToUtc(date, time, tz) {
  const d = typeof time === 'string' && time !== '' ? time : '00:00';
  const iso = `${date}T${d.slice(0, 5)}:00`; // P.ej. 2026-08-18T18:00:00
  if (!isValidTimeZone(tz)) return new Date(iso + 'Z').toISOString();

  // Tratamos iso como si fuera UTC en un primer intento y corregimos el offset
  // de la zona en dos pasadas para cubrir DST.
  const asUtc = new Date(iso + 'Z').getTime();
  let off = offsetMs(tz, asUtc);
  let utc = asUtc - off;
  const off2 = offsetMs(tz, utc);
  if (off2 !== off) utc = asUtc - off2;
  return new Date(utc).toISOString();
}

// Proyecta un instante UTC ISO a la zona tz → { date: YYYY-MM-DD, time: HH:MM }.
// time refleja la hora local de ese instante en tz. Si tz no es válida → UTC.
function utcToWallClock(isoOrMs, tz) {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : new Date(isoOrMs).getTime();
  const t = new Date(ms);
  if (!isValidTimeZone(tz)) {
    return {
      date: `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`,
      time: `${pad2(t.getUTCHours())}:${pad2(t.getUTCMinutes())}`,
    };
  }
  const dtf = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const parts = dtf.formatToParts(t);
  const get = (k) => parts.find((p) => p.type === k)?.value || '00';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, time: `${get('hour')}:${get('minute')}` };
}

module.exports = { wallClockToUtc, utcToWallClock, isValidTimeZone };