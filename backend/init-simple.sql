-- Drop existing tables if they exist
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS categories;
DROP TABLE IF EXISTS wallets;
DROP TABLE IF EXISTS exchanges;

-- Create wallets table with correct updated_at
CREATE TABLE wallets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  currency TEXT NOT NULL,
  balance DECIMAL(10,2) DEFAULT 0,
  description TEXT,
  isActive BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME
);

-- Create categories table
CREATE TABLE categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  color TEXT,
  icon TEXT,
  isActive BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Insert sample wallets
INSERT INTO wallets (name, type, currency, description) VALUES 
  ('Cuenta Bancaria USD', 'bank', 'USD', 'Cuenta bancaria en dólares'),
  ('Cuenta Bancaria VES', 'bank', 'VES', 'Cuenta bancaria en bolívares'),
  ('Efectivo USD', 'cash', 'USD', 'Efectivo en dólares'),
  ('Efectivo VES', 'cash', 'VES', 'Efectivo en bolívares'),
  ('Crypto Wallet', 'crypto', 'USD', 'Wallet de criptomonedas'),
  ('Tarjeta Prepagada', 'card', 'USD', 'Tarjeta prepagada internacional');

-- Insert sample categories
INSERT INTO categories (name, type, color) VALUES 
  ('food', 'expense', '#e74c3c'),
  ('transport', 'expense', '#4ecdc4'),
  ('housing', 'expense', '#45b7d1'),
  ('utilities', 'expense', '#ffd166'),
  ('entertainment', 'expense', '#a663cc'),
  ('health', 'expense', '#ff6b6b'),
  ('education', 'expense', '#1dd3b0'),
  ('shopping', 'expense', '#f28482'),
  ('personal', 'expense', '#b8b8b8'),
  ('other_expense', 'expense', '#95a5a6'),
  ('salary', 'income', '#27ae60'),
  ('freelance', 'income', '#2ecc71'),
  ('investment', 'income', '#3498db'),
  ('gift', 'income', '#9b59b6'),
  ('other_income', 'income', '#34495e');

-- Create transactions table
CREATE TABLE transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  description TEXT,
  date DATETIME NOT NULL,
  exchange_rate DECIMAL(10,4) DEFAULT 1.0,
  converted_amount DECIMAL(10,2) NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Create exchanges table
CREATE TABLE exchanges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  from_wallet_id INTEGER NOT NULL,
  to_wallet_id INTEGER NOT NULL,
  from_amount DECIMAL(10,2) NOT NULL,
  to_amount DECIMAL(10,2) NOT NULL,
  rate DECIMAL(10,4) NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (from_wallet_id) REFERENCES wallets(id),
  FOREIGN KEY (to_wallet_id) REFERENCES wallets(id)
);

-- Insert test data
INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, exchange_rate, converted_amount) VALUES 
  (1, 11, 'income', 1000, 'Salario inicial', datetime('now'), 1.0, 1000),
  (1, 1, 'expense', 50, 'Comida rápida', datetime('now'), 1.0, 50);

-- Update wallets balance
UPDATE wallets SET balance = 950, updated_at = CURRENT_TIMESTAMP WHERE id = 1;

PRAGMA user_version = 4;