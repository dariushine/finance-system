// src/services/rates.js — Tasas (dolarapi, daily_rates, tasa efectiva).
const { db } = require('../db');
const { toInt, toNum } = require('./money');

// Consultar las tasas oficial (BCV) y paralelo de Dolarapi
function fetchRatesFromApi() {
  return new Promise((resolve) => {
    const fetchRate = (path) => new Promise((res) => {
      const lib = require('https');
      lib.get({ host: 've.dolarapi.com', path: `/v1/${path}`, timeout: 5000 }, (resp) => {
        let data = '';
        resp.on('data', (c) => (data += c));
        resp.on('end', () => {
          try {
            const j = JSON.parse(data);
            res(typeof j.promedio === 'number' ? j.promedio : null);
          } catch (e) {
            res(null);
          }
        });
      }).on('error', () => res(null)).on('timeout', function () { this.destroy(); res(null); });
    });

    Promise.all([fetchRate('dolares/oficial'), fetchRate('dolares/paralelo')]).then(([bcv, paralelo]) => {
      if (bcv === null || paralelo === null) {
        resolve(null);
      } else {
        resolve({ bcv, paralelo });
      }
    });
  });
}

// Guardar (o actualizar) la tasa para una fecha.
// bcv/paralelo llegan en UNIDADES HUMANAS (desde la API o el body) y se
// guardan como enteros de escala 4 (×10000) en la columna INTEGER.
function upsertRate(date, bcv, paralelo, source) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO daily_rates (date, bcv, paralelo, source)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET bcv = excluded.bcv, paralelo = excluded.paralelo, source = excluded.source`,
      [date, toInt(bcv), toInt(paralelo), source || 'dolarapi'],
      (err) => err ? reject(err) : resolve()
    );
  });
}

// Obtener la tasa del día: la busca en BD; si no existe, la consulta a la API y la guarda.
// Devuelve { date, bcv, paralelo, fromDb } o { error: 'mensaje' } si no se pudo obtener.
async function getTodayRate() {
  const today = new Date().toISOString().split('T')[0];

  // 1. Intentar desde la BD
  const fromDb = await new Promise((resolve) => {
    db.get('SELECT date, bcv, paralelo FROM daily_rates WHERE date = ?', [today], (err, row) => {
      if (err || !row) return resolve(null);
      resolve({ date: row.date, bcv: row.bcv, paralelo: row.paralelo });
    });
  });

  if (fromDb) {
    // De BD vienen enteros de escala 4 → unidades humanas para el front.
    return { ...fromDb, bcv: toNum(fromDb.bcv), paralelo: toNum(fromDb.paralelo), fromDb: true };
  }

  // 2. No está en BD: pedir a la API
  const api = await fetchRatesFromApi();
  if (!api) {
    return { error: 'No se pudieron obtener las tasas del día desde la API.' };
  }

  try {
    await upsertRate(today, api.bcv, api.paralelo, 'dolarapi');
    // Los valores de la API ya vienen en unidades humanas.
    return { date: today, bcv: api.bcv, paralelo: api.paralelo, fromDb: false };
  } catch (err) {
    return { error: 'No se pudo guardar la tasa en la base de datos.' };
  }
}

// Sincroniza las columnas denormalizadas de comisión (fee). En runtime, la


function isValidTime(value) {
  if (typeof value !== 'string' || value === '') return true; // opcional
  const m = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] == null ? 0 : Number(m[3]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 && s >= 0 && s <= 59;
}

// Normaliza una hora a HH:MM (minuto) descartando segundos. La UI solo
// maneja HH:MM y guardar segundos genera inconsistencias (p.ej. una
// transacción a 12:55:55 con un fee a 12:55:00). Recibe HH:MM o HH:MM:SS.
function normalizeTimeMinute(value) {
  if (typeof value !== 'string' || value === '') return value;
  return value.slice(0, 5); // HH:MM[:SS] → HH:MM
}

function getRateForDate(date, type) {
  return new Promise((resolve) => {
    const col = type === 'paralelo' ? 'paralelo' : 'bcv';
    db.get('SELECT ' + col + ' AS rate FROM daily_rates WHERE date = ?', [date], (err, row) => {
      if (err) return resolve(null);
      if (row && row.rate != null) return resolve(row.rate);
      db.get('SELECT ' + col + ' AS rate FROM daily_rates ORDER BY date DESC LIMIT 1', [], (err2, last) => {
        if (err2) return resolve(null);
        resolve(last && last.rate != null ? last.rate : null);
      });
    });
  });
}

// Busca una categoría activa por nombre+tipo. Si no existe, la crea de forma
// idempotente (nueva categoría con color por tipo). Devuelve la fila (id, name...).
// Evita crear categorías del sistema (fee, exchange_out, exchange_in): si se pide
// una de estas y no existe, se rechaza el error para no corromper los flujos.


function getExchangeRates() {
  return { USD: 1, VES: 635, EUR: 1.07 };
}

// Endpoint para que el frontend obtenga las tasas en vez de hardcodearlas

module.exports = { fetchRatesFromApi, upsertRate, getTodayRate, isValidTime, normalizeTimeMinute, getRateForDate, getExchangeRates };
