// src/routes/wallets.js — Endpoints HTTP de billeteras (delegan en services).
const wallets = require('../services/wallets');
const { getUserTimeZone } = require('../services/settings');
const { isValidTimeZone } = require('../services/timeZoneMap');
const { decodeMoney, decodeMoneyList, toInt, toNum } = require('../services/money');

const err = (res, e) => res.status(e.status || 500).json({ error: e.message });
const toNumSafe = (v) => (v == null ? v : toNum(v));

// Campos de dinero que se devuelven en unidades (int→unidades) al front.
const WALLET_MONEY = ['balance'];

module.exports = function registerWalletRoutes(app) {
  app.get('/api/wallets', async (req, res) => {
    try {
      const rows = await wallets.listWallets();
      res.json(decodeMoneyList(rows, WALLET_MONEY));
    } catch (e) { err(res, e); }
  });

  // Listar billeteras eliminadas (soft-delete)
  app.get('/api/wallets/deleted', async (req, res) => {
    try {
      const rows = await wallets.listWallets({ deleted: true });
      res.json(decodeMoneyList(rows, WALLET_MONEY));
    } catch (e) { err(res, e); }
  });

  // Obtener una billetera por id (solo activas)
  app.get('/api/wallets/:id', async (req, res) => {
    try {
      const wallet = await wallets.getWalletById(Number(req.params.id), 1);
      if (!wallet) return res.status(404).json({ error: 'Billetera no encontrada' });
      res.json(decodeMoney(wallet, WALLET_MONEY));
    } catch (e) { err(res, e); }
  });

  // Crear una billetera
  app.post('/api/wallets', async (req, res) => {
    try {
      const body = { ...(req.body || {}) };
      if (body.balance != null) body.balance = toInt(body.balance); // unidades → entero
      const row = await wallets.createWallet(body);
      res.status(201).json(decodeMoney(row, WALLET_MONEY));
    } catch (e) { err(res, e); }
  });

  // Actualizar una billetera (solo metadata: name/alias/description/icon/color)
  app.put('/api/wallets/:id', async (req, res) => {
    try {
      const row = await wallets.updateWalletMeta(Number(req.params.id), req.body || {});
      res.json(decodeMoney(row, WALLET_MONEY));
    } catch (e) { err(res, e); }
  });

  // Soft-delete
  app.delete('/api/wallets/:id', async (req, res) => {
    try {
      const result = await wallets.softDeleteWallet(Number(req.params.id));
      res.json(result);
    } catch (e) { err(res, e); }
  });

  // Reactivar una billetera eliminada
  app.put('/api/wallets/:id/reactivate', async (req, res) => {
    try {
      const row = await wallets.reactivateWallet(Number(req.params.id));
      res.json(decodeMoney(row, WALLET_MONEY));
    } catch (e) { err(res, e); }
  });

  // Reporte de una billetera
  app.get('/api/wallets/:id/report', async (req, res) => {
    try {
      const q = req.query || {};
      let tz = q.tz;
      if (!tz || !isValidTimeZone(tz)) tz = await getUserTimeZone();
      const report = await wallets.getWalletReport(Number(req.params.id), { ...q, tz });
      // Convertir montos a unidades (int→unidades) en balance, summary y transacciones.
      report.wallet = decodeMoney(report.wallet, WALLET_MONEY);
      report.summary = {
        ...report.summary,
        income: toNumSafe(report.summary.income),
        expense: toNumSafe(report.summary.expense),
        net: toNumSafe(report.summary.net),
      };
      (report.transactions || []).forEach((t) => { t.amount = toNumSafe(t.amount); if (t.fee != null) t.fee = toNumSafe(t.fee); });
      res.json(report);
    } catch (e) { err(res, e); }
  });
};
