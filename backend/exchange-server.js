const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3002;

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
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (debit_transaction_id) REFERENCES transactions(id),
          FOREIGN KEY (credit_transaction_id) REFERENCES transactions(id),
          FOREIGN KEY (from_wallet_id) REFERENCES wallets(id),
          FOREIGN KEY (to_wallet_id) REFERENCES wallets(id)
        );
        INSERT INTO exchanges_new (id, debit_transaction_id, credit_transaction_id, from_wallet_id, to_wallet_id, from_amount, to_amount, rate, fee, description, created_at)
          SELECT id, debit_transaction_id, credit_transaction_id, from_wallet_id, to_wallet_id, from_amount, to_amount, rate, COALESCE(fee,0), description, created_at FROM exchanges;
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
        
        // 2. Obtener categoría
        db.get('SELECT * FROM categories WHERE name = ? AND type = ? AND isActive = 1', 
          [categoryName, type], (err, category) => {
            if (err) return reject(err);
            if (!category) return reject(new Error('Categoría no encontrada'));
            
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
          });
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
       WHERE t.wallet_id = ? AND t.date >= ? AND t.date <= ?
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

  const conditions = ['t.date >= ?', 't.date <= ?'];
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
    WHERE t.id = ?`,
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
              FROM transactions WHERE wallet_id = ?) AS total_net
           FROM transactions t
           WHERE t.wallet_id = ?
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
             WHERE t.parent_transaction_id = ?
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
              res.json({
                ...txRest,
                balanceAfter: balanceAfter != null ? parseFloat(balanceAfter.toFixed(2)) : null,
                children: children || [],
              });
            }
          );
        }
      );
    }
  );
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

  const conditions = ["COALESCE(dt.date, '') >= ?", "COALESCE(dt.date, '') <= ?"];
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
    ORDER BY COALESCE(dt.date, '1970-01-01'), COALESCE(dt.time, ''), e.created_at DESC, e.id DESC
    LIMIT ? OFFSET ?`;

  db.all(query, params, (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    db.get(`SELECT COUNT(*) AS total FROM exchanges e LEFT JOIN transactions dt ON dt.id = e.debit_transaction_id WHERE ${conditions.join(' AND ')}`, [fromDate, toDate], (countErr, result) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      res.json({ data: rows || [], total: result?.total || 0, page, limit });
    });
  });
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

  try {
    const rows = await new Promise((resolve, reject) => {
      db.all("SELECT t.type, t.amount, t.date, c.name AS category, w.currency, w.name AS walletName FROM transactions t LEFT JOIN categories c ON c.id = t.category_id LEFT JOIN wallets w ON w.id = t.wallet_id", (err, r) => err ? reject(err) : resolve(r));
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
        categoryMap.set(cat, { category: cat, count: 0, total: 0 });
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

    const byCategory = Array.from(categoryMap.values()).map((c) => ({
      ...c,
      total: parseFloat(c.total.toFixed(2)),
    }));

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
