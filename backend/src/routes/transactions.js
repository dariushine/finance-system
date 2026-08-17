// src/routes/transactions.js — Endpoints HTTP de transacciones.
const { db } = require('../db');
const {
  createTransaction, getTransactionRow, runDb, getDb,
  resolveExchangeForTransaction, getMinChildDate, dtKey, syncParentFeeSql, balanceEffect, withTransaction,
} = require('../services/transactions');
const { isValidTime } = require('../services/rates');
const { getOrCreateCategory, isSystemCategoryName } = require('../services/categories');

module.exports = function registerTransactionRoutes(app) {
  app.post('/api/transactions', async (req, res) => {
    try {
      const { walletId, categoryName, type, amount, description, fee, date, time } = req.body;
      if (!walletId || !categoryName || !type || !amount) {
        return res.status(400).json({ error: 'Faltan campos requeridos: walletId, categoryName, type, amount' });
      }
      if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
      }
      if (!isValidTime(time)) {
        return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
      }
      const result = await createTransaction(walletId, categoryName, type, amount, description, fee, date, time);
      res.json({ success: true, message: `Transacción de ${type} registrada exitosamente`, transaction: result });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Listar transacciones (paginado + rango de fechas)
  app.get('/api/transactions', (req, res) => {
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

    const conditions = ['t.deleted = 0', 't.date >= ?', 't.date <= ?'];
    const params = [fromDate, toDate, limit, offset];
    const query = `
      SELECT
        t.id,
        t.wallet_id AS walletId,
        w.name AS walletName,
        w.currency AS walletCurrency,
        c.name AS category,
        t.type,
        t.amount,
        t.description,
        t.date,
        t.time,
        t.fee,
        t.parent_transaction_id AS parentTransactionId,
        t.created_at AS createdAt
      FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id
      JOIN categories c ON c.id = t.category_id
      WHERE ${conditions.join(' AND ')}
      ORDER BY t.date DESC, t.time DESC, t.created_at DESC, t.id DESC
      LIMIT ? OFFSET ?`;

    db.all(query, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get(`SELECT COUNT(*) AS total FROM transactions t WHERE ${conditions.join(' AND ')}`, [fromDate, toDate], (countErr, result) => {
        if (countErr) return res.status(500).json({ error: countErr.message });
        res.json({ data: rows, total: result?.total || 0, page, limit });
      });
    });
  });

  // Detalle de una transacción (balanceAfter + hijos + pertenencia a exchange)
  app.get('/api/transactions/:id', (req, res) => {
    db.get(`
      SELECT
        t.id,
        t.wallet_id AS walletId,
        w.name AS walletName,
        w.currency AS walletCurrency,
        w.balance AS walletBalance,
        c.name AS category,
        t.type,
        t.amount,
        t.description,
        t.date,
        t.time,
        t.fee,
        t.parent_transaction_id AS parentTransactionId,
        t.created_at AS createdAt
      FROM transactions t
      JOIN wallets w ON w.id = t.wallet_id
      JOIN categories c ON c.id = t.category_id
      WHERE t.id = ? AND t.deleted = 0`,
      [req.params.id],
      (err, transaction) => {
        if (err) return res.status(500).json({ error: err.message });
        if (!transaction) return res.status(404).json({ error: 'Transacción no encontrada' });

        db.get(
          `SELECT running, total_net FROM (
             SELECT
               t.id,
               SUM(
                 CASE
                   WHEN t.type = 'income'  THEN COALESCE(t.amount, 0)
                   WHEN t.type = 'expense' THEN -COALESCE(t.amount, 0)
                   ELSE 0
                 END
               ) OVER (ORDER BY t.date, t.time, t.created_at, t.id) AS running,
               (SELECT SUM(
                  CASE
                    WHEN type = 'income'  THEN COALESCE(amount, 0)
                    WHEN type = 'expense' THEN -COALESCE(amount, 0)
                    ELSE 0
                  END)
                FROM transactions WHERE wallet_id = ? AND deleted = 0) AS total_net
             FROM transactions t
             WHERE t.wallet_id = ? AND t.deleted = 0
           ) WHERE id = ?`,
          [transaction.walletId, transaction.walletId, req.params.id],
          (balErr, balRow) => {
            db.all(
              `SELECT
                 t.id,
                 t.wallet_id AS walletId,
                 w.name AS walletName,
                 w.currency AS walletCurrency,
                 c.name AS category,
                 t.type,
                 t.amount,
                 t.description,
                 t.date,
                 t.time,
                 t.fee,
                 t.parent_transaction_id AS parentTransactionId,
                 t.created_at AS createdAt
               FROM transactions t
               JOIN wallets w ON w.id = t.wallet_id
               JOIN categories c ON c.id = t.category_id
               WHERE t.parent_transaction_id = ? AND t.deleted = 0
               ORDER BY t.id ASC`,
              [req.params.id],
              (childErr, children) => {
                if (balErr) return res.status(500).json({ error: balErr.message });
                if (childErr) return res.status(500).json({ error: childErr.message });
                const { walletBalance: _wb, ...txRest } = transaction;
                let balanceAfter = null;
                if (balRow && balRow.running != null) {
                  const walletBalance = Number(transaction.walletBalance) || 0;
                  const totalNet = Number(balRow.total_net) || 0;
                  balanceAfter = walletBalance - totalNet + Number(balRow.running);
                }
                resolveExchangeForTransaction(req.params.id).then((info) => {
                  res.json({
                    ...txRest,
                    balanceAfter: balanceAfter != null ? parseFloat(balanceAfter.toFixed(2)) : null,
                    children: children || [],
                    exchangeId: info ? info.exchangeId : null,
                    isExchangeMember: !!info,
                  });
                }).catch((exErr) => {
                  res.status(500).json({ error: exErr.message });
                });
              }
            );
          }
        );
      }
    );
  });

  // === Acciones en el detalle de transacción ===

  // PUT /api/transactions/:id — editar descripción, monto, fecha y categoría.
  app.put('/api/transactions/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const t = await getTransactionRow(id);
      if (!t || t.deleted) return res.status(404).json({ error: 'Transacción no encontrada' });

      const exInfo = await resolveExchangeForTransaction(id);
      if (exInfo) {
        return res.status(400).json({ error: 'Esta transacción pertenece a un exchange. Edítala desde el panel de exchange (feature futuro).' });
      }

      const { description, amount, date, time, categoryName } = req.body;
      let newDate = t.date;
      let newTime = t.time || null;
      if (date != null && date !== '') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
        }
        newDate = date;
      }
      if (time != null && time !== '') {
        if (!isValidTime(time)) {
          return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
        }
        newTime = time.length === 5 ? `${time}:00` : time;
      } else if (time === '') {
        newTime = null;
      }
      if (t.parentId != null) {
        const parent = await getTransactionRow(t.parentId);
        if (parent && dtKey(newDate, newTime) < dtKey(parent.date, parent.time)) {
          return res.status(400).json({ error: `La fecha/hora no puede ser anterior a la de su transacción padre (${parent.date}${parent.time ? ' ' + parent.time : ''}).` });
        }
      }
      const minChild = await getMinChildDate(id);
      if (minChild && minChild.minDateTime != null && dtKey(newDate, newTime) > minChild.minDateTime) {
        const childLabel = minChild.minDate != null ? `${minChild.minDate}` : '';
        return res.status(400).json({ error: `La fecha/hora no puede ser posterior a la de sus transacciones asociadas (${childLabel}).` });
      }

      let newAmount = Number(t.amount);
      let amountChanged = false;
      if (amount != null && amount !== '') {
        const parsed = Number(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
        }
        newAmount = parsed;
        amountChanged = newAmount !== Number(t.amount);
      }

      let newCategoryId = t.categoryId;
      if (categoryName != null && categoryName !== '' && categoryName !== t.category) {
        if (t.category === 'fee') {
          return res.status(400).json({ error: 'La categoría de una comisión (fee) no se puede cambiar.' });
        }
        if (isSystemCategoryName(categoryName)) {
          return res.status(400).json({ error: 'No puedes asignar categorías del sistema (fee, exchange).' });
        }
        const cat = await getOrCreateCategory(categoryName, t.type);
        newCategoryId = cat.id;
      }

      const newDescription = description !== undefined ? (description || '') : t.description;

      await withTransaction(async () => {
        if (amountChanged) {
          const oldEffect = balanceEffect(t.type, t.amount);
          const newEffect = balanceEffect(t.type, newAmount);
          const delta = newEffect - oldEffect;
          await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) + delta, t.walletId]);
        }

        await runDb('UPDATE transactions SET description = ?, amount = ?, date = ?, time = ?, category_id = ? WHERE id = ?', [newDescription, newAmount, newDate, newTime, newCategoryId, id]);

        if (t.category === 'fee' && t.parentId != null) {
          await syncParentFeeSql(t.parentId);
        }
      });

      res.json({ success: true, message: 'Transacción actualizada' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // DELETE /api/transactions/:id — soft-delete.
  app.delete('/api/transactions/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const t = await getTransactionRow(id);
      if (!t || t.deleted) return res.status(404).json({ error: 'Transacción no encontrada' });

      const exInfo = await resolveExchangeForTransaction(id);
      if (exInfo) {
        return res.status(400).json({ error: 'Esta transacción pertenece a un exchange. Elimínala desde el panel de exchange (feature futuro).' });
      }
      const child = await getDb('SELECT id FROM transactions WHERE parent_transaction_id = ? AND deleted = 0 LIMIT 1', [id]);
      if (child) {
        return res.status(400).json({ error: 'No se puede eliminar: primero elimina sus transacciones asociadas.' });
      }
      const effect = balanceEffect(t.type, t.amount);
      await withTransaction(async () => {
        await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) - effect, t.walletId]);
        await runDb('UPDATE transactions SET deleted = 1 WHERE id = ?', [id]);
        if (t.category === 'fee' && t.parentId != null) {
          await syncParentFeeSql(t.parentId);
        }
      });
      res.json({ success: true, message: 'Transacción eliminada (virtualmente)' });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/transactions/:id/fee — agregar una comisión (fee).
  app.post('/api/transactions/:id/fee', async (req, res) => {
    try {
      const id = req.params.id;
      const t = await getTransactionRow(id);
      if (!t || t.deleted) return res.status(404).json({ error: 'Transacción no encontrada' });
      if (t.category === 'fee') {
        return res.status(400).json({ error: 'No puedes agregar comisión a una comisión (fee).' });
      }
      const exInfo = await resolveExchangeForTransaction(id);
      if (exInfo) {
        return res.status(400).json({ error: 'Esta transacción pertenece a un exchange. No puedes agregarle comisión desde aquí.' });
      }
      const { amount, date, time } = req.body;
      const feeAmount = Number(amount);
      if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
        return res.status(400).json({ error: 'El monto de la comisión debe ser mayor a 0' });
      }
      let feeDate = t.date;
      let feeTime = null;
      if (date != null && date !== '') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
        }
        feeDate = date;
      }
      if (time != null && time !== '') {
        if (!isValidTime(time)) {
          return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
        }
        feeTime = time.length === 5 ? `${time}:00` : time;
      } else if (time === '') {
        feeTime = null;
      }
      if (dtKey(feeDate, feeTime) < dtKey(t.date, t.time)) {
        return res.status(400).json({ error: `La fecha/hora de la comisión no puede ser anterior a la de su transacción (${t.date}${t.time ? ' ' + t.time : ''}).` });
      }
      const feeCat = await getDb("SELECT id FROM categories WHERE name = 'fee' AND type = 'expense' AND isActive = 1", []);
      if (!feeCat) return res.status(400).json({ error: 'Categoría fee no disponible' });
      if (Number(t.walletBalance) < feeAmount) {
        return res.status(400).json({ error: `Fondos insuficientes. Balance actual: ${t.walletBalance} ${t.currency}, necesita ${feeAmount}` });
      }
      const ins = await withTransaction(async () => {
        await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) - feeAmount, t.walletId]);
        const inserted = await runDb(
          `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, time, exchange_rate, converted_amount, fee, parent_transaction_id)
           VALUES (?, ?, 'expense', ?, ?, ?, ?, 1.0, ?, 0, ?)`,
          [t.walletId, feeCat.id, feeAmount, `Comisión: ${t.description || t.category}`, feeDate, feeTime, feeAmount, id]
        );
        await syncParentFeeSql(id);
        return inserted;
      });
      res.json({ success: true, message: 'Comisión agregada', feeId: ins.lastID });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // POST /api/transactions/:id/associate — crear una transacción asociada (hija).
  app.post('/api/transactions/:id/associate', async (req, res) => {
    try {
      const id = req.params.id;
      const t = await getTransactionRow(id);
      if (!t || t.deleted) return res.status(404).json({ error: 'Transacción no encontrada' });
      if (t.category === 'fee') {
        return res.status(400).json({ error: 'No puedes crear transacciones asociadas a una comisión (fee).' });
      }
      const exInfo = await resolveExchangeForTransaction(id);
      if (exInfo) {
        return res.status(400).json({ error: 'Esta transacción pertenece a un exchange. No puedes crearle transacciones asociadas desde aquí.' });
      }
      const { amount, type, categoryName, description, date, time } = req.body;
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
        return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
      }
      if (type !== 'income' && type !== 'expense') {
        return res.status(400).json({ error: 'type debe ser income o expense' });
      }
      if (isSystemCategoryName(categoryName)) {
        return res.status(400).json({ error: 'No puedes usar categorías del sistema (fee, exchange).' });
      }
      const cat = await getOrCreateCategory(categoryName, type);
      let assocDate = t.date;
      let assocTime = null;
      if (date != null && date !== '') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
        }
        assocDate = date;
      }
      if (time != null && time !== '') {
        if (!isValidTime(time)) {
          return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
        }
        assocTime = time.length === 5 ? `${time}:00` : time;
      } else if (time === '') {
        assocTime = null;
      }
      if (dtKey(assocDate, assocTime) < dtKey(t.date, t.time)) {
        return res.status(400).json({ error: `La fecha/hora de la transacción asociada no puede ser anterior a la de su padre (${t.date}${t.time ? ' ' + t.time : ''}).` });
      }
      const effect = balanceEffect(type, parsedAmount);
      if (effect < 0 && Number(t.walletBalance) < parsedAmount) {
        return res.status(400).json({ error: `Fondos insuficientes. Balance actual: ${t.walletBalance} ${t.currency}, necesita ${parsedAmount}` });
      }
      const ins = await withTransaction(async () => {
        await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) + effect, t.walletId]);
        return runDb(
          `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, time, exchange_rate, converted_amount, fee, parent_transaction_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, ?, 0, ?)`,
          [t.walletId, cat.id, type, parsedAmount, description || '', assocDate, assocTime, parsedAmount, id]
        );
      });
      res.json({ success: true, message: 'Transacción asociada creada', associateId: ins.lastID });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};