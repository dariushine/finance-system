// src/routes/exchanges.js — Endpoints HTTP de exchanges.
// Modelo de fecha: UN solo `datetime_utc` (instante absoluto UTC, ISO con Z).
const { db } = require('../db');
const {
  getDb, allDb, runDb,
  createTransaction, syncParentFeeSql, withTransaction,
} = require('../services/transactions');
const { isValidTime, normalizeTimeMinute } = require('../services/rates');
const {
  getExchangeTransactions, getExchangeTransactionRow, createFeeForExchange, softDeleteExchangeTransactions,
} = require('../services/exchanges');
const { getUserTimeZone } = require('../services/settings');
const { rangeToInstants, projectInstants } = require('../services/timeUtil');
const { wallClockToUtc, isValidTimeZone } = require('../services/timeZoneMap');

async function effectiveTz(q, body) {
  const c = (body && body.tz) || (q && q.tz) || null;
  if (c && isValidTimeZone(c)) return c;
  return getUserTimeZone();
}

// Proyecta una fila (con datetimeUtc) a {date,time} en tz.
function projectRow(row, tz) {
  const p = projectInstants(row ? [row] : [], tz);
  return p && p.length ? p[0] : row;
}

module.exports = function registerExchangeRoutes(app) {
  // POST /api/exchanges — crear un exchange (débito + crédito + fee).
  app.post('/api/exchanges', async (req, res) => {
    try {
      const { fromWalletId, toWalletId, fromAmount, toAmount, description, fee, date, time, tz } = req.body;
      const tzEff = await effectiveTz(null, req.body);

      if (!fromWalletId || !toWalletId || !fromAmount || !toAmount) {
        return res.status(400).json({ error: 'Faltan campos requeridos: fromWalletId, toWalletId, fromAmount, toAmount' });
      }
      if (fromWalletId === toWalletId) {
        return res.status(400).json({ error: 'Las billeteras origen y destino deben ser diferentes' });
      }
      if (fromAmount <= 0 || toAmount <= 0) {
        return res.status(400).json({ error: 'Los montos deben ser mayores a 0' });
      }
      if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
      }
      if (time != null && time !== '' && !isValidTime(time)) {
        return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
      }
      const txDate = typeof date === 'string' && date !== '' ? date : undefined;
      const txTime = typeof time === 'string' && time !== '' ? normalizeTimeMinute(time) : undefined;

      const [fromWallet, toWallet] = await Promise.all([
        new Promise((resolve, reject) => db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [fromWalletId], (err, row) => (err ? reject(err) : resolve(row)))),
        new Promise((resolve, reject) => db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [toWalletId], (err, row) => (err ? reject(err) : resolve(row)))),
      ]);
      if (!fromWallet) throw new Error('Billetera origen no encontrada');
      if (!toWallet) throw new Error('Billetera destino no encontrada');

      const commission = Number(fee) || 0;
      const fromTotal = fromAmount + commission;
      if (fromWallet.balance < fromTotal) {
        throw new Error(`Fondos insuficientes en ${fromWallet.name}. Balance actual: ${fromWallet.balance} ${fromWallet.currency}, necesita ${fromTotal}`);
      }
      const rate = toAmount / fromAmount;

      const debitTransaction = await createTransaction(
        fromWalletId, 'exchange_out', 'expense', fromAmount,
        `${description || 'Exchange'} → ${toWallet.name}`, commission, txDate, txTime, tzEff
      );
      const creditTransaction = await createTransaction(
        toWalletId, 'exchange_in', 'income', toAmount,
        `${description || 'Exchange'} ← ${fromWallet.name}`, 0, txDate, txTime, tzEff
      );

      db.run(
        `INSERT INTO exchanges (debit_transaction_id, credit_transaction_id, from_wallet_id, to_wallet_id,
         from_amount, to_amount, rate, fee, description)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [debitTransaction.id, creditTransaction.id, fromWalletId, toWalletId, fromAmount, toAmount, rate, commission, description || ''],
        function (err) {
          if (err) {
            console.error('Error registrando exchange:', err);
            return res.status(500).json({ error: 'Error interno del servidor' });
          }
          const exchangeId = this.lastID;
          res.json({
            success: true,
            message: 'Exchange registrado exitosamente',
            exchange: {
              id: exchangeId,
              rate,
              fromWallet: fromWallet.name,
              toWallet: toWallet.name,
              fromAmount,
              toAmount,
              fromCurrency: fromWallet.currency,
              toCurrency: toWallet.currency,
              description: description || '',
            },
            transactions: { debit: debitTransaction, credit: creditTransaction },
          });
        }
      );
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // GET /api/exchanges — listar (paginado + rango en la zona del usuario).
  app.get('/api/exchanges', async (req, res) => {
    try {
      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
      const offset = (page - 1) * limit;

      const { from, to, period, tz } = req.query;
      const tzEff = await effectiveTz(req.query, null);
      const bounds = rangeToInstants(from, to, period, tzEff);
      const conditions = ['e.deleted = 0'];
      const params = [];
      if (bounds) {
        conditions.push('dt.datetime_utc >= ?', 'dt.datetime_utc < ?');
        params.push(bounds.start, bounds.end);
      }
      params.push(limit, offset);

      const query = `
        SELECT
          e.id,
          e.from_wallet_id AS fromWalletId,
          e.to_wallet_id AS toWalletId,
          e.from_amount AS fromAmount,
          e.to_amount AS toAmount,
          e.rate,
          e.debit_transaction_id AS debitTransactionId,
          e.credit_transaction_id AS creditTransactionId,
          e.fee,
          e.description,
          e.created_at AS createdAt,
          dt.datetime_utc AS datetimeUtc,
          from_wallet.name AS fromWalletName,
          to_wallet.name AS toWalletName,
          from_wallet.currency AS fromCurrency,
          to_wallet.currency AS toCurrency
        FROM exchanges e
        JOIN wallets from_wallet ON from_wallet.id = e.from_wallet_id
        JOIN wallets to_wallet ON to_wallet.id = e.to_wallet_id
        LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY COALESCE(dt.datetime_utc, '1970-01-01T00:00:00Z') DESC, e.created_at DESC, e.id DESC
        LIMIT ? OFFSET ?`;

      const rows = await new Promise((resv, rej) => db.all(query, params, (e, r) => (e ? rej(e) : resv(r))));
      const total = await new Promise((resv, rej) =>
        db.get(`SELECT COUNT(*) AS total FROM exchanges e LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id WHERE ${conditions.join(' AND ')}`, params.slice(0, -2), (e, r) => (e ? rej(e) : resv(r)))
      );
      res.json({ data: projectInstants(rows, tzEff), total: total?.total || 0, page, limit, tz: tzEff });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET /api/exchanges/:id — detalle.
  app.get('/api/exchanges/:id', async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
      const tzEff = await effectiveTz(req.query, null);
      const query = `
        SELECT
          e.id,
          e.from_wallet_id AS fromWalletId,
          e.to_wallet_id AS toWalletId,
          e.from_amount AS fromAmount,
          e.to_amount AS toAmount,
          e.rate,
          e.fee,
          e.description,
          e.created_at AS createdAt,
          e.debit_transaction_id AS debitTransactionId,
          e.credit_transaction_id AS creditTransactionId,
          dt.datetime_utc AS datetimeUtc,
          fw.name AS fromWalletName,
          tw.name AS toWalletName,
          fw.currency AS fromCurrency,
          tw.currency AS toCurrency
        FROM exchanges e
        JOIN wallets fw ON fw.id = e.from_wallet_id
        JOIN wallets tw ON tw.id = e.to_wallet_id
        LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id
        WHERE e.id = ? AND e.deleted = 0`;
      const row = await new Promise((resv, rej) => db.get(query, [id], (e, r) => (e ? rej(e) : resv(r))));
      if (!row) return res.status(404).json({ error: 'Exchange no encontrado' });
      res.json(projectRow(row, tzEff));
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // PUT /api/exchanges/:id — editar montos, fee, fecha/hora y descripción.
  app.put('/api/exchanges/:id', async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

      const ex = await getDb(
        `SELECT id, debit_transaction_id AS debitTransactionId, credit_transaction_id AS creditTransactionId,
                from_wallet_id AS fromWalletId, to_wallet_id AS toWalletId,
                from_amount AS fromAmount, to_amount AS toAmount, rate, fee, description, deleted
         FROM exchanges WHERE id = ?`,
        [id]
      );
      if (!ex || ex.deleted) return res.status(404).json({ error: 'Exchange no encontrado' });

      const { fromAmount, toAmount, fee, description, date, time, tz } = req.body;
      const tzEff = await effectiveTz(null, req.body);
      const [debit, credit] = await getExchangeTransactions(ex);
      if (!debit || debit.deleted || !credit || credit.deleted) {
        return res.status(400).json({ error: 'El exchange tiene transacciones inconsistentes.' });
      }
      const fromWalletBalanceBefore = debit.walletBalance;
      const toWalletBalanceBefore = credit.walletBalance;

      const [fromWalletInfo, toWalletInfo] = await Promise.all([
        getDb('SELECT name FROM wallets WHERE id = ?', [ex.fromWalletId]),
        getDb('SELECT name FROM wallets WHERE id = ?', [ex.toWalletId]),
      ]);
      const debitWalletName = fromWalletInfo ? fromWalletInfo.name : 'origen';
      const creditWalletName = toWalletInfo ? toWalletInfo.name : 'destino';

      const prevFees = await allDb(
        `SELECT t.id, t.wallet_id AS walletId, t.type, t.amount, t.parent_transaction_id AS parentId
         FROM transactions t JOIN categories c ON c.id = t.category_id
         WHERE t.parent_transaction_id IN (?, ?) AND c.name = 'fee' AND t.deleted = 0`,
        [debit.id, credit.id]
      );

      let newFromAmount = Number(ex.fromAmount);
      let newToAmount = Number(ex.toAmount);
      if (fromAmount != null && fromAmount !== '') {
        const parsed = Number(fromAmount);
        if (!Number.isFinite(parsed) || parsed <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
        newFromAmount = parsed;
      }
      if (toAmount != null && toAmount !== '') {
        const parsed = Number(toAmount);
        if (!Number.isFinite(parsed) || parsed <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
        newToAmount = parsed;
      }

      let newFee = Number(ex.fee) || 0;
      let feeChanged = false;
      if (fee != null && fee !== '') {
        const parsed = Number(fee);
        if (!Number.isFinite(parsed) || parsed < 0) return res.status(400).json({ error: 'La comisión no puede ser negativa' });
        newFee = parsed;
        feeChanged = newFee !== (Number(ex.fee) || 0);
      }

      // Nueva fecha/hora → instante UTC (conserva la del débito si no se cambia).
      let newDatetimeUtc = debit.datetimeUtc;
      if (date != null && date !== '' || (time != null && time !== '')) {
        const prevWall = projectRow({ datetimeUtc: debit.datetimeUtc }, tzEff) || {};
        const newDate = (date != null && date !== '') ? date : prevWall.date;
        if (newDate !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
          return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
        }
        const newTime = (time != null && time !== '') ? normalizeTimeMinute(time) : (prevWall.time || '00:00');
        newDatetimeUtc = wallClockToUtc(newDate, newTime, tzEff);
      }
      const newDescription = description !== undefined ? (description || '') : ex.description;

      const newFromTotal = newFromAmount + newFee;
      if (fromWalletBalanceBefore < newFromTotal) {
        return res.status(400).json({ error: `Fondos insuficientes en la billetera origen. Balance: ${fromWalletBalanceBefore}, requiere ${newFromTotal}` });
      }

      const prevFromFeeTotal = prevFees.reduce((s, f) => s + Number(f.amount), 0);
      const oldFromEffect = -(Number(ex.fromAmount)) - prevFromFeeTotal;
      const oldToEffect = Number(ex.toAmount);
      const newFromEffect = -(newFromAmount) - newFee;
      const newToEffect = newToAmount;
      const fromDelta = newFromEffect - oldFromEffect;
      const toDelta = newToEffect - oldToEffect;

      await withTransaction(async () => {
        await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [fromWalletBalanceBefore + fromDelta, ex.fromWalletId]);
        await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [toWalletBalanceBefore + toDelta, ex.toWalletId]);

        const newRate = newToAmount / newFromAmount;
        const debitDesc = `${newDescription || 'Exchange'} → ${creditWalletName || 'destino'}`;
        await runDb('UPDATE transactions SET amount = ?, description = ?, datetime_utc = ? WHERE id = ?', [newFromAmount, debitDesc, newDatetimeUtc, debit.id]);
        const creditDesc = `${newDescription || 'Exchange'} ← ${debitWalletName || 'origen'}`;
        await runDb('UPDATE transactions SET amount = ?, description = ?, datetime_utc = ? WHERE id = ?', [newToAmount, creditDesc, newDatetimeUtc, credit.id]);

        let feesAlive = [...prevFees];
        if (feeChanged) {
          if (newFee > 0 && prevFees.length === 0) {
            await createFeeForExchange(debit, newFee, newDatetimeUtc, newDescription, tzEff);
            feesAlive = [];
          } else if (newFee === 0) {
            for (const f of prevFees) await runDb('UPDATE transactions SET deleted = 1 WHERE id = ?', [f.id]);
            feesAlive = [];
          } else {
            const firstFee = prevFees[0];
            await runDb('UPDATE transactions SET amount = ? WHERE id = ?', [newFee, firstFee.id]);
            for (const f of prevFees.slice(1)) await runDb('UPDATE transactions SET deleted = 1 WHERE id = ?', [f.id]);
            feesAlive = [firstFee];
          }
        }
        for (const f of feesAlive) {
          await runDb('UPDATE transactions SET datetime_utc = ? WHERE id = ?', [newDatetimeUtc, f.id]);
        }

        await runDb(
          `UPDATE exchanges SET from_amount = ?, to_amount = ?, rate = ?, fee = ?, description = ? WHERE id = ?`,
          [newFromAmount, newToAmount, newRate, newFee, newDescription || '', id]
        );
        await syncParentFeeSql(debit.id);
      });

      res.json({ success: true, message: 'Exchange actualizado' });
    } catch (e) {
      console.error('Error actualizando exchange:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/exchanges/:id
  app.delete('/api/exchanges/:id', async (req, res) => {
    try {
      const id = Number.parseInt(req.params.id, 10);
      if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

      const ex = await getDb(
        `SELECT id, debit_transaction_id AS debitTransactionId, credit_transaction_id AS creditTransactionId,
                from_wallet_id AS fromWalletId, to_wallet_id AS toWalletId, deleted
         FROM exchanges WHERE id = ?`,
        [id]
      );
      if (!ex || ex.deleted) return res.status(404).json({ error: 'Exchange no encontrado' });

      const [debit, credit] = await getExchangeTransactions(ex);
      if (!debit || !credit) return res.status(400).json({ error: 'El exchange tiene transacciones inconsistentes.' });

      await withTransaction(async () => {
        const byWallet = await softDeleteExchangeTransactions(debit, credit);
        for (const walletId of Object.keys(byWallet)) {
          const wallet = await getDb('SELECT balance FROM wallets WHERE id = ?', [walletId]);
          if (!wallet) continue;
          const newBalance = Number(wallet.balance) - byWallet[walletId];
          await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [newBalance, walletId]);
        }
        await runDb('UPDATE exchanges SET deleted = 1 WHERE id = ?', [id]);
      });
      res.json({ success: true, message: 'Exchange eliminado (virtualmente)' });
    } catch (e) {
      console.error('Error eliminando exchange:', e);
      res.status(500).json({ error: e.message });
    }
  });
};
