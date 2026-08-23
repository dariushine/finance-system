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
// IMPORTANTE (dinero): amount y fee entran en ENTEROS de CENTAVOS (×100),
// porque este service opera en enteros internamente (ver money.js). Las rutas
// que llamen aquí ya deben haber convertido de unidades con toInt().
//
// createTransaction = createTransactionCore envuelto en withTransaction().
// Con esto la escritura es ATÓMICA (padre + fee en un solo COMMIT) y además
// queda serializada por la cola de escrituras (writeTxQueue), eliminando el
// choque de dos BEGIN sobre la única conexión SQLite que causaba
// "cannot start a transaction within a transaction".
function createTransaction(walletId, categoryName, type, amount, description, fee = 0, date, time, tz) {
  return withTransaction(() =>
    createTransactionCore(walletId, categoryName, type, amount, description, fee, date, time, tz)
  );
}

// Núcleo de creación sin administración de transacción propia: NO abre
// BEGIN/COMMIT/ROLLBACK (el caller — un withTransaction — ya abrió el BEGIN).
// Así puede envolverse junto con otras operaciones en UNA sola transacción
// atómica (p. ej. el débito + crédito + registro de un exchange completo).
async function createTransactionCore(walletId, categoryName, type, amount, description, fee = 0, date, time, tz) {
  const commission = Number(fee) || 0;
  const datetimeUtc = resolveDatetimeUtc(date, time, tz);

  const wallet = await getDb('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [walletId]);
  if (!wallet) throw new Error('Wallet no encontrada');

  const category = await getOrCreateCategory(categoryName, type);

  const total = amount + commission;
  if (type === 'expense' && wallet.balance < total) {
    // amount/commission/balance ya están en enteros de centavos (×100);
    // el mensaje se muestra en unidades humanas para el usuario.
    throw new Error(`Fondos insuficientes. Balance actual: ${(wallet.balance / 100)} ${wallet.currency}, necesita ${(total / 100)}`);
  }

  const newBalance = type === 'expense'
    ? wallet.balance - total
    : wallet.balance + amount - commission;

  const ins = await runDb(
    `INSERT INTO transactions (wallet_id, category_id, type, amount, description, datetime_utc, fee, parent_transaction_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [walletId, category.id, type, amount, description || '', datetimeUtc, 0, null]
  );
  const transactionId = ins.lastID;

  let feeTransactionId = null;
  if (commission > 0) {
    const feeCategory = await getDb("SELECT * FROM categories WHERE name = 'fee' AND type = 'expense' AND isActive = 1");
    const fc = feeCategory ? feeCategory : category;
    // Etiqueta el lado cuando la transacción padre es parte de un exchange
    // (categoría exchange_out/exchange_in): "Comisión débito" / "Comisión crédito".
    const side = categoryName === 'exchange_out' ? 'débito' :
                 categoryName === 'exchange_in' ? 'crédito' : null;
    const sideLabel = side ? ` ${side}` : '';
    const feeIns = await runDb(
      `INSERT INTO transactions (wallet_id, category_id, type, amount, description, datetime_utc, fee, parent_transaction_id)
       VALUES (?, ?, 'expense', ?, ?, ?, 0, ?)`,
      [walletId, fc.id, commission,
       `Comisión${sideLabel}: ${description || category.name}`,
       datetimeUtc, transactionId]
    );
    feeTransactionId = feeIns.lastID;
    await syncParentFeeSql(transactionId);
  }

  await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [newBalance, walletId]);

  return {
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
  };
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

// Recalcula transactions.fee del padre, exchanges.fee (si el padre es débito de
// un exchange) y exchanges.credit_fee (si el padre es crédito de un exchange).
// SOLO UPDATEs; debe llamarse DENTRO de un withTransaction.
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
  // Comisión del lado DÉBITO: hijos de la transacción débito → exchanges.fee.
  await runDb(
    `UPDATE exchanges SET fee = COALESCE((
       SELECT SUM(t.amount) FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.parent_transaction_id = exchanges.debit_transaction_id AND c.name = 'fee' AND t.deleted = 0
     ), 0)
     WHERE debit_transaction_id = ?`,
    [parentId]
  );
  // Comisión del lado CRÉDITO: hijos de la transacción crédito → exchanges.credit_fee.
  await runDb(
    `UPDATE exchanges SET credit_fee = COALESCE((
       SELECT SUM(t.amount) FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.parent_transaction_id = exchanges.credit_transaction_id AND c.name = 'fee' AND t.deleted = 0
     ), 0)
     WHERE credit_transaction_id = ?`,
    [parentId]
  );
}

function syncParentFee(parentId) {
  return withTransaction(() => syncParentFeeSql(parentId));
}

// Efecto de una transacción sobre el balance de la billetera.
// Operan en enteros de CENTAVOS (×100) (amount ya viene en enteros).
function balanceEffect(type, amount) {
  return type === 'income' ? Number(amount) : -Number(amount);
}

module.exports = {
  createTransaction,
  createTransactionCore,
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
