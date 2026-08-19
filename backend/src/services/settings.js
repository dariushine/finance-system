// src/services/settings.js — Preferencias compartidas (key-value) en la BD.
// Almacena la zona horaria del usuario (user_timezone, cómo muestra el front).
// El backend SIEMPRE corre en UTC (datetime_utc): no hay zona del servidor
// configurable — el servidor es UTC por definición (estándar de la industria).
const { db } = require('../db');
const { isValidTimeZone } = require('./timeZoneMap');

// Lee el valor de un key. Devuelve null si no existe.
function getSetting(key) {
  return new Promise((resolve, reject) => {
    db.get('SELECT value FROM settings WHERE key = ?', [key], (err, row) => {
      if (err) return reject(err);
      resolve(row ? row.value : null);
    });
  });
}

// Escribe (o inserta) el valor de un key.
function setSetting(key, value) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
       ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`,
      [key, value == null ? null : String(value)],
      (err) => (err ? reject(err) : resolve())
    );
  });
}

// Zona horaria del usuario (la que ve en el front).
// Default: America/Caracas (zona de Freddy). Null se interpreta como default.
const DEFAULT_USER_TZ = 'America/Caracas';

// Lee la zona del usuario. Devuelve DEFAULT_USER_TZ si no está configurada.
async function getUserTimeZone() {
  const v = await getSetting('user_timezone');
  return v && isValidTimeZone(v) ? v : DEFAULT_USER_TZ;
}

// Guarda la zona del usuario. null la limpia (vuelve al default).
function setUserTimeZone(tz) {
  return setSetting('user_timezone', tz);
}

module.exports = {
  getSetting,
  setSetting,
  getUserTimeZone,
  setUserTimeZone,
  DEFAULT_USER_TZ,
};
