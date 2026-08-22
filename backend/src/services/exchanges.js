// src/services/exchanges.js — Lógica de negocio de exchanges.
const { db } = require('../db');
const { getDb, allDb, runDb, balanceEffect } = require('./transactions');

// getExchangeTransactions
function getExchangeTransactions(exchange, tRow = {}) {
  return Promise.all([
    getExchangeTransactionRow(exchange.debitTransactionId),
    getExchangeTransactionRow(exchange.creditTransactionId),
  ]);
}

// Row de una transacción para edición de exchange (incluye wallet balance).
function getExchangeTransactionRow(id) {
  return getDb(
    `SELECT
       t.id,
       t.wallet_id AS walletId,
       t.type,
       t.amount,
       t.description,
       t.datetime_utc AS datetimeUtc,
       t.datetime_utc AS datetime_utc,
       t.category_id AS categoryId,
       t.parent_transaction_id AS parentId,
       t.deleted AS deleted,
       c.name AS category,
       w.balance AS walletBalance
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     JOIN wallets w ON w.id = t.wallet_id
     WHERE t.id = ?`,
    [id]
  );
}

// Crea una transacción fee (hija de parentTx) con el instante UTC del exchange.
// Se usa tanto para la comisión del débito (hija del débito) como para la del
// crédito (hija del crédito). parentTx puede ser el débito o el crédito.
async function createFeeForExchange(parentTx, amount, datetimeUtc, description, tz, side) {
  const category = await getDb("SELECT id FROM categories WHERE name = 'fee' AND type = 'expense' AND isActive = 1");
  // fc ya es el ID (entero) de la categoría fee, o el categoryId del padre si no existe.
  const fc = category ? category.id : parentTx.categoryId;
  // side: 'débito' o 'crédito' (opcional) → "Comisión débito: ..." / "Comisión crédito: ...".
  const sideLabel = side ? ` ${side}` : '';
  await runDb(
    `INSERT INTO transactions (wallet_id, category_id, type, amount, description, datetime_utc, fee, parent_transaction_id)
     VALUES (?, ?, 'expense', ?, ?, ?, 0, ?)`,
    [parentTx.walletId, fc, amount, `Comisión${sideLabel}: ${description || 'Exchange'}`, datetimeUtc, parentTx.id]
  );
}

// Elimina virtualmente todas las transacciones de un exchange (débito, crédito y fees)
// y devuelve el efecto neto por billetera para reajustar balances.
async function softDeleteExchangeTransactions(debit, credit) {
  const txIds = [debit.id, credit.id];
  // Todos los fees (hijos del débito y del crédito, no borrados) también se borran.
  const fees = await allDb(
    `SELECT id, wallet_id AS walletId, type, amount, parent_transaction_id AS parentId
     FROM transactions
     WHERE parent_transaction_id IN (?, ?) AND deleted = 0`,
    [debit.id, credit.id]
  );
  fees.forEach((f) => txIds.push(f.id));

  // Efecto por billetera (los fees son gasto en su billetera).
  const byWallet = {};
  const applyEffect = (row) => {
    const key = String(row.walletId);
    if (!byWallet[key]) byWallet[key] = 0;
    byWallet[key] += balanceEffect(row.type, row.amount); // income suma, expense descuenta
  };
  applyEffect(debit);   // gasto (exchange_out)
  applyEffect(credit);  // ingreso (exchange_in)
  fees.forEach(applyEffect);

  for (const id of txIds) {
    if (!id) continue;
    await runDb('UPDATE transactions SET deleted = 1 WHERE id = ?', [id]);
  }
  return byWallet;
}

// PUT /api/exchanges/:id — editar montos, fee, fecha/hora y descripción.
// Las billeteras son FIJAS (no se pueden cambiar). Ajusta balances con el delta

module.exports = { getExchangeTransactions, getExchangeTransactionRow, createFeeForExchange, softDeleteExchangeTransactions };
