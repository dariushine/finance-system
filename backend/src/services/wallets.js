// src/services/wallets.js — Lógica de negocio de billeteras.
const { db } = require('../db');

function listWallets({ deleted = false } = {}) {
  const active = deleted ? 0 : 1;
  return new Promise((resolve, reject) => {
    const order = deleted ? 'ORDER BY name' : 'ORDER BY currency, name';
    db.all(`SELECT * FROM wallets WHERE isActive = ? ${order}`, [active], (err, rows) => {
      if (err) return reject(err);
      resolve(rows || []);
    });
  });
}

// Obtiene una billetera por id. active=1 solo activas, active=0 solo eliminadas.
function getWalletById(id, active) {
  return new Promise((resolve, reject) => {
    const where = active === undefined ? 'id = ?' : 'id = ? AND isActive = ?';
    const params = active === undefined ? [id] : [id, active];
    db.get(`SELECT * FROM wallets WHERE ${where}`, params, (err, row) => {
      if (err) return reject(err);
      resolve(row || null);
    });
  });
}

// Crea una billetera. Valida campos requeridos; balance controlado para evitar
// valores inválidos. El balance inicial lo pone el usuario al crearla.
function createWallet(data) {
  const { name, alias, type, currency, balance, description, icon, color, excludeFromTotal, hideInDashboard } = data;
  if (!name || !type || !currency) {
    return Promise.reject(new Error('Faltan campos requeridos: name, type, currency'));
  }
  const excludeTotal = (excludeFromTotal === true || excludeFromTotal === 1) ? 1 : 0;
  const hideDash = (hideInDashboard === true || hideInDashboard === 1) ? 1 : 0;
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO wallets (name, alias, type, currency, balance, description, icon, color, isActive, excludeFromTotal, hideInDashboard)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      [name, alias || null, type, currency, balance || 0, description || null, icon || null, color || null, excludeTotal, hideDash],
      function (err) {
        if (err) return reject(err);
        db.get('SELECT * FROM wallets WHERE id = ?', [this.lastID], (e, row) => {
          if (e) return reject(e);
          resolve(row);
        });
      }
    );
  });
}

// Actualiza SOLO metadata (name/alias/description/icon/color/toggles). Nunca balance,
// type ni currency: son fijos tras la creación (mutan solo vía transacciones).
function updateWalletMeta(id, fields) {
  const { name, alias, description, icon, color, excludeFromTotal, hideInDashboard } = fields;
  return new Promise((resolve, reject) => {
    getWalletById(id, 1).then((wallet) => {
      if (!wallet) return reject(Object.assign(new Error('Billetera no encontrada'), { status: 404 }));
      const newName = name !== undefined ? name : wallet.name;
      const newAlias = alias !== undefined ? alias : wallet.alias;
      const newDescription = description !== undefined ? description : wallet.description;
      const newIcon = icon !== undefined ? icon : wallet.icon;
      const newColor = color !== undefined ? color : wallet.color;
      // Los flags sólo cambian si vienen en el body (si no, conservan su valor actual)
      const newExcludeTotal = excludeFromTotal !== undefined
        ? (excludeFromTotal === true || excludeFromTotal === 1 ? 1 : 0)
        : wallet.excludeFromTotal;
      const newHideDash = hideInDashboard !== undefined
        ? (hideInDashboard === true || hideInDashboard === 1 ? 1 : 0)
        : wallet.hideInDashboard;
      db.run(
        `UPDATE wallets SET name = ?, alias = ?, description = ?, icon = ?, color = ?, excludeFromTotal = ?, hideInDashboard = ? WHERE id = ?`,
        [newName, newAlias, newDescription, newIcon, newColor, newExcludeTotal, newHideDash, id],
        (updErr) => {
          if (updErr) return reject(updErr);
          getWalletById(id).then(resolve).catch(reject);
        }
      );
    }).catch(reject);
  });
}

// Soft-delete: marca isActive = 0 (no borra, conserva el historial).
function softDeleteWallet(id) {
  return new Promise((resolve, reject) => {
    getWalletById(id, 1).then((wallet) => {
      if (!wallet) return reject(Object.assign(new Error('Billetera no encontrada'), { status: 404 }));
      db.run('UPDATE wallets SET isActive = 0 WHERE id = ?', [id], (e) => {
        if (e) return reject(e);
        resolve({ success: true, message: 'Billetera desactivada (no eliminada definitivamente)' });
      });
    }).catch(reject);
  });
}

// Reactivar una billetera eliminada.
function reactivateWallet(id) {
  return new Promise((resolve, reject) => {
    getWalletById(id, 0).then((wallet) => {
      if (!wallet) return reject(Object.assign(new Error('Billetera no encontrada o ya activa'), { status: 404 }));
      db.run('UPDATE wallets SET isActive = 1 WHERE id = ?', [id], (e) => {
        if (e) return reject(e);
        getWalletById(id).then(resolve).catch(reject);
      });
    }).catch(reject);
  });
}

// Resuelve el rango de fechas por defecto según el periodo.
// ?from & ?to: si no vienen, se derivan del periodo (day|week|month|3m|year|all).
function resolveDateRange(from, to, period) {
  if (from && to) return { from, to, period: period || 'custom' };
  const now = new Date();
  const pad2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  const toDate = iso(now);
  let fromDate;
  if (period === 'day') fromDate = toDate;
  else if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); fromDate = iso(d); }
  else if (period === 'month') { const d = new Date(now); d.setDate(1); fromDate = iso(d); }
  else if (period === '3m') { const d = new Date(now); d.setMonth(d.getMonth() - 3); fromDate = iso(d); }
  else if (period === 'year') { const d = new Date(now); d.setMonth(d.getMonth() - 12); fromDate = iso(d); }
  else fromDate = '1970-01-01';
  return { from: fromDate, to: toDate, period: period || 'all' };
}

// Reporte de una billetera: balance + ingresos/egresos + transacciones por rango.
function getWalletReport(id, { from, to, period } = {}) {
  return new Promise((resolve, reject) => {
    getWalletById(id).then((wallet) => {
      if (!wallet) return reject(Object.assign(new Error('Billetera no encontrada'), { status: 404 }));
      const range = resolveDateRange(from, to, period);
      db.all(
        `SELECT
           t.id,
           t.type,
           t.amount,
           t.description,
           t.date,
           t.fee,
           c.name AS category,
           t.created_at AS createdAt
         FROM transactions t
         JOIN categories c ON c.id = t.category_id
         WHERE t.wallet_id = ? AND t.deleted = 0 AND t.date >= ? AND t.date <= ?
         ORDER BY t.date DESC, t.time DESC, t.created_at DESC, t.id DESC`,
        [id, range.from, range.to],
        (err, rows) => {
          if (err) return reject(err);
          const transactions = rows || [];
          let income = 0;
          let expense = 0;
          transactions.forEach((t) => {
            if (t.type === 'income') income += Number(t.amount);
            else if (t.type === 'expense') expense += Number(t.amount);
          });
          resolve({
            wallet,
            range,
            summary: {
              income: parseFloat(income.toFixed(2)),
              expense: parseFloat(expense.toFixed(2)),
              net: parseFloat((income - expense).toFixed(2)),
              transactionCount: transactions.length,
            },
            transactions,
          });
        }
      );
    }).catch(reject);
  });
}

module.exports = {
  listWallets,
  getWalletById,
  createWallet,
  updateWalletMeta,
  softDeleteWallet,
  reactivateWallet,
  getWalletReport,
  resolveDateRange,
};
