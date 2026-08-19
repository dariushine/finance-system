// src/services/money.js — Conversión de dinero en los límites API↔DB (escala 4).
//
// DECISIÓN DE DISEÑO (Freddy, 19 ago 2026):
//   - La API y el frontend trabajan en UNIDADES HUMANAS ($1.50, 634.95 VES/USD).
//   - La base de datos guarda ENTEROS de escala 4 (×10000): $1.50 → 15000,
//     tasa 634.95 → 6349500. Aritmética INTEGER exacta (sin ruido flotante).
//   - SOLO las rutas (límite API↔DB) llaman a estos helpers. Los services
//     operan y devuelven enteros internamente; el front no cambia.
//
// MOTIVO DE LA ESCALA 4 (vs centavos):
//   - Int64 en SQLite llega a 9,223,372,036,854,775,807 → con ×10000 el monto
//     máximo almacenable es ~922,337,203,685,477 unidades (~922 billones).
//   - Margen indesbordable incluso bajo hiperinflación venezolana real.
//   - Escala fija 4 es consistente para montos y tasas de cambio.

const SCALE = 10000;
const SCALE_F = 10000; // número (para división exacta en JS, ver toNum)

// Unidades humanas → entero de escala 4. SIEMPRE se redondea primero y luego se
// escala (round-then-scale): así el ruido flotante de entrada (ej. 15.30000004)
// no se multiplica como error. Redondea al múltiplo de 1/10000 más cercano.
function toInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round((n + Number.EPSILON) * SCALE);
}

// Entero de escala 4 → unidades humanas. Divide por 10000.
function toNum(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return n / SCALE_F;
}

// Verdaderos positivos/negativos a partir de un monto humano o entero.
// Útil en validaciones que comparan con 0 (ej. "debe ser mayor a 0").
function isPositiveUnits(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0;
}
function isNonNegativeUnits(v) {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0;
}

// Decodifica una fila (u objeto) de BD: devuelve una copia con los campos
// `fields` (nombres de keys del objeto) convertidos de entero a unidades.
// NO muta el original.
function decodeMoney(obj, fields) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  for (const f of fields) {
    if (f in out) out[f] = toNum(out[f]);
  }
  return out;
}

// Igual que decodeMoney pero para arrays de filas.
function decodeMoneyList(rows, fields) {
  return (rows || []).map((r) => decodeMoney(r, fields));
}

module.exports = {
  SCALE,
  toInt,
  toNum,
  isPositiveUnits,
  isNonNegativeUnits,
  decodeMoney,
  decodeMoneyList,
};