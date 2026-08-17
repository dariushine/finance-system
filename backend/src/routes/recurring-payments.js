// src/routes/recurring-payments.js — Endpoints HTTP de pagos frecuentes.
const recurring = require('../services/recurring-payments');

const handle = (res, fn) =>
  fn().then((data) => res.json(data)).catch((err) =>
    res.status(err.status || 400).json({ error: err.message }));

module.exports = function registerRecurringRoutes(app) {
  app.get('/api/recurring-payments', (req, res) =>
    handle(res, () => recurring.listRecurringPayments()));

  app.get('/api/recurring-payments/:id', (req, res) =>
    handle(res, () => recurring.getRecurringPayment(Number(req.params.id))));

  app.post('/api/recurring-payments', (req, res) => {
    recurring.createRecurringPayment(req.body || {})
      .then((row) => res.status(201).json(row))
      .catch((err) => res.status(400).json({ error: err.message }));
  });

  app.put('/api/recurring-payments/:id', (req, res) =>
    handle(res, () => recurring.updateRecurringPayment(Number(req.params.id), req.body || {})));

  app.delete('/api/recurring-payments/:id', (req, res) =>
    handle(res, () => recurring.softDeleteRecurringPayment(Number(req.params.id))));

  // Ejecutar un pago frecuente: crea una transacción real desde la plantilla.
  app.post('/api/recurring-payments/:id/execute', (req, res) =>
    handle(res, () => recurring.executeRecurringPayment(Number(req.params.id), req.body || {})));
};