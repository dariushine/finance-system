// src/routes/wallets.js — Endpoints HTTP de billeteras (delegan en services).
const wallets = require('../services/wallets');

const err = (res, e) => res.status(e.status || 500).json({ error: e.message });

module.exports = function registerWalletRoutes(app) {
  app.get('/api/wallets', async (req, res) => {
    try {
      const rows = await wallets.listWallets();
      res.json(rows);
    } catch (e) { err(res, e); }
  });

  // Listar billeteras eliminadas (soft-delete)
  app.get('/api/wallets/deleted', async (req, res) => {
    try {
      const rows = await wallets.listWallets({ deleted: true });
      res.json(rows);
    } catch (e) { err(res, e); }
  });

  // Obtener una billetera por id (solo activas)
  app.get('/api/wallets/:id', async (req, res) => {
    try {
      const wallet = await wallets.getWalletById(Number(req.params.id), 1);
      if (!wallet) return res.status(404).json({ error: 'Billetera no encontrada' });
      res.json(wallet);
    } catch (e) { err(res, e); }
  });

  // Crear una billetera
  app.post('/api/wallets', async (req, res) => {
    try {
      const row = await wallets.createWallet(req.body || {});
      res.status(201).json(row);
    } catch (e) { err(res, e); }
  });

  // Actualizar una billetera (solo metadata: name/alias/description/icon/color)
  app.put('/api/wallets/:id', async (req, res) => {
    try {
      const row = await wallets.updateWalletMeta(Number(req.params.id), req.body || {});
      res.json(row);
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
      res.json(row);
    } catch (e) { err(res, e); }
  });

  // Reporte de una billetera
  app.get('/api/wallets/:id/report', async (req, res) => {
    try {
      const report = await wallets.getWalletReport(Number(req.params.id), req.query || {});
      res.json(report);
    } catch (e) { err(res, e); }
  });
};
