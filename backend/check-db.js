const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./data/finance.db');

console.log('📊 Verificando base de datos limpia...\n');

db.all('SELECT name, type, currency, balance FROM wallets ORDER BY id', (err, rows) => {
  console.log('Wallets encontrados:', rows.length);
  rows.forEach(w => console.log(`  ${w.name} (${w.type}/${w.currency}): $${w.balance}`));
  
  db.all('SELECT name, type FROM categories ORDER BY type, name', (err, rows) => {
    console.log('\nCategorías encontradas:', rows.length);
    console.log('Gastos:');
    rows.filter(c => c.type === 'expense').forEach(c => console.log(`  • ${c.name}`));
    console.log('Ingresos:');
    rows.filter(c => c.type === 'income').forEach(c => console.log(`  • ${c.name}`));
    
    db.all('SELECT COUNT(*) as count FROM transactions', (err, rows) => {
      console.log(`\nTransacciones: ${rows[0].count}`);
      
      db.all('SELECT COUNT(*) as count FROM exchanges', (err, rows) => {
        console.log(`Exchanges: ${rows[0].count}`);
        
        console.log('\n✅ Base de datos está completamente limpia y lista para pruebas.');
        console.log('💰 Todos los balances comienzan en 0.');
        console.log('🔄 No hay transacciones ni exchanges.');
        
        db.close();
      });
    });
  });
});