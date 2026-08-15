/**
 * FINANCE API PRO v1.0
 * API profesional con paginación, validación, y mejores prácticas
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3002;
const API_VERSION = 'v1';

// ========== MIDDLEWARE ==========
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['http://localhost:3000', 'http://frontend:3000']
    : '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Rate limiting básico
const requestCounts = new Map();
app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minuto
  const maxRequests = 100;
  
  if (!requestCounts.has(ip)) {
    requestCounts.set(ip, []);
  }
  
  const requests = requestCounts.get(ip);
  const windowStart = now - windowMs;
  
  // Limpiar requests viejos
  while (requests.length && requests[0] < windowStart) {
    requests.shift();
  }
  
  if (requests.length >= maxRequests) {
    return res.status(429).json({
      success: false,
      error: { code: 429, message: 'Too many requests' }
    });
  }
  
  requests.push(now);
  next();
});

// Logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${new Date().toISOString()} | ${req.method} ${req.url} | ${res.statusCode} | ${duration}ms`);
  });
  next();
});

// ========== DATABASE ==========
const dbPath = path.join(__dirname, 'data/finance.db');
const db = new sqlite3.Database(dbPath);

// Inicializar base de datos
const initDatabase = () => {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // Wallets
      db.run(`CREATE TABLE IF NOT EXISTS wallets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE,
        type TEXT NOT NULL,
        currency TEXT NOT NULL CHECK(currency IN ('USD', 'VES', 'EUR', 'COP')),
        balance DECIMAL(10,2) DEFAULT 0,
        description TEXT,
        isActive INTEGER DEFAULT 1,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        updatedAt DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Transactions
      db.run(`CREATE TABLE IF NOT EXISTS transactions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        walletId INTEGER NOT NULL,
        category TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
        amount DECIMAL(10,2) NOT NULL CHECK(amount > 0),
        description TEXT,
        date DATETIME DEFAULT CURRENT_TIMESTAMP,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (walletId) REFERENCES wallets(id) ON DELETE RESTRICT
      )`);

      // Indexes para performance
      db.run('CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(walletId)');
      db.run('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC)');
      db.run('CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)');
      
      // Exchanges (para tracking)
      db.run(`CREATE TABLE IF NOT EXISTS exchanges (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fromWalletId INTEGER NOT NULL,
        toWalletId INTEGER NOT NULL,
        fromAmount DECIMAL(10,2) NOT NULL,
        toAmount DECIMAL(10,2) NOT NULL,
        rate DECIMAL(10,4) NOT NULL,
        marketRate DECIMAL(10,4),
        spread DECIMAL(5,2),
        description TEXT,
        createdAt DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (fromWalletId) REFERENCES wallets(id),
        FOREIGN KEY (toWalletId) REFERENCES wallets(id)
      )`);

      console.log('✅ Database initialized');
      resolve();
    });
  });
};

// ========== UTILITIES ==========
const executeQuery = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const executeSingle = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const executeRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// ========== RESPONSE FORMATTERS ==========
const successResponse = (data, meta = {}) => ({
  success: true,
  data,
  meta: {
    ...meta,
    timestamp: new Date().toISOString(),
    version: API_VERSION
  }
});

const errorResponse = (message, code = 400, details = null) => ({
  success: false,
  error: {
    code,
    message,
    details
  },
  timestamp: new Date().toISOString(),
  version: API_VERSION
});

// ========== VALIDATION MIDDLEWARES ==========
const validateTransaction = (req, res, next) => {
  const { walletId, type, amount, category } = req.body;
  
  const errors = [];
  
  if (!walletId || walletId <= 0) errors.push('walletId must be a positive integer');
  if (!type || !['income', 'expense'].includes(type)) errors.push('type must be "income" or "expense"');
  if (!amount || amount <= 0) errors.push('amount must be greater than 0');
  if (!category || typeof category !== 'string' || category.trim().length === 0) {
    errors.push('category is required');
  }
  
  if (errors.length > 0) {
    return res.status(400).json(errorResponse('Validation failed', 400, errors));
  }
  
  next();
};

const validateExchange = async (req, res, next) => {
  const { fromWalletId, toWalletId, fromAmount, toAmount, marketRate } = req.body;
  
  const errors = [];
  
  if (!fromWalletId || !toWalletId) errors.push('Both wallet IDs are required');
  if (fromWalletId === toWalletId) errors.push('Cannot exchange with same wallet');
  if (!fromAmount || fromAmount <= 0) errors.push('fromAmount must be greater than 0');
  if (!toAmount || toAmount <= 0) errors.push('toAmount must be greater than 0');
  
  if (errors.length > 0) {
    return res.status(400).json(errorResponse('Validation failed', 400, errors));
  }
  
  // Verificar que wallets existan
  try {
    const fromWallet = await executeSingle('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [fromWalletId]);
    const toWallet = await executeSingle('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [toWalletId]);
    
    if (!fromWallet) errors.push('From wallet not found or inactive');
    if (!toWallet) errors.push('To wallet not found or inactive');
    
    // Verificar fondos
    if (fromWallet && fromWallet.balance < fromAmount) {
      errors.push(`Insufficient funds in ${fromWallet.name}. Balance: ${fromWallet.balance} ${fromWallet.currency}, Needed: ${fromAmount} ${fromWallet.currency}`);
    }
    
    if (errors.length > 0) {
      return res.status(400).json(errorResponse('Validation failed', 400, errors));
    }
    
    req.wallets = { fromWallet, toWallet };
    next();
  } catch (error) {
    res.status(500).json(errorResponse('Server error', 500, error.message));
  }
};

const validatePagination = (req, res, next) => {
  const page = Math.max(1, parseInt(req.query.page) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
  const orderBy = req.query.orderBy || 'createdAt';
  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
  
  // Validar orderBy seguro
  const allowedOrderBy = ['id', 'date', 'createdAt', 'amount', 'category', 'type'];
  if (!allowedOrderBy.includes(orderBy)) {
    return res.status(400).json(errorResponse(`orderBy must be one of: ${allowedOrderBy.join(', ')}`));
  }
  
  req.pagination = { page, limit, orderBy, order, offset: (page - 1) * limit };
  next();
};

// ========== API ENDPOINTS ==========

// ===== HEALTH & INFO =====
app.get(`/api/${API_VERSION}/health`, (req, res) => {
  res.json(successResponse({
    status: 'healthy',
    service: 'Finance API Pro',
    version: '1.0.0',
    uptime: process.uptime(),
    timestamp: new Date().toISOString()
  }));
});

app.get(`/api/${API_VERSION}/info`, (req, res) => {
  res.json(successResponse({
    name: 'Finance Management System',
    version: '1.0.0',
    description: 'Professional finance API with pagination, validation, and best practices',
    endpoints: [
      { method: 'GET', path: `/api/${API_VERSION}/health`, description: 'Health check' },
      { method: 'GET', path: `/api/${API_VERSION}/wallets`, description: 'List wallets (paginated)' },
      { method: 'POST', path: `/api/${API_VERSION}/wallets`, description: 'Create wallet' },
      { method: 'GET', path: `/api/${API_VERSION}/wallets/:id`, description: 'Get wallet details' },
      { method: 'GET', path: `/api/${API_VERSION}/wallets/:id/transactions`, description: 'Get wallet transactions (paginated)' },
      { method: 'GET', path: `/api/${API_VERSION}/transactions`, description: 'List transactions (paginated)' },
      { method: 'POST', path: `/api/${API_VERSION}/transactions`, description: 'Create transaction' },
      { method: 'GET', path: `/api/${API_VERSION}/transactions/:id`, description: 'Get transaction details' },
      { method: 'POST', path: `/api/${API_VERSION}/exchanges`, description: 'Create exchange' },
      { method: 'GET', path: `/api/${API_VERSION}/exchanges`, description: 'List exchanges (paginated)' },
      { method: 'GET', path: `/api/${API_VERSION}/balance`, description: 'Get consolidated balance' },
      { method: 'GET', path: `/api/${API_VERSION}/stats`, description: 'Get statistics' }
    ],
    features: ['pagination', 'validation', 'rate-limiting', 'cors', 'structured-logging']
  }));
});

// ===== WALLETS =====
app.get(`/api/${API_VERSION}/wallets`, validatePagination, async (req, res) => {
  try {
    const { limit, offset } = req.pagination;
    
    // Obtener total
    const totalResult = await executeSingle('SELECT COUNT(*) as total FROM wallets WHERE isActive = 1');
    const total = totalResult.total;
    
    // Obtener datos paginados
    const wallets = await executeQuery(
      'SELECT * FROM wallets WHERE isActive = 1 ORDER BY name ASC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    
    res.json(successResponse(wallets, {
      pagination: {
        page: req.pagination.page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: req.pagination.page < Math.ceil(total / limit),
        hasPrev: req.pagination.page > 1
      }
    }));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch wallets', 500, error.message));
  }
});

app.post(`/api/${API_VERSION}/wallets`, async (req, res) => {
  try {
    const { name, type, currency, description } = req.body;
    
    if (!name || !type || !currency) {
      return res.status(400).json(errorResponse('name, type, and currency are required'));
    }
    
    const result = await executeRun(
      'INSERT INTO wallets (name, type, currency, description) VALUES (?, ?, ?, ?)',
      [name, type, currency, description]
    );
    
    const wallet = await executeSingle('SELECT * FROM wallets WHERE id = ?', [result.id]);
    res.status(201).json(successResponse(wallet));
  } catch (error) {
    if (error.message.includes('UNIQUE constraint failed')) {
      res.status(409).json(errorResponse('Wallet name already exists', 409));
    } else {
      res.status(500).json(errorResponse('Failed to create wallet', 500, error.message));
    }
  }
});

app.get(`/api/${API_VERSION}/wallets/:id`, async (req, res) => {
  try {
    const wallet = await executeSingle(
      'SELECT * FROM wallets WHERE id = ? AND isActive = 1',
      [req.params.id]
    );
    
    if (!wallet) {
      return res.status(404).json(errorResponse('Wallet not found', 404));
    }
    
    res.json(successResponse(wallet));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch wallet', 500, error.message));
  }
});

app.get(`/api/${API_VERSION}/wallets/:id/transactions`, validatePagination, async (req, res) => {
  try {
    const { limit, offset, orderBy, order } = req.pagination;
    const walletId = req.params.id;
    
    // Verificar que wallet existe
    const wallet = await executeSingle('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [walletId]);
    if (!wallet) {
      return res.status(404).json(errorResponse('Wallet not found', 404));
    }
    
    // Obtener total
    const totalResult = await executeSingle(
      'SELECT COUNT(*) as total FROM transactions WHERE walletId = ?',
      [walletId]
    );
    const total = totalResult.total;
    
    // Obtener transacciones paginadas
    const transactions = await executeQuery(
      `SELECT * FROM transactions WHERE walletId = ? ORDER BY ${orderBy} ${order} LIMIT ? OFFSET ?`,
      [walletId, limit, offset]
    );
    
    res.json(successResponse(transactions, {
      wallet: { id: wallet.id, name: wallet.name, currency: wallet.currency },
      pagination: {
        page: req.pagination.page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: req.pagination.page < Math.ceil(total / limit),
        hasPrev: req.pagination.page > 1
      }
    }));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch transactions', 500, error.message));
  }
});

// ===== TRANSACTIONS =====
app.get(`/api/${API_VERSION}/transactions`, validatePagination, async (req, res) => {
  try {
    const { limit, offset, orderBy, order } = req.pagination;
    const { walletId, category, type, startDate, endDate } = req.query;
    
    let whereClauses = ['1=1'];
    let params = [];
    
    if (walletId) {
      whereClauses.push('walletId = ?');
      params.push(walletId);
    }
    
    if (category) {
      whereClauses.push('category = ?');
      params.push(category);
    }
    
    if (type && ['income', 'expense'].includes(type)) {
      whereClauses.push('type = ?');
      params.push(type);
    }
    
    if (startDate) {
      whereClauses.push('date >= ?');
      params.push(startDate);
    }
    
    if (endDate) {
      whereClauses.push('date <= ?');
      params.push(endDate);
    }
    
    const whereSQL = whereClauses.join(' AND ');
    
    // Obtener total
    const totalResult = await executeSingle(
      `SELECT COUNT(*) as total FROM transactions WHERE ${whereSQL}`,
      params
    );
    const total = totalResult.total;
    
    // Obtener datos paginados
    const transactions = await executeQuery(
      `SELECT t.*, w.name as walletName, w.currency as walletCurrency 
       FROM transactions t 
       LEFT JOIN wallets w ON t.walletId = w.id 
       WHERE ${whereSQL} 
       ORDER BY ${orderBy} ${order} 
       LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    
    res.json(successResponse(transactions, {
      pagination: {
        page: req.pagination.page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: req.pagination.page < Math.ceil(total / limit),
        hasPrev: req.pagination.page > 1
      },
      filters: { walletId, category, type, startDate, endDate }
    }));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch transactions', 500, error.message));
  }
});

app.post(`/api/${API_VERSION}/transactions`, validateTransaction, async (req, res) => {
  const connection = db;
  
  try {
    await new Promise((resolve, reject) => {
      connection.run('BEGIN TRANSACTION', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    const { walletId, type, amount, category, description } = req.body;
    
    // Verificar que wallet existe
    const wallet = await executeSingle('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [walletId]);
    if (!wallet) {
      throw new Error('Wallet not found');
    }
    
    // Preparar amount con signo correcto
    const signedAmount = type === 'expense' ? -Math.abs(amount) : Math.abs(amount);
    
    // Crear transacción
    const transactionResult = await executeRun(
      'INSERT INTO transactions (walletId, type, amount, category, description) VALUES (?, ?, ?, ?, ?)',
      [walletId, type, Math.abs(amount), category, description]
    );
    
    // Actualizar balance de la wallet
    await executeRun(
      'UPDATE wallets SET balance = balance + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [signedAmount, walletId]
    );
    
    // Obtener transacción creada
    const transaction = await executeSingle(
      `SELECT t.*, w.name as walletName, w.currency as walletCurrency 
       FROM transactions t 
       LEFT JOIN wallets w ON t.walletId = w.id 
       WHERE t.id = ?`,
      [transactionResult.id]
    );
    
    // Actualizar wallet con nuevo balance
    const updatedWallet = await executeSingle('SELECT * FROM wallets WHERE id = ?', [walletId]);
    
    await new Promise((resolve, reject) => {
      connection.run('COMMIT', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.status(201).json(successResponse({
      transaction,
      wallet: updatedWallet
    }));
    
  } catch (error) {
    await new Promise((resolve, reject) => {
      connection.run('ROLLBACK', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    if (error.message === 'Wallet not found') {
      res.status(404).json(errorResponse(error.message, 404));
    } else {
      res.status(500).json(errorResponse('Failed to create transaction', 500, error.message));
    }
  }
});

app.get(`/api/${API_VERSION}/transactions/:id`, async (req, res) => {
  try {
    const transaction = await executeSingle(
      `SELECT t.*, w.name as walletName, w.currency as walletCurrency 
       FROM transactions t 
       LEFT JOIN wallets w ON t.walletId = w.id 
       WHERE t.id = ?`,
      [req.params.id]
    );
    
    if (!transaction) {
      return res.status(404).json(errorResponse('Transaction not found', 404));
    }
    
    res.json(successResponse(transaction));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch transaction', 500, error.message));
  }
});

// ===== EXCHANGES =====
app.post(`/api/${API_VERSION}/exchanges`, validateExchange, async (req, res) => {
  const connection = db;
  
  try {
    await new Promise((resolve, reject) => {
      connection.run('BEGIN TRANSACTION', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    const { fromWalletId, toWalletId, fromAmount, toAmount, marketRate, description } = req.body;
    const { fromWallet, toWallet } = req.wallets;
    
    // Calcular tasa
    const rate = toAmount / fromAmount;
    let spread = null;
    if (marketRate && marketRate > 0) {
      spread = ((marketRate - rate) / marketRate) * 100;
    }
    
    // 1. Crear registro de exchange
    const exchangeResult = await executeRun(
      `INSERT INTO exchanges (fromWalletId, toWalletId, fromAmount, toAmount, rate, marketRate, spread, description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [fromWalletId, toWalletId, fromAmount, toAmount, rate, marketRate, spread, description]
    );
    
    // 2. Transacción de débito (fromWallet)
    const debitResult = await executeRun(
      'INSERT INTO transactions (walletId, type, amount, category, description) VALUES (?, ?, ?, ?, ?)',
      [fromWalletId, 'expense', fromAmount, 'exchange_out', description || 'Exchange out']
    );
    
    // 3. Transacción de crédito (toWallet)
    const creditResult = await executeRun(
      'INSERT INTO transactions (walletId, type, amount, category, description) VALUES (?, ?, ?, ?, ?)',
      [toWalletId, 'income', toAmount, 'exchange_in', description || 'Exchange in']
    );
    
    // 4. Actualizar balances
    await executeRun(
      'UPDATE wallets SET balance = balance - ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [fromAmount, fromWalletId]
    );
    
    await executeRun(
      'UPDATE wallets SET balance = balance + ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [toAmount, toWalletId]
    );
    
    // 5. Obtener datos completos
    const exchange = await executeSingle('SELECT * FROM exchanges WHERE id = ?', [exchangeResult.id]);
    const debitTransaction = await executeSingle('SELECT * FROM transactions WHERE id = ?', [debitResult.id]);
    const creditTransaction = await executeSingle('SELECT * FROM transactions WHERE id = ?', [creditResult.id]);
    const updatedFromWallet = await executeSingle('SELECT * FROM wallets WHERE id = ?', [fromWalletId]);
    const updatedToWallet = await executeSingle('SELECT * FROM wallets WHERE id = ?', [toWalletId]);
    
    await new Promise((resolve, reject) => {
      connection.run('COMMIT', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.status(201).json(successResponse({
      exchange,
      debitTransaction,
      creditTransaction,
      fromWallet: updatedFromWallet,
      toWallet: updatedToWallet,
      rate,
      spread
    }));
    
  } catch (error) {
    await new Promise((resolve, reject) => {
      connection.run('ROLLBACK', (err) => {
        if (err) reject(err);
        else resolve();
      });
    });
    
    res.status(500).json(errorResponse('Failed to create exchange', 500, error.message));
  }
});

app.get(`/api/${API_VERSION}/exchanges`, validatePagination, async (req, res) => {
  try {
    const { limit, offset, orderBy, order } = req.pagination;
    
    // Obtener total
    const totalResult = await executeSingle('SELECT COUNT(*) as total FROM exchanges');
    const total = totalResult.total;
    
    // Obtener exchanges con info de wallets
    const exchanges = await executeQuery(
      `SELECT e.*, 
              fw.name as fromWalletName, fw.currency as fromCurrency,
              tw.name as toWalletName, tw.currency as toCurrency
       FROM exchanges e
       LEFT JOIN wallets fw ON e.fromWalletId = fw.id
       LEFT JOIN wallets tw ON e.toWalletId = tw.id
       ORDER BY e.${orderBy} ${order}
       LIMIT ? OFFSET ?`,
      [limit, offset]
    );
    
    res.json(successResponse(exchanges, {
      pagination: {
        page: req.pagination.page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: req.pagination.page < Math.ceil(total / limit),
        hasPrev: req.pagination.page > 1
      }
    }));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch exchanges', 500, error.message));
  }
});

// ===== BALANCE & STATS =====
app.get(`/api/${API_VERSION}/balance`, async (req, res) => {
  try {
    // Balance por moneda
    const balanceByCurrency = await executeQuery(`
      SELECT currency, SUM(balance) as total, COUNT(*) as walletCount
      FROM wallets 
      WHERE isActive = 1
      GROUP BY currency
      ORDER BY total DESC
    `);
    
    // Balance total en USD (asumiendo tasas fijas para ejemplo)
    let totalUSD = 0;
    const rates = { USD: 1, VES: 0.0016, EUR: 1.07, COP: 0.00026 }; // Tasas ejemplo
    
    balanceByCurrency.forEach(item => {
      const rate = rates[item.currency] || 1;
      totalUSD += item.total * rate;
    });
    
    // Top wallets
    const topWallets = await executeQuery(`
      SELECT id, name, currency, balance
      FROM wallets 
      WHERE isActive = 1
      ORDER BY balance DESC
      LIMIT 5
    `);
    
    res.json(successResponse({
      totalUSD: parseFloat(totalUSD.toFixed(2)),
      byCurrency: balanceByCurrency,
      topWallets,
      lastUpdated: new Date().toISOString()
    }));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch balance', 500, error.message));
  }
});

app.get(`/api/${API_VERSION}/stats`, async (req, res) => {
  try {
    const [
      totalTransactions,
      totalIncome,
      totalExpenses,
      transactionCountByCategory,
      monthlySummary
    ] = await Promise.all([
      executeSingle('SELECT COUNT(*) as count FROM transactions'),
      executeSingle('SELECT SUM(amount) as total FROM transactions WHERE type = "income"'),
      executeSingle('SELECT SUM(amount) as total FROM transactions WHERE type = "expense"'),
      executeQuery(`
        SELECT category, COUNT(*) as count, SUM(amount) as total
        FROM transactions
        GROUP BY category
        ORDER BY total DESC
        LIMIT 10
      `),
      executeQuery(`
        SELECT strftime('%Y-%m', date) as month,
               SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END) as income,
               SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END) as expense,
               COUNT(*) as transactionCount
        FROM transactions
        GROUP BY strftime('%Y-%m', date)
        ORDER BY month DESC
        LIMIT 6
      `)
    ]);
    
    res.json(successResponse({
      summary: {
        totalTransactions: totalTransactions.count,
        totalIncome: totalIncome.total || 0,
        totalExpenses: totalExpenses.total || 0,
        net: (totalIncome.total || 0) - (totalExpenses.total || 0)
      },
      byCategory: transactionCountByCategory,
      monthly: monthlySummary,
      generatedAt: new Date().toISOString()
    }));
  } catch (error) {
    res.status(500).json(errorResponse('Failed to fetch statistics', 500, error.message));
  }
});

// ========== ERROR HANDLING ==========
app.use((req, res) => {
  res.status(404).json(errorResponse('Endpoint not found', 404));
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json(errorResponse('Internal server error', 500, process.env.NODE_ENV === 'development' ? err.message : null));
});

// ========== START SERVER ==========
const startServer = async () => {
  try {
    await initDatabase();
    
    // Datos de ejemplo si está vacío
    const walletCount = await executeSingle('SELECT COUNT(*) as count FROM wallets');
    if (walletCount.count === 0) {
      console.log('📊 Adding sample data...');
      await executeRun(`INSERT INTO wallets (name, type, currency, balance, description) VALUES 
        ('Cuenta Bancaria USD', 'bank', 'USD', 1000, 'Cuenta bancaria en dólares'),
        ('Cuenta Bancaria VES', 'bank', 'VES', 50000, 'Cuenta bancaria en bolívares'),
        ('Efectivo USD', 'cash', 'USD', 200, 'Efectivo en dólares'),
        ('Efectivo VES', 'cash', 'VES', 100000, 'Efectivo en bolívares'),
        ('Crypto Wallet', 'crypto', 'USD', 500, 'Wallet de criptomonedas'),
        ('Tarjeta Prepagada', 'card', 'USD', 100, 'Tarjeta prepagada internacional')
      `);
    }
    
    app.listen(PORT, () => {
      console.log(`🚀 Finance API Pro v${API_VERSION} running on port ${PORT}`);
      console.log(`📚 API Docs: http://localhost:${PORT}/api/${API_VERSION}/info`);
      console.log(`🏥 Health: http://localhost:${PORT}/api/${API_VERSION}/health`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

startServer();

module.exports = app;