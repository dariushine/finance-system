// src/routes/rates.js — Balance global + tasas + CRUD de daily_rates.
const { db } = require('../db');
const {
  getRateForDate, getTodayRate, upsertRate,
} = require('../services/rates');
const { toRateInt, toRateNum } = require('../services/money');

module.exports = function registerRateRoutes(app) {
  // Tasa vigente (bcv por defecto) para una fecha; usada para convertir VES a USD.
  app.get('/api/rates/effective', async (req, res) => {
    const type = req.query.type === 'paralelo' ? 'paralelo' : 'bcv';
    const date = req.query.date;
    const rate = await getRateForDate(date || new Date().toISOString().split('T')[0], type);
    res.json({ date: date || new Date().toISOString().split('T')[0], rate: rate != null ? toRateNum(rate) : null, type });
  });

  // === CRUD de tasas diarias (daily_rates) ===
  app.get('/api/daily-rates', (req, res) => {
    db.all('SELECT * FROM daily_rates ORDER BY date DESC', (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      // bcv/paralelo en enteros → unidades humanas.
      (rows || []).forEach((r) => { r.bcv = toRateNum(r.bcv); r.paralelo = toRateNum(r.paralelo); });
      res.json({ data: rows || [] });
    });
  });

  app.get('/api/daily-rates/today', async (req, res) => {
    const result = await getTodayRate();
    if (result.error) return res.status(503).json({ error: result.error });
    res.json({ data: result });
  });

  app.post('/api/daily-rates', async (req, res) => {
    try {
      const { date, bcv, paralelo } = req.body;
      if (!date || bcv == null || paralelo == null) {
        return res.status(400).json({ error: 'Faltan campos: date, bcv, paralelo' });
      }
      await upsertRate(date, Number(bcv), Number(paralelo), 'manual');
      res.json({ success: true, message: `Tasa creada para ${date}` });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.put('/api/daily-rates/:id', (req, res) => {
    const { bcv, paralelo } = req.body;
    if (bcv == null || paralelo == null) {
      return res.status(400).json({ error: 'Faltan campos: bcv, paralelo' });
    }
    db.run('UPDATE daily_rates SET bcv = ?, paralelo = ? WHERE id = ?',
      [toRateInt(bcv), toRateInt(paralelo), req.params.id],
      function (err) {
        if (err) return res.status(500).json({ error: err.message });
        if (this.changes === 0) return res.status(404).json({ error: 'Tasa no encontrada' });
        res.json({ success: true, message: 'Tasa actualizada' });
      }
    );
  });

  app.delete('/api/daily-rates/:id', (req, res) => {
    db.run('DELETE FROM daily_rates WHERE id = ?', [req.params.id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Tasa no encontrada' });
      res.json({ success: true, message: 'Tasa eliminada' });
    });
  });
};