// src/services/timeUtil.js — Utilidades de fecha de períodos y zonas horarias.
// El servidor trabaja en UTC (datetime_utc). El usuario ve fechas en SU zona
// (user_timezone). Los límites de período se calculan en esa zona y se convierten
// a instantes UTC para filtrar sobre datetime_utc.
const { wallClockToUtc, utcToWallClock } = require('./timeZoneMap');

const pad2 = (n) => String(n).padStart(2, '0');
const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function partsOf(iso) {
  const m = ISO.exec(iso);
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

function shiftIso(iso, { months = 0, days = 0 } = {}) {
  const p = partsOf(iso) || { y: 1970, m: 1, d: 1 };
  const dt = new Date(p.y, p.m - 1 + months, p.d + days);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

// Fecha "hoy" (YYYY-MM-DD) según la zona horaria indicada.
function todayInZone(tz, now = new Date()) {
  if (!tz) {
    return `${now.getUTCFullYear()}-${pad2(now.getUTCMonth() + 1)}-${pad2(now.getUTCDate())}`;
  }
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

// Siguiente día calendario de un YYYY-MM-DD.
function nextDayIso(iso) {
  const p = partsOf(iso) || { y: 1970, m: 1, d: 1 };
  const dt = new Date(p.y, p.m - 1, p.d + 1);
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())}`;
}

// Resuelve { from, to } (YYYY-MM-DD) según el periodo y la zona horaria.
// from/to explícitos tienen prioridad. period: day|week|month|3m|year|all.
function resolveDateRange(from, to, period, tz) {
  if (from && to) return { from, to, period: period || 'custom' };

  // 'all' = TODO el historial, sin límite superior (incluye fechas futuras).
  if (!period || period === 'all') {
    return { from: '1970-01-01', to: '9999-12-31', period: 'all' };
  }

  const toDate = todayInZone(tz);
  let fromDate;
  switch (period) {
    case 'day':
      fromDate = toDate;
      break;
    case 'week':
      fromDate = shiftIso(toDate, { days: -7 });
      break;
    case 'month': {
      const p = partsOf(toDate) || { y: 1970, m: 1 };
      fromDate = `${p.y}-${pad2(p.m)}-01`;
      break;
    }
    case '3m':
      fromDate = shiftIso(toDate, { months: -3 });
      break;
    case 'year':
      fromDate = shiftIso(toDate, { months: -12 });
      break;
    default:
      fromDate = '1970-01-01';
  }
  return { from: fromDate, to: toDate, period: period || 'all' };
}

// Convierte un rango de período (reloj-de-pared en tz) a límites de INSTANTES
// UTC [startIso, endIso) para filtrar sobre datetime_utc. 'all' → null.
function rangeToInstants(from, to, period, tz) {
  if (!tz) return null;
  if (from && to === undefined) to = from;
  if (!from && !to && (!period || period === 'all')) return null;
  let { from: fd, to: td } = resolveDateRange(from, to, period, tz);
  if (fd === '1970-01-01' && td === '9999-12-31') return null;
  const start = wallClockToUtc(fd, '00:00', tz);
  const end = wallClockToUtc(nextDayIso(td), '00:00', tz);
  return { start, end };
}

// Proyecta filas con `datetime_utc` → { date, time } según tz.
function projectInstants(rows, tz) {
  if (!tz || !Array.isArray(rows) || rows.length === 0) return rows;
  return rows.map((r) => {
    const inst = r.datetimeUtc || r.datetime_utc;
    if (!inst) return r;
    const w = utcToWallClock(inst, tz);
    return { ...r, date: w.date, time: w.time };
  });
}

module.exports = {
  todayInZone,
  resolveDateRange,
  rangeToInstants,
  projectInstants,
  nextDayIso,
  shiftIso,
};