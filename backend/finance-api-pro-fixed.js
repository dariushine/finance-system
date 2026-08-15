/**
 * FINANCE API PRO - FIXED VERSION
 * Versión corregida con inicialización más robusta
 */

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3002;
const API_VERSION = 'v1';
const DB_PATH = path.join(__dirname, 'data/finance.db');

// ========== DATABASE INITIALIZATION ==========
const ensureDatabaseExists = () => {
  if (!fs.existsSync(path.dirname(DB_PATH))) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
  }
};

const initDatabase = () => {
  const db = new sqlite3.Database(DB_PATH);
  
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      console.log('🔄 Initializing database...');
      
      // Wallets table
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
      )`, (err) => {
        if (err) console.error('Error creating wallets table:', err.message);
      });

      // Transactions table - FIXED: walletId → walletId (consistent naming)
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
      )`, (err) => {
        if (err) console.error('Error creating transactions table:', err.message);
      });

      // Exchanges table
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
      )`, (err) => {
        if (err) console.error('Error creating exchanges table:', err.message);
      });

      // Create indexes
      db.run('CREATE INDEX IF NOT EXISTS idx_transactions_wallet ON transactions(walletId)', (err) => {
        if (err) console.error('Error creating index:', err.message);
      });
      
      db.run('CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC)', (err) => {
        if (err) console.error('Error creating index:', err.message);
      });
      
      db.run('CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category)', (err) => {
        if (err) console.error('Error creating index:', err.message);
      });

      // Check if we need sample data
      db.get('SELECT COUNT(*) as count FROM wallets', (err, row) => {
        if (err) {
          console.error('Error checking wallet count:', err.message);
          db.close();
          reject(err);
          return;
        }
        
        if (row.count === 0) {
          console.log('📊 Adding sample wallets...');
          const sampleWallets = [
            ['Cuenta Bancaria USD', 'bank', 'USD', 1000, 'Cuenta bancaria en dólares'],
            ['Cuenta Bancaria VES', 'bank', 'VES', 50000, 'Cuenta bancaria en bolívares'],
            ['Efectivo USD', 'cash', 'USD', 200, 'Efectivo en dólares'],
            ['Efectivo VES', 'cash', 'VES', 100000, 'Efectivo en bolívares'],
            ['Crypto Wallet', 'crypto', 'USD', 500, 'Wallet de criptomonedas'],
            ['Tarjeta Prepagada', 'card', 'USD', 100, 'Tarjeta prepagada internacional']
          ];
          
          const stmt = db.prepare('INSERT INTO wallets (name, type, currency, balance, description) VALUES (?, ?, ?, ?, ?)');
          sampleWallets.forEach(wallet => stmt.run(wallet));
          stmt.finalize();
          
          console.log('✅ Sample wallets added');
        }
        
        console.log('✅ Database initialized successfully');
        db.close();
        resolve();
      });
    });
  });
};

// ========== SETUP ==========
ensureDatabaseExists();
let db;

// Middleware
app.use(cors({
  origin: ['http://localhost:3000', 'http://frontend:3000', 'http://127.0.0.1:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Simple request logging
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} ${req.method} ${req.url}`);
  next();
});

// ========== DATABASE HELPERS ==========
const getDb = () => {
  if (!db) {
    db = new sqlite3.Database(DB_PATH);
  }
  return db;
};

const query = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

const queryOne = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
};

const run = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    getDb().run(sql, params, function(err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
};

// ========== RESPONSE HELPERS ==========
const success = (data, meta = {}) => ({
  success: true,
  data,
  meta: { ...meta, timestamp: new Date().toISOString(), version: API_VERSION }
});

const error = (message, code = 400, details = null) => ({
  success: false,
  error: { code, message, details },
  timestamp: new Date().toISOString(),
  version: API_VERSION
});

// ========== SIMPLE ENDPOINTS ==========
app.get(`/api/${API_VERSION}/health`, async (req, res) => {
  try {
    // Test database connection
    await queryOne('SELECT 1 as test');
    res.json(success({ 
      status: 'healthy', 
      service: 'Finance API',
      database: 'connected',
      timestamp: new Date().toISOString()
    }));
  } catch (err) {
    res.status(503).json(error('Service unavailable', 503, err.message));
  }
});

app.get(`/api/${API_VERSION}/wallets`, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const offset = (page - 1) * limi