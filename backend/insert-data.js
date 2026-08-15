const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data/finance.db');
const db = new sqlite3.Database(dbPath);

// Primero verificar si existe categoría
db.get("SELECT id FROM categories LIMIT 1", (err, cat) => {
  if (err || !cat) {
    // Crear categoría si no existe
    db.run("INSERT INTO categories (name, type, color) VALUES ('salary', 'income', '#4CAF50')", function() {
      const categoryId = this.lastID;
      insertData(categoryId);
    });
  } else {
    insertData(cat.id);
  }
});

function insertData(categoryId) {
  console.log('Using category_id:', categoryId);
  
  // Actualizar wallets con balances
  const updates = [
    "UPDATE wallets SET balance = 1000 WHERE id = 1", // USD Bank
    "UPDATE wallets SET balance = 50000 WHERE id = 2", // VES Bank
    "UPDATE wallets SET balance = 200 WHERE id = 3", // USD Cash
    "UPDATE wallets SET balance = 100000 WHERE id = 4", // VES Cash
    "UPDATE wallets SET balance = 500 WHERE id = 5", // Crypto
    "UPDATE wallets SET balance = 100 WHERE id = 6", // Card
  ];
  
  let completed = 0;
  updates.forEach(sql => {
    db.run(sql, (err) => {
      if (err) console.error('Update error:', err.message);
      completed++;
      if (completed === updates.length) {
        insertTransactions(categoryId);
      }
    });
  });
}

function insertTransactions(categoryId) {
  const today = new Date().toISOString().split('T')[0];
  
  const transactions = [
    `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, exchange_rate, converted_amount) 
     VALUES (1, ${categoryId}, 'income', 1000, 'Salario inicial', '${today}', 1.0, 1000)`,
    `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, exchange_rate, converted_amount) 
     VALUES (2, ${categoryId}, 'income', 50000, 'Ingreso en VES', '${today}', 635.0, 78.74)`,
    `INSERT INTO transactions (wallet_id, category_id, type, amount, description, date, exchange_rate, converted_amount) 
     VALUES (3, ${categoryId}, 'expense', 50, 'Comida rápida', '${today}', 1.0, 50)`,
  ];
  
  let completed = 0;
  transactions.forEach(sql => {
    db.run(sql, (err) => {
      if (err) console.error('Transaction insert error:', err.message);
      completed++;
      if (completed === transactions.length) {
        console.log('Data inserted successfully!');
        verifyData();
      }
    });
  });
}

function verifyData() {
  db.all("SELECT id, name, currency, balance FROM wallets", (err, wallets) => {
    if (err) console.error('Error reading wallets:', err.message);
    else console.log('Wallets:', wallets);
    
    db.all("SELECT id, wallet_id, type, amount, description FROM transactions", (err, trans) => {
      if (err) console.error('Error reading transactions:', err.message);
      else console.log('Transactions:', trans);
      
      db.close();
    });
  });
}