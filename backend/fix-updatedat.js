const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'finance-api-enhanced.js');
let content = fs.readFileSync(filePath, 'utf8');

// Remove updatedAt = CURRENT_TIMESTAMP from line
content = content.replace(
  /UPDATE wallets SET balance = balance \+ \?, updatedAt = CURRENT_TIMESTAMP WHERE id = \?/g,
  'UPDATE wallets SET balance = balance + ? WHERE id = ?'
);

// Also remove any other occurrences
content = content.replace(/updatedAt = CURRENT_TIMESTAMP,?\s*/g, '');

fs.writeFileSync(filePath, content, 'utf8');
console.log('Fixed updatedAt references in finance-api-enhanced.js');