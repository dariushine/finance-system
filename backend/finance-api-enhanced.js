/**
 * FINANCE API ENHANCED
 * MEJORAS INCREMENTALES al server existente
 * - Paginación
 * - Validación básica
 * - Sin romper compatibilidad
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const dbPath = path.join(__dirname, 'data/finance.db');
const db = new sqlite3.Database(dbPath);

// ========== MIDDLEWARE MEJORADO ==========
app.use(cors());
app.use(express.json());

// Rate limiting simple
const requestCounts = {};
const RATE_LIMIT = { windowMs: 60000, max: 100 }; // 100 requests/min

app.use((req, res, next) => {
  const ip = req.ip;
  const now = Date.now();
  
  if (!requestCounts[ip]) {
    requestCounts[ip] = [];
  }
  
  // Clean old requests
  requestCounts[ip] = requestCounts[ip].filter(time => now - time < RATE_LIMIT.windowMs);
  
  if (requestCounts[ip].length >= RATE_LIMIT.max) {
    return res.status(429).json({ error: 'Too many requests', retryAfter: 60 });
  }
  
  requestCounts[ip].push(now);
  next();
});

// ========== FUNCIONES DE AYUDA ==========
const query = (sql, params) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

const queryOne = (sql, params) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const run = (sql, params) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    err ? reject(err) : resolve({ id: this.lastID, changes: this.changes });
  });
});

// ========== VALIDACIÓN ==========
const validateTransaction = (req, res, next) => {
  const { wallet_id, type, amount, category_id } = req.body;
  const errors = [];
  
  if (!wallet_id || wallet_id <= 0) errors.push('wallet_id inválido');
  if (!type || !['income', 'expense'].includes(type)) errors.push('type debe ser "income" o "expense"');
  if (!amount || amount <= 0) errors.push('amount debe ser mayor a 0');
  if (!category_id || category_id.trim() === '') errors.push('category_id es requerido');
  
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validación falló', details: errors });
  }
  next();
};

// ========== ENDPOINTS MEJORADOS ==========

// 1. TRANSACCIONES CON PAGINACIÓN
app.get('/api/transactions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    
    const { wallet_id, category_id, date } = req.query;
    let whereClause = 'WHERE 1=1';
    const params = [];
    
    if (wallet_id) {
      whereClause += ' AND wallet_id = ?';
      params.push(wallet_id);
    }
    if (category_id) {
      whereClause += ' AND category_id = ?';
      params.push(category_id);
    }
    if (date) {
      whereClause += ' AND date(date) = date(?)';
      params.push(date);
    }
    
    // Obtener total
    const totalResult = await queryOne(
      `SELECT COUNT(*) as total FROM transactions ${whereClause}`,
      params
    );
    const total = totalResult.total;
    
    // Obtener datos paginados (ordenados por fecha descendente)
    const transactions = await query(
      `SELECT * FROM transactions ${whereClause} ORDER BY date DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    
    res.json({
      data: transactions,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNext: page < Math.ceil(total / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ error: 'Error al obtener transacciones' });
  }
});

// 2. WALLETS CON PAGINACIÓN
app.get('/api/wallets', async (req, res) => {
  try {
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 50));
    
    const wallets = await query(
      'SELECT * FROM wallets WHERE isActive = 1 ORDER BY name LIMIT ?',
      [limit]
    );
    
    res.json(wallets);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener billeteras' });
  }
});

// 3. TRANSACCIÓN INDIVIDUAL
app.get('/api/transactions/:id', async (req, res) => {
  try {
    const transaction = await queryOne(
      `SELECT t.*, w.name as walletName, w.currency as walletCurrency 
       FROM transactions t 
       LEFT JOIN wallets w ON t.wallet_id = w.id 
       WHERE t.id = ?`,
      [req.params.id]
    );
    
    if (!transaction) {
      return res.status(404).json({ error: 'Transacción no encontrada' });
    }
    
    res.json(transaction);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener transacción' });
  }
});

// 4. CREAR TRANSACCIÓN CON VALIDACIÓN
app.post('/api/transactions', validateTransaction, async (req, res) => {
  try {
    const { wallet_id, type, amount, category_id, description } = req.body;
    const signedAmount = type === 'expense' ? -Math.abs(amount) : Math.abs(amount);
    
    // Verificar que wallet existe
    const wallet = await queryOne('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [wallet_id]);
    if (!wallet) {
      return res.status(404).json({ error: 'Billetera no encontrada' });
    }
    
    // Verificar fondos para gastos
    if (type === 'expense' && wallet.balance < amount) {
      return res.status(400).json({ 
        error: 'Fondos insuficientes',
        currentBalance: wallet.balance,
        required: amount
      });
    }
    
    // Insertar transacción
    const result = await run(
      'INSERT INTO transactions (wallet_id, type, amount, category_id, description) VALUES (?, ?, ?, ?, ?)',
      [wallet_id, type, Math.abs(amount), category_id, description]
    );
    
    // Actualizar balance
    await run(
      'UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [signedAmount, wallet_id]
    );
    
    // Obtener transacción creada
    const transaction = await queryOne('SELECT * FROM transactions WHERE id = ?', [result.id]);
    const updatedWallet = await queryOne('SELECT * FROM wallets WHERE id = ?', [wallet_id]);
    
    res.status(201).json({
      transaction,
      wallet: updatedWallet,
      message: 'Transacción creada exitosamente'
    });
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ error: 'Error al crear transacción' });
  }
});

// 5. HISTORIAL DE EXCHANGES
app.get('/api/exchanges', async (req, res) => {
  try {
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit) || 20));
    
    const exchanges = await query(
      `SELECT e.*, 
              fw.name as fromWalletName, fw.currency as fromCurrency,
              tw.name as toWalletName, tw.currency as toCurrency
       FROM exchanges e
       LEFT JOIN wallets fw ON e.fromWalletId = fw.id
       LEFT JOIN wallets tw ON e.toWalletId = tw.id
       ORDER BY e.createdAt DESC
       LIMIT ?`,
      [limit]
    );
    
    res.json(exchanges);
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener exchanges' });
  }
});

// 6. ESTADÍSTICAS
app.get('/api/stats', async (req, res) => {
  try {
    const [totalCount, incomeSum, expenseSum, recentTransactions] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM transactions'),
      queryOne('SELECT SUM(amount) as total FROM transactions WHERE type = "income"'),
      queryOne('SELECT SUM(amount) as total FROM transactions WHERE type = "expense"'),
      query('SELECT * FROM transactions ORDER BY date DESC LIMIT 5')
    ]);
    
    res.json({
      summary: {
        totalTransactions: totalCount.count,
        totalIncome: incomeSum.total || 0,
        totalExpenses: expenseSum.total || 0,
        net: (incomeSum.total || 0) - (expenseSum.total || 0)
      },
      recentTransactions,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ========== MANTENER ENDPOINTS EXISTENTES DEL SERVER ORIGINAL ==========
// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Finance API Enhanced',
    version: '1.1.0',
    features: ['pagination', 'validation', 'rate-limiting']
  });
});

// Wallets detallado
app.get('/api/wallets/:id', async (req, res) => {
  try {
    const wallet = await queryOne(
      'SELECT * FROM wallets WHERE id = ? AND isActive = 1',
      [req.params.id]
    );
    
    if (!wallet) {
      return res.status(404).json({ error: 'Billetera no encontrada' });
    }
    
    const transactions = await query(
      'SELECT * FROM transactions WHERE wallet_id = ? ORDER BY date DESC LIMIT 10',
      [req.params.id]
    );
    
    res.json({ wallet, recentTransactions: transactions });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener billetera' });
  }
});

// Balance consolidado
app.get('/api/balance', async (req, res) => {
  try {
    const balanceByCurrency = await query(`
      SELECT currency, SUM(balance) as total
      FROM wallets 
      WHERE isActive = 1
      GROUP BY currency
    `);
    
    // Tasas de conversión aproximadas (para ejemplo)
    const rates = { USD: 1, VES: 0.0016, EUR: 1.07 };
    let totalUSD = 0;
    
    balanceByCurrency.forEach(item => {
      totalUSD += item.total * (rates[item.currency] || 1);
    });
    
    res.json({
      totalUSD: parseFloat(totalUSD.toFixed(2)),
      byCurrency: balanceByCurrency,
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al obtener balance' });
  }
});

// POST exchange (mantiene compatibilidad)
app.post('/api/exchanges', async (req, res) => {
  try {
    const { fromWalletId, toWalletId, fromAmount, toAmount, marketRate, description } = req.body;
    
    if (!fromWalletId || !toWalletId || !fromAmount || !toAmount) {
      return res.status(400).json({ error: 'Faltan campos requeridos' });
    }
    
    if (fromWalletId === toWalletId) {
      return res.status(400).json({ error: 'No se puede hacer exchange con la misma billetera' });
    }
    
    // Verificar wallets
    const fromWallet = await queryOne('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [fromWalletId]);
    const toWallet = await queryOne('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [toWalletId]);
    
    if (!fromWallet || !toWallet) {
      return res.status(404).json({ error: 'Billetera no encontrada' });
    }
    
    if (fromWallet.balance < fromAmount) {
      return res.status(400).json({ 
        error: 'Fondos insuficientes',
        current: fromWallet.balance,
        required: fromAmount
      });
    }
    
    // Calcular tasa y spread
    const rate = toAmount / fromAmount;
    let spread = null;
    if (marketRate && marketRate > 0) {
      spread = ((marketRate - rate) / marketRate) * 100;
    }
    
    // Iniciar transacción
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      
      // Insertar exchange
      db.run(
        `INSERT INTO exchanges (fromWalletId, toWalletId, fromAmount, toAmount, rate, marketRate, spread, description) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [fromWalletId, toWalletId, fromAmount, toAmount, rate, marketRate, spread, description],
        function(err) {
          if (err) {
            db.run('ROLLBACK');
            return res.status(500).json({ error: 'Error al crear exchange' });
          }
          
          const exchangeId = this.lastID;
          
          // Transacción de débito
          db.run(
            'INSERT INTO transactions (wallet_id, type, amount, category_id, description) VALUES (?, ?, ?, ?, ?)',
            [fromWalletId, 'expense', fromAmount, 'exchange_out', description || 'Exchange out']
          );
          
          // Transacción de crédito
          db.run(
            'INSERT INTO transactions (wallet_id, type, amount, category_id, description) VALUES (?, ?, ?, ?, ?)',
            [toWalletId, 'income', toAmount, 'exchange_in', description || 'Exchange in']
          );
          
          // Actualizar balances
          db.run('UPDATE wallets SET balance = balance - ? WHERE id = ?', [fromAmount, fromWalletId]);
          db.run('UPDATE wallets SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [toAmount, toWalletId]);
          
          db.run('COMMIT', (err) => {
            if (err) {
              return res.status(500).json({ error: 'Error al completar exchange' });
            }
            
            res.status(201).json({
              success: true,
              exchangeId,
              rate,
              spread,
              message: 'Exchange completado exitosamente'
            });
          });
        }
      );
    });
  } catch (error) {
    res.status(500).json({ error: 'Error al procesar exchange' });
  }
});

// ========== INICIAR SERVER ==========
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🚀 Finance API Enhanced running on port ${PORT}`);
  console.log(`📊 Endpoints mejorados:`);
  console.log(`   GET  /api/transactions    → Con paginación (?page=1&limit=20)`);
  console.log(`   GET  /api/transactions/:id → Detalle con wallet info`);
  console.log(`   POST /api/transactions    → Con validación`);
  console.log(`   GET  /api/stats           → Estadísticas`);
  console.log(`   GET  /api/exchanges       → Historial`);
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
});

module.exports = app;