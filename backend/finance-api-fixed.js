/**
 * FINANCE API CORREGIDA
 * Fixed: category → category_id mapping
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const dbPath = path.join(__dirname, 'data/finance.db');
const db = new sqlite3.Database(dbPath);

// ========== MIDDLEWARE ==========
app.use(cors());
app.use(express.json());

// ========== FUNCIONES DE AYUDA ==========
const query = (sql, params) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => err ? reject(err) : resolve(rows));
});

const queryOne = (sql, params) => new Promise((resolve, reject) => {
  db.get(sql, params, (err, row) => err ? reject(err) : resolve(row));
});

const run = (sql, params) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve({ id: this.lastID });
  });
});

// ========== VALIDACIÓN CORREGIDA ==========
const validateTransaction = (req, res, next) => {
  const { walletId, type, amount, category } = req.body;
  const errors = [];
  
  if (!walletId || walletId <= 0) errors.push('walletId inválido');
  if (!type || !['income', 'expense'].includes(type)) errors.push('type debe ser "income" o "expense"');
  if (!amount || amount <= 0) errors.push('amount debe ser mayor a 0');
  if (!category || typeof category !== 'string') errors.push('category es requerido (string)');
  
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Validación falló', details: errors });
  }
  next();
};

// ========== API ENDPOINTS CORREGIDOS ==========

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Finance API Fixed',
    version: '2.0.0',
    features: ['pagination', 'validation', 'category-mapping']
  });
});

// Get wallets
app.get('/api/wallets', async (req, res) => {
  try {
    const wallets = await query('SELECT * FROM wallets WHERE isActive = 1 ORDER BY id');
    res.json(wallets);
  } catch (error) {
    res.status(500).json({ error: 'Error fetching wallets' });
  }
});

// Get transactions
app.get('/api/transactions', async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.max(1, Math.min(50, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limit;
    
    const total = await queryOne('SELECT COUNT(*) as count FROM transactions');
    const transactions = await query(
      'SELECT t.*, c.name as categoryName, w.name as walletName FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN wallets w ON t.wallet_id = w.id ORDER BY t.id DESC LIMIT ? OFFSET ?',
      [limit, offset]
    );
    
    res.json({
      data: transactions,
      pagination: {
        page,
        limit,
        total: total.count,
        totalPages: Math.ceil(total.count / limit),
        hasNext: page < Math.ceil(total.count / limit),
        hasPrev: page > 1
      }
    });
  } catch (error) {
    res.status(500).json({ error: 'Error fetching transactions' });
  }
});

// POST transaction (CORREGIDO con creación automática de categoría)
app.post('/api/transactions', validateTransaction, async (req, res) => {
  try {
    const { walletId, type, amount, category, description } = req.body;
    
    // Buscar o crear categoría
    let categoryRow = await queryOne('SELECT id FROM categories WHERE name = ? AND type = ? LIMIT 1', [category, type]);
    let categoryId;
    
    if (!categoryRow) {
      // Crear nueva categoría automáticamente
      const colors = {
        income: ['#27ae60', '#2ecc71', '#3498db', '#9b59b6', '#34495e'],
        expense: ['#e74c3c', '#4ecdc4', '#45b7d1', '#ffd166', '#a663cc', '#ff6b6b', '#1dd3b0', '#f28482', '#b8b8b8', '#95a5a6']
      };
      
      const colorPalette = colors[type] || ['#3498db'];
      const randomColor = colorPalette[Math.floor(Math.random() * colorPalette.length)];
      
      const result = await run(
        'INSERT INTO categories (name, type, color, isActive) VALUES (?, ?, ?, 1)',
        [category, type, randomColor]
      );
      
      categoryId = result.id;
      console.log(`Nueva categoría creada: ${category} (${type}) con id ${categoryId}`);
    } else {
      categoryId = categoryRow.id;
    }
    const signedAmount = type === 'expense' ? -Math.abs(amount) : Math.abs(amount);
    
    // Verificar wallet
    const wallet = await queryOne('SELECT * FROM wallets WHERE id = ? AND isActive = 1', [walletId]);
    if (!wallet) {
      return res.status(404).json({ error: 'Wallet no encontrada' });
    }
    
    // Verificar fondos para gastos
    if (type === 'expense' && wallet.balance < amount) {
      return res.status(400).json({ 
        error: 'Fondos insuficientes',
        currentBalance: wallet.balance,
        required: amount
      });
    }
    
    // Insertar transacción (CORREGIDO: usar category_id)
    const result = await run(
      'INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, exchange_rate, converted_amount) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [walletId, categoryId, type, Math.abs(amount), description || '', new Date().toISOString(), 1.0, Math.abs(amount)]
    );
    
    // Actualizar balance
    await run(
      'UPDATE wallets SET balance = balance + ? WHERE id = ?',
      [signedAmount, walletId]
    );
    
    // Obtener transacción creada con joins
    const transaction = await queryOne(
      'SELECT t.*, c.name as categoryName, w.name as walletName FROM transactions t LEFT JOIN categories c ON t.category_id = c.id LEFT JOIN wallets w ON t.wallet_id = w.id WHERE t.id = ?',
      [result.id]
    );
    
    const updatedWallet = await queryOne('SELECT * FROM wallets WHERE id = ?', [walletId]);
    
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

// Get stats
app.get('/api/stats', async (req, res) => {
  try {
    const [totalTransactions, totalIncome, totalExpenses] = await Promise.all([
      queryOne('SELECT COUNT(*) as count FROM transactions'),
      queryOne('SELECT SUM(amount) as sum FROM transactions WHERE type = "income"'),
      queryOne('SELECT SUM(amount) as sum FROM transactions WHERE type = "expense"')
    ]);
    
    const net = (totalIncome?.sum || 0) - (totalExpenses?.sum || 0);
    
    const recent = await query(
      'SELECT t.id, t.type, t.amount, t.description, c.name as category FROM transactions t LEFT JOIN categories c ON t.category_id = c.id ORDER BY t.id DESC LIMIT 5'
    );
    
    res.json({
      summary: {
        totalTransactions: totalTransactions.count || 0,
        totalIncome: totalIncome?.sum || 0,
        totalExpenses: totalExpenses?.sum || 0,
        net: net
      },
      recentTransactions: recent,
      generatedAt: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Error calculating stats' });
  }
});

// Balance
app.get('/api/balance', async (req, res) => {
  try {
    const wallets = await query('SELECT * FROM wallets WHERE isActive = 1');
    const totalUSD = wallets.filter(w => w.currency === 'USD').reduce((sum, w) => sum + (w.balance || 0), 0);
    
    res.json({
      totalUSD,
      byCurrency: wallets.map(w => ({
        currency: w.currency,
        total: w.balance || 0
      })),
      lastUpdated: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Error calculating balance' });
  }
});

// Start server
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`🚀 Finance API Fixed corriendo en puerto ${PORT}`);
  console.log(`📊 Endpoints corregidos:`);
  console.log(`   POST /api/transactions    → Con mapeo category→category_id`);
  console.log(`   GET  /api/stats           → Estadísticas`);
  console.log(`   GET  /api/balance         → Balance`);
  console.log(`🏥 Health: http://localhost:${PORT}/api/health`);
});

module.exports = app;