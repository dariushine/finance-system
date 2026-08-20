// src/routes/transactions.js — Endpoints HTTP de transacciones.
// Modelo de fecha: UN solo `datetime_utc` (instante absoluto UTC, ISO con Z).
// El front manda date+time+t z en SU zona; aquí se convierte a instante UTC al
// guardar. Al leer, se proyecta a la zona del usuario (projectInstants).
const { db } = require('../db');
const {
  createTransaction, getTransactionRow, runDb, getDb,
  resolveExchangeForTransaction, getMinChildDate, dtKey, syncParentFeeSql, balanceEffect, withTransaction,
} = require('../services/transactions');
const { isValidTime, normalizeTimeMinute } = require('../services/rates');
const { getOrCreateCategory, isSystemCategoryName } = require('../services/categories');
const { getUserTimeZone } = require('../services/settings');
const { rangeToInstants, projectInstants } = require('../services/timeUtil');
const { wallClockToUtc, isValidTimeZone } = require('../services/timeZoneMap');
const { toInt, toNum } = require('../services/money');

// tz efectivo: el de la request (query/body); sino, la zona del usuario.
async function effectiveTz(q, body) {
  const c = (body && body.tz) || (q && q.tz) || null;
  if (c && isValidTimeZone(c)) return c;
  return getUserTimeZone();
}

// Proyecta una fila (con datetimeUtc|datetime_utc) a date/time en tz.
function projectRow(row, tz) {
  const p = projectInstants(row ? [row] : [], tz);
  return p && p.length ? p[0] : row;
}

module.exports = function registerTransactionRoutes(app) {
  app.post('/api/transactions', async (req, res) => {
    try {
      const { walletId, categoryName, type, amount, description, fee, date, time, tz } = req.body;
      const catName = typeof categoryName === 'string' ? categoryName.trim() : categoryName;
      const desc = typeof description === 'string' ? description.trim() : description;
      if (!walletId || !catName || !type || !amount) {
        return res.status(400).json({ error: 'Faltan campos requeridos: walletId, categoryName, type, amount' });
      }
      if (typeof date !== 'string' || date === '') {
        return res.status(400).json({ error: 'La fecha es obligatoria (YYYY-MM-DD)' });
      }
      if (typeof time !== 'string' || time === '') {
        return res.status(400).json({ error: 'La hora es obligatoria (HH:MM)' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
      }
      if (!isValidTime(time)) {
        return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
      }
      const result = await createTransaction(walletId, catName, type, toInt(amount), desc, toInt(fee), date, time, tz);
      // La respuesta vuelve en unidades (int→unidades) para el front.
      res.json({ success: true, message: `Transacción de ${type} registrada exitosamente`, transaction: {
        ...result,
        amount: toNum(result.amount),
        fee: toNum(result.fee),
        newBalance: toNum(result.newBalance),
      } });
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  });

  // Listar transacciones (paginado + rango de fechas en la zona del usuario)
  app.get('/api/transactions', async (req, res) => {
    try {
      const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
      const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
      const offset = (page - 1) * limit;

      const { from, to, period, tz } = req.query;
      const tzEff = await effectiveTz(req.query, null);
      // Límites del período como instantes UTC (según la zona del usuario).
      const bounds = rangeToInstants(from, to, period, tzEff);
      const conditions = ['t.deleted = 0'];
      const params = [];
      if (bounds) {
        conditions.push('t.datetime_utc >= ?', 't.datetime_utc < ?');
        params.push(bounds.start, bounds.end);
      }
      params.push(limit, offset);
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
          t.datetime_utc AS datetimeUtc,
          t.fee,
          t.parent_transaction_id AS parentTransactionId,
          t.created_at AS createdAt
        FROM transactions t
        JOIN wallets w ON w.id = t.wallet_id
        JOIN categories c ON c.id = t.category_id
        WHERE ${conditions.join(' AND ')}
        ORDER BY t.datetime_utc DESC, t.id DESC
        LIMIT ? OFFSET ?`;

      const rows = await new Promise((resv, rej) =>
        db.all(query, params, (e, r) => (e ? rej(e) : resv(r)))
      );
      const total = await new Promise((resv, rej) =>
        db.get(`SELECT COUNT(*) AS total FROM transactions t WHERE ${conditions.join(' AND ')}`, params.slice(0, -2), (e, r) => (e ? rej(e) : resv(r)))
      );
      // Convertir montos a unidades para el front (int→unidades, escala 4).
      const projected = projectInstants(rows, tzEff) || [];
      projected.forEach((r) => { r.amount = toNum(r.amount); if (r.fee != null) r.fee = toNum(r.fee); });
      res.json({ data: projected, total: total?.total || 0, page, limit, tz: tzEff });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Detalle de una transacción (balanceAfter + hijos + pertenencia a exchange)
  app.get('/api/transactions/:id', async (req, res) => {
    try {
      const tzEff = await effectiveTz(req.query, null);
      const transaction = await new Promise((resv, rej) =>
        db.get(
          `SELECT
             t.id,
             t.wallet_id AS walletId,
             w.name AS walletName,
             w.currency AS walletCurrency,
             w.balance AS walletBalance,
             c.name AS category,
             t.type,
             t.amount,
             t.description,
             t.datetime_utc AS datetimeUtc,
             t.fee,
             t.parent_transaction_id AS parentTransactionId,
             t.created_at AS createdAt
           FROM transactions t
           JOIN wallets w ON w.id = t.wallet_id
           JOIN categories c ON c.id = t.category_id
           WHERE t.id = ? AND t.deleted = 0`,
          [req.params.id],
          (e, r) => (e ? rej(e) : resv(r))
        )
      );
      if (!transaction) return res.status(404).json({ error: 'Transacción no encontrada' });

      const balRow = await new Promise((resv, rej) =>
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
               ) OVER (ORDER BY t.datetime_utc, t.id) AS running,
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
          (e, r) => (e ? rej(e) : resv(r))
        )
      );

      const children = await new Promise((resv, rej) =>
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
             t.datetime_utc AS datetimeUtc,
             t.fee,
             t.parent_transaction_id AS parentTransactionId,
             t.created_at AS createdAt
           FROM transactions t
           JOIN wallets w ON w.id = t.wallet_id
           JOIN categories c ON c.id = t.category_id
           WHERE t.parent_transaction_id = ? AND t.deleted = 0
           ORDER BY t.id ASC`,
          [req.params.id],
          (e, r) => (e ? rej(e) : resv(r))
        )
      );

      const { walletBalance: _wb, ...txRest } = transaction;
      let balanceAfter = null;
      if (balRow && balRow.running != null) {
        const walletBalance = Number(transaction.walletBalance) || 0;
        const totalNet = Number(balRow.total_net) || 0;
        balanceAfter = walletBalance - totalNet + Number(balRow.running);
      }
      const info = await resolveExchangeForTransaction(req.params.id);
      const projected = projectRow(txRest, tzEff) || txRest;
      res.json({
        ...projected,
        datetimeUtc: transaction.datetimeUtc,
        amount: toNum(projected.amount),
        fee: toNum(projected.fee),
        balanceAfter: balanceAfter != null ? toNum(balanceAfter) : null,
        children: (projectInstants(children || [], tzEff) || []).map((c) => {
          c.amount = toNum(c.amount);
          if (c.fee != null) c.fee = toNum(c.fee);
          return c;
        }),
        exchangeId: info ? info.exchangeId : null,
        isExchangeMember: !!info,
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
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

      const { description, amount, date, time, categoryName, tz } = req.body;
      const catName = typeof categoryName === 'string' ? categoryName.trim() : categoryName;
      const desc = typeof description === 'string' ? description.trim() : description;
      const tzEff = await effectiveTz(null, req.body);

      // La fecha/hora en edición siempre viajan juntas (el front prellena la
      // hora previa si no cambias). Si viene una, exige ambas completas.
      if ((date != null && date !== '') || (time != null && time !== '')) {
        if (typeof date !== 'string' || date === '') {
          return res.status(400).json({ error: 'La fecha es obligatoria (YYYY-MM-DD)' });
        }
        if (typeof time !== 'string' || time === '') {
          return res.status(400).json({ error: 'La hora es obligatoria (HH:MM)' });
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
        }
        if (!isValidTime(time)) {
          return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
        }
      }

      let newDatetimeUtc = t.datetimeUtc;
      const hasNewDate = date != null && date !== '';
      if (hasNewDate) {
        // Si solo se cambia la fecha, conserva la hora previa proyectada en tzEff.
        const prevWall = projectRow({ datetimeUtc: t.datetimeUtc }, tzEff) || {};
        const newTime = (time != null && time !== '') ? normalizeTimeMinute(time) : (prevWall.time || '00:00');
        newDatetimeUtc = wallClockToUtc(date, newTime, tzEff);
      } else if (time != null && time !== '') {
        if (!isValidTime(time)) {
          return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
        }
        const prevWall = projectRow({ datetimeUtc: t.datetimeUtc }, tzEff) || {};
        newDatetimeUtc = wallClockToUtc(prevWall.date, normalizeTimeMinute(time), tzEff);
      }
      const newWall = projectRow({ datetimeUtc: newDatetimeUtc }, tzEff) || {};

      if (t.parentId != null) {
        const parent = await getTransactionRow(t.parentId);
        if (parent && newDatetimeUtc < parent.datetimeUtc) {
          return res.status(400).json({ error: 'La fecha/hora no puede ser anterior a la de su transacción padre.' });
        }
      }
      const minChild = await getMinChildDate(id);
      if (minChild && minChild.minDateTime != null && newDatetimeUtc > minChild.minDateTime) {
        return res.status(400).json({ error: 'La fecha/hora no puede ser posterior a la de sus transacciones asociadas.' });
      }

      let newAmount = Number(t.amount);
      let amountChanged = false;
      if (amount != null && amount !== '') {
        const parsed = Number(amount);
        if (!Number.isFinite(parsed) || parsed <= 0) {
          return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
        }
        newAmount = toInt(parsed); // body en unidades → entero de escala 4
        amountChanged = newAmount !== Number(t.amount);
      }

      let newCategoryId = t.categoryId;
      if (catName != null && catName !== '' && catName !== t.category) {
        if (t.category === 'fee') {
          return res.status(400).json({ error: 'La categoría de una comisión (fee) no se puede cambiar.' });
        }
        if (isSystemCategoryName(catName)) {
          return res.status(400).json({ error: 'No puedes asignar categorías del sistema (fee, exchange).' });
        }
        const cat = await getOrCreateCategory(catName, t.type);
        newCategoryId = cat.id;
      }

      const newDescription = desc !== undefined ? (desc || '') : t.description;

      await withTransaction(async () => {
        if (amountChanged) {
          const oldEffect = balanceEffect(t.type, t.amount);
          const newEffect = balanceEffect(t.type, newAmount);
          const delta = newEffect - oldEffect;
          await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) + delta, t.walletId]);
        }
        await runDb(
          'UPDATE transactions SET description = ?, amount = ?, datetime_utc = ?, category_id = ? WHERE id = ?',
          [newDescription, newAmount, newDatetimeUtc, newCategoryId, id]
        );
        if (t.category === 'fee' && t.parentId != null) {
          await syncParentFeeSql(t.parentId);
        }
      });

      const updated = await getTransactionRow(id);
      const updatedProj = projectRow(updated, tzEff) || updated;
      updatedProj.amount = toNum(updatedProj.amount);
      if (updatedProj.fee != null) updatedProj.fee = toNum(updatedProj.fee);
      if (updatedProj.walletBalance != null) updatedProj.walletBalance = toNum(updatedProj.walletBalance);
      res.json({ success: true, message: 'Transacción actualizada', transaction: updatedProj });
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
      const { amount, date, time, tz } = req.body;
      const tzEff = await effectiveTz(null, req.body);
      const feeUnits = Number(amount);
      if (!Number.isFinite(feeUnits) || feeUnits <= 0) {
        return res.status(400).json({ error: 'El monto de la comisión debe ser mayor a 0' });
      }
      const feeAmount = toInt(feeUnits); // unidades → entero de escala 4
      if (typeof date !== 'string' || date === '') {
        return res.status(400).json({ error: 'La fecha es obligatoria (YYYY-MM-DD)' });
      }
      if (typeof time !== 'string' || time === '') {
        return res.status(400).json({ error: 'La hora es obligatoria (HH:MM)' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
      }
      if (!isValidTime(time)) {
        return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
      }

      const prevWall = projectRow({ datetimeUtc: t.datetimeUtc }, tzEff) || {};
      const feeDate = date;
      const feeTime = normalizeTimeMinute(time);
      const feeDatetimeUtc = wallClockToUtc(feeDate, feeTime, tzEff);
      if (feeDatetimeUtc < t.datetimeUtc) {
        return res.status(400).json({ error: 'La fecha/hora de la comisión no puede ser anterior a la de su transacción.' });
      }
      const feeCat = await getDb("SELECT id FROM categories WHERE name = 'fee' AND type = 'expense' AND isActive = 1", []);
      if (!feeCat) return res.status(400).json({ error: 'Categoría fee no disponible' });
      if (Number(t.walletBalance) < feeAmount) {
        return res.status(400).json({ error: `Fondos insuficientes. Balance actual: ${toNum(t.walletBalance)} ${t.currency}, necesita ${toNum(feeAmount)}` });
      }
      const ins = await withTransaction(async () => {
        await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) - feeAmount, t.walletId]);
        const inserted = await runDb(
          `INSERT INTO transactions (wallet_id, category_id, type, amount, description, datetime_utc, exchange_rate, converted_amount, fee, parent_transaction_id)
           VALUES (?, ?, 'expense', ?, ?, ?, 10000, ?, 0, ?)`,
          [t.walletId, feeCat.id, feeAmount, `Comisión: ${t.description || t.category}`, feeDatetimeUtc, feeAmount, id]
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
      const { amount, type, categoryName, description, date, time, tz } = req.body;
      const catName = typeof categoryName === 'string' ? categoryName.trim() : categoryName;
      const desc = typeof description === 'string' ? description.trim() : description;
      const tzEff = await effectiveTz(null, req.body);
      const parsedUnits = Number(amount);
      if (!Number.isFinite(parsedUnits) || parsedUnits <= 0) {
        return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
      }
      const parsedAmount = toInt(parsedUnits); // unidades → entero de escala 4
      if (type !== 'income' && type !== 'expense') {
        return res.status(400).json({ error: 'type debe ser income o expense' });
      }
      if (isSystemCategoryName(catName)) {
        return res.status(400).json({ error: 'No puedes usar categorías del sistema (fee, exchange).' });
      }
      if (typeof date !== 'string' || date === '') {
        return res.status(400).json({ error: 'La fecha es obligatoria (YYYY-MM-DD)' });
      }
      if (typeof time !== 'string' || time === '') {
        return res.status(400).json({ error: 'La hora es obligatoria (HH:MM)' });
      }
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
      }
      if (!isValidTime(time)) {
        return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
      }
      const cat = await getOrCreateCategory(catName, type);

      const prevWall = projectRow({ datetimeUtc: t.datetimeUtc }, tzEff) || {};
      const assocDate = date;
      const assocTime = normalizeTimeMinute(time);
      const assocDatetimeUtc = wallClockToUtc(assocDate, assocTime, tzEff);
      if (assocDatetimeUtc < t.datetimeUtc) {
        return res.status(400).json({ error: 'La fecha/hora de la transacción asociada no puede ser anterior a la de su padre.' });
      }
      const effect = balanceEffect(type, parsedAmount);
      if (effect < 0 && Number(t.walletBalance) < parsedAmount) {
        return res.status(400).json({ error: `Fondos insuficientes. Balance actual: ${toNum(t.walletBalance)} ${t.currency}, necesita ${toNum(parsedAmount)}` });
      }
      const ins = await withTransaction(async () => {
        await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) + effect, t.walletId]);
        return runDb(
          `INSERT INTO transactions (wallet_id, category_id, type, amount, description, datetime_utc, exchange_rate, converted_amount, fee, parent_transaction_id)
           VALUES (?, ?, ?, ?, ?, ?, 10000, ?, 0, ?)`,
          [t.walletId, cat.id, type, parsedAmount, desc || '', assocDatetimeUtc, parsedAmount, id]
        );
      });
      res.json({ success: true, message: 'Transacción asociada creada', associateId: ins.lastID });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
};
