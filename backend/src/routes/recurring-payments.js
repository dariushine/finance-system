// src/routes/recurring-payments.js — Endpoints HTTP de pagos frecuentes.
const recurring = require('../services/recurring-payments');
const { decodeMoney, decodeMoneyList, toInt } = require('../services/money');

// Campos de dinero de un pago frecuente (int→unidades al front).
const RP_MONEY = ['amount', 'fee'];

const handle = (res, fn) =>
  fn().then((data) => res.json(data)).catch((err) =>
    res.status(err.status || 400).json({ error: err.message }));

module.exports = function registerRecurringRoutes(app) {
  app.get('/api/recurring-payments', (req, res) =>
    handle(res, async () => decodeMoneyList(await recurring.listRecurringPayments(), RP_MONEY)));

  app.get('/api/recurring-payments/:id', (req, res) =>
    handle(res, async () => decodeMoney(await recurring.getRecurringPayment(Number(req.params.id)), RP_MONEY)));

  app.post('/api/recurring-payments', (req, res) => {
    recurring.createRecurringPayment(convertBody(req.body || {}))
      .then((row) => res.status(201).json(decodeMoney(row, RP_MONEY)))
      .catch((err) => res.status(400).json({ error: err.message }));
  });

  app.put('/api/recurring-payments/:id', (req, res) =>
    handle(res, async () => decodeMoney(await recurring.updateRecurringPayment(Number(req.params.id), convertBody(req.body || {})), RP_MONEY)));

  app.delete('/api/recurring-payments/:id', (req, res) =>
    handle(res, () => recurring.softDeleteRecurringPayment(Number(req.params.id))));

  // Ejecutar un pago frecuente: crea una transacción real desde la plantilla.
  app.post('/api/recurring-payments/:id/execute', (req, res) =>
    handle(res, async () => {
      const result = await recurring.executeRecurringPayment(Number(req.params.id), convertBody(req.body || {}));
      // La transacción creada vuelve en unidades (int→unidades).
      if (result && result.transaction) {
        result.transaction.amount = toNumSafe(result.transaction.amount);
        result.transaction.newBalance = toNumSafe(result.transaction.newBalance);
        result.transaction.fee = toNumSafe(result.transaction.fee);
      }
      return result;
    }));
};

// Convierte los campos de dinero del body (unidades→enteros) para el service.
function convertBody(body) {
  const out = { ...body };
  if (out.amount != null) out.amount = toInt(out.amount);
  if (out.fee != null) out.fee = toInt(out.fee);
  if (out.overrideAmount != null) out.overrideAmount = toInt(out.overrideAmount);
  if (out.overrideFee != null) out.overrideFee = toInt(out.overrideFee);
  return out;
}

function toNumSafe(v) { return v == null ? v : require('../services/money').toNum(v); }