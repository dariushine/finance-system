// src/services/recurring-payments.js — Lógica de negocio de pagos frecuentes.
const { db } = require('../db');
const { createTransaction } = require('./transactions');

// Select con join a categoría y billetera para devolver nombres legibles.
const RECURRING_SELECT = `
  SELECT
    rp.id,
    rp.name,
    rp.description,
    rp.amount,
    rp.fee,
    rp.currency,
    rp.type,
    rp.category_id AS categoryId,
    c.name AS categoryName,
    rp.wallet_id AS walletId,
    w.name AS walletName,
    w.currency AS walletCurrency,
    rp.created_at AS createdAt,
    rp.updated_at AS updatedAt
  FROM recurring_payments rp
  JOIN categories c ON c.id = rp.category_id
  LEFT JOIN wallets w ON w.id = rp.wallet_id
`;

const q = (sql, params = []) => new Promise((resolve, reject) =>
  db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row))));
const all = (sql, params = []) => new Promise((resolve, reject) =>
  db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows))));
const run = (sql, params = []) => new Promise((resolve, reject) =>
  db.run(sql, params, function (err) { err ? reject(err) : resolve(this); }));

function listRecurringPayments() {
  return all(`${RECURRING_SELECT} WHERE rp.isActive = 1 ORDER BY rp.name`);
}

function getRecurringPayment(id) {
  return q(`${RECURRING_SELECT} WHERE rp.id = ? AND rp.isActive = 1`, [id]).then((row) => {
    if (!row) { const e = new Error('Pago frecuente no encontrado'); e.status = 404; throw e; }
    return row;
  });
}

async function validateCategory(categoryId, type) {
  const category = await q('SELECT * FROM categories WHERE id = ? AND isActive = 1', [categoryId]);
  if (!category) throw new Error('Categoría no encontrada');
  if (category.type !== type) throw new Error('La categoría debe coincidir con el tipo del pago');
  return category;
}

async function validateWallet(walletId, currency) {
  if (walletId == null || walletId === '') return null;
  const wallet = await q('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [walletId]);
  if (!wallet) throw new Error('Billetera no encontrada');
  if (wallet.currency !== currency) throw new Error(`La billetera usa ${wallet.currency}, pero el pago es en ${currency}`);
  return wallet.id;
}

async function createRecurringPayment(data) {
  const { name, description, amount, fee, currency, type, categoryId, walletId } = data;
  const trimmedName = String(name || '').trim();
  if (!trimmedName) throw new Error('El nombre es requerido');
  if (type !== 'income' && type !== 'expense') throw new Error('type debe ser income o expense');
  const parsedAmount = Number(amount);
  if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) throw new Error('El monto debe ser mayor a 0');
  const parsedFee = fee != null ? Number(fee) : 0;
  if (!Number.isFinite(parsedFee) || parsedFee < 0) throw new Error('La comisión no puede ser negativa');
  if (!currency) throw new Error('La moneda es requerida');
  if (!categoryId) throw new Error('La categoría es requerida');
  await validateCategory(categoryId, type);
  const finalWalletId = await validateWallet(walletId, currency);

  const { lastID } = await run(
    'INSERT INTO recurring_payments (name, description, amount, fee, currency, type, category_id, wallet_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [trimmedName, description || '', parsedAmount, parsedFee, currency, type, categoryId, finalWalletId]
  );
  return q(`${RECURRING_SELECT} WHERE rp.id = ?`, [lastID]);
}

async function updateRecurringPayment(id, data) {
  const existing = await q('SELECT * FROM recurring_payments WHERE id = ? AND isActive = 1', [id]);
  if (!existing) throw new Error('Pago frecuente no encontrado');

  const { name, description, amount, fee, currency, type, categoryId, walletId } = data || {};
  const trimmedName = name != null ? String(name).trim() : existing.name;
  const finalType = type || existing.type;
  const finalCurrency = currency || existing.currency;
  const finalAmount = amount != null ? Number(amount) : existing.amount;
  const finalFee = fee != null ? Number(fee) : (existing.fee || 0);
  const finalCategoryId = categoryId || existing.category_id;
  const finalWalletId = walletId != null && walletId !== '' ? walletId : null;

  if (!trimmedName) throw new Error('El nombre es requerido');
  if (finalType !== 'income' && finalType !== 'expense') throw new Error('type debe ser income o expense');
  if (!Number.isFinite(finalAmount) || finalAmount <= 0) throw new Error('El monto debe ser mayor a 0');
  if (!Number.isFinite(finalFee) || finalFee < 0) throw new Error('La comisión no puede ser negativa');
  if (finalCategoryId !== existing.category_id) await validateCategory(finalCategoryId, finalType);
  if (finalWalletId != null && finalWalletId !== existing.wallet_id) await validateWallet(finalWalletId, finalCurrency);

  await run(
    'UPDATE recurring_payments SET name = ?, description = ?, amount = ?, fee = ?, currency = ?, type = ?, category_id = ?, wallet_id = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [trimmedName, description != null ? description : existing.description, finalAmount, finalFee, finalCurrency, finalType, finalCategoryId, finalWalletId, id]
  );
  return q(`${RECURRING_SELECT} WHERE rp.id = ?`, [id]);
}

async function softDeleteRecurringPayment(id) {
  await run('UPDATE recurring_payments SET isActive = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND isActive = 1', [id]);
  return { success: true };
}

// Ejecutar un pago frecuente: crea una transacción real a partir de la plantilla.
async function executeRecurringPayment(id, options = {}) {
  const row = await q(`${RECURRING_SELECT} WHERE rp.id = ? AND rp.isActive = 1`, [id]);
  if (!row) throw new Error('Pago frecuente no encontrado');

  const { date, time, tz, overrideAmount, overrideCategoryName, overrideWalletId, overrideFee, description } = options;
  const amount = overrideAmount != null ? Number(overrideAmount) : row.amount;
  const type = row.type; // el tipo pertenece a la plantilla y no cambia al realizarla
  const categoryName = overrideCategoryName || row.categoryName;
  const walletId = overrideWalletId != null && overrideWalletId !== '' ? overrideWalletId : row.walletId;
  const fee = overrideFee != null ? Number(overrideFee) : (row.fee || 0);
  const finalDescription =
    description != null ? description
    : (row.description ? `Pago frecuente: ${row.name} — ${row.description}` : `Pago frecuente: ${row.name}`);

  if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto debe ser mayor a 0');
  if (!Number.isFinite(fee) || fee < 0) throw new Error('La comisión no puede ser negativa');
  if (!walletId) throw new Error('Selecciona una billetera para realizar el pago');

  const transaction = await createTransaction(walletId, categoryName, type, amount, finalDescription, fee, date, time, tz);
  return { transaction };
}

module.exports = {
  listRecurringPayments,
  getRecurringPayment,
  createRecurringPayment,
  updateRecurringPayment,
  softDeleteRecurringPayment,
  executeRecurringPayment,
};
