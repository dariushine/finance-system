// src/services/categories.js — Lógica de categorías (crear/buscar, sistema).
const { db } = require('../db');


// Busca una categoría activa por nombre+tipo. Si no existe, la crea de forma
// idempotente (nueva categoría con color por tipo). Devuelve la fila (id, name...).
// Evita crear categorías del sistema (fee, exchange_out, exchange_in): si se pide
// una de estas y no existe, se rechaza el error para no corromper los flujos.
function getOrCreateCategory(categoryName, type) {
  return new Promise((resolve, reject) => {
    const name = String(categoryName || '').trim();
    if (!name) return reject(new Error('Nombre de categoría vacío'));
    if (!type || (type !== 'income' && type !== 'expense')) {
      return reject(new Error('type debe ser income o expense'));
    }
    db.get('SELECT * FROM categories WHERE name = ? AND type = ?', [name, type], (err, row) => {
      if (err) return reject(err);
      if (row) {
        // Existe (incluida una de sistema como exchange_out/fee): devolverla tal cual.
        // Si estaba desactivada, reactivar para poder usarla.
        if (!row.isActive && !isSystemCategoryName(row.name)) {
          db.run('UPDATE categories SET isActive = 1 WHERE id = ?', [row.id], (upErr) => {
            if (upErr) return reject(upErr);
            resolve({ ...row, isActive: 1 });
          });
        } else {
          resolve(row);
        }
        return;
      }
      // No existe: crear una nueva, pero nunca una de sistema (solo se crean vía exchange).
      if (isSystemCategoryName(name)) {
        return reject(new Error(`No puedes crear la categoría de sistema '${name}'`));
      }
      const color = type === 'income' ? '#2ecc71' : '#e74c3c';
      db.run(
        'INSERT INTO categories (name, type, color) VALUES (?, ?, ?)',
        [name, type, color],
        function (insErr) {
          if (insErr) {
            // Carrera (concurrente): reintentar lectura.
            if (/UNIQUE/.test(String(insErr.message))) {
              db.get('SELECT * FROM categories WHERE name = ? AND type = ?', [name, type], (e2, r2) => {
                if (e2) return reject(e2);
                resolve(r2);
              });
            } else {
              reject(insErr);
            }
            return;
          }
          db.get('SELECT * FROM categories WHERE id = ?', [this.lastID], (e3, r3) => {
            if (e3) return reject(e3);
            resolve(r3);
          });
        }
      );
    });
  });
}


module.exports = { getOrCreateCategory, isSystemCategoryName };


// Comunica la categoría fee/exchange por nombre según tipo de categoría usada.
function isSystemCategoryName(name) {
  return ['fee', 'exchange_out', 'exchange_in'].includes(String(name));
}
