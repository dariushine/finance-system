const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data/finance.db');
const db = new sqlite3.Database(dbPath);

console.log('Checking database tables...');

db.all("SELECT name FROM sqlite_master WHERE type='table'", (err, tables) => {
  if (err) {
    console.error('Error:', err.message);
    return;
  }
  
  console.log('Tables found:', tables.map(t => t.name));
  
  // Check wallets
  db.all("SELECT * FROM wallets LIMIT 5", (err, wallets) => {
    if (err) {
      console.error('Error reading wallets:', err.message);
    } else {
      console.log('Sample wallets:', wallets);
    }
    
    // Check transactions
    db.all("SELECT * FROM transactions LIMIT 5", (err, transactions) => {
      if (err) {
        console.error('Error reading transactions:', err.message);
      } else {
        console.log('Sample transactions:', transactions);
      }
      
      db.close();
    });
  });
});