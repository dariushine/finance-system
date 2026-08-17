// exchange-server.js — Punto de entrada (shim de compatibilidad).
//
// La lógica del backend ahora vive modularizada en src/:
//   - src/db.js                 : conexión SQLite + esquema + migraciones
//   - src/services/             : lógica de negocio por dominio
//   - src/routes/               : routers HTTP por recurso
//   - src/app.js                : construcción de la app Express
//
// Este archivo se mantiene únicamente para no romper las formas existentes de
// arrancar el servidor (`npm start`, `start-backend.sh`) ni los tests que
// importan `createServer` (supertest).
const { createServer, app, port, db } = require('./src/app');

module.exports = { createServer };

// Iniciar el servidor solo si se ejecuta directamente (no al importarlo en tests).
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Servidor ejecutándose en: http://localhost:${port}`);
    console.log('📊 Health: GET /api/health');
    console.log('💾 Billeteras: GET /api/wallets');
    console.log('💸 Transacciones: POST /api/transactions');
    console.log('💱 Exchanges: POST /api/exchanges');
    console.log('💰 Balance: GET /api/balance');
  });

  process.on('SIGINT', () => {
    console.log('\n👋 Cerrando servidor...');
    db.close();
    process.exit(0);
  });
}
