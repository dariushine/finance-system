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
    type TEXT NOT NULL,
    currency TEXT NOT NULL,
    balance DECIMAL(10,2) DEFAULT 0,
    description TEXT,
    isActive BOOLEAN DEFAULT 1,
    createdAt DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  
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
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (debit_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (credit_transaction_id) REFERENCES transactions(id),
    FOREIGN KEY (from_wallet_id) REFERENCES wallets(id),
    FOREIGN KEY (to_wallet_id) REFERENCES wallets(id)
  )`);
  
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
});

// Helper para crear transacción
function createTransaction(walletId, categoryName, type, amount, description) {
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
              `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, exchange_rate, converted_amount) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
              [walletId, category.id, type, amount, description || '', 
               new Date().toISOString().split('T')[0], 1.0, amount],
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

// Exchanges con transacciones separadas
app.post('/api/exchanges', async (req, res) => {
  try {
    const { fromWalletId, toWalletId, fromAmount, toAmount, description, marketRate } = req.body;
    
    console.log('💱 Procesando exchange:', { fromWalletId, toWalletId, fromAmount, toAmount });
    
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
    
    // Calcular spread solo si hay marketRate
    let spread = null;
    if (marketRate !== undefined && marketRate !== null) {
      spread = ((marketRate - rate) / marketRate) * 100;
    }
    
    // Crear transacción de débito (exchange_out)
    const debitTransaction = await createTransaction(
      fromWalletId,
      'exchange_out',
      'expense',
      fromAmount,
      `${description || 'Exchange'} → ${toWallet.name}`
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
       from_amount, to_amount, rate, market_rate, spread, description) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

app.get('/api/balance', (req, res) => {
  db.all('SELECT * FROM wallets WHERE isActive = 1', (err, wallets) => {
    if (err) return res.status(500).json({ error: err.message });
    
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

// Iniciar servidor
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