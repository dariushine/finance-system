// src/db.js — Conexión SQLite, esquema y migraciones.
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const seedDemoData = process.env.SEED_DEMO_DATA === 'true';

const dbPath = path.join(__dirname, '..', 'data/finance.db');
const db = new sqlite3.Database(dbPath);


// Crear tablas
db.serialize(() => {
  // Wallets (ya existe)
  db.run(`CREATE TABLE IF NOT EXISTS wallets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    alias TEXT,
    type TEXT NOT NULL,
    currency TEXT NOT NULL,
    balance DECIMAL(10,2) DEFAULT 0,
    description TEXT,
    icon TEXT,
    color TEXT,
    isActive BOOLEAN DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Migración: añadir columna alias a DBs creadas antes de que existiera
  db.all(`PRAGMA table_info(wallets)`, (err, cols) => {
    if (err) return;
    const names = (cols || []).map((c) => c.name);
    if (!names.includes('alias')) {
      db.run(`ALTER TABLE wallets ADD COLUMN alias TEXT`);
    }
    if (!names.includes('icon')) {
      db.run(`ALTER TABLE wallets ADD COLUMN icon TEXT`);
    }
    if (!names.includes('color')) {
      db.run(`ALTER TABLE wallets ADD COLUMN color TEXT`);
    }
  });
  
  // Categories (ya existe)
  db.run(`CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL,
    color TEXT,
    icon TEXT,
    isActive BOOLEAN DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
  // Transactions (ya existe)
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    wallet_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    description TEXT,
    date TEXT NOT NULL,
    exchange_rate DECIMAL(10,4) DEFAULT 1.0,
    converted_amount DECIMAL(10,2) NOT NULL,
    fee DECIMAL(10,2) DEFAULT 0,
    parent_transaction_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (parent_transaction_id) REFERENCES transactions(id)
  )`);
  
  // Exchanges (NUEVA - para metadata)
  db.run(`CREATE TABLE IF NOT EXISTS exchanges (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    debit_transaction_id INTEGER NOT NULL,
    credit_transaction_id INTEGER NOT NULL,
    from_wallet_id INTEGER NOT NULL,
    to_wallet_id INTEGER NOT NULL,
    from_amount DECIMAL(10,2) NOT NULL,
    to_amount DECIMAL(10,2) NOT NULL,
    rate DECIMAL(10,4) NOT NULL,
    fee DECIMAL(10,2) DEFAULT 0,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debit_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (credit_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (from_wallet_id) REFERENCES wallets(id),
    FOREIGN KEY (to_wallet_id) REFERENCES wallets(id)
  )`);

  // Migración: quitar columnas market_rate, spread y fee de exchanges.
  // Migración de exchanges:
  // - Si aún tiene market_rate o spread (de versiones viejas), se recrea la tabla
  //   SIN esas columnas (el spread se calcula sobre la marcha contra daily_rates)
  //   pero CON la columna fee (total de comisión, denormalizada).
  // - Si solo falta fee, se agrega con ALTER TABLE.
  // La columna fee se sincroniza automáticamente vía trigger en transactions
  // (ver función ensureExchangesFeeSync), de modo que quede consistente con las
  // transacciones tipo 'fee' vinculadas por parent_transaction_id.
  db.all(`PRAGMA table_info(exchanges)`, (err, cols) => {
    if (err) return;
    const names = (cols || []).map((c) => c.name);
    const hasMarket = names.includes('market_rate');
    const hasSpread = names.includes('spread');
    const hasFee = names.includes('fee');
    const hasDeleted = names.includes('deleted');
    if (!hasDeleted) {
      db.run(`ALTER TABLE exchanges ADD COLUMN deleted INTEGER DEFAULT 0`, (addDelErr) => {
        if (!addDelErr) console.log('✅ exchanges: agregada columna deleted (soft-delete)');
      });
    }
    if (hasMarket || hasSpread) {
      db.exec(`
        BEGIN;
        CREATE TABLE exchanges_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          debit_transaction_id INTEGER NOT NULL,
          credit_transaction_id INTEGER NOT NULL,
          from_wallet_id INTEGER NOT NULL,
          to_wallet_id INTEGER NOT NULL,
          from_amount DECIMAL(10,2) NOT NULL,
          to_amount DECIMAL(10,2) NOT NULL,
          rate DECIMAL(10,4) NOT NULL,
          fee DECIMAL(10,2) DEFAULT 0,
          description TEXT,
          deleted INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (debit_transaction_id) REFERENCES transactions(id),
          FOREIGN KEY (credit_transaction_id) REFERENCES transactions(id),
          FOREIGN KEY (from_wallet_id) REFERENCES wallets(id),
          FOREIGN KEY (to_wallet_id) REFERENCES wallets(id)
        );
        INSERT INTO exchanges_new (id, debit_transaction_id, credit_transaction_id, from_wallet_id, to_wallet_id, from_amount, to_amount, rate, fee, description, deleted, created_at)
          SELECT id, debit_transaction_id, credit_transaction_id, from_wallet_id, to_wallet_id, from_amount, to_amount, rate, COALESCE(fee,0), description, COALESCE(deleted,0), created_at FROM exchanges;
        DROP TABLE exchanges;
        ALTER TABLE exchanges_new RENAME TO exchanges;
        COMMIT;
      `, (rebuildErr) => {
        if (!rebuildErr) console.log('✅ exchanges: recreada sin market_rate/spread, con fee');
      });
    } else if (!hasFee) {
      db.run(`ALTER TABLE exchanges ADD COLUMN fee DECIMAL(10,2) DEFAULT 0`, (addErr) => {
        if (!addErr) console.log('✅ exchanges: agregada columna fee');
      });
    }
  });
  db.all(`PRAGMA table_info(transactions)`, (err, cols) => {
    if (err) return;
    const names = (cols || []).map((c) => c.name);
    if (!names.includes('fee')) {
      db.run(`ALTER TABLE transactions ADD COLUMN fee DECIMAL(10,2) DEFAULT 0`);
    }
    if (!names.includes('parent_transaction_id')) {
      db.run(`ALTER TABLE transactions ADD COLUMN parent_transaction_id INTEGER`);
      console.log('✅ transactions: agregada columna parent_transaction_id');
    }
    if (!names.includes('time')) {
      db.run(`ALTER TABLE transactions ADD COLUMN time TEXT`);
      console.log('✅ transactions: agregada columna time (HH:MM:SS)');
    }
    if (!names.includes('deleted')) {
      db.run(`ALTER TABLE transactions ADD COLUMN deleted INTEGER DEFAULT 0`);
      console.log('✅ transactions: agregada columna deleted (soft-delete)');
    }
    // Sincronizar exchanges.fee con las transacciones fee (crea triggers + backfill)
    ensureExchangesFeeSync();
  });
  
  // Insertar datos de demostración (solo si está habilitado; desactivar con SEED_DEMO_DATA=false)
  if (seedDemoData) {
  // Insertar datos iniciales
  db.get('SELECT COUNT(*) as count FROM wallets', (err, result) => {
    if (!err && result && result.count === 0) {
      console.log('💰 Insertando billeteras iniciales...');
      const wallets = [
        ['Cuenta Bancaria USD', 'bank', 'USD', 1000, 'Cuenta bancaria en dólares'],
        ['Cuenta Bancaria VES', 'bank', 'VES', 50000, 'Cuenta bancaria en bolívares'],
        ['Efectivo USD', 'cash', 'USD', 200, 'Efectivo en dólares'],
        ['Efectivo VES', 'cash', 'VES', 100000, 'Efectivo en bolívares'],
        ['Crypto Wallet', 'crypto', 'USD', 500, 'Wallet de criptomonedas'],
        ['Tarjeta Prepagada', 'card', 'USD', 100, 'Tarjeta prepagada internacional'],
      ];
      
      const stmt = db.prepare('INSERT INTO wallets (name, type, currency, balance, description) VALUES (?, ?, ?, ?, ?)');
      wallets.forEach(wallet => stmt.run(wallet));
      stmt.finalize();
      console.log('✅ 6 billeteras creadas');
    }
  });
  
  db.get('SELECT COUNT(*) as count FROM categories', (err, result) => {
    if (!err && result && result.count === 0) {
      console.log('🏷️  Insertando categorías iniciales...');
      const categories = [
        ['food', 'expense', '#e74c3c'],
        ['transport', 'expense', '#4ecdc4'],
        ['housing', 'expense', '#45b7d1'],
        ['utilities', 'expense', '#ffd166'],
        ['entertainment', 'expense', '#a663cc'],
        ['health', 'expense', '#ff6b6b'],
        ['education', 'expense', '#1dd3b0'],
        ['shopping', 'expense', '#f28482'],
        ['personal', 'expense', '#b8b8b8'],
        ['other_expense', 'expense', '#95a5a6'],
        ['salary', 'income', '#27ae60'],
        ['freelance', 'income', '#2ecc71'],
        ['investment', 'income', '#3498db'],
        ['gift', 'income', '#9b59b6'],
        ['other_income', 'income', '#34495e'],
        ['exchange_out', 'expense', '#9c27b0'],   // Categoría especial para exchanges
        ['exchange_in', 'income', '#673ab7'],     // Categoría especial para exchanges
        ['fee', 'expense', '#e67e22'],            // Comisiones
      ];
      
      const stmt = db.prepare('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)');
      categories.forEach(cat => stmt.run(cat));
      stmt.finalize();
      console.log('✅ 18 categorías creadas (incluyendo exchange_out/in y fee)');
    }
  });
  } // fin de seed de datos de demostración

  // Asegurar existencia de las categorías de infraestructura del sistema SIEMPRE
  // (no son demo data): fee (comisiones), exchange_out (débito de exchange) y
  // exchange_in (crédito de exchange). Sin ellas, los flujos internos fallarían
  // incluso con una base de datos vacía.
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

  // Tabla de tasas diarias (BCV oficial + paralelo) consumida por reportes
  db.run(`CREATE TABLE IF NOT EXISTS daily_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    bcv REAL NOT NULL,
    paralelo REAL NOT NULL,
    source TEXT DEFAULT 'dolarapi',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Pagos frecuentes: plantillas para crear transacciones de forma rápida.
  // Solo guardan data prellenada (monto, moneda, tipo, categoría, descripción y
  // una billetera preferida OPCIONAL); no generan transacciones por sí solos (el
  // usuario las ejecuta manualmente). fee = comisión opcional incluida al ejecutar.
  db.run(`CREATE TABLE IF NOT EXISTS recurring_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(10,2) NOT NULL,
    fee DECIMAL(10,2) DEFAULT 0,
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

  // Migración para instalaciones que ya tenían la primera versión de la tabla:
  // wallet_id antes era NOT NULL, pero ahora es una preferencia opcional.
  db.all(`PRAGMA table_info(recurring_payments)`, (err, cols) => {
    if (err) return;
    const columns = cols || [];
    const names = columns.map((c) => c.name);
    const walletColumn = columns.find((c) => c.name === 'wallet_id');

    if (walletColumn?.notnull) {
      // SQLite no permite quitar NOT NULL con ALTER TABLE: se reconstruye la tabla
      // preservando las plantillas existentes y convirtiendo la billetera en nullable.
      const feeValue = names.includes('fee') ? 'COALESCE(fee, 0)' : '0';
      db.run(`CREATE TABLE recurring_payments_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        description TEXT,
        amount DECIMAL(10,2) NOT NULL,
        fee DECIMAL(10,2) DEFAULT 0,
        currency TEXT NOT NULL,
        type TEXT NOT NULL,
        category_id INTEGER NOT NULL,
        wallet_id INTEGER,
        isActive BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (category_id) REFERENCES categories(id),
        FOREIGN KEY (wallet_id) REFERENCES wallets(id)
      )`, (createErr) => {
        if (createErr) return console.error('Error migrando pagos frecuentes:', createErr.message);
        db.run(
          `INSERT INTO recurring_payments_new (id, name, description, amount, fee, currency, type, category_id, wallet_id, isActive, created_at, updated_at)
           SELECT id, name, description, amount, ${feeValue}, currency, type, category_id, wallet_id, isActive, created_at, updated_at
           FROM recurring_payments`,
          (copyErr) => {
            if (copyErr) return console.error('Error copiando pagos frecuentes:', copyErr.message);
            db.run('DROP TABLE recurring_payments', (dropErr) => {
              if (dropErr) return console.error('Error reemplazando pagos frecuentes:', dropErr.message);
              db.run('ALTER TABLE recurring_payments_new RENAME TO recurring_payments', (renameErr) => {
                if (renameErr) console.error('Error finalizando migración de pagos frecuentes:', renameErr.message);
              });
            });
          }
        );
      });
    } else if (!names.includes('fee')) {
      db.run(`ALTER TABLE recurring_payments ADD COLUMN fee DECIMAL(10,2) DEFAULT 0`);
    }
  });
});

// crea la transacción 'fee' (ver createTransaction): así el total se mantiene
// consistente con el detalle sin depender de triggers, que son difíciles de
// depurar y esconden lógica. Esta función solo hace un backfill al arrancar
// (por si hay datos previos o se cae a mitad de una sync).
function ensureExchangesFeeSync() {
  // Eliminar triggers si existieran de versiones anteriores.
  db.exec(`
    DROP TRIGGER IF EXISTS trg_sync_fee_after_insert;
    DROP TRIGGER IF EXISTS trg_sync_fee_after_delete;
    DROP TRIGGER IF EXISTS trg_sync_fee_after_update;
  `);
  const backfill = () => {
    // Recalcular fee de cada transacción padre
    db.run(`
      UPDATE transactions SET fee = COALESCE((
        SELECT SUM(t.amount) FROM transactions t
        JOIN categories c ON c.id = t.category_id
        WHERE t.parent_transaction_id = transactions.id AND c.name = 'fee'
      ), 0)
      WHERE id IN (SELECT DISTINCT parent_transaction_id FROM transactions WHERE parent_transaction_id IS NOT NULL)
    `);
    // Recalcular fee de cada exchange (suma de fees cuyo parent = débito del exchange)
    db.run(`
      UPDATE exchanges SET fee = COALESCE((
        SELECT SUM(t.amount) FROM transactions t
        JOIN categories c ON c.id = t.category_id
        WHERE t.parent_transaction_id = exchanges.debit_transaction_id AND c.name = 'fee'
      ), 0)
    `);
  };

  backfill();
}

module.exports = { db, dbPath, seedDemoData, ensureExchangesFeeSync };
