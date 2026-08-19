// src/services/transactions.js — Lógica de negocio de transacciones.
// Modelo de fecha: UN solo `datetime_utc` (instante absoluto UTC, ISO con Z).
// El front manda la fecha/hora EN SU ZONA (date "YYYY-MM-DD", time "HH:MM",
// tz IANA) y aquí se convierte a instante UTC al guardar. Al leer, se proyecta
// el instante a la zona (ver routes, que llama utcToWallClock).
const { db } = require('../db');
const { getOrCreateCategory } = require('./categories');
const { wallClockToUtc, utcToWallClock } = require('./timeZoneMap');

// Convierte la fecha/hora "de pared" del usuario a un instante UTC ISO (con Z).
// Si no se provee fecha u hora, usa "ahora" (instante actual, horario servidor).
// Si se provee fecha pero no hora, usa la hora actual del reloj del usuario
// (en su zona tz) sobre la fecha dada, en lugar de quedarse en 00:00.
// `tz` debe ser la zona del usuario (IANA). Si falta, se interpreta como UTC.
function resolveDatetimeUtc(date, time, tz) {
  const nowIso = new Date().toISOString();
  const hasDate = typeof date === 'string' && date !== '';
  if (!hasDate) return nowIso;
  const hasTime = typeof time === 'string' && time !== '';
  if (hasTime) return wallClockToUtc(date, time, tz);
  const nowWall = utcToWallClock(new Date(), tz); // hora actual en la zona del usuario
  return wallClockToUtc(date, nowWall.time, tz);
}

// createTransaction
// @param {string} tz - zona IANA del usuario (para convertir date+time a UTC).
// IMPORTANTE (escala 4): amount y fee entran en ENTEROS de escala 4 (×10000),
// porque este service opera en enteros internamente (ver money.js). Las rutas
// que llamen aquí ya deben haber convertido de unidades con toInt().
function createTransaction(walletId, categoryName, type, amount, description, fee = 0, date, time, tz) {
  return new Promise((resolve, reject) => {
    const commission = Number(fee) || 0;
    const datetimeUtc = resolveDatetimeUtc(date, time, tz);

    db.serialize(() => {
      db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [walletId], (err, wallet) => {
        if (err) return reject(err);
        if (!wallet) return reject(new Error('Wallet no encontrada'));

        getOrCreateCategory(categoryName, type).then((category) => {
            const total = amount + commission;
            if (type === 'expense' && wallet.balance < total) {
              // amount/commission/balance ya están en enteros de escala 4; el
              // mensaje se muestra en unidades humanas para el usuario.
              return reject(new Error(`Fondos insuficientes. Balance actual: ${(wallet.balance / 10000)} ${wallet.currency}, necesita ${(total / 10000)}`));
            }

            const newBalance = type === 'expense'
              ? wallet.balance - total
              : wallet.balance + amount - commission;

            db.run('BEGIN TRANSACTION');

            db.run(
              `INSERT INTO transactions (wallet_id, category_id, type, amount, description, datetime_utc, exchange_rate, converted_amount, fee, parent_transaction_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [walletId, category.id, type, amount, description || '', datetimeUtc, 10000, amount, 0, null],
              function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                const transactionId = this.lastID;

                const finish = (feeTransactionId) => {
                  db.run('UPDATE wallets SET balance = ? WHERE id = ?', [newBalance, walletId], (upErr) => {
                    if (upErr) {
                      db.run('ROLLBACK');
                      return reject(upErr);
                    }
                    db.run('COMMIT', () => {
                      resolve({
                        id: transactionId,
                        feeTransactionId,
                        wallet: wallet.name,
                        currency: wallet.currency,
                        amount,
                        type,
                        newBalance,
                        category: category.name,
                        fee: commission,
                        datetime_utc: datetimeUtc,
                      });
                    });
                  });
                };

                if (commission > 0) {
                  db.get('SELECT * FROM categories WHERE name = ? AND type = ? AND isActive = 1',
                    ['fee', 'expense'], (fErr, feeCategory) => {
                      const fc = (!fErr && feeCategory) ? feeCategory : category;
                      db.run(
                        `INSERT INTO transactions (wallet_id, category_id, type, amount, description, datetime_utc, exchange_rate, converted_amount, fee, parent_transaction_id)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [walletId, fc.id, 'expense', commission,
                         `Comisión: ${description || category.name}`,
                         datetimeUtc, 10000, commission, 0, transactionId],
                        function(err2) {
                          if (err2) {
                            db.run('ROLLBACK');
                            return reject(err2);
                          }
                          const feeTransactionId = this.lastID;
                          db.run(
                            `UPDATE transactions SET fee =
                               (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
                                JOIN categories c ON c.id = t.category_id
                                WHERE t.parent_transaction_id = ? AND c.name = 'fee')
                              WHERE id = ?`,
                            [transactionId, transactionId],
                            (feeUpErr) => {
                              if (feeUpErr) {
                                db.run('ROLLBACK');
                                return reject(feeUpErr);
                              }
                              db.run(
                                `UPDATE exchanges SET fee =
                                   (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
                                    JOIN categories c ON c.id = t.category_id
                                    WHERE t.parent_transaction_id = ? AND c.name = 'fee')
                                  WHERE debit_transaction_id = ?`,
                                [transactionId, transactionId],
                                (exUpErr) => {
                                  if (exUpErr) {
                                    db.run('ROLLBACK');
                                    return reject(exUpErr);
                                  }
                                  finish(feeTransactionId);
                                }
                              );
                            }
                          );
                        }
                      );
                    });
                } else {
                  finish(null);
                }
              }
            );
          }).catch((err) => reject(err));
      });
    });
  });
}

// Helpers de cadena de transacciones
function getParentChain(transactionId) {
  return new Promise((resolve, reject) => {
    const chain = [];
    const visit = (id, depth) => {
      if (depth > 50) return resolve(chain);
      db.get(
        `SELECT id, parent_transaction_id AS parentId, category_id FROM transactions WHERE id = ?`,
        [id],
        (err, row) => {
          if (err) return reject(err);
          if (!row) return resolve(chain);
          chain.push({ id: row.id, categoryId: row.category_id, parentId: row.parentId });
          if (row.parentId == null) return resolve(chain);
          visit(row.parentId, depth + 1);
        }
      );
    };
    visit(transactionId, 0);
  });
}

// Resuelve si una transacción (o cualquiera de sus ancestros) es miembro de un
// exchange. Devuelve { exchangeId } o null.
function resolveExchangeForTransaction(transactionId) {
  return new Promise((resolve, reject) => {
    getParentChain(transactionId).then((chain) => {
      const ids = chain.map((c) => c.id);
      if (ids.length === 0) return resolve(null);
      const placeholders = ids.map(() => '?').join(',');
      db.get(
        `SELECT id, debit_transaction_id AS debitId, credit_transaction_id AS creditId
         FROM exchanges
         WHERE debit_transaction_id IN (${placeholders}) OR credit_transaction_id IN (${placeholders})
         LIMIT 1`,
        [...ids, ...ids],
        (err, row) => {
          if (err) return reject(err);
          if (!row) return resolve(null);
          resolve({ exchangeId: row.id });
        }
      );
    }).catch(reject);
  });
}


// Helpers promisificados para editar/eliminar
function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function getDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function allDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

let writeTxQueue = Promise.resolve();
function withTransaction(fn) {
  const run = () => new Promise((resolve, reject) => {
    db.run('BEGIN TRANSACTION', (err) => {
      if (err) return reject(err);
      Promise.resolve()
        .then(fn)
        .then(
          (result) =>
            new Promise((res, rej) =>
              db.run('COMMIT', (e) => (e ? rej(e) : res(result)))
            )
        )
        .then(resolve)
        .catch((error) => {
          db.run('ROLLBACK', () => reject(error));
        });
    });
  });
  const p = writeTxQueue.then(run, run);
  writeTxQueue = p.catch(() => {});
  return p;
}

// Obtiene una transacción con datos de billetera y categoría.
function getTransactionRow(id) {
  return getDb(
    `SELECT
       t.id,
       t.wallet_id AS walletId,
       t.category_id AS categoryId,
       t.type,
       t.amount,
       t.description,
       t.datetime_utc AS datetimeUtc,
       t.fee,
       t.parent_transaction_id AS parentId,
       t.deleted AS deleted,
       w.name AS walletName,
       w.currency AS currency,
       w.balance AS walletBalance,
       c.name AS category
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     JOIN categories c ON c.id = t.category_id
     WHERE t.id = ?`,
    [id]
  );
}

// Instante (datetime_utc) más reciente entre los hijos no borrados.
function getMinChildDate(parentId) {
  return getDb(
    `SELECT MIN(datetime_utc) AS minDateTime FROM transactions
     WHERE parent_transaction_id = ? AND deleted = 0`,
    [parentId]
  );
}

// Compara dos instantes UTC (ISO). Devuelve true si a < b lexicográficamente
// (ISO con Z ordena correctamente). Compatible con la API previa (dtKey).
function dtKey(isoA, isoB) {
  return String(isoA || '') < String(isoB || '');
}

// Recalcula transactions.fee del padre y exchanges.fee (si el padre es débito de
// un exchange). SOLO UPDATEs; debe llamarse DENTRO de un withTransaction.
async function syncParentFeeSql(parentId) {
  await runDb(
    `UPDATE transactions SET fee = COALESCE((
       SELECT SUM(t.amount) FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.parent_transaction_id = transactions.id AND c.name = 'fee' AND t.deleted = 0
     ), 0)
     WHERE id = ?`,
    [parentId]
  );
  await runDb(
    `UPDATE exchanges SET fee = COALESCE((
       SELECT SUM(t.amount) FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.parent_transaction_id = exchanges.debit_transaction_id AND c.name = 'fee' AND t.deleted = 0
     ), 0)
     WHERE debit_transaction_id = ?`,
    [parentId]
  );
}

function syncParentFee(parentId) {
  return withTransaction(() => syncParentFeeSql(parentId));
}

// Efecto de una transacción sobre el balance de la billetera.
// Operan en enteros de escala 4 (amount ya viene en enteros).
function balanceEffect(type, amount) {
  return type === 'income' ? Number(amount) : -Number(amount);
}

module.exports = {
  createTransaction,
  getParentChain,
  resolveExchangeForTransaction,
  runDb,
  getDb,
  allDb,
  getTransactionRow,
  getMinChildDate,
  dtKey,
  syncParentFee,
  syncParentFeeSql,
  balanceEffect,
  withTransaction,
  resolveDatetimeUtc,
};