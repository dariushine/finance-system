// src/app.js — Construcción de la aplicación Express y ensamblado de routers.
const express = require('express');
const cookieParser = require('cookie-parser');

// Inicializa la conexión SQLite + esquema/migraciones (efecto secundario al requerir).
const { db } = require('./db');

// Autenticación: crea el router /api/auth y el middleware requireAuth.
const { createAuth, authEnabled } = require('./auth');
const auth = createAuth(db);

const registerCategories = require('./routes/categories');
const registerRecurring = require('./routes/recurring-payments');
const registerWallets = require('./routes/wallets');
const registerTransactions = require('./routes/transactions');
const registerExchanges = require('./routes/exchanges');
const registerRates = require('./routes/rates');
const registerStats = require('./routes/stats');
const registerSettings = require('./routes/settings');

const port = process.env.PORT ? Number(process.env.PORT) : 3002;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  // Health se deja público (no expone datos).
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      service: 'Finance API v4',
      version: '1.0.0',
      features: ['wallets', 'transactions', 'exchanges', 'balance', 'timezone-config'],
      note: 'Exchanges con transacciones separadas (débito/crédito)',
    });
  });

  // Rutas públicas de auth: login/refresh/logout/session.
  app.use('/api/auth', auth.router);

  // Protege el resto del /api cuando la autenticación está habilitada.
  app.use('/api', auth.requireAuth);

  if (authEnabled()) {
    console.log('🔐 Autenticación habilitada — el /api está protegido');
  } else {
    console.log('⚠️  Autenticación DISABLED: define AUTH_USERNAME y AUTH_PASSWORD para proteger la API.');
  }

  registerCategories(app);
  registerRecurring(app);
  registerWallets(app);
  registerTransactions(app);
  registerExchanges(app);
  registerRates(app);
  registerSettings(app);
  registerStats(app);

  return app;
}

function createServer() {
  return buildApp();
}

// Instancia única usada por el punto de entrada (exchange-server.js shim).
const app = buildApp();

module.exports = { createServer, buildApp, app, port, db };