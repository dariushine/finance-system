const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = process.env.PORT ? Number(process.env.PORT) : 3002;

const dbPath = path.join(__dirname, 'data/finance.db');
const db = new sqlite3.Database(dbPath);

app.use(express.json());

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

  // Asegurar existencia de la categoría 'fee' (expense) incluso en DB ya inicializadas
  db.get("SELECT id FROM categories WHERE name = 'fee' AND type = 'expense'", (err, row) => {
    if (!err && !row) {
      db.run("INSERT INTO categories (name, type, color) VALUES ('fee', 'expense', '#e67e22')", (e) => {
        if (!e) console.log('✅ Categoría fee (comisión) agregada');
      });
    }
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
});

// Consultar las tasas oficial (BCV) y paralelo de Dolarapi
function fetchRatesFromApi() {
  return new Promise((resolve) => {
    const fetchRate = (path) => new Promise((res) => {
      const lib = require('https');
      lib.get({ host: 've.dolarapi.com', path: `/v1/${path}`, timeout: 5000 }, (resp) => {
        let data = '';
        resp.on('data', (c) => (data += c));
        resp.on('end', () => {
          try {
            const j = JSON.parse(data);
            res(typeof j.promedio === 'number' ? j.promedio : null);
          } catch (e) {
            res(null);
          }
        });
      }).on('error', () => res(null)).on('timeout', function () { this.destroy(); res(null); });
    });

    Promise.all([fetchRate('dolares/oficial'), fetchRate('dolares/paralelo')]).then(([bcv, paralelo]) => {
      if (bcv === null || paralelo === null) {
        resolve(null);
      } else {
        resolve({ bcv, paralelo });
      }
    });
  });
}

// Guardar (o actualizar) la tasa para una fecha
function upsertRate(date, bcv, paralelo, source) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO daily_rates (date, bcv, paralelo, source)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(date) DO UPDATE SET bcv = excluded.bcv, paralelo = excluded.paralelo, source = excluded.source`,
      [date, bcv, paralelo, source || 'dolarapi'],
      (err) => err ? reject(err) : resolve()
    );
  });
}

// Obtener la tasa del día: la busca en BD; si no existe, la consulta a la API y la guarda.
// Devuelve { date, bcv, paralelo, fromDb } o { error: 'mensaje' } si no se pudo obtener.
async function getTodayRate() {
  const today = new Date().toISOString().split('T')[0];

  // 1. Intentar desde la BD
  const fromDb = await new Promise((resolve) => {
    db.get('SELECT date, bcv, paralelo FROM daily_rates WHERE date = ?', [today], (err, row) => {
      if (err || !row) return resolve(null);
      resolve({ date: row.date, bcv: row.bcv, paralelo: row.paralelo });
    });
  });

  if (fromDb) {
    return { ...fromDb, fromDb: true };
  }

  // 2. No está en BD: pedir a la API
  const api = await fetchRatesFromApi();
  if (!api) {
    return { error: 'No se pudieron obtener las tasas del día desde la API.' };
  }

  try {
    await upsertRate(today, api.bcv, api.paralelo, 'dolarapi');
    return { date: today, bcv: api.bcv, paralelo: api.paralelo, fromDb: false };
  } catch (err) {
    return { error: 'No se pudo guardar la tasa en la base de datos.' };
  }
}

// Sincroniza las columnas denormalizadas de comisión (fee). En runtime, la
// actualización se hace explícitamente dentro de la misma transacción SQL que
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

// Obtener la tasa (bcv | paralelo) para una fecha dada; si no hay registro, usa la última disponible
// Valida una hora en formato HH:MM o HH:MM:SS y comprueba rangos reales (0-23h, 0-59min, 0-59s).
// Devuelve true si es válida, false si no.
function isValidTime(value) {
  if (typeof value !== 'string' || value === '') return true; // opcional
  const m = value.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return false;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = m[3] == null ? 0 : Number(m[3]);
  return h >= 0 && h <= 23 && min >= 0 && min <= 59 && s >= 0 && s <= 59;
}

function getRateForDate(date, type) {
  return new Promise((resolve) => {
    const col = type === 'paralelo' ? 'paralelo' : 'bcv';
    db.get('SELECT ' + col + ' AS rate FROM daily_rates WHERE date = ?', [date], (err, row) => {
      if (err) return resolve(null);
      if (row && row.rate != null) return resolve(row.rate);
      db.get('SELECT ' + col + ' AS rate FROM daily_rates ORDER BY date DESC LIMIT 1', [], (err2, last) => {
        if (err2) return resolve(null);
        resolve(last && last.rate != null ? last.rate : null);
      });
    });
  });
}

// Busca una categoría activa por nombre+tipo. Si no existe, la crea de forma
// idempotente (nueva categoría con color por tipo). Devuelve la fila (id, name...).
// Evita crear categorías del sistema (fee, exchange_out, exchange_in): si se pide
// una de estas y no existe, se rechaza el error para no corromper los flujos.
function getOrCreateCategory(categoryName, type) {
  return new Promise((resolve, reject) => {
    const name = String(categoryName || '').trim();
    if (!name) return reject(new Error('Nombre de categoría vacío'));
    if (!type || (type !== 'income' && type !== 'expense')) {
      return reject(new Error('type debe ser income o expense'));
    }
    db.get('SELECT * FROM categories WHERE name = ? AND type = ?', [name, type], (err, row) => {
      if (err) return reject(err);
      if (row) {
        // Existe (incluida una de sistema como exchange_out/fee): devolverla tal cual.
        // Si estaba desactivada, reactivar para poder usarla.
        if (!row.isActive && !isSystemCategoryName(row.name)) {
          db.run('UPDATE categories SET isActive = 1 WHERE id = ?', [row.id], (upErr) => {
            if (upErr) return reject(upErr);
            resolve({ ...row, isActive: 1 });
          });
        } else {
          resolve(row);
        }
        return;
      }
      // No existe: crear una nueva, pero nunca una de sistema (solo se crean vía exchange).
      if (isSystemCategoryName(name)) {
        return reject(new Error(`No puedes crear la categoría de sistema '${name}'`));
      }
      const color = type === 'income' ? '#2ecc71' : '#e74c3c';
      db.run(
        'INSERT INTO categories (name, type, color) VALUES (?, ?, ?)',
        [name, type, color],
        function (insErr) {
          if (insErr) {
            // Carrera (concurrente): reintentar lectura.
            if (/UNIQUE/.test(String(insErr.message))) {
              db.get('SELECT * FROM categories WHERE name = ? AND type = ?', [name, type], (e2, r2) => {
                if (e2) return reject(e2);
                resolve(r2);
              });
            } else {
              reject(insErr);
            }
            return;
          }
          db.get('SELECT * FROM categories WHERE id = ?', [this.lastID], (e3, r3) => {
            if (e3) return reject(e3);
            resolve(r3);
          });
        }
      );
    });
  });
}

function createTransaction(walletId, categoryName, type, amount, description, fee = 0, date, time) {
  return new Promise((resolve, reject) => {
    const commission = Number(fee) || 0;
    // Fecha + hora de la transacción. El frontend manda `date` como
    // YYYY-MM-DD y `time` como HH:MM[:SS]. Si no se proveen, se usa hoy local.
    const now = new Date();
    const pad2 = (n) => String(n).padStart(2, '0');
    const defaultDate = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
    const defaultTime = `${pad2(now.getHours())}:${pad2(now.getMinutes())}:${pad2(now.getSeconds())}`;
    const txDate = typeof date === 'string' && date !== '' ? date : defaultDate;
    let txTime = defaultTime;
    if (typeof time === 'string' && time !== '') {
      // Aceptar HH:MM o HH:MM:SS
      txTime = /^\d{2}:\d{2}:\d{2}$/.test(time) ? time : `${time}:00`;
    }
    db.serialize(() => {
      // 1. Obtener wallet
      db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [walletId], (err, wallet) => {
        if (err) return reject(err);
        if (!wallet) return reject(new Error('Wallet no encontrada'));
        
        // 2. Obtener categoría (si no existe, se crea automáticamente)
        getOrCreateCategory(categoryName, type).then((category) => {
            // 3. Validar fondos para gastos: monto + comisión (la comisión es EXTRA al monto)
            const total = amount + commission;
            if (type === 'expense' && wallet.balance < total) {
              return reject(new Error(`Fondos insuficientes. Balance actual: ${wallet.balance} ${wallet.currency}, necesita ${total}`));
            }
            
            // 4. Calcular nuevo balance:
            //    - Gasto: se descuenta monto + comisión.
            //    - Ingreso: se suma el monto pero la comisión se resta (es un GASTO aparte).
            const newBalance = type === 'expense'
              ? wallet.balance - total
              : wallet.balance + amount - commission;
            
            // 5. Crear transacción y actualizar balance en transacción
            db.run('BEGIN TRANSACTION');

            // 5a. Transacción principal con el monto original (sin comisión)
            db.run(
              `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, time, exchange_rate, converted_amount, fee, parent_transaction_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [walletId, category.id, type, amount, description || '', txDate, txTime, 1.0, amount, 0, null],
              function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                const transactionId = this.lastID;

                const finish = (feeTransactionId) => {
                  // Actualizar balance
                  db.run('UPDATE wallets SET balance = ? WHERE id = ?', [newBalance, walletId], (upErr) => {
                    if (upErr) {
                      db.run('ROLLBACK');
                      return reject(upErr);
                    }
                    db.run('COMMIT', () => {
                      resolve({
                        id: transactionId,
                        feeTransactionId,
                        wallet: wallet.name,
                        currency: wallet.currency,
                        amount,
                        type,
                        newBalance,
                        category: category.name,
                        fee: commission
                      });
                    });
                  });
                };

                // 5b. Si hay comisión, crear una transacción SEPARADA tipo fee.
                //     La comisión SIEMPRE es un gasto, aunque el padre sea un ingreso.
                if (commission > 0) {
                  db.get('SELECT * FROM categories WHERE name = ? AND type = ? AND isActive = 1',
                    ['fee', 'expense'], (fErr, feeCategory) => {
                      const fc = (!fErr && feeCategory) ? feeCategory : category;
                      db.run(
                        `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, time, exchange_rate, converted_amount, fee, parent_transaction_id)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [walletId, fc.id, 'expense', commission,
                         `Comisión: ${description || category.name}`,
                         txDate, txTime, 1.0, commission, 0, transactionId],
                        function(err2) {
                          if (err2) {
                            db.run('ROLLBACK');
                            return reject(err2);
                          }
                          const feeTransactionId = this.lastID;

                          // Recalcular transactions.fee del padre (suma de fees)
                          db.run(
                            `UPDATE transactions SET fee =
                               (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
                                JOIN categories c ON c.id = t.category_id
                                WHERE t.parent_transaction_id = ? AND c.name = 'fee')
                              WHERE id = ?`,
                            [transactionId, transactionId],
                            (feeUpErr) => {
                              if (feeUpErr) {
                                db.run('ROLLBACK');
                                return reject(feeUpErr);
                              }
                              // Recalcular exchanges.fee si este padre es el débito de un exchange
                              db.run(
                                `UPDATE exchanges SET fee =
                                   (SELECT COALESCE(SUM(t.amount), 0) FROM transactions t
                                    JOIN categories c ON c.id = t.category_id
                                    WHERE t.parent_transaction_id = ? AND c.name = 'fee')
                                  WHERE debit_transaction_id = ?`,
                                [transactionId, transactionId],
                                (exUpErr) => {
                                  if (exUpErr) {
                                    db.run('ROLLBACK');
                                    return reject(exUpErr);
                                  }
                                  finish(feeTransactionId);
                                }
                              );
                            }
                          );
                        }
                      );
                    });
                } else {
                  finish(null);
                }
              }
            );
          }).catch((err) => reject(err));
      });
    });
  });
}

// Endpoints
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Finance API v4',
    version: '4.0.0',
    features: ['wallets', 'transactions', 'exchanges', 'balance'],
    note: 'Exchanges con transacciones separadas (débito/crédito)'
  });
});

// ---- Categorías ----
// Listar categorías. ?type=income|expense filtra por tipo; por defecto solo activas.
// ?includingInactive=1 incluye también las desactivadas (para la pantalla de config).
app.get('/api/categories', (req, res) => {
  const { type, includingInactive } = req.query;
  let sql = 'SELECT * FROM categories';
  const conds = [];
  const params = [];
  if (type === 'income' || type === 'expense') {
    conds.push('type = ?');
    params.push(type);
  }
  if (includingInactive !== '1') {
    conds.push('isActive = 1');
  }
  if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
  sql += ' ORDER BY type, name';
  db.all(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Crear una categoría.
app.post('/api/categories', (req, res) => {
  const { name, type, color, icon } = req.body || {};
  const trimmed = String(name || '').trim();
  if (!trimmed) return res.status(400).json({ error: 'El nombre es requerido' });
  if (type !== 'income' && type !== 'expense') {
    return res.status(400).json({ error: 'type debe ser income o expense' });
  }
  if (isSystemCategoryName(trimmed)) {
    return res.status(400).json({ error: `'${trimmed}' es una categoría del sistema y no se puede crear manualmente.` });
  }
  const finalColor = color || (type === 'income' ? '#2ecc71' : '#e74c3c');
  db.run(
    'INSERT INTO categories (name, type, color, icon) VALUES (?, ?, ?, ?)',
    [trimmed, type, finalColor, icon || null],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      db.get('SELECT * FROM categories WHERE id = ?', [this.lastID], (e, row) => {
        if (e) return res.status(500).json({ error: e.message });
        res.status(201).json(row);
      });
    }
  );
});

// Editar una categoría (nombre, color, icono). Se bloquea en categorías del sistema.
app.put('/api/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  db.get('SELECT * FROM categories WHERE id = ?', [id], (err, cat) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
    if (isSystemCategoryName(cat.name)) {
      return res.status(400).json({ error: `'${cat.name}' es una categoría del sistema y no se puede editar.` });
    }
    const { name, color, icon, type } = req.body || {};
    const newName = name !== undefined && String(name).trim() !== '' ? String(name).trim() : cat.name;
    if (type !== undefined && type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'type debe ser income o expense' });
    }
    if (newName !== cat.name && isSystemCategoryName(newName)) {
      return res.status(400).json({ error: `'${newName}' es una categoría del sistema y no se puede usar.` });
    }
    const newColor = color !== undefined ? color : cat.color;
    const newIcon = icon !== undefined ? icon : cat.icon;
    const newType = type !== undefined ? type : cat.type;
    db.run(
      'UPDATE categories SET name = ?, color = ?, icon = ?, type = ? WHERE id = ?',
      [newName, newColor, newIcon, newType, id],
      function (updErr) {
        if (updErr) return res.status(400).json({ error: updErr.message });
        db.get('SELECT * FROM categories WHERE id = ?', [id], (e, row) => {
          if (e) return res.status(500).json({ error: e.message });
          res.json(row);
        });
      }
    );
  });
});

// Soft-delete / reactivar categoría.
// DELETE marca isActive=0 (no borra físicamente: conserva el historial).
app.delete('/api/categories/:id', (req, res) => {
  const id = Number(req.params.id);
  db.get('SELECT * FROM categories WHERE id = ?', [id], (err, cat) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
    if (isSystemCategoryName(cat.name)) {
      return res.status(400).json({ error: `'${cat.name}' es una categoría del sistema y no se puede desactivar.` });
    }
    db.run('UPDATE categories SET isActive = 0 WHERE id = ?', [id], (e) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true, message: 'Categoría desactivada' });
    });
  });
});

// Reactivar (deshacer soft-delete)
app.put('/api/categories/:id/reactivate', (req, res) => {
  const id = Number(req.params.id);
  db.get('SELECT * FROM categories WHERE id = ?', [id], (err, cat) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
    if (isSystemCategoryName(cat.name)) {
      return res.status(400).json({ error: `'${cat.name}' es una categoría del sistema y no se puede reactivar.` });
    }
    db.run('UPDATE categories SET isActive = 1 WHERE id = ?', [id], (e) => {
      if (e) return res.status(500).json({ error: e.message });
      db.get('SELECT * FROM categories WHERE id = ?', [id], (e2, row) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json(row);
      });
    });
  });
});

app.get('/api/wallets', (req, res) => {
  db.all('SELECT * FROM wallets WHERE isActive = 1 ORDER BY currency, name', (err, wallets) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(wallets);
  });
});

// Listar billeteras eliminadas (soft-delete)
app.get('/api/wallets/deleted', (req, res) => {
  db.all('SELECT * FROM wallets WHERE isActive = 0 ORDER BY name', (err, wallets) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(wallets);
  });
});

// Obtener una billetera por id (solo activas)
app.get('/api/wallets/:id', (req, res) => {
  db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [req.params.id], (err, wallet) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!wallet) return res.status(404).json({ error: 'Billetera no encontrada' });
    res.json(wallet);
  });
});

// Crear una billetera
app.post('/api/wallets', (req, res) => {
  const { name, alias, type, currency, balance, description, icon, color } = req.body;
  if (!name || !type || !currency) {
    return res.status(400).json({ error: 'Faltan campos requeridos: name, type, currency' });
  }
  const isActive = 1;
  db.run(
    `INSERT INTO wallets (name, alias, type, currency, balance, description, icon, color, isActive)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [name, alias || null, type, currency, balance || 0, description || null, icon || null, color || null, isActive],
    function (err) {
      if (err) return res.status(400).json({ error: err.message });
      db.get('SELECT * FROM wallets WHERE id = ?', [this.lastID], (e, row) => {
        if (e) return res.status(500).json({ error: e.message });
        res.status(201).json(row);
      });
    }
  );
});

// Actualizar una billetera (campos editables: metadata únicamente)
// El balance NO se puede editar aquí: solo cambia vía transacciones/exchanges
// (createTransaction/createExchange actualizan wallets.balance). Tampoco se
// permite cambiar type ni currency: son fijos tras la creación.
app.put('/api/wallets/:id', (req, res) => {
  const { name, alias, description, icon, color } = req.body;
  db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [req.params.id], (err, wallet) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!wallet) return res.status(404).json({ error: 'Billetera no encontrada' });

    const newName = name !== undefined ? name : wallet.name;
    const newAlias = alias !== undefined ? alias : wallet.alias;
    const newDescription = description !== undefined ? description : wallet.description;
    const newIcon = icon !== undefined ? icon : wallet.icon;
    const newColor = color !== undefined ? color : wallet.color;
    // Se BORRA el balance de la query de actualización: aunque el cliente mande
    // un campo balance/type/currency en el body, se ignora.

    db.run(
      `UPDATE wallets SET name = ?, alias = ?, description = ?, icon = ?, color = ? WHERE id = ?`,
      [newName, newAlias, newDescription, newIcon, newColor, req.params.id],
      function (updErr) {
        if (updErr) return res.status(400).json({ error: updErr.message });
        db.get('SELECT * FROM wallets WHERE id = ?', [req.params.id], (e, row) => {
          if (e) return res.status(500).json({ error: e.message });
          res.json(row);
        });
      }
    );
  });
});

// Soft-delete (no borra realmente, solo marca isActive = 0)
app.delete('/api/wallets/:id', (req, res) => {
  db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [req.params.id], (err, wallet) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!wallet) return res.status(404).json({ error: 'Billetera no encontrada' });
    db.run('UPDATE wallets SET isActive = 0 WHERE id = ?', [req.params.id], (e) => {
      if (e) return res.status(500).json({ error: e.message });
      res.json({ success: true, message: 'Billetera desactivada (no eliminada definitivamente)' });
    });
  });
});

// Reactivar una billetera eliminada
app.put('/api/wallets/:id/reactivate', (req, res) => {
  db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 0', [req.params.id], (err, wallet) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!wallet) return res.status(404).json({ error: 'Billetera no encontrada o ya activa' });
    db.run('UPDATE wallets SET isActive = 1 WHERE id = ?', [req.params.id], (e) => {
      if (e) return res.status(500).json({ error: e.message });
      db.get('SELECT * FROM wallets WHERE id = ?', [req.params.id], (e2, row) => {
        if (e2) return res.status(500).json({ error: e2.message });
        res.json(row);
      });
    });
  });
});

// Reporte de una billetera: balance + ingresos/egresos + transacciones con rango de fechas
// ?from=YYYY-MM-DD&to=YYYY-MM-DD&period=day|week|month|3m|year|all
app.get('/api/wallets/:id/report', (req, res) => {
  const walletId = req.params.id;
  const { from, to, period } = req.query;
  db.get('SELECT * FROM wallets WHERE id = ?', [walletId], (err, wallet) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!wallet) return res.status(404).json({ error: 'Billetera no encontrada' });

    // Calcular rango por defecto si no hay from/to
    let fromDate = from;
    let toDate = to;
    if (!fromDate || !toDate) {
      const now = new Date();
      toDate = now.toISOString().split('T')[0];
      if (period === 'day') {
        fromDate = toDate;
      } else if (period === 'week') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        fromDate = d.toISOString().split('T')[0];
      } else if (period === 'month') {
        const d = new Date(now);
        d.setDate(1);
        fromDate = d.toISOString().split('T')[0];
      } else if (period === '3m') {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 3);
        fromDate = d.toISOString().split('T')[0];
      } else if (period === 'year') {
        const d = new Date(now);
        d.setMonth(d.getMonth() - 12);
        fromDate = d.toISOString().split('T')[0];
      } else { // all
        fromDate = '1970-01-01';
      }
    }

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
      [walletId, fromDate, toDate],
      (err, rows) => {
        if (err) return res.status(500).json({ error: err.message });
        const transactions = rows || [];
        let income = 0;
        let expense = 0;
        transactions.forEach((t) => {
          if (t.type === 'income') income += Number(t.amount);
          else if (t.type === 'expense') expense += Number(t.amount);
        });
        res.json({
          wallet,
          range: { from: fromDate, to: toDate, period: period || 'custom' },
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
  });
});

app.post('/api/transactions', async (req, res) => {
  try {
    const { walletId, categoryName, type, amount, description, fee, date, time } = req.body;
    
    if (!walletId || !categoryName || !type || !amount) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: walletId, categoryName, type, amount' 
      });
    }
    
    // Fecha opcional: validar formato si viene. Sin fecha => hoy.
    if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
    }
    // Hora opcional: aceptar HH:MM o HH:MM:SS con rango válido
    if (!isValidTime(time)) {
      return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
    }
    
    const result = await createTransaction(walletId, categoryName, type, amount, description, fee, date, time);
    
    res.json({
      success: true,
      message: `Transacción de ${type} registrada exitosamente`,
      transaction: result
    });
    
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

// Listar transacciones con los nombres que consume el frontend.
app.get('/api/transactions', (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  // Rango de fechas (from/to opcionales; period presets) — igual que en el reporte de billetera
  const { from, to, period } = req.query;
  let fromDate = from;
  let toDate = to;
  if (!fromDate || !toDate) {
    if (!period) {
      // Sin filtro: mostrar todo el historial
      fromDate = '1970-01-01';
      toDate = '9999-12-31';
    } else {
      const now = new Date();
      toDate = now.toISOString().split('T')[0];
      if (period === 'day') fromDate = toDate;
      else if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); fromDate = d.toISOString().split('T')[0]; }
      else if (period === 'month') { const d = new Date(now); d.setDate(1); fromDate = d.toISOString().split('T')[0]; }
      else if (period === '3m') { const d = new Date(now); d.setMonth(d.getMonth() - 3); fromDate = d.toISOString().split('T')[0]; }
      else if (period === 'year') { const d = new Date(now); d.setMonth(d.getMonth() - 12); fromDate = d.toISOString().split('T')[0]; }
      else fromDate = '1970-01-01';
    }
  }

  const conditions = ['t.deleted = 0', 't.date >= ?', 't.date <= ?'];
  const params = [fromDate, toDate, limit, offset];

  const query = `
    SELECT
      t.id,
      t.wallet_id AS walletId,
      w.name AS walletName,
      w.currency AS walletCurrency,
      c.name AS category,
      t.type,
      t.amount,
      t.description,
      t.date,
      t.time,
      t.fee,
      t.parent_transaction_id AS parentTransactionId,
      t.created_at AS createdAt
    FROM transactions t
    JOIN wallets w ON w.id = t.wallet_id
    JOIN categories c ON c.id = t.category_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY t.date DESC, t.time DESC, t.created_at DESC, t.id DESC
    LIMIT ? OFFSET ?`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    db.get(`SELECT COUNT(*) AS total FROM transactions t WHERE ${conditions.join(' AND ')}`, [fromDate, toDate], (countErr, result) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      res.json({ data: rows, total: result?.total || 0, page, limit });
    });
  });
});

app.get('/api/transactions/:id', (req, res) => {
  db.get(`
    SELECT
      t.id,
      t.wallet_id AS walletId,
      w.name AS walletName,
      w.currency AS walletCurrency,
      w.balance AS walletBalance,
      c.name AS category,
      t.type,
      t.amount,
      t.description,
      t.date,
      t.time,
      t.fee,
      t.parent_transaction_id AS parentTransactionId,
      t.created_at AS createdAt
    FROM transactions t
    JOIN wallets w ON w.id = t.wallet_id
    JOIN categories c ON c.id = t.category_id
    WHERE t.id = ? AND t.deleted = 0`,
    [req.params.id],
    (err, transaction) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!transaction) return res.status(404).json({ error: 'Transacción no encontrada' });

      // Saldo "después de aplicar la transacción", calculado sobre la marcha
      // (running sum sobre las transacciones de la billetera). No se almacena
      // en la entidad: se deriva del orden real, evitando desincronización si
      // se editan/borran/reordenan transacciones.
      //
      // La billetera puede tener un saldo inicial que no está representado
      // como transacción, así que anclamos el running sum al saldo actual:
      //   balance_after = wallet.balance - total_net + running_sum_hasta_esta
      db.get(
        `SELECT running, total_net FROM (
           SELECT
             t.id,
             SUM(
               CASE
                 WHEN t.type = 'income'  THEN COALESCE(t.amount, 0)
                 WHEN t.type = 'expense' THEN -COALESCE(t.amount, 0)
                 ELSE 0
               END
             ) OVER (ORDER BY t.date, t.time, t.created_at, t.id) AS running,
             (SELECT SUM(
                CASE
                  WHEN type = 'income'  THEN COALESCE(amount, 0)
                  WHEN type = 'expense' THEN -COALESCE(amount, 0)
                  ELSE 0
                END)
              FROM transactions WHERE wallet_id = ? AND deleted = 0) AS total_net
           FROM transactions t
           WHERE t.wallet_id = ? AND t.deleted = 0
         ) WHERE id = ?`,
        [transaction.walletId, transaction.walletId, req.params.id],
        (balErr, balRow) => {
          // Transacciones hijas (fees de la comisión, por ejemplo)
          db.all(
            `SELECT
               t.id,
               t.wallet_id AS walletId,
               w.name AS walletName,
               w.currency AS walletCurrency,
               c.name AS category,
               t.type,
               t.amount,
               t.description,
               t.date,
               t.time,
               t.fee,
               t.parent_transaction_id AS parentTransactionId,
               t.created_at AS createdAt
             FROM transactions t
             JOIN wallets w ON w.id = t.wallet_id
             JOIN categories c ON c.id = t.category_id
             WHERE t.parent_transaction_id = ? AND t.deleted = 0
             ORDER BY t.id ASC`,
            [req.params.id],
            (childErr, children) => {
              if (balErr) return res.status(500).json({ error: balErr.message });
              if (childErr) return res.status(500).json({ error: childErr.message });
              const { walletBalance: _wb, ...txRest } = transaction;
              let balanceAfter = null;
              if (balRow && balRow.running != null) {
                const walletBalance = Number(transaction.walletBalance) || 0;
                const totalNet = Number(balRow.total_net) || 0;
                balanceAfter = walletBalance - totalNet + Number(balRow.running);
              }
              // Determinar si esta transacción pertenece a un exchange:
              // puede ser débito, crédito O un fee/cualquier hijo de esas
              // (recorremos la cadena de parent_transaction_id hasta la raíz).
              resolveExchangeForTransaction(req.params.id).then((info) => {
                res.json({
                  ...txRest,
                  balanceAfter: balanceAfter != null ? parseFloat(balanceAfter.toFixed(2)) : null,
                  children: children || [],
                  exchangeId: info ? info.exchangeId : null,
                  isExchangeMember: !!info,
                });
              }).catch((exErr) => {
                res.status(500).json({ error: exErr.message });
              });
            }
          );
        }
      );
    }
  );
});

// Sigue la cadena de parent_transaction_id hacia arriba hasta la raíz de la
// transacción. Devuelve [{id, category}...] de ancestros (sin incluir la raíz
// consultada). Usada para saber si una transacción pertenece a un exchange.
function getParentChain(transactionId) {
  return new Promise((resolve, reject) => {
    const chain = [];
    const visit = (id, depth) => {
      if (depth > 50) return resolve(chain); // tope de seguridad
      db.get(
        `SELECT id, parent_transaction_id AS parentId, category_id FROM transactions WHERE id = ?`,
        [id],
        (err, row) => {
          if (err) return reject(err);
          if (!row) return resolve(chain);
          chain.push({ id: row.id, categoryId: row.category_id, parentId: row.parentId });
          if (row.parentId == null) return resolve(chain);
          visit(row.parentId, depth + 1);
        }
      );
    };
    visit(transactionId, 0);
  });
}

// Resuelve si una transacción (o cualquiera de sus ancestros) es un miembro
// directo de un exchange (débito o crédito). Devuelve { exchangeId } o null.
function resolveExchangeForTransaction(transactionId) {
  return new Promise((resolve, reject) => {
    getParentChain(transactionId).then((chain) => {
      // La cadena incluye la propia transacción + ancestros; buscar el primer
      // eslabón que sea débito/crédito de un exchange.
      const ids = chain.map((c) => c.id);
      if (ids.length === 0) return resolve(null);
      const placeholders = ids.map(() => '?').join(',');
      db.get(
        `SELECT id, debit_transaction_id AS debitId, credit_transaction_id AS creditId
         FROM exchanges
         WHERE debit_transaction_id IN (${placeholders}) OR credit_transaction_id IN (${placeholders})
         LIMIT 1`,
        [...ids, ...ids],
        (err, row) => {
          if (err) return reject(err);
          if (!row) return resolve(null);
          resolve({ exchangeId: row.id });
        }
      );
    }).catch(reject);
  });
}

// === Helpers promisificados para editar/eliminar ===
function runDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) return reject(err);
      resolve({ lastID: this.lastID, changes: this.changes });
    });
  });
}
function getDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
  });
}
function allDb(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// Obtiene una transacción con datos de billetera y categoría (incluso si está borrada).
function getTransactionRow(id) {
  return getDb(
    `SELECT
       t.id,
       t.wallet_id AS walletId,
       t.category_id AS categoryId,
       t.type,
       t.amount,
       t.description,
       t.date,
       t.time,
       t.fee,
       t.parent_transaction_id AS parentId,
       t.deleted AS deleted,
       w.name AS walletName,
       w.currency AS currency,
       w.balance AS walletBalance,
       c.name AS category
     FROM transactions t
     JOIN wallets w ON w.id = t.wallet_id
     JOIN categories c ON c.id = t.category_id
     WHERE t.id = ?`,
    [id]
  );
}

// Fecha mínima entre los hijos (no borrados) de una transacción.
function getMinChildDate(parentId) {
  return getDb(
    `SELECT MIN(date) AS minDate, MIN(
       CASE
         WHEN time IS NOT NULL AND time != '' THEN date || 'T' || time
         ELSE date || 'T23:59:59'
       END
     ) AS minDateTime FROM transactions WHERE parent_transaction_id = ? AND deleted = 0`,
    [parentId]
  );
}

// Convierte una fecha/hora a un string comparable lexicográficamente.
// `time` puede ser HH:MM, HH:MM:SS, vacío o null. Si falta, se usa 23:59:59
// (el final del día) para que una transacción sin hora se considere después de
// cualquier otra con hora ese mismo día.
function dtKey(date, time) {
  const t = (typeof time === 'string' && time !== '') ? time : '23:59:59';
  const normalized = t.length === 5 ? `${t}:00` : t;
  return `${date}T${normalized}`;
}

// Comunica la categoría fee/exchange por nombre según tipo de categoría usada.
function isSystemCategoryName(name) {
  return ['fee', 'exchange_out', 'exchange_in'].includes(String(name));
}

// Recalcula transactions.fee del padre y exchanges.fee si el padre es débito,
// a partir de la suma de sus transacciones hijas categoría fee.
function syncParentFee(parentId) {
  return new Promise(async (resolve, reject) => {
    try {
      await runDb(
        `UPDATE transactions SET fee = COALESCE((
           SELECT SUM(t.amount) FROM transactions t
           JOIN categories c ON c.id = t.category_id
           WHERE t.parent_transaction_id = transactions.id AND c.name = 'fee' AND t.deleted = 0
         ), 0)
         WHERE id = ?`,
        [parentId]
      );
      await runDb(
        `UPDATE exchanges SET fee = COALESCE((
           SELECT SUM(t.amount) FROM transactions t
           JOIN categories c ON c.id = t.category_id
           WHERE t.parent_transaction_id = exchanges.debit_transaction_id AND c.name = 'fee' AND t.deleted = 0
         ), 0)
         WHERE debit_transaction_id = ?`,
        [parentId]
      );
      resolve();
    } catch (e) {
      reject(e);
    }
  });
}

// Efecto de una transacción sobre el balance de la billetera.
function balanceEffect(type, amount) {
  return type === 'income' ? Number(amount) : -Number(amount);
}

// === Endpoints de acciones en el detalle de transacción ===

// PUT /api/transactions/:id — editar descripción, monto, fecha y categoría.
// Reglas: bloqueado en transacciones de exchange (débito/crédito/fees).
// En un fee: se edita su monto/descripción/fecha, pero NO la categoría.
// Fecha: no menor a la del padre (si tiene) y no mayor a la mínima de sus hijos.
// Al cambiar el monto se recalcula el balance de la billetera.
app.put('/api/transactions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const t = await getTransactionRow(id);
    if (!t || t.deleted) return res.status(404).json({ error: 'Transacción no encontrada' });

    const exInfo = await resolveExchangeForTransaction(id);
    if (exInfo) {
      return res.status(400).json({ error: 'Esta transacción pertenece a un exchange. Edítala desde el panel de exchange (feature futuro).' });
    }

    const { description, amount, date, time, categoryName } = req.body;

    // Fecha + hora
    let newDate = t.date;
    let newTime = t.time || null;
    if (date != null && date !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
      }
      newDate = date;
    }
    if (time != null && time !== '') {
      if (!isValidTime(time)) {
        return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
      }
      newTime = time.length === 5 ? `${time}:00` : time;
    } else if (time === '') {
      newTime = null;
    }
    if (t.parentId != null) {
      const parent = await getTransactionRow(t.parentId);
      if (parent && dtKey(newDate, newTime) < dtKey(parent.date, parent.time)) {
        return res.status(400).json({ error: `La fecha/hora no puede ser anterior a la de su transacción padre (${parent.date}${parent.time ? ' ' + parent.time : ''}).` });
      }
    }
    const minChild = await getMinChildDate(id);
    if (minChild && minChild.minDateTime != null && dtKey(newDate, newTime) > minChild.minDateTime) {
      const childLabel = minChild.minDate != null ? `${minChild.minDate}` : '';
      return res.status(400).json({ error: `La fecha/hora no puede ser posterior a la de sus transacciones asociadas (${childLabel}).` });
    }

    // Monto
    let newAmount = Number(t.amount);
    let amountChanged = false;
    if (amount != null && amount !== '') {
      const parsed = Number(amount);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
      }
      newAmount = parsed;
      amountChanged = newAmount !== Number(t.amount);
    }

    // Categoría: solo en no-fee y no-exchange
    let newCategoryId = t.categoryId;
    if (categoryName != null && categoryName !== '' && categoryName !== t.category) {
      if (t.category === 'fee') {
        return res.status(400).json({ error: 'La categoría de una comisión (fee) no se puede cambiar.' });
      }
      if (isSystemCategoryName(categoryName)) {
        return res.status(400).json({ error: 'No puedes asignar categorías del sistema (fee, exchange).' });
      }
      // Si no existe, se crea automáticamente (getOrCreateCategory).
      const cat = await getOrCreateCategory(categoryName, t.type);
      newCategoryId = cat.id;
    }

    const newDescription = description !== undefined ? (description || '') : t.description;

    if (amountChanged) {
      const oldEffect = balanceEffect(t.type, t.amount);
      const newEffect = balanceEffect(t.type, newAmount);
      const delta = newEffect - oldEffect;
      await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) + delta, t.walletId]);
    }

    await runDb('UPDATE transactions SET description = ?, amount = ?, date = ?, time = ?, category_id = ? WHERE id = ?', [newDescription, newAmount, newDate, newTime, newCategoryId, id]);

    // Si es un fee, re-sincronizar el fee del padre / exchange
    if (t.category === 'fee' && t.parentId != null) {
      await syncParentFee(t.parentId);
    }

    res.json({ success: true, message: 'Transacción actualizada' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/transactions/:id — eliminar virtualmente (soft-delete).
// Reglas: bloqueado en transacciones de exchange. Si tiene asociadas,
// pide eliminarlas primero. Revertir el balance al quitar la transacción.
// Un fee se puede eliminar (re-sincroniza el fee del padre / exchange).
app.delete('/api/transactions/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const t = await getTransactionRow(id);
    if (!t || t.deleted) return res.status(404).json({ error: 'Transacción no encontrada' });

    const exInfo = await resolveExchangeForTransaction(id);
    if (exInfo) {
      return res.status(400).json({ error: 'Esta transacción pertenece a un exchange. Elimínala desde el panel de exchange (feature futuro).' });
    }

    const child = await getDb('SELECT id FROM transactions WHERE parent_transaction_id = ? AND deleted = 0 LIMIT 1', [id]);
    if (child) {
      return res.status(400).json({ error: 'No se puede eliminar: primero elimina sus transacciones asociadas.' });
    }

    const effect = balanceEffect(t.type, t.amount);
    await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) - effect, t.walletId]);
    await runDb('UPDATE transactions SET deleted = 1 WHERE id = ?', [id]);

    if (t.category === 'fee' && t.parentId != null) {
      await syncParentFee(t.parentId);
    }

    res.json({ success: true, message: 'Transacción eliminada (virtualmente)' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/transactions/:id/fee — agregar una comisión (fee).
// SIEMPRE crea una fee NUEVA (no toca las existentes), con su misma cadena
// de heredad. Reglas: bloqueado en fees y en transacciones de exchange.
// Fecha opcional; por defecto la del padre y nunca menor a esta.
app.post('/api/transactions/:id/fee', async (req, res) => {
  try {
    const id = req.params.id;
    const t = await getTransactionRow(id);
    if (!t || t.deleted) return res.status(404).json({ error: 'Transacción no encontrada' });

    if (t.category === 'fee') {
      return res.status(400).json({ error: 'No puedes agregar comisión a una comisión (fee).' });
    }
    const exInfo = await resolveExchangeForTransaction(id);
    if (exInfo) {
      return res.status(400).json({ error: 'Esta transacción pertenece a un exchange. No puedes agregarle comisión desde aquí.' });
    }

    const { amount, date, time } = req.body;
    const feeAmount = Number(amount);
    if (!Number.isFinite(feeAmount) || feeAmount <= 0) {
      return res.status(400).json({ error: 'El monto de la comisión debe ser mayor a 0' });
    }

    let feeDate = t.date;
    let feeTime = null;
    if (date != null && date !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
      }
      feeDate = date;
    }
    if (time != null && time !== '') {
      if (!isValidTime(time)) {
        return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
      }
      feeTime = time.length === 5 ? `${time}:00` : time;
    } else if (time === '') {
      feeTime = null;
    }
    if (dtKey(feeDate, feeTime) < dtKey(t.date, t.time)) {
      return res.status(400).json({ error: `La fecha/hora de la comisión no puede ser anterior a la de su transacción (${t.date}${t.time ? ' ' + t.time : ''}).` });
    }

    const feeCat = await getDb("SELECT id FROM categories WHERE name = 'fee' AND type = 'expense' AND isActive = 1", []);
    if (!feeCat) return res.status(400).json({ error: 'Categoría fee no disponible' });

    if (Number(t.walletBalance) < feeAmount) {
      return res.status(400).json({ error: `Fondos insuficientes. Balance actual: ${t.walletBalance} ${t.currency}, necesita ${feeAmount}` });
    }

    await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) - feeAmount, t.walletId]);
    const ins = await runDb(
      `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, time, exchange_rate, converted_amount, fee, parent_transaction_id)
       VALUES (?, ?, 'expense', ?, ?, ?, ?, 1.0, ?, 0, ?)`,
      [t.walletId, feeCat.id, feeAmount, `Comisión: ${t.description || t.category}`, feeDate, feeTime, feeAmount, id]
    );

    await syncParentFee(id);

    res.json({ success: true, message: 'Comisión agregada', feeId: ins.lastID });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// POST /api/transactions/:id/associate — crear una transacción asociada (hija).
// Reglas: cualquier tipo excepto sistema (fee, exchange). Bloqueado en fees
// y en transacciones de exchange. Recalc balance según tipo.
app.post('/api/transactions/:id/associate', async (req, res) => {
  try {
    const id = req.params.id;
    const t = await getTransactionRow(id);
    if (!t || t.deleted) return res.status(404).json({ error: 'Transacción no encontrada' });

    if (t.category === 'fee') {
      return res.status(400).json({ error: 'No puedes crear transacciones asociadas a una comisión (fee).' });
    }
    const exInfo = await resolveExchangeForTransaction(id);
    if (exInfo) {
      return res.status(400).json({ error: 'Esta transacción pertenece a un exchange. No puedes crearle transacciones asociadas desde aquí.' });
    }

    const { amount, type, categoryName, description, date, time } = req.body;
    const parsedAmount = Number(amount);
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
    }
    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'type debe ser income o expense' });
    }
    if (isSystemCategoryName(categoryName)) {
      return res.status(400).json({ error: 'No puedes usar categorías del sistema (fee, exchange).' });
    }
    // Si no existe, se crea automáticamente (getOrCreateCategory).
    const cat = await getOrCreateCategory(categoryName, type);

    let assocDate = t.date;
    let assocTime = null;
    if (date != null && date !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
      }
      assocDate = date;
    }
    if (time != null && time !== '') {
      if (!isValidTime(time)) {
        return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
      }
      assocTime = time.length === 5 ? `${time}:00` : time;
    } else if (time === '') {
      assocTime = null;
    }
    if (dtKey(assocDate, assocTime) < dtKey(t.date, t.time)) {
      return res.status(400).json({ error: `La fecha/hora de la transacción asociada no puede ser anterior a la de su padre (${t.date}${t.time ? ' ' + t.time : ''}).` });
    }

    const effect = balanceEffect(type, parsedAmount);
    if (effect < 0 && Number(t.walletBalance) < parsedAmount) {
      return res.status(400).json({ error: `Fondos insuficientes. Balance actual: ${t.walletBalance} ${t.currency}, necesita ${parsedAmount}` });
    }
    await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [Number(t.walletBalance) + effect, t.walletId]);

    const ins = await runDb(
      `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, time, exchange_rate, converted_amount, fee, parent_transaction_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1.0, ?, 0, ?)`,
      [t.walletId, cat.id, type, parsedAmount, description || '', assocDate, assocTime, parsedAmount, id]
    );

    res.json({ success: true, message: 'Transacción asociada creada', associateId: ins.lastID });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Exchanges con transacciones separadas
app.post('/api/exchanges', async (req, res) => {
  try {
    const { fromWalletId, toWalletId, fromAmount, toAmount, description, fee, date, time } = req.body;
    
    console.log('💱 Procesando exchange:', { fromWalletId, toWalletId, fromAmount, toAmount, fee, date });
    
    // Validaciones básicas
    if (!fromWalletId || !toWalletId || !fromAmount || !toAmount) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: fromWalletId, toWalletId, fromAmount, toAmount' 
      });
    }
    
    if (fromWalletId === toWalletId) {
      return res.status(400).json({ error: 'Las billeteras origen y destino deben ser diferentes' });
    }
    
    if (fromAmount <= 0 || toAmount <= 0) {
      return res.status(400).json({ error: 'Los montos deben ser mayores a 0' });
    }
    
    // Fecha opcional para el exchange (débito/crédito). Sin fecha => hoy.
    if (date != null && date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
    }
    if (!isValidTime(time)) {
      return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
    }
    const txDate = typeof date === 'string' && date !== '' ? date : undefined;
    const txTime = typeof time === 'string' && time !== '' ? (time.length === 5 ? `${time}:00` : time) : undefined;
    
    // Obtener información de wallets
    const [fromWallet, toWallet] = await Promise.all([
      new Promise((resolve, reject) => {
        db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [fromWalletId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      }),
      new Promise((resolve, reject) => {
        db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [toWalletId], (err, row) => {
          if (err) reject(err);
          else resolve(row);
        });
      })
    ]);
    
    if (!fromWallet) throw new Error('Billetera origen no encontrada');
    if (!toWallet) throw new Error('Billetera destino no encontrada');
    
    // Validar fondos en origen: monto + comisión (la comisión es EXTRA)
    const commission = Number(fee) || 0;
    const fromTotal = fromAmount + commission;
    if (fromWallet.balance < fromTotal) {
      throw new Error(`Fondos insuficientes en ${fromWallet.name}. Balance actual: ${fromWallet.balance} ${fromWallet.currency}, necesita ${fromTotal}`);
    }
    
    // Calcular tasa: SOLO con el monto, la comisión NO afecta la tasa.
    // Ej: 100 USD -> 87.000 VES = 870 bs/$, con comisión 3.75 aparte.
    const rate = toAmount / fromAmount;

    // Crear transacción de débito (exchange_out): descontará fromAmount + fee, creando
    // además una transacción separada tipo fee con la comisión.
    const debitTransaction = await createTransaction(
      fromWalletId,
      'exchange_out',
      'expense',
      fromAmount,
      `${description || 'Exchange'} → ${toWallet.name}`,
      commission,
      txDate,
      txTime
    );
    
    // Crear transacción de crédito (exchange_in)
    const creditTransaction = await createTransaction(
      toWalletId,
      'exchange_in',
      'income',
      toAmount,
      `${description || 'Exchange'} ← ${fromWallet.name}`,
      0,
      txDate,
      txTime
    );
    
    // Registrar metadata del exchange
    db.run(
      `INSERT INTO exchanges (debit_transaction_id, credit_transaction_id, from_wallet_id, to_wallet_id, 
       from_amount, to_amount, rate, fee, description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        debitTransaction.id,
        creditTransaction.id,
        fromWalletId,
        toWalletId,
        fromAmount,
        toAmount,
        rate,
        commission,
        description || ''
      ],
      function(err) {
        if (err) {
          console.error('Error registrando exchange:', err);
          return res.status(500).json({ error: 'Error interno del servidor' });
        }
        
        const exchangeId = this.lastID;
        
        res.json({
          success: true,
          message: 'Exchange registrado exitosamente',
          exchange: {
            id: exchangeId,
            rate,
            fromWallet: fromWallet.name,
            toWallet: toWallet.name,
            fromAmount,
            toAmount,
            fromCurrency: fromWallet.currency,
            toCurrency: toWallet.currency,
            description: description || ''
          },
          transactions: {
            debit: debitTransaction,
            credit: creditTransaction
          }
        });
      }
    );
    
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.get('/api/exchanges', (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(req.query.limit, 10) || 20, 1), 100);
  const offset = (page - 1) * limit;

  // Rango de fechas (from/to opcionales; period presets) — igual que en transacciones
  const { from, to, period } = req.query;
  let fromDate = from;
  let toDate = to;
  if (!fromDate || !toDate) {
    if (!period) {
      // Sin filtro: mostrar todo el historial
      fromDate = '1970-01-01';
      toDate = '9999-12-31';
    } else {
      const now = new Date();
      toDate = now.toISOString().split('T')[0];
      if (period === 'day') fromDate = toDate;
      else if (period === 'week') { const d = new Date(now); d.setDate(d.getDate() - 7); fromDate = d.toISOString().split('T')[0]; }
      else if (period === 'month') { const d = new Date(now); d.setDate(1); fromDate = d.toISOString().split('T')[0]; }
      else if (period === '3m') { const d = new Date(now); d.setMonth(d.getMonth() - 3); fromDate = d.toISOString().split('T')[0]; }
      else if (period === 'year') { const d = new Date(now); d.setMonth(d.getMonth() - 12); fromDate = d.toISOString().split('T')[0]; }
      else fromDate = '1970-01-01';
    }
  }

  const conditions = ["COALESCE(dt.date, '') >= ?", "COALESCE(dt.date, '') <= ?", 'e.deleted = 0'];
  const params = [fromDate, toDate, limit, offset];

  const query = `
    SELECT
      e.id,
      e.from_wallet_id AS fromWalletId,
      e.to_wallet_id AS toWalletId,
      e.from_amount AS fromAmount,
      e.to_amount AS toAmount,
      e.rate,
      e.debit_transaction_id AS debitTransactionId,
      e.credit_transaction_id AS creditTransactionId,
      e.fee,
      e.description,
      e.created_at AS createdAt,
      dt.date AS date,
      dt.time AS time,
      from_wallet.name AS fromWalletName,
      to_wallet.name AS toWalletName,
      from_wallet.currency AS fromCurrency,
      to_wallet.currency AS toCurrency
    FROM exchanges e
    JOIN wallets from_wallet ON from_wallet.id = e.from_wallet_id
    JOIN wallets to_wallet ON to_wallet.id = e.to_wallet_id
    LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id
    WHERE ${conditions.join(' AND ')}
    ORDER BY COALESCE(dt.date, '1970-01-01') DESC, COALESCE(dt.time, '') DESC, e.created_at DESC, e.id DESC
    LIMIT ? OFFSET ?`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT COUNT(*) AS total FROM exchanges e LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id WHERE ${conditions.join(' AND ')}`, [fromDate, toDate], (countErr, result) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      res.json({ data: rows || [], total: result?.total || 0, page, limit });
    });
  });
});

// Detalle de un exchange (GET /api/exchanges/:id)
app.get('/api/exchanges/:id', (req, res) => {
  const id = Number.parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'ID inválido' });
  }

  const query = `
    SELECT
      e.id,
      e.from_wallet_id AS fromWalletId,
      e.to_wallet_id AS toWalletId,
      e.from_amount AS fromAmount,
      e.to_amount AS toAmount,
      e.rate,
      e.fee,
      e.description,
      e.created_at AS createdAt,
      e.debit_transaction_id AS debitTransactionId,
      e.credit_transaction_id AS creditTransactionId,
      dt.date AS date,
      dt.time AS time,
      fw.name AS fromWalletName,
      tw.name AS toWalletName,
      fw.currency AS fromCurrency,
      tw.currency AS toCurrency
    FROM exchanges e
    JOIN wallets fw ON fw.id = e.from_wallet_id
    JOIN wallets tw ON tw.id = e.to_wallet_id
    LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id
    WHERE e.id = ? AND e.deleted = 0`;

  db.get(query, [id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.status(404).json({ error: 'Exchange no encontrado' });
    res.json(row);
  });
});

// Obtiene el débito y el crédito de un exchange junto con su wallet.
function getExchangeTransactions(exchange, tRow = {}) {
  return Promise.all([
    getExchangeTransactionRow(exchange.debitTransactionId),
    getExchangeTransactionRow(exchange.creditTransactionId),
  ]);
}

// Row de una transacción para edición de exchange (incluye wallet balance).
function getExchangeTransactionRow(id) {
  return getDb(
    `SELECT
       t.id,
       t.wallet_id AS walletId,
       t.type,
       t.amount,
       t.description,
       t.date,
       t.time,
       t.category_id AS categoryId,
       t.parent_transaction_id AS parentId,
       t.deleted AS deleted,
       c.name AS category,
       w.balance AS walletBalance
     FROM transactions t
     JOIN categories c ON c.id = t.category_id
     JOIN wallets w ON w.id = t.wallet_id
     WHERE t.id = ?`,
    [id]
  );
}

// Crea una transacción fee (hija del débito) con la fecha/hora del exchange.
// La comisión SIEMPRE es un gasto en la billetera del débito (origen).
async function createFeeForExchange(debit, amount, date, time, description) {
  const category = await getDb("SELECT id FROM categories WHERE name = 'fee' AND type = 'expense' AND isActive = 1");
  const fc = category ? category.id : debit.categoryId;
  await runDb(
    `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, time, exchange_rate, converted_amount, fee, parent_transaction_id)
     VALUES (?, ?, 'expense', ?, ?, ?, ?, 1.0, ?, 0, ?)`,
    [debit.walletId, fc, amount, `Comisión: ${description || 'Exchange'}`, date, time, amount, debit.id]
  );
}

// Elimina virtualmente todas las transacciones de un exchange (débito, crédito y fees)
// y devuelve el efecto neto por billetera para reajustar balances.
async function softDeleteExchangeTransactions(debit, credit) {  const txIds = [debit.id, credit.id];
  // Todos los fees (hijos del débito y del crédito, no borrados) también se borran.
  const fees = await allDb(
    `SELECT id, wallet_id AS walletId, type, amount, parent_transaction_id AS parentId
     FROM transactions
     WHERE parent_transaction_id IN (?, ?) AND deleted = 0`,
    [debit.id, credit.id]
  );
  fees.forEach((f) => txIds.push(f.id));

  // Efecto por billetera (los fees son gasto en su billetera).
  const byWallet = {};
  const applyEffect = (row) => {
    const key = String(row.walletId);
    if (!byWallet[key]) byWallet[key] = 0;
    byWallet[key] += balanceEffect(row.type, row.amount); // income suma, expense descuenta
  };
  applyEffect(debit);   // gasto (exchange_out)
  applyEffect(credit);  // ingreso (exchange_in)
  fees.forEach(applyEffect);

  for (const id of txIds) {
    if (!id) continue;
    await runDb('UPDATE transactions SET deleted = 1 WHERE id = ?', [id]);
  }
  return byWallet;
}

// PUT /api/exchanges/:id — editar montos, fee, fecha/hora y descripción.
// Las billeteras son FIJAS (no se pueden cambiar). Ajusta balances con el delta
// neto entre el estado anterior y el nuevo. La tasa se recalcula.
app.put('/api/exchanges/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

    const ex = await getDb(
      `SELECT id, debit_transaction_id AS debitTransactionId, credit_transaction_id AS creditTransactionId,
              from_wallet_id AS fromWalletId, to_wallet_id AS toWalletId,
              from_amount AS fromAmount, to_amount AS toAmount, rate, fee, description, deleted
       FROM exchanges WHERE id = ?`,
      [id]
    );
    if (!ex || ex.deleted) return res.status(404).json({ error: 'Exchange no encontrado' });

    const { fromAmount, toAmount, fee, description, date, time } = req.body;

    // ---- Captura del estado anterior ----
    const [debit, credit] = await getExchangeTransactions(ex);
    if (!debit || debit.deleted || !credit || credit.deleted) {
      return res.status(400).json({ error: 'El exchange tiene transacciones inconsistentes.' });
    }
    const fromWalletBalanceBefore = debit.walletBalance;
    const toWalletBalanceBefore = credit.walletBalance;

    // Nombres de billeteras para las descripciones de débito/crédito.
    const [fromWalletInfo, toWalletInfo] = await Promise.all([
      getDb('SELECT name FROM wallets WHERE id = ?', [ex.fromWalletId]),
      getDb('SELECT name FROM wallets WHERE id = ?', [ex.toWalletId]),
    ]);
    const debitWalletName = fromWalletInfo ? fromWalletInfo.name : 'origen';
    const creditWalletName = toWalletInfo ? toWalletInfo.name : 'destino';

    // Fees previos (hijos del débito y del crédito).
    const prevFees = await allDb(
      `SELECT t.id, t.wallet_id AS walletId, t.type, t.amount, t.parent_transaction_id AS parentId
       FROM transactions t JOIN categories c ON c.id = t.category_id
       WHERE t.parent_transaction_id IN (?, ?) AND c.name = 'fee' AND t.deleted = 0`,
      [debit.id, credit.id]
    );

    // ---- Validaciones ----
    // Nuevo monto origen (por defecto el actual).
    let newFromAmount = Number(ex.fromAmount);
    let newToAmount = Number(ex.toAmount);
    if (fromAmount != null && fromAmount !== '') {
      const parsed = Number(fromAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
      newFromAmount = parsed;
    }
    if (toAmount != null && toAmount !== '') {
      const parsed = Number(toAmount);
      if (!Number.isFinite(parsed) || parsed <= 0) return res.status(400).json({ error: 'El monto debe ser mayor a 0' });
      newToAmount = parsed;
    }

    let newFee = Number(ex.fee) || 0;
    let feeChanged = false;
    if (fee != null && fee !== '') {
      const parsed = Number(fee);
      if (!Number.isFinite(parsed) || parsed < 0) return res.status(400).json({ error: 'La comisión no puede ser negativa' });
      newFee = parsed;
      feeChanged = newFee !== (Number(ex.fee) || 0);
    }

    // Fecha + hora (regla: misma para débito y crédito, y para fees asociados).
    let newDate = debit.date || credit.date;
    let newTime = debit.time || credit.time || null;
    if (date != null && date !== '') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'Fecha inválida, use formato YYYY-MM-DD' });
      newDate = date;
    }
    if (time != null && time !== '') {
      if (!isValidTime(time)) return res.status(400).json({ error: 'Hora inválida, use formato HH:MM (00-23:00-59)' });
      newTime = time.length === 5 ? `${time}:00` : time;
    } else if (time === '') {
      newTime = null;
    }

    const newDescription = description !== undefined ? (description || '') : ex.description;

    // Validación de balance origen: monto + comisión nueva no supera balance (solo si sube).
    const newFromTotal = newFromAmount + newFee;
    if (fromWalletBalanceBefore < newFromTotal) {
      return res.status(400).json({
        error: `Fondos insuficientes en la billetera origen. Balance: ${fromWalletBalanceBefore}, requiere ${newFromTotal}`
      });
    }

    // ---- Recalcular balances con el delta neto ----
    // Efecto anterior sobre el origen: -(fromAmount) - (suma de fees previos)
    const prevFromFeeTotal = prevFees.reduce((s, f) => s + Number(f.amount), 0);
    const oldFromEffect = -(Number(ex.fromAmount)) - prevFromFeeTotal;
    const oldToEffect = Number(ex.toAmount);
    const newFromEffect = -(newFromAmount) - newFee; // fee nuevo duplica el descuento si cambió y hay fee
    const newToEffect = newToAmount;

    // Nota: cuando fee NO cambió, newFee == prevFromFeeTotal, así que newFromEffect
    // captura correctamente el descuento del fee (si lo hay). Evitamos doble conteo
    // creando la transacción fee solo cuando viene de 0.
    const fromDelta = newFromEffect - oldFromEffect;
    const toDelta = newToEffect - oldToEffect;

    await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [fromWalletBalanceBefore + fromDelta, ex.fromWalletId]);
    await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [toWalletBalanceBefore + toDelta, ex.toWalletId]);

    const newRate = newToAmount / newFromAmount;

    // ---- Actualizar débito ----
    const debitDesc = `${newDescription || 'Exchange'} → ${creditWalletName || 'destino'}`;
    await runDb(
      `UPDATE transactions SET amount = ?, description = ?, date = ?, time = ? WHERE id = ?`,
      [newFromAmount, debitDesc, newDate, newTime, debit.id]
    );

    // ---- Actualizar crédito ----
    const creditDesc = `${newDescription || 'Exchange'} ← ${debitWalletName || 'origen'}`;
    await runDb(
      `UPDATE transactions SET amount = ?, description = ?, date = ?, time = ? WHERE id = ?`,
      [newToAmount, creditDesc, newDate, newTime, credit.id]
    );

    // ---- Manejo del fee ----
    // 1) Cambios de monto / creación / eliminación del fee.
    let feesAlive = [...prevFees]; // fees que siguen vigentes tras el cambio
    if (feeChanged) {
      if (newFee > 0 && prevFees.length === 0) {
        // fee 0 -> >0: crear fee nuevo hijo del débito con la fecha/hora del exchange.
        await createFeeForExchange(debit, newFee, newDate, newTime, newDescription);
        feesAlive = [];
      } else if (newFee === 0) {
        // fee >0 -> 0: eliminar virtualmente todos los fees.
        for (const f of prevFees) {
          await runDb('UPDATE transactions SET deleted = 1 WHERE id = ?', [f.id]);
        }
        feesAlive = [];
      } else {
        // fee >0 -> otro >0: actualizar el monto del primer fee; borrar adicionales.
        const firstFee = prevFees[0];
        await runDb('UPDATE transactions SET amount = ? WHERE id = ?', [newFee, firstFee.id]);
        for (const f of prevFees.slice(1)) {
          await runDb('UPDATE transactions SET deleted = 1 WHERE id = ?', [f.id]);
        }
        feesAlive = [firstFee];
      }
    }
    // 2) Sincronizar fecha/hora de los fees que quedan vivos: el fee comparte la
    //    fecha/hora del exchange, incluso cuando NO cambió el monto del fee.
    for (const f of feesAlive) {
      await runDb('UPDATE transactions SET date = ?, time = ? WHERE id = ?', [newDate, newTime, f.id]);
    }

    // ---- Actualizar metadata del exchange ----
    await runDb(
      `UPDATE exchanges SET from_amount = ?, to_amount = ?, rate = ?, fee = ?, description = ? WHERE id = ?`,
      [newFromAmount, newToAmount, newRate, newFee, newDescription || '', id]
    );

    // Re-sincronizar fee denormalizado a partir de los fees hijos.
    await syncParentFee(debit.id);

    res.json({ success: true, message: 'Exchange actualizado' });
  } catch (e) {
    console.error('Error actualizando exchange:', e);
    res.status(500).json({ error: e.message });
  }
});

// DELETE /api/exchanges/:id — eliminar virtualmente el exchange y sus transacciones.
app.delete('/api/exchanges/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'ID inválido' });

    const ex = await getDb(
      `SELECT id, debit_transaction_id AS debitTransactionId, credit_transaction_id AS creditTransactionId,
              from_wallet_id AS fromWalletId, to_wallet_id AS toWalletId, deleted
       FROM exchanges WHERE id = ?`,
      [id]
    );
    if (!ex || ex.deleted) return res.status(404).json({ error: 'Exchange no encontrado' });

    const [debit, credit] = await getExchangeTransactions(ex);
    if (!debit || !credit) {
      return res.status(400).json({ error: 'El exchange tiene transacciones inconsistentes.' });
    }

    // Revertir balance por billetera (devolver lo descontado, quitar lo sumado).
    const byWallet = await softDeleteExchangeTransactions(debit, credit);
    for (const walletId of Object.keys(byWallet)) {
      const wallet = await getDb('SELECT balance FROM wallets WHERE id = ?', [walletId]);
      if (!wallet) continue;
      // byWallet guarda el efecto: expense => -valor; para revertir sumamos el inverso.
      const newBalance = Number(wallet.balance) - byWallet[walletId];
      await runDb('UPDATE wallets SET balance = ? WHERE id = ?', [newBalance, walletId]);
    }

    await runDb('UPDATE exchanges SET deleted = 1 WHERE id = ?', [id]);

    res.json({ success: true, message: 'Exchange eliminado (virtualmente)' });
  } catch (e) {
    console.error('Error eliminando exchange:', e);
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/balance', (req, res) => {
  db.all('SELECT * FROM wallets WHERE isActive = 1', (err, wallets) => {
    if (err) return res.status(500).json({ error: err.message });
    
    const rates = getExchangeRates();
    const byCurrency = {};
    
    wallets.forEach(wallet => {
      const currency = wallet.currency;
      if (!byCurrency[currency]) {
        byCurrency[currency] = { currency, total: 0, walletCount: 0 };
      }
      byCurrency[currency].total += wallet.balance;
      byCurrency[currency].walletCount++;
    });
    
    let totalUSD = 0;
    const byCurrencyArray = Object.values(byCurrency).map(data => {
      const usdValue = data.total / rates[data.currency];
      totalUSD += usdValue;
      return { ...data, usdValue, rate: rates[data.currency] };
    });
    
    res.json({
      totalUSD: parseFloat(totalUSD.toFixed(2)),
      byCurrency: byCurrencyArray,
      timestamp: new Date().toISOString(),
    });
  });
});

// Tasas de cambio centralizadas (única fuente de verdad)
// TODO: cuando exista un proveedor real, reemplazar aquí sin tocar el resto
function getExchangeRates() {
  return { USD: 1, VES: 635, EUR: 1.07 };
}

// Endpoint para que el frontend obtenga las tasas en vez de hardcodearlas
app.get('/api/exchange-rates', (req, res) => {
  res.json({
    rates: getExchangeRates(),
    timestamp: new Date().toISOString(),
  });
});

// Obtener la tasa vigente (bcv por defecto) para una fecha; usada para convertir VES a USD en el frontend
app.get('/api/rates/effective', async (req, res) => {
  const type = req.query.type === 'paralelo' ? 'paralelo' : 'bcv';
  const date = req.query.date;
  const rate = await getRateForDate(date || new Date().toISOString().split('T')[0], type);
  res.json({ date: date || new Date().toISOString().split('T')[0], rate, type });
});

// === CRUD de tasas diarias (daily_rates) ===

// Listar todas las tasas diarias (descendente por fecha)
app.get('/api/daily-rates', (req, res) => {
  db.all('SELECT * FROM daily_rates ORDER BY date DESC', (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ data: rows || [] });
  });
});

// Obtener/crear la tasa de hoy (usada al cargar la página)
// 1) busca en BD, 2) si no existe consulta API y guarda, 3) si falla error
app.get('/api/daily-rates/today', async (req, res) => {
  const result = await getTodayRate();
  if (result.error) return res.status(503).json({ error: result.error });
  res.json({ data: result });
});

// Crear una tasa manual para una fecha
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

// Actualizar una tasa existente
app.put('/api/daily-rates/:id', (req, res) => {
  const { bcv, paralelo } = req.body;
  if (bcv == null || paralelo == null) {
    return res.status(400).json({ error: 'Faltan campos: bcv, paralelo' });
  }
  db.run('UPDATE daily_rates SET bcv = ?, paralelo = ? WHERE id = ?',
    [Number(bcv), Number(paralelo), req.params.id],
    function (err) {
      if (err) return res.status(500).json({ error: err.message });
      if (this.changes === 0) return res.status(404).json({ error: 'Tasa no encontrada' });
      res.json({ success: true, message: 'Tasa actualizada' });
    }
  );
});

// Eliminar una tasa
app.delete('/api/daily-rates/:id', (req, res) => {
  db.run('DELETE FROM daily_rates WHERE id = ?', [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: 'Tasa no encontrada' });
    res.json({ success: true, message: 'Tasa eliminada' });
  });
});

// Estadísticas para el dashboard (forma esperada por el frontend)
// ?rate=bcv (default) | paralelo — convierte VES a USD usando la tasa diaria registrada
app.get('/api/stats', async (req, res) => {
  const rateType = req.query.rate === 'paralelo' ? 'paralelo' : 'bcv';

  // Rango de fechas (from/to explícitos o preset por period)
  const { from, to, period } = req.query;
  let fromDate = from;
  let toDate = to;
  if (!fromDate || !toDate) {
    const now = new Date();
    toDate = now.toISOString().split('T')[0];
    if (!period || period === 'all' || period === '') {
      fromDate = '1970-01-01';
    } else {
      const d = new Date(now);
      if (period === '1m') d.setMonth(d.getMonth() - 1);
      else if (period === '3m') d.setMonth(d.getMonth() - 3);
      else if (period === '6m') d.setMonth(d.getMonth() - 6);
      else if (period === '1y') d.setMonth(d.getMonth() - 12);
      else { fromDate = '1970-01-01'; }
      if (fromDate === '1970-01-01') fromDate = d.toISOString().split('T')[0];
    }
  }

  try {
    const rows = await new Promise((resolve, reject) => {
      db.all("SELECT t.type, t.amount, t.date, c.name AS category, c.type AS categoryType, w.currency, w.name AS walletName FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN wallets w ON w.id = t.wallet_id WHERE COALESCE(t.date, '') >= ? AND COALESCE(t.date, '') <= ?", [fromDate, toDate], (err, r) => err ? reject(err) : resolve(r));
    });

    let total_income = 0;
    let total_expense = 0;
    let transaction_count = rows?.length || 0;

    const monthlyMap = new Map();
    const categoryMap = new Map();
    // Cache de tasas por fecha (evita consultas repetidas)
    const rateCache = new Map();

    const getRate = async (date) => {
      if (rateCache.has(date)) return rateCache.get(date);
      const rate = await getRateForDate(date, rateType);
      rateCache.set(date, rate);
      return rate;
    };

    for (const row of (rows || [])) {
      const usdValue = await (async () => {
        if (row.currency === 'VES') {
          const rate = await getRate(row.date);
          return rate ? Number(row.amount) / rate : 0;
        }
        return Number(row.amount) || 0;
      })();

      if (row.type === 'income') total_income += usdValue;
      else if (row.type === 'expense') total_expense += usdValue;

      let month = 'Desconocido';
      if (row.date) {
        const d = new Date(row.date);
        if (!isNaN(d.getTime())) month = d.toISOString().slice(0, 7);
      }
      if (!monthlyMap.has(month)) {
        monthlyMap.set(month, { month, income: 0, expense: 0, transactionCount: 0 });
      }
      const m = monthlyMap.get(month);
      m.transactionCount++;
      if (row.type === 'income') m.income += usdValue;
      else if (row.type === 'expense') m.expense += usdValue;

      const cat = row.category || 'Sin categoría';
      if (!categoryMap.has(cat)) {
        categoryMap.set(cat, { category: cat, count: 0, total: 0, expenseOnly: row.categoryType === 'expense' });
      }
      const c = categoryMap.get(cat);
      c.count++;
      if (row.type === 'expense') c.total += usdValue;
    }

    const monthly = Array.from(monthlyMap.values())
      .sort((a, b) => a.month.localeCompare(b.month))
      .map((m) => ({
        ...m,
        income: parseFloat(m.income.toFixed(2)),
        expense: parseFloat(m.expense.toFixed(2)),
        net: parseFloat((m.income - m.expense).toFixed(2)),
      }));

    // Solo categorías de tipo gasto aparecen en "Gastos por Categoría"
    const byCategory = Array.from(categoryMap.values())
      .filter((c) => c.expenseOnly)
      .map((c) => ({
        category: c.category,
        count: c.count,
        total: parseFloat(c.total.toFixed(2)),
      }))
      .sort((a, b) => b.total - a.total);
    // Suma total de gastos por categoría (coincide con total_expense)
    const byCategoryTotal = byCategory.reduce((s, c) => s + c.total, 0);

    // Estadísticas de exchange SERVER-SIDE, en USD y dentro del rango de fechas
    const exchangeRows = await new Promise((resolve, reject) => {
      db.all(`SELECT
          e.from_amount AS fromAmount,
          e.to_amount AS toAmount,
          e.rate,
          e.fee,
          fw.currency AS fromCurrency,
          tw.currency AS toCurrency,
          dt.date AS date
        FROM exchanges e
        JOIN wallets fw ON fw.id = e.from_wallet_id
        JOIN wallets tw ON tw.id = e.to_wallet_id
        LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id
        WHERE e.deleted = 0 AND COALESCE(dt.date, '') >= ? AND COALESCE(dt.date, '') <= ?`,
        [fromDate, toDate], (err, r) => err ? reject(err) : resolve(r || []));
    });
    let totalFromUSD = 0;
    let totalToUSD = 0;
    let totalFeeUSD = 0;
    let totalExchanges = exchangeRows.length;
    // Spread = (to_rate / market_rate - 1); mercado = de la fecha (bcv/paralelo)
    // Acumulamos el spread total y el conteo real para promediar
    let spreadSum = 0;
    let spreadCount = 0;
    const exchangeRateCache = new Map();
    const getExRate = async (date) => {
      if (exchangeRateCache.has(date)) return exchangeRateCache.get(date);
      const r = await getRateForDate(date, rateType);
      exchangeRateCache.set(date, r);
      return r;
    };
    for (const ex of exchangeRows) {
      const fromUsd = ex.fromCurrency === 'VES' && ex.rate != null && ex.rate !== 0
        ? Number(ex.fromAmount) / Number(ex.rate)
        : (ex.fromCurrency === 'VES' ? 0 : Number(ex.fromAmount) || 0);
      const toUsd = ex.toCurrency === 'VES' && ex.rate != null && ex.rate !== 0
        ? Number(ex.toAmount) / Number(ex.rate)
        : (ex.toCurrency === 'VES' ? 0 : Number(ex.toAmount) || 0);
      totalFromUSD += fromUsd;
      totalToUSD += toUsd;
      // Comisión: convertir fee a USD según la moneda de origen
      if (ex.fee) {
        const feeUsd = ex.fromCurrency === 'VES' && ex.rate != null && ex.rate !== 0
          ? Number(ex.fee) / Number(ex.rate)
          : Number(ex.fee) || 0;
        totalFeeUSD += feeUsd;
      }
      // Spread: si hay tasa de mercado del día, compararla con la tasa del exchange
      if (ex.rate != null && Number(ex.rate) > 0 && ex.date) {
        const market = await getExRate(ex.date.split('T')[0]);
        if (market && Number(market) > 0) {
          // Para VES->USD u otras, spread razonable = |market/rate - 1|
          const spread = Math.abs(Number(market) / Number(ex.rate) - 1) * 100;
          spreadSum += spread;
          spreadCount++;
        }
      }
    }
    const averageSpread = spreadCount > 0 ? spreadSum / spreadCount : 0;
    const exchangeStats = {
      totalExchanges,
      averageSpread: parseFloat(averageSpread.toFixed(2)),
      totalFromAmount: parseFloat(totalFromUSD.toFixed(2)),
      totalToAmount: parseFloat(totalToUSD.toFixed(2)),
      totalFee: parseFloat(totalFeeUSD.toFixed(2)),
    };

    res.json({
      total_income: parseFloat(total_income.toFixed(2)),
      total_expense: parseFloat(total_expense.toFixed(2)),
      net_balance: parseFloat((total_income - total_expense).toFixed(2)),
      transaction_count,
      rateType,
      summary: {
        totalTransactions: transaction_count,
        totalIncome: parseFloat(total_income.toFixed(2)),
        totalExpenses: parseFloat(total_expense.toFixed(2)),
        net: parseFloat((total_income - total_expense).toFixed(2)),
      },
      monthly,
      byCategory,
      byCategoryTotal: parseFloat(byCategoryTotal.toFixed(2)),
      exchangeStats,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exportar la aplicación Express para testing (supertest)
function createServer() {
  return app;
}

module.exports = { createServer };

// Iniciar servidor solo si se ejecuta directamente (no al importarlo en tests)
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Servidor ejecutándose en: http://localhost:${port}`);
    console.log('📊 Health: GET /api/health');
    console.log('💾 Billeteras: GET /api/wallets');
    console.log('💸 Transacciones: POST /api/transactions');
    console.log('💱 Exchanges: POST /api/exchanges');
    console.log('💰 Balance: GET /api/balance');
    console.log('\n✨ Sistema completo con:');
    console.log('   • Exchanges generan transacciones separadas (débito/crédito)');
    console.log('   • Currency automático de wallets');
    console.log('   • Tasa de referencia (BCV/paralelo) desde daily_rates');
    console.log('   • Validación de fondos antes del exchange');
  });

  // Manejar cierre
  process.on('SIGINT', () => {
    console.log('\n👋 Cerrando servidor...');
    db.close();
    process.exit(0);
  });
}
