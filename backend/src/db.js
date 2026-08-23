// src/db.js — Conexión SQLite, esquema y migraciones.
//
// MODELO DE FECHA (decisión de Freddy, 18 ago 2026):
//   - Cada transacción guarda UN SOLO datetime absoluto: `datetime_utc`
//     (ISO 8601 con Z, instante UTC). Nada de date + time por separado,
//     ni date/time + instant_utc duplicados (eso fue el error previo).
//   - Al leer, se deriva la fecha/hora que ve el usuario proyectando ese único
//     instante a la zona horaria configurada.
//   - La zona horaria del usuario (user_timezone) vive en una tabla propia
//     `settings`. El servidor SIEMPRE corre en UTC (estándar): la BD guarda
//     instantes UTC y el front proyecta a la zona del usuario.
// Migración 2026-08-23: sqlite3 → better-sqlite3.
// Se reemplaza la librería asíncrona (callbacks) por better-sqlite3 (síncrona,
// prepare() + db.transaction() nativa). Para no reescribir los ~118 call-sites
// del backend, `db` expone un wrapper SÍNCRONO con la misma API de sqlite3
// (get/run/all/exec/serialize, con callback opcional) delegando todo el SQL a
// better-sqlite3. Al ser síncrono se elimina la clase de bugs de transacciones
// anidadas/pisadas sobre la conexión única.
const Database = require('better-sqlite3');
const path = require('path');

const seedDemoData = process.env.SEED_DEMO_DATA === 'true';

// El sistema lee SIEMPRE el archivo data/finance.db — nombre estable del
// sistema, NO renombrar (preferencia de Freddy 19 ago 2026). Si no existe,
// CREATE TABLE IF NOT EXISTS de abajo la genera limpia desde 0 con el esquema
// definido aquí.
const dbPath = path.join(__dirname, '..', 'data/finance.db');
const conn = new Database(dbPath);
conn.pragma('journal_mode = WAL;');

// Wrapper SÍNCRONO de compatibilidad sobre better-sqlite3.
// Soporta la firma de sqlite3 con callback opcional: db.get/run/all(sql, params, cb).
// Si no se pasa cb, devuelve el resultado directamente (uso tipo better-sqlite3).
// Es síncrono, alineado con better-sqlite3, y elimina la clase de bugs de
// transacciones (el SQL corre de forma atómica y sin carreras de conexión).
function runSync(sql, params) {
  // better-sqlite3 NO acepta `undefined` como parámetro (solo null). Lo
  // normalizamos a null para compat con el código que venía de sqlite3.
  const args = (params || []).map((v) => (v === undefined ? null : v));
  const stmt = conn.prepare(sql);
  const info = stmt.run(...args);
  return { lastID: Number(info.lastInsertRowid), changes: Number(info.changes) };
}

// El objeto `db` expuesto al resto del backend: mismas firmas de sqlite3
// (get/run/all/exec/serialize) + prepare/transaction de better-sqlite3.
// NOTA: para maximizar compat con el código existente (que usaba callbacks)
// y con el esquema (que llama en serie dentro de serialize), todo es síncrono:
// el callback se invoca en el acto si se pasa, y si no se devuelve el valor.
const db = {
  get(sql, params, cb) {
    // Soporta get(sql), get(sql, params), get(sql, params, cb), get(sql, cb).
    if (typeof params === 'function') { cb = params; params = undefined; }
    let row;
    const args = (Array.isArray(params) ? params : (params ? [params] : [])).map((v) => (v === undefined ? null : v));
    try { row = conn.prepare(sql).get(...args); }
    catch (e) { if (cb) { cb(e); return undefined; } throw e; }
    if (cb) { cb(null, row); return undefined; }
    return row;
  },
  run(sql, params, cb) {
    // Soporta las firmas: run(sql), run(sql, params), run(sql, params, cb), run(sql, cb).
    if (typeof params === 'function') { cb = params; params = undefined; }
    const args = Array.isArray(params) ? params : (params ? [params] : []);
    let info;
    try { info = runSync(sql, args); }
    catch (e) { if (cb) { cb(e); return undefined; } throw e; }
    if (cb) {
      // El código existente usa `this.lastID`/`this.changes` dentro del callback
      // (comportamiento de sqlite3). Le inyectamos un contexto con esos campos.
      const self = { lastID: info.lastID, changes: info.changes };
      cb.call(self, null, info);
      return undefined;
    }
    return info;
  },
  all(sql, params, cb) {
    // Soporta all(sql), all(sql, params), all(sql, params, cb), all(sql, cb).
    if (typeof params === 'function') { cb = params; params = undefined; }
    let rows;
    const args = (Array.isArray(params) ? params : (params ? [params] : [])).map((v) => (v === undefined ? null : v));
    try { rows = conn.prepare(sql).all(...args); }
    catch (e) {
      // Compat con sqlite3: PRAGMA table_info sobre tabla inexistente devolvía []
      // (en better-sqlite3 lanza 'no such table'). El esquema lo usa para saber
      // qué columnas migrar; devolvemos [] para no romper el arranque en BD nueva.
      if (/no such table/.test(String(e.message)) && /PRAGMA table_info/i.test(sql)) {
        rows = [];
      } else {
        if (cb) { cb(e); return undefined; }
        throw e;
      }
    }
    if (cb) { cb(null, rows); return undefined; }
    return rows;
  },
  exec(sql, cb) {
    try { conn.exec(sql); }
    catch (e) { if (cb) { cb(e); return undefined; } throw e; }
    if (cb) { cb(null); return undefined; }
    return undefined;
  },
  // serialize(fn): ejecuta fn() de inmediato (ya somos síncronos y en orden).
  serialize(fn) { fn(); },
  // prepare() directo de better-sqlite3 para quien lo necesite.
  prepare(sql) { return conn.prepare(sql); },
  // transaction(fn): nativa de better-sqlite3 (atómica; lanza y hace rollback).
  transaction(fn) { return conn.transaction(fn); },
  _connection: conn,
  close(cb) { conn.close(); cb && cb(); return undefined; },
};

// ALMACENAMIENTO DE DINERO (decisión Freddy, 19 ago 2026):
//   - MONTOS (balance, amount, fee, ...): INTEGER ×100 (centavos). $1.50 → 150.
//   - TASAS (rate, bcv/paralelo): INTEGER ×10000. 634.95 → 6349500.
// La API/front trabajan en unidades; las rutas convierten en el límite (money.js).

// Crear tablas
db.serialize(() => {
  // Billeteras
  db.run(`CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    alias TEXT,
    type TEXT NOT NULL,
    currency TEXT NOT NULL,
    balance INTEGER DEFAULT 0,
    description TEXT,
    icon TEXT,
    color TEXT,
    isActive BOOLEAN DEFAULT 1,
    excludeFromTotal BOOLEAN DEFAULT 0,
    hideInDashboard BOOLEAN DEFAULT 0,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Columnas opcionales para DBs creadas por versiones previas
  db.all(`PRAGMA table_info(wallets)`, (err, cols) => {
    if (err) return;
    const names = (cols || []).map((c) => c.name);
    [
      ['alias', 'TEXT'],
      ['icon', 'TEXT'],
      ['color', 'TEXT'],
      ['excludeFromTotal', 'BOOLEAN DEFAULT 0'],
      ['hideInDashboard', 'BOOLEAN DEFAULT 0'],
    ].forEach(([col, ddl]) => {
      if (!names.includes(col)) db.run(`ALTER TABLE wallets ADD COLUMN ${col} ${ddl}`);
    });
  });

  // Categorías
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    isActive BOOLEAN DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Transacciones — UN solo datetime absoluto (UTC). No date ni time.
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    description TEXT,
    datetime_utc TEXT NOT NULL,
    fee INTEGER DEFAULT 0,
    parent_transaction_id INTEGER,
    deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (parent_transaction_id) REFERENCES transactions(id)
  )`);

  db.all(`PRAGMA table_info(transactions)`, (err, cols) => {
    if (err) return;
    const names = (cols || []).map((c) => c.name);
    if (!names.includes('fee')) db.run(`ALTER TABLE transactions ADD COLUMN fee INTEGER DEFAULT 0`);
    if (!names.includes('parent_transaction_id')) db.run(`ALTER TABLE transactions ADD COLUMN parent_transaction_id INTEGER`);
    if (!names.includes('deleted')) db.run(`ALTER TABLE transactions ADD COLUMN deleted INTEGER DEFAULT 0`);
    if (!names.includes('datetime_utc')) {
      // Solo seguridad: esta DB nueva ya nace con datetime_utc. Si un esquema
      // viejo (date/time) llega a aparecer, no lo migramos en caliente; el
      // usuario pidió empezar de cero con DB nueva.
      db.run(`ALTER TABLE transactions ADD COLUMN datetime_utc TEXT`, (addErr) => {
        if (addErr) console.log('⚠️ datetime_utc:', addErr.message);
      });
    }
  });

  // Migración: quitar columnas legacy exchange_rate y converted_amount de
  // transactions (no se usan; siempre placeholder 10000/amount). SQLite >= 3.35
  // soporta DROP COLUMN; reconstruimos la tabla para descartarlas de verdad.
  db.all(`PRAGMA table_info(transactions)`, (err2, cols2) => {
    if (err2) return;
    const names2 = (cols2 || []).map((c) => c.name);
    const hasLegacy = names2.includes('exchange_rate') || names2.includes('converted_amount');
    if (!hasLegacy) return;
    console.log('🗑️  Migración: quitando exchange_rate/converted_amount de transactions');
    db.serialize(() => {
      db.run(`DROP TABLE IF EXISTS transactions_old_migration`);
      db.run(`
        CREATE TABLE transactions_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          wallet_id INTEGER NOT NULL,
          category_id INTEGER NOT NULL,
          type TEXT NOT NULL,
          amount INTEGER NOT NULL,
          description TEXT,
          datetime_utc TEXT NOT NULL,
          fee INTEGER DEFAULT 0,
          parent_transaction_id INTEGER,
          deleted INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (wallet_id) REFERENCES wallets(id),
          FOREIGN KEY (category_id) REFERENCES categories(id),
          FOREIGN KEY (parent_transaction_id) REFERENCES transactions(id)
        )`);
      db.run(`
        INSERT INTO transactions_new (id, wallet_id, category_id, type, amount, description, datetime_utc, fee, parent_transaction_id, deleted, created_at)
        SELECT id, wallet_id, category_id, type, amount, description, datetime_utc, fee, parent_transaction_id, deleted, created_at
        FROM transactions`);
      db.run(`DROP TABLE transactions`);
      db.run(`ALTER TABLE transactions_new RENAME TO transactions`);
      // Re-asegurar columnas opcionales por si el schema nuevo es de una versión anterior.
      db.all(`PRAGMA table_info(transactions)`, (e3, c3) => {
        const n3 = (c3 || []).map((c) => c.name);
        if (!n3.includes('fee')) db.run(`ALTER TABLE transactions ADD COLUMN fee INTEGER DEFAULT 0`);
        if (!n3.includes('parent_transaction_id')) db.run(`ALTER TABLE transactions ADD COLUMN parent_transaction_id INTEGER`);
        if (!n3.includes('deleted')) db.run(`ALTER TABLE transactions ADD COLUMN deleted INTEGER DEFAULT 0`);
      });
    });
  });

  // Intercambios
  db.run(`CREATE TABLE IF NOT EXISTS exchanges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debit_transaction_id INTEGER NOT NULL,
    credit_transaction_id INTEGER NOT NULL,
    from_wallet_id INTEGER NOT NULL,
    to_wallet_id INTEGER NOT NULL,
    from_amount INTEGER NOT NULL,
    to_amount INTEGER NOT NULL,
    rate INTEGER NOT NULL,
    fee INTEGER DEFAULT 0,
    credit_fee INTEGER DEFAULT 0,
    description TEXT,
    deleted INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debit_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (credit_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (from_wallet_id) REFERENCES wallets(id),
    FOREIGN KEY (to_wallet_id) REFERENCES wallets(id)
  )`);

  // Migración: columna credit_fee (comisión del crédito) para DBs previas.
  // No hace falta backfill: como las transacciones de exchange no admiten
  // comisiones/operaciones asociadas y antes no existía credit_fee, no puede
  // haber datos viejos con comisión de crédito (siempre sería 0). El valor se
  // mantiene en runtime vía syncParentFeeSql al crear/editar exchanges.
  db.all(`PRAGMA table_info(exchanges)`, (err, cols) => {
    if (err) return;
    const names = (cols || []).map((c) => c.name);
    if (!names.includes('credit_fee')) {
      db.run(`ALTER TABLE exchanges ADD COLUMN credit_fee INTEGER DEFAULT 0`);
    }
  });

  // Tasas diarias
  db.run(`CREATE TABLE IF NOT EXISTS daily_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    bcv INTEGER NOT NULL,
    paralelo INTEGER NOT NULL,
    source TEXT DEFAULT 'dolarapi',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Pagos frecuentes
  db.run(`CREATE TABLE IF NOT EXISTS recurring_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    amount INTEGER NOT NULL,
    fee INTEGER DEFAULT 0,
    currency TEXT NOT NULL,
    type TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    wallet_id INTEGER,
    isActive BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (wallet_id) REFERENCES wallets(id)
  )`);

  // ============ SETTINGS (tabla nueva, key-value) ============
  // Guarda la zona horaria del usuario (user_timezone). El servidor es SIEMPRE
  // UTC (no es configurable): la BD guarda instantes UTC y el front proyecta.
  db.run(`CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  // Default razonable: usuario en Caracas.
  db.run(`INSERT OR IGNORE INTO settings (key, value) VALUES ('user_timezone', 'America/Caracas')`);

  // ============ REFRESH TOKENS (sesiones) ============
  // La tabla la crea createTokenStore en auth.js; aquí la aseguramos (IF NOT
  // EXISTS) para que el arranque sea robusto también en BD nueva, y luego
  // añadimos las columnas de identificación de sesión para DBs previas.
  db.run(`CREATE TABLE IF NOT EXISTS refresh_tokens (
    jti TEXT PRIMARY KEY,
    token_hash TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    user_agent TEXT,
    ip TEXT,
    device_name TEXT,
    last_used_at INTEGER
  )`);
  db.all(`PRAGMA table_info(refresh_tokens)`, (err, cols) => {
    if (err) return;
    const names = (cols || []).map((c) => c.name);
    if (!names.includes('user_agent')) db.run(`ALTER TABLE refresh_tokens ADD COLUMN user_agent TEXT`);
    if (!names.includes('ip')) db.run(`ALTER TABLE refresh_tokens ADD COLUMN ip TEXT`);
    if (!names.includes('device_name')) db.run(`ALTER TABLE refresh_tokens ADD COLUMN device_name TEXT`);
    if (!names.includes('last_used_at')) db.run(`ALTER TABLE refresh_tokens ADD COLUMN last_used_at INTEGER`);
  });

  // ============ API TOKENS (acceso programático) ============
  // Tokens de larga duración (o sin expiración) para operar la API fuera de un
  // navegador (scripts, skills, etc.). Se guardan HASHED (SHA-256); el valor
  // plano solo se muestra una vez al crearlo.
  db.run(`CREATE TABLE IF NOT EXISTS api_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at INTEGER,
    created_at INTEGER NOT NULL,
    last_used_at INTEGER,
    is_active INTEGER DEFAULT 1
  )`);

  // Categorías de sistema (siempre presentes)
  const systemCategories = [
    ['fee', 'expense', '#e67e22'],
    ['exchange_out', 'expense', '#9c27b0'],
    ['exchange_in', 'income', '#673ab7'],
  ];
  systemCategories.forEach(([name, type, color]) => {
    db.get('SELECT id FROM categories WHERE name = ? AND type = ?', [name, type], (err, row) => {
      if (!err && !row) {
        db.run('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)', [name, type, color], (e) => {
          if (!e) console.log(`✅ Categoría de sistema '${name}' agregada`);
        });
      }
    });
  });

  // Seed de datos de demostración (opcional)
  if (seedDemoData) {
    db.get('SELECT COUNT(*) as count FROM wallets', (err, result) => {
      if (!err && result && result.count === 0) {
        const wallets = [
          ['Cuenta Bancaria USD', 'bank', 'USD', 100000, 'Cuenta bancaria en dólares'],  // 1000.00
          ['Cuenta Bancaria VES', 'bank', 'VES', 5000000, 'Cuenta bancaria en bolívares'],  // 50000.00
          ['Efectivo USD', 'cash', 'USD', 20000, 'Efectivo en dólares'],  // 200.00
          ['Efectivo VES', 'cash', 'VES', 10000000, 'Efectivo en bolívares'],  // 100000.00
          ['Crypto Wallet', 'crypto', 'USD', 50000, 'Wallet de criptomonedas'],  // 500.00
          ['Tarjeta Prepagada', 'card', 'USD', 10000, 'Tarjeta prepagada internacional'],  // 100.00
        ];
        const stmt = db.prepare('INSERT INTO wallets (name, type, currency, balance, description) VALUES (?, ?, ?, ?, ?)');
        wallets.forEach((w) => stmt.run(w));
        stmt.finalize();
      }
    });
    db.get('SELECT COUNT(*) as count FROM categories', (err, result) => {
      if (!err && result && result.count === 0) {
        const categories = [
          ['food', 'expense', '#e74c3c'], ['transport', 'expense', '#4ecdc4'],
          ['housing', 'expense', '#45b7d1'], ['utilities', 'expense', '#ffd166'],
          ['entertainment', 'expense', '#a663cc'], ['health', 'expense', '#ff6b6b'],
          ['education', 'expense', '#1dd3b0'], ['shopping', 'expense', '#f28482'],
          ['personal', 'expense', '#b8b8b8'], ['other_expense', 'expense', '#95a5a6'],
          ['salary', 'income', '#27ae60'], ['freelance', 'income', '#2ecc71'],
          ['investment', 'income', '#3498db'], ['gift', 'income', '#9b59b6'],
          ['other_income', 'income', '#34495e'],
        ];
        const stmt = db.prepare('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)');
        categories.forEach((c) => stmt.run(c));
        stmt.finalize();
      }
    });
  }
});

// Recálculo de fee de exchanges/padres al arrancar (consistencia).
// Los triggers fueron descartados (esconden lógica); este backfill mantiene
// consistente la columna fee denormalizada con sus transacciones hijas.
function ensureExchangesFeeSync() {
  // Guard: en entornos de test el mock de sqlite no expone db.exec; saltar ahí.
  if (typeof db.exec === 'function') {
    db.exec(`
      DROP TRIGGER IF EXISTS trg_sync_fee_after_insert;
      DROP TRIGGER IF EXISTS trg_sync_fee_after_delete;
      DROP TRIGGER IF EXISTS trg_sync_fee_after_update;
    `);
  }
  db.run(`
    UPDATE transactions SET fee = COALESCE((
      SELECT SUM(t.amount) FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.parent_transaction_id = transactions.id AND c.name = 'fee'
    ), 0)
    WHERE id IN (SELECT DISTINCT parent_transaction_id FROM transactions WHERE parent_transaction_id IS NOT NULL)
  `);
  db.run(`
    UPDATE exchanges SET fee = COALESCE((
      SELECT SUM(t.amount) FROM transactions t
      JOIN categories c ON c.id = t.category_id
      WHERE t.parent_transaction_id = exchanges.debit_transaction_id AND c.name = 'fee'
    ), 0)
  `);
}

ensureExchangesFeeSync();

module.exports = { db, dbPath, seedDemoData, ensureExchangesFeeSync };
