// src/services/transactions.js — Lógica de negocio de transacciones.
const { db } = require('../db');
const { getOrCreateCategory } = require('./categories');

// createTransaction
function createTransaction(walletId, categoryName, type, amount, description, fee = 0, date, time) {
  return new Promise((resolve, reject) => {
    const commission = Number(fee) || 0;
    // Fecha + hora de la transacción. El frontend manda `date` como
    // YYYY-MM-DD y `time` como HH:MM[:SS]. Si no se proveen, se usa hoy local.
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const defaultDate = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const defaultTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    const txDate = typeof date === 'string' && date !== '' ? date : defaultDate;
    let txTime = defaultTime;
    if (typeof time === 'string' && time !== '') {
      // Aceptar HH:MM o HH:MM:SS
      txTime = /^\d{2}:\d{2}:\d{2}$/.test(time) ? time : `${time}:00`;
    }
    db.serialize(() => {
      // 1. Obtener wallet
      db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [walletId], (err, wallet) => {
        if (err) return reject(err);
        if (!wallet) return reject(new Error('Wallet no encontrada'));
        
        // 2. Obtener categoría (si no existe, se crea automáticamente)
        getOrCreateCategory(categoryName, type).then((category) => {
            // 3. Validar fondos para gastos: monto + comisión (la comisión es EXTRA al monto)
            const total = amount + commission;
            if (type === 'expense' && wallet.balance < total) {
              return reject(new Error(`Fondos insuficientes. Balance actual: ${wallet.balance} ${wallet.currency}, necesita ${total}`));
            }
            
            // 4. Calcular nuevo balance:
            //    - Gasto: se descuenta monto + comisión.
            //    - Ingreso: se suma el monto pero la comisión se resta (es un GASTO aparte).
            const newBalance = type === 'expense'
              ? wallet.balance - total
              : wallet.balance + amount - commission;
            
            // 5. Crear transacción y actualizar balance en transacción
            db.run('BEGIN TRANSACTION');

            // 5a. Transacción principal con el monto original (sin comisión)
            db.run(
              `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, time, exchange_rate, converted_amount, fee, parent_transaction_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [walletId, category.id, type, amount, description || '', txDate, txTime, 1.0, amount, 0, null],
              function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                const transactionId = this.lastID;

                const finish = (feeTransactionId) => {
                  // Actualizar balance
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
                        fee: commission
                      });
                    });
                  });
                };

                // 5b. Si hay comisión, crear una transacción SEPARADA tipo fee.
                //     La comisión SIEMPRE es un gasto, aunque el padre sea un ingreso.
                if (commission > 0) {
                  db.get('SELECT * FROM categories WHERE name = ? AND type = ? AND isActive = 1',
                    ['fee', 'expense'], (fErr, feeCategory) => {
                      const fc = (!fErr && feeCategory) ? feeCategory : category;
                      db.run(
                        `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, time, exchange_rate, converted_amount, fee, parent_transaction_id)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [walletId, fc.id, 'expense', commission,
                         `Comisión: ${description || category.name}`,
                         txDate, txTime, 1.0, commission, 0, transactionId],
                        function(err2) {
                          if (err2) {
                            db.run('ROLLBACK');
                            return reject(err2);
                          }
                          const feeTransactionId = this.lastID;

                          // Recalcular transactions.fee del padre (suma de fees)
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
                              // Recalcular exchanges.fee si este padre es el débito de un exchange
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

// Endpoints


// Helpers de cadena de transacciones
// transacción. Devuelve [{id, category}...] de ancestros (sin incluir la raíz
// consultada). Usada para saber si una transacción pertenece a un exchange.
function getParentChain(transactionId) {
  return new Promise((resolve, reject) => {
    const chain = [];
    const visit = (id, depth) => {
      if (depth > 50) return resolve(chain); // tope de seguridad
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

// Resuelve si una transacción (o cualquiera de sus ancestros) es un miembro
// directo de un exchange (débito o crédito). Devuelve { exchangeId } o null.
function resolveExchangeForTransaction(transactionId) {
  return new Promise((resolve, reject) => {
    getParentChain(transactionId).then((chain) => {
      // La cadena incluye la propia transacción + ancestros; buscar el primer
      // eslabón que sea débito/crédito de un exchange.
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
// === Helpers promisificados para editar/eliminar ===
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

// Ejecuta `fn` (async) dentro de UNA transacción SQL (BEGIN/COMMIT/ROLLBACK).
// `fn` debe contener SOLO operaciones de escritura (usa runDb/serverDb/etc.).
// Si `fn` lanza o rechaza, se hace ROLLBACK y se relanza el error.
// Además serializa las transacciones de escritura en la conexión compartida
// (cola de promesas) para que dos requests concurrentes no intercalen sus
// statements dentro de una misma transacción.
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
          // ROLLBACK y relanzar el error original
          db.run('ROLLBACK', () => reject(error));
        });
    });
  });
  const p = writeTxQueue.then(run, run);
  writeTxQueue = p.catch(() => {});
  return p;
}

// Obtiene una transacción con datos de billetera y categoría (incluso si está borrada).


// getTransactionRow + getMinChildDate + dtKey + syncParentFee + balanceEffect
function getTransactionRow(id) {
  return getDb(
    `SELECT
       t.id,
       t.wallet_id AS walletId,
       t.category_id AS categoryId,
       t.type,
       t.amount,
       t.description,
       t.date,
       t.time,
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

// Fecha mínima entre los hijos (no borrados) de una transacción.
function getMinChildDate(parentId) {
  return getDb(
    `SELECT MIN(date) AS minDate, MIN(
       CASE
         WHEN time IS NOT NULL AND time != '' THEN date || 'T' || time
         ELSE date || 'T23:59:59'
       END
     ) AS minDateTime FROM transactions WHERE parent_transaction_id = ? AND deleted = 0`,
    [parentId]
  );
}

// Convierte una fecha/hora a un string comparable lexicográficamente.
// `time` puede ser HH:MM, HH:MM:SS, vacío o null. Si falta, se usa 23:59:59
// (el final del día) para que una transacción sin hora se considere después de
// cualquier otra con hora ese mismo día.
function dtKey(date, time) {
  const t = (typeof time === 'string' && time !== '') ? time : '23:59:59';
  const normalized = t.length === 5 ? `${t}:00` : t;
  return `${date}T${normalized}`;
}

// Comunica la categoría fee/exchange por nombre según tipo de categoría usada.

// Recalcula transactions.fee del padre y exchanges.fee (si el padre es débito de
// un exchange) a partir de la suma de sus transacciones hijas categoría fee.
// NOTA: esta variante ejecuta SOLO los UPDATEs, SIN abrir transacción.
// Debe llamarse DENTRO de un withTransaction (los handlers la envuelven).
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

// Recalcula fees del padre/exchange, atómico (envuelve syncParentFeeSql en UNA
// transacción). Útil cuando se llama de forma aislada (p.ej. desde createTransaction
// u otros flujos que no envuelven todo el bloque).
function syncParentFee(parentId) {
  return withTransaction(() => syncParentFeeSql(parentId));
}

// Efecto de una transacción sobre el balance de la billetera.
function balanceEffect(type, amount) {
  return type === 'income' ? Number(amount) : -Number(amount);
}


module.exports = { createTransaction, getParentChain, resolveExchangeForTransaction, runDb, getDb, allDb, getTransactionRow, getMinChildDate, dtKey, syncParentFee, syncParentFeeSql, balanceEffect, withTransaction };
