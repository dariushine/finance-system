const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const fs = require('fs');

const dbPath = path.join(__dirname, 'data/finance.db');

// Backup y eliminar base existente
if (fs.existsSync(dbPath)) {
  const backupPath = `${dbPath}.backup.${Date.now()}`;
  fs.copyFileSync(dbPath, backupPath);
  console.log(`Backup creado en: ${backupPath}`);
  fs.unlinkSync(dbPath);
  console.log('Base de datos anterior eliminada');
}

// Crear nueva base de datos
const db = new sqlite3.Database(dbPath);

// Crear tablas en orden correcto usando serialización
const createTables = () => {
  console.log('Creando tablas...');
  
  // Tabla wallets con updated_at
  db.run(`
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
    )
  `, (err) => {
    if (err) console.error('Error creando tabla wallets:', err.message);
    else console.log('Tabla wallets creada');
    
    // Tabla categories
    db.run(`
      CREATE TABLE categories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        color TEXT,
        icon TEXT,
        isActive BOOLEAN DEFAULT 1,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `, (err) => {
      if (err) console.error('Error creando tabla categories:', err.message);
      else console.log('Tabla categories creada');
      
      // Tabla transactions
      db.run(`
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
        )
      `, (err) => {
        if (err) console.error('Error creando tabla transactions:', err.message);
        else console.log('Tabla transactions creada');
        
        // Tabla exchanges
        db.run(`
          CREATE TABLE exchanges (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            from_wallet_id INTEGER NOT NULL,
            to_wallet_id INTEGER NOT NULL,
            from_amount DECIMAL(10,2) NOT NULL,
            to_amount DECIMAL(10,2) NOT NULL,
            rate DECIMAL(10,4) NOT NULL,
            description TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (from_wallet_id) REFERENCES wallets( id),
            FOREIGN KEY (to_wallet_id) REFERENCES wallets(id)
          )
        `, (err) => {
          if (err) console.error('Error creando tabla exchanges:', err.message);
          else console.log('Tabla exchanges creada');
          
          // Ahora insertar datos
          insertWallets();
        });
      });
    });
  });
};

const insertWallets = () => {
  console.log('Insertando wallets...');
  const wallets = [
    ['Cuenta Bancaria USD', 'bank', 'USD', 'Cuenta bancaria en dólares'],
    ['Cuenta Bancaria VES', 'bank', 'VES', 'Cuenta bancaria en bolívares'],
    ['Efectivo USD', 'cash', 'USD', 'Efectivo en dólares'],
    ['Efectivo VES', 'cash', 'VES', 'Efectivo en bolívares'],
    ['Crypto Wallet', 'crypto', 'USD', 'Wallet de criptomonedas (Binance, etc.)'],
    ['Tarjeta Prepagada', 'card', 'USD', 'Tarjeta prepagada internacional']
  ];

  let walletCount = 0;
  wallets.forEach(([name, type, currency, description]) => {
    db.run(
      'INSERT INTO wallets (name, type, currency, description, balance) VALUES (?, ?, ?, ?, ?)',
      [name, type, currency, description, 0],
      (err) => {
        if (err) console.error(`Error insertando wallet ${name}:`, err.message);
        else walletCount++;
        
        if (walletCount === wallets.length) {
          console.log(`${walletCount} wallets insertadas`);
          insertCategories();
        }
      }
    );
  });
};

const insertCategories = () => {
  console.log('Insertando categorías...');
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
    ['other_income', 'income', '#34495e']
  ];
  
  let categoryCount = 0;
  categories.forEach(([name, type, color]) => {
    db.run(
      'INSERT INTO categories (name, type, color) VALUES (?, ?, ?)',
      [name, type, color],
      (err) => {
        if (err) console.error(`Error insertando categoría ${name}:`, err.message);
        else categoryCount++;
        
        if (categoryCount === categories.length) {
          console.log(`${categoryCount} categorías insertadas`);
          finalize();
        }
      }
    );
  });
};

const finalize = () => {
  db.all('SELECT COUNT(*) as count FROM wallets', (err, rows) => {
    console.log(`Total wallets: ${rows[0].count}`);
  });
  
  db.all('SELECT COUNT(*) as count FROM categories', (err, rows) => {
    console.log(`Total categorías: ${rows[0].count}`);
  });
  
  console.log('\n✅ Base de datos limpia creada exitosamente');
  console.log('📁 Archivo: data/finance.db');
  console.log('💰 Wallets: 6 (todos con balance 0)');
  console.log('🏷️  Categorías: 15 (7 gastos, 8 ingresos)');
  console.log('🔧 Tablas: wallets, categories, transactions, exchanges');
  
  db.close();
};

// Iniciar proceso
createTables();