// src/services/money.js — Conversión de dinero en los límites API↔DB.
//
// DECISIÓN DE DISEÑO (Freddy, 19 ago 2026):
//   - MONTOS/SALDOS (balance, amount, fee, from_amount,
//     to_amount): escala ×100 (centavos). $1.50 → 150, 1.50 VES → 150.
//   - TASAS (rate, daily_rates.bcv/paralelo): escala ×10000.
//     634.95 → 6349500. La tasa lleva más precisión natural.
//   - La API y el front trabajan en UNIDADES HUMANAS ($1.50). Solo las rutas
//     (límite API↔DB) convierten; los services operan en enteros; el front no
//     cambia.
//
// POR QUÉ DOS ESCALAS: los montos de una moneda y la tasa de cambio son datos
// distintos. Centavos (×100) basta para lo que la UI escribe (2 decimales) y es
// legible/estándar. La tasa necesita 4 decimales para no perder precisión en la
// conversión. Utilizar la misma escala para ambos forzaba un compromiso.
//
// RECORDATORIO (cambio 2→escala): si en el futuro una redenominación exige más
// finura, se sube VES a ×10000; USD puede quedarse en ×100.

// ===== MONTOS (×100 = centavos) =====
const MONEY_SCALE = 100;

// Unidades humanas → entero de centavos. Always round-then-scale.
function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * MONEY_SCALE);
}
// Entero de centavos → unidades humanas.
function toNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / MONEY_SCALE;
}

// ===== TASAS (×10000) =====
const RATE_SCALE = 10000;
// Unidades humanas de tasa → entero de escala 4.
function toRateInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * RATE_SCALE);
}
// Entero de escala 4 de tasa → unidades humanas.
function toRateNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / RATE_SCALE;
}

// Convierte un monto VES (en terreno de MONTOS, ×100) a USD, dado el rate
// (en terreno de TASAS, ×10000). Almacenado: rawAmount = VES*100,
// rawRate = VESperUSD*10000. Entonces rawAmount/rawRate devuelve USD*0.01:
// hay que re-escalar por RATE_SCALE/MONEY_SCALE = 100.
function rawVesAmountToUsd(rawAmount, rawRate) {
  const a = Number(rawAmount);
  const r = Number(rawRate);
  if (!Number.isFinite(a) || !Number.isFinite(r) || r === 0) return 0;
  return (a * (RATE_SCALE / MONEY_SCALE)) / r;
}

// Decodifica una fila (u objeto) de BD: copia con los campos `fields`
// convertidos de CENTAVOS (×100) → unidades humanas. NO muta el original.
function decodeMoney(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const f of fields) if (f in out) out[f] = toNum(out[f]);
  return out;
}
function decodeMoneyList(rows, fields) {
  return (rows || []).map((r) => decodeMoney(r, fields));
}

module.exports = {
  MONEY_SCALE,
  RATE_SCALE,
  toInt,
  toNum,
  toRateInt,
  toRateNum,
  rawVesAmountToUsd,
  isPositiveUnits: (v) => { const n = Number(v); return Number.isFinite(n) && n > 0; },
  isNonNegativeUnits: (v) => { const n = Number(v); return Number.isFinite(n) && n >= 0; },
  decodeMoney,
  decodeMoneyList,
};