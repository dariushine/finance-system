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
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
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
    market_rate DECIMAL(10,4),
    spread DECIMAL(5,2),
    fee DECIMAL(10,2) DEFAULT 0,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debit_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (credit_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (from_wallet_id) REFERENCES wallets(id),
    FOREIGN KEY (to_wallet_id) REFERENCES wallets(id)
  )`);

  // Migración: asegurar columnas opcionales de exchanges en DBs creadas antes de que existieran
  db.all(`PRAGMA table_info(exchanges)`, (err, cols) => {
    if (err) return;
    const names = (cols || []).map((c) => c.name);
    if (!names.includes('market_rate')) {
      db.run(`ALTER TABLE exchanges ADD COLUMN market_rate DECIMAL(10,4)`);
    }
    if (!names.includes('spread')) {
      db.run(`ALTER TABLE exchanges ADD COLUMN spread DECIMAL(5,2)`);
    }
    if (!names.includes('fee')) {
      db.run(`ALTER TABLE exchanges ADD COLUMN fee DECIMAL(10,2) DEFAULT 0`);
    }
  });
  db.all(`PRAGMA table_info(transactions)`, (err, cols) => {
    if (err) return;
    const names = (cols || []).map((c) => c.name);
    if (!names.includes('fee')) {
      db.run(`ALTER TABLE transactions ADD COLUMN fee DECIMAL(10,2) DEFAULT 0`);
    }
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
      ];
      
      const stmt = db.prepare('INSERT INTO categories (name, type, color) VALUES (?, ?, ?)');
      categories.forEach(cat => stmt.run(cat));
      stmt.finalize();
      console.log('✅ 17 categorías creadas (incluyendo exchange_out/in)');
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

// Obtener la tasa (bcv | paralelo) para una fecha dada; si no hay registro, usa la última disponible
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

function createTransaction(walletId, categoryName, type, amount, description, fee = 0) {
  return new Promise((resolve, reject) => {
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
            
            // 3. Validar fondos para gastos
            if (type === 'expense' && wallet.balance < amount) {
              return reject(new Error(`Fondos insuficientes. Balance actual: ${wallet.balance} ${wallet.currency}`));
            }
            
            // 4. Calcular nuevo balance
            const newBalance = type === 'expense' ? wallet.balance - amount : wallet.balance + amount;
            
            // 5. Crear transacción y actualizar balance en transacción
            db.run('BEGIN TRANSACTION');
            
            db.run(
              `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, exchange_rate, converted_amount, fee) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [walletId, category.id, type, amount, description || '', 
               new Date().toISOString().split('T')[0], 1.0, amount, fee || 0],
              function(err) {
                if (err) {
                  db.run('ROLLBACK');
                  return reject(err);
                }
                
                const transactionId = this.lastID;
                
                // Actualizar balance
                db.run('UPDATE wallets SET balance = ? WHERE id = ?', [newBalance, walletId], (err) => {
                  if (err) {
                    db.run('ROLLBACK');
                    return reject(err);
                  }
                  
                  db.run('COMMIT', () => {
                    resolve({
                      id: transactionId,
                      wallet: wallet.name,
                      currency: wallet.currency,
                      amount,
                      type,
                      newBalance,
                      category: category.name
                    });
                  });
                });
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

// Actualizar una billetera (campos editables)
app.put('/api/wallets/:id', (req, res) => {
  const { name, alias, balance, description, icon, color, type, currency } = req.body;
  db.get('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [req.params.id], (err, wallet) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!wallet) return res.status(404).json({ error: 'Billetera no encontrada' });

    const newName = name !== undefined ? name : wallet.name;
    const newAlias = alias !== undefined ? alias : wallet.alias;
    const newBalance = balance !== undefined ? Number(balance) : wallet.balance;
    const newDescription = description !== undefined ? description : wallet.description;
    const newIcon = icon !== undefined ? icon : wallet.icon;
    const newColor = color !== undefined ? color : wallet.color;
    // Moneda y tipo: solo se pueden cambiar si no hay transacciones asociadas (se valida aquí)
    // Por simplicidad y seguridad, permitimos cambiar descripción/nombre/alias/icono/color/balance

    db.run(
      `UPDATE wallets SET name = ?, alias = ?, balance = ?, description = ?, icon = ?, color = ? WHERE id = ?`,
      [newName, newAlias, newBalance, newDescription, newIcon, newColor, req.params.id],
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
         c.name AS category,
         t.created_at AS createdAt
       FROM transactions t
       JOIN categories c ON c.id = t.category_id
       WHERE t.wallet_id = ? AND t.date >= ? AND t.date <= ?
       ORDER BY t.date DESC, t.created_at DESC, t.id DESC`,
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
    const { walletId, categoryName, type, amount, description } = req.body;
    
    if (!walletId || !categoryName || !type || !amount) {
      return res.status(400).json({ 
        error: 'Faltan campos requeridos: walletId, categoryName, type, amount' 
      });
    }
    
    const result = await createTransaction(walletId, categoryName, type, amount, description);
    
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
      t.created_at AS createdAt
    FROM transactions t
    JOIN wallets w ON w.id = t.wallet_id
    JOIN categories c ON c.id = t.category_id
    ORDER BY t.created_at DESC, t.id DESC
    LIMIT ? OFFSET ?`;

  db.all(query, [limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    db.get('SELECT COUNT(*) AS total FROM transactions', (countErr, result) => {
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
      c.name AS category,
      t.type,
      t.amount,
      t.description,
      t.date,
      t.created_at AS createdAt
    FROM transactions t
    JOIN wallets w ON w.id = t.wallet_id
    JOIN categories c ON c.id = t.category_id
    WHERE t.id = ?`,
    [req.params.id],
    (err, transaction) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!transaction) return res.status(404).json({ error: 'Transacción no encontrada' });
      res.json(transaction);
    }
  );
});

// Exchanges con transacciones separadas
app.post('/api/exchanges', async (req, res) => {
  try {
    const { fromWalletId, toWalletId, fromAmount, toAmount, description, marketRate, fee } = req.body;
    
    console.log('💱 Procesando exchange:', { fromWalletId, toWalletId, fromAmount, toAmount, fee });
    
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
    
    // Validar fondos en origen
    if (fromWallet.balance < fromAmount) {
      throw new Error(`Fondos insuficientes en ${fromWallet.name}. Balance actual: ${fromWallet.balance} ${fromWallet.currency}`);
    }
    
    // Calcular tasa
    const rate = toAmount / fromAmount;
    
    // Comisión (fee) en la moneda de origen, por defecto 0
    const commission = Number(fee) || 0;

    // Monto neto recibido después de la comisión (lo que realmente ingresa al destino)
    // La comisión se cobra en el origen: lo que sale realmente = fromAmount, 
    // lo que llega neto de comisión = toAmount (el usuario ya ingresó lo que recibió).
    // Para el spread usamos la tasa neta: toAmount / (fromAmount - commission)
    // Si no hay comisión, la tasa neta = tasa bruta.
    const netFromAmount = fromAmount - commission;
    const netRate = netFromAmount > 0 ? toAmount / netFromAmount : rate;

    // Calcular spread sobre la tasa neta (sin comisión)
    let spread = null;
    if (marketRate !== undefined && marketRate !== null) {
      spread = ((marketRate - netRate) / marketRate) * 100;
    }
    
    // Crear transacción de débito (exchange_out)
    const debitTransaction = await createTransaction(
      fromWalletId,
      'exchange_out',
      'expense',
      fromAmount,
      `${description || 'Exchange'} → ${toWallet.name}`,
      commission
    );
    
    // Crear transacción de crédito (exchange_in)
    const creditTransaction = await createTransaction(
      toWalletId,
      'exchange_in',
      'income',
      toAmount,
      `${description || 'Exchange'} ← ${fromWallet.name}`
    );
    
    // Registrar metadata del exchange
    db.run(
      `INSERT INTO exchanges (debit_transaction_id, credit_transaction_id, from_wallet_id, to_wallet_id, 
       from_amount, to_amount, rate, market_rate, spread, fee, description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        debitTransaction.id,
        creditTransaction.id,
        fromWalletId,
        toWalletId,
        fromAmount,
        toAmount,
        rate,
        marketRate || null,
        spread,
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
            marketRate: marketRate || null,
            spread,
            fee: commission,
            fromWallet: fromWallet.name,
            toWallet: toWallet.name,
            fromAmount,
            toAmount,
            netRate,
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

  const query = `
    SELECT
      e.id,
      e.from_wallet_id AS fromWalletId,
      e.to_wallet_id AS toWalletId,
      e.from_amount AS fromAmount,
      e.to_amount AS toAmount,
      e.rate,
      e.market_rate AS marketRate,
      e.spread,
      e.fee,
      e.description,
      e.created_at AS createdAt,
      from_wallet.name AS fromWalletName,
      to_wallet.name AS toWalletName,
      from_wallet.currency AS fromCurrency,
      to_wallet.currency AS toCurrency
    FROM exchanges e
    JOIN wallets from_wallet ON from_wallet.id = e.from_wallet_id
    JOIN wallets to_wallet ON to_wallet.id = e.to_wallet_id
    ORDER BY e.created_at DESC, e.id DESC
    LIMIT ? OFFSET ?`;

  db.all(query, [limit, offset], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });

    db.get('SELECT COUNT(*) AS total FROM exchanges', (countErr, result) => {
      if (countErr) return res.status(500).json({ error: countErr.message });
      res.json({ data: rows, total: result?.total || 0, page, limit });
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
    console.log('   • Spread calculado solo si se provee marketRate');
    console.log('   • Validación de fondos antes del exchange');
  });

  // Manejar cierre
  process.on('SIGINT', () => {
    console.log('\n👋 Cerrando servidor...');
    db.close();
    process.exit(0);
  });
}
