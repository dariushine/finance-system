// src/routes/exchanges.js — Endpoints HTTP de exchanges.
const { db } = require('../db');
const {
  getDb, allDb, runDb,
  createTransaction, syncParentFeeSql, withTransaction,
} = require('../services/transactions');
const { isValidTime, normalizeTimeMinute } = require('../services/rates');
const {
  getExchangeTransactions, createFeeForExchange, softDeleteExchangeTransactions,
} = require('../services/exchanges');

module.exports = function registerExchangeRoutes(app) {
  app.post('/api/exchanges', async (req, res) => {
    try {
      const { fromWalletId, toWalletId, fromAmount, toAmount, description, fee, date, time } = req.body;
      console.log('💱 Procesando exchange:', { fromWalletId, toWalletId, fromAmount, toAmount, fee, date });

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
      if (!isValidTime(time)) {
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
        `${description || 'Exchange'} → ${toWallet.name}`, commission, txDate, txTime
      );
      const creditTransaction = await createTransaction(
        toWalletId, 'exchange_in', 'income', toAmount,
        `${description || 'Exchange'} ← ${fromWallet.name}`, 0, txDate, txTime
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

  app.get('/api/exchanges', (req, res) => {
    const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
    const offset = (page - 1) * limit;

    const { from, to, period } = req.query;
    let fromDate = from;
    let toDate = to;
    if (!fromDate || !toDate) {
      if (!period) {
        fromDate = '1970-01-01';
        toDate = '9999-12-31';
      } else {
        const now = new Date();
        toDate = now.toISOString().split('T')[0];
        if (period === 'day') fromDate = toDate;
        else if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); fromDate = d.toISOString().split('T')[0]; }
        else if (period === 'month') { const d = new Date(now); d.setDate(1); fromDate = d.toISOString().split('T')[0]; }
        else if (period === '3m') { const d = new Date(now); d.setMonth(d.getMonth() - 3); fromDate = d.toISOString().split('T')[0]; }
        else if (period === 'year') { const d = new Date(now); d.setMonth(d.getMonth() - 12); fromDate = d.toISOString().split('T')[0]; }
        else fromDate = '1970-01-01';
      }
    }

    const conditions = ["COALESCE(dt.date, '') >= ?", "COALESCE(dt.date, '') <= ?", 'e.deleted = 0'];
    const params = [fromDate, toDate, limit, offset];
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
        dt.date AS date,
        dt.time AS time,
        from_wallet.name AS fromWalletName,
        to_wallet.name AS toWalletName,
        from_wallet.currency AS fromCurrency,
        to_wallet.currency AS toCurrency
      FROM exchanges e
      JOIN wallets from_wallet ON from_wallet.id = e.from_wallet_id
      JOIN wallets to_wallet ON to_wallet.id = e.to_wallet_id
      LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY COALESCE(dt.date, '1970-01-01') DESC, COALESCE(dt.time, '') DESC, e.created_at DESC, e.id DESC
      LIMIT ? OFFSET ?`;

    db.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(`SELECT COUNT(*) AS total FROM exchanges e LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id WHERE ${conditions.join(' AND ')}`, [fromDate, toDate], (countErr, result) => {
        if (countErr) return res.status(500).json({ error: countErr.message });
        res.json({ data: rows || [], total: result?.total || 0, page, limit });
      });
    });
  });

  // Detalle de un exchange
  app.get('/api/exchanges/:id', (req, res) => {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });
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
        dt.date AS date,
        dt.time AS time,
        fw.name AS fromWalletName,
        tw.name AS toWalletName,
        fw.currency AS fromCurrency,
        tw.currency AS toCurrency
      FROM exchanges e
      JOIN wallets fw ON fw.id = e.from_wallet_id
      JOIN wallets tw ON tw.id = e.to_wallet_id
      LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id
      WHERE e.id = ? AND e.deleted = 0`;
    db.get(query, [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) return res.status(404).json({ error: 'Exchange no encontrado' });
      res.json(row);
    });
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

      const { fromAmount, toAmount, fee, description, date, time } = req.body;
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

      let newDate = debit.date || credit.date;
      let newTime = debit.time || credit.time || null;
      if (date != null && date !== '') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
        newDate = date;
      }
      if (time != null && time !== '') {
        if (!isValidTime(time)) return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
        newTime = normalizeTimeMinute(time);
      } else if (time === '') {
        newTime = null;
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
        await runDb('UPDATE transactions SET amount = ?, description = ?, date = ?, time = ? WHERE id = ?', [newFromAmount, debitDesc, newDate, newTime, debit.id]);
        const creditDesc = `${newDescription || 'Exchange'} ← ${debitWalletName || 'origen'}`;
        await runDb('UPDATE transactions SET amount = ?, description = ?, date = ?, time = ? WHERE id = ?', [newToAmount, creditDesc, newDate, newTime, credit.id]);

        let feesAlive = [...prevFees];
        if (feeChanged) {
          if (newFee > 0 && prevFees.length === 0) {
            await createFeeForExchange(debit, newFee, newDate, newTime, newDescription);
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
          await runDb('UPDATE transactions SET date = ?, time = ? WHERE id = ?', [newDate, newTime, f.id]);
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