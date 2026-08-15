#!/usr/bin/env node

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const app = express();
const port = 3001;

const dbPath = path.join(__dirname, 'data/finance.db');
const db = new sqlite3.Database(dbPath);

app.use(express.json());

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Finance API v2',
    version: '2.0.0',
    features: ['wallets', 'transactions', 'categories', 'balance'],
  });
});

// Obtener billeteras
app.get('/api/wallets', (req, res) => {
  db.all(`SELECT * FROM wallets WHERE isActive = 1 ORDER BY currency, name`, (err, wallets) => {
    if (err) {
      console.error('Error obteniendo billeteras:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
      return;
    }
    res.json(wallets);
  });
});

// Obtener categorías
app.get('/api/categories', (req, res) => {
  const { type } = req.query;
  let query = 'SELECT * FROM categories WHERE isActive = 1';
  if (type === 'expense' || type === 'income') {
    query += ` AND type = '${type}'`;
  }
  query += ' ORDER BY type, name';
  
  db.all(query, (err, categories) => {
    if (err) {
      console.error('Error obteniendo categorías:', err);
      res.status(500).json({ error: 'Error interno del servidor' });
      return;
    }
    res.json(categories);
  });
});

// Crear transacción (actualiza balance automáticamente)
app.post('/api/transactions', (req,1 res) => {
  const { walletId, categoryId, type, amount, currency, description } = req.body;
  
  console.log('📝 Procesando transacción:', { walletId, type, amount, currency });
  
  if (!walletId || !categoryId || !type || !amount || !currency) {
    return res.status(400).json({ 
      error: 'Faltan campos requeridos: walletId, categoryId, type, amount, currency' 
    });
  }
  
  if (type !== 'income' && type !== 'expense') {
    return res.status(400).json({ error: 'type debe ser "income" o "expense"' });
  }
  
  // Validar billetera
  db.get(`SELECT * FROM wallets WHERE id = ? AND isActive = 1`, [walletId], (err, wallet) => {
    if (err) {
      console.error('Error validando billetera:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    
    if (!wallet) {
      return res.status(404).json({ error: 'Billetera no encontrada' });
    }
    
    // Validar moneda
    if (wallet.currency !== currency) {
      return res.status(400).json({ 
        error: `La billetera usa ${wallet.currency}, pero la transacción es en ${currency}` 
      });
    }
    
    // Validar categoría
    db.get(`SELECT * FROM categories WHERE id = ? AND isActive = 1`, [categoryId], (err, category) => {
      if (err) {
        console.error('Error validando categoría:', err);
        return res.status(500).json({ error: 'Error interno del servidor' });
      }
      
      if (!category) {
        return res.status(404).json({ error: 'Categoría no encontrada' });
      }
      
      // Validar fondos para gastos
      if (type === 'expense' && wallet.balance < amount) {
        return res.status(400).json({ 
          error: `Fondos insuficientes. Balance actual: ${wallet.balance} ${currency}, necesitas: ${amount} ${currency}` 
        });
      }
      
      const transactionDate = new Date().toISOString().split('T')[0];
      
      // Crear transacción
      db.run(
        `INSERT INTO transactions (wallet_id, category_id, type, amount, currency, description, date, exchange_rate, converted_amount) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [walletId, categoryId, type, amount, currency, description || '', transactionDate, 1.0, amount],
        function(err) {
          if (err) {
            console.error('Error creando transacción:', err);
            return res.status(500).json({ error: 'Error interno del servidor' });
          }
          
          // Actualizar balance de billetera automáticamente
          const newBalance = type === 'expense' ? wallet.balance - amount : wallet.balance + amount;
          
          db.run(`UPDATE wallets SET balance = ? WHERE id = ?`, [newBalance, walletId], (err) => {
            if (err) {
              console.error('Error actualizando balance:', err);
              return res.status(500).json({ error: 'Error interno del servidor' });
            }
            
            res.status(201).json({
              transaction: {
                id: this.lastID,
                type,
                amount,
                currency,
                description: description || '',
                date: transactionDate,
                wallet: wallet.name,
                category: category.name,
              },
              message: `Transacción de ${type === 'expense' ? 'gasto' : 'ingreso'} registrada exitosamente`,
              newBalance,
            });
          });
        }
      );
    });
  });
});

// Balance total
app.get('/api/balance', (req, res) => {
  db.all(`SELECT * FROM wallets WHERE isActive = 1`, (err, wallets) => {
    if (err) {
      console.error('Error obteniendo billeteras:', err);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
    
    const rates = { USD: 1, VES: 635, EUR: 1.07 };
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

// Crear esquema inicial
function createTables() {
  db.serialize(() => {
    // Billeteras
    db.run(`CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      type TEXT NOT NULL,
      currency TEXT NOT NULL,
      balance DECIMAL(10,2) DEFAULT 0,
      description TEXT,
      isActive BOOLEAN DEFAULT 1,
      createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    
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
    
    // Transacciones
    db.run(`CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      category_id INTEGER NOT NULL,
      type TEXT NOT NULL,
      amount DECIMAL(10,2) NOT NULL,
      currency TEXT NOT NULL,
      description TEXT,
      date TEXT NOT NULL,
      exchange_rate DECIMAL(10,4) DEFAULT 1.0,
      converted_amount DECIMAL(10,2) NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wallet_id) REFERENCES wallets(id),
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`);
    
    // Insertar datos iniciales
    db.get(`SELECT COUNT(*) as count FROM wallets`, (err, result) => {
      if (err || result.count === 0) {
        console.log('💰 Insertando billeteras iniciales...');
        const wallets = [
          ['Cuenta Bancaria USD', 'bank', 'USD', 0, 'Cuenta bancaria en dólares'],
          ['Cuenta Bancaria VES', 'bank', 'VES', 0, 'Cuenta bancaria en bolívares'],
          ['Efectivo USD', 'cash', 'USD', 0, 'Efectivo en dólares'],
          ['Efectivo VES', 'cash', 'VES', 0, 'Efectivo en bolívares'],
          ['Crypto Wallet', 'crypto', 'USD', 0, 'Wallet de criptomonedas'],
          ['Tarjeta Prepagada', 'card', 'USD', 0, 'Tarjeta prepagada internacional'],
        ];
        
        const stmt = db.prepare(`INSERT INTO wallets (name, type, currency, balance, description) VALUES (?, ?, ?, ?, ?)`);
        wallets.forEach(wallet => {
          stmt.run(wallet);
        });
        stmt.finalize();
        console.log('✅ 6 billeteras creadas');
      } else {
        console.log(`📊 ${result.count} billeteras existentes`);
      }
    });
    
    db.get(`SELECT COUNT(*) as count FROM categories`, (err, result) => {
      if (err || result.count === 0) {
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
        ];
        
        const stmt = db.prepare(`INSERT INTO categories (name, type, color) VALUES (?, ?, ?)`);
        categories.forEach(category => {
          stmt.run(category);
        });
        stmt.finalize();
        console.log('✅ 15 categorías creadas');
      } else {
        console.log(`🏷️  ${result.count} categorías existentes`);
      }
    });
  });
}

// Iniciar servidor
app.listen(port, () => {
  console.log(`\n🚀 Servidor ejecutándose en: http://localhost:${port}`);
  console.log(`📊 Health: http://localhost:${port}/api/health`);
  console.log(`💾 Billeteras: http://localhost:${port}/api/wallets`);
  console.log(`🏷️  Categorías: http://localhost:${port}/api/categories`);
  console.log(`💸 Transacciones: POST http://localhost:${port}/api/transactions`);
  console.log(`💰 Balance: http://localhost:${port}/api/balance`);
  console.log('\n✨ Transacciones actualizan balances automáticamente');
  console.log('📝 Ejemplo: Gastar 1200 VES → Balance de Efectivo VES se reduce automáticamente');
});

createTables();

// Manejar cierre
process.on('SIGINT', () => {
  console.log('\n👋 Recibido SIGINT. Cerrando servidor...');
  db.close();
  process.exit(0);
});