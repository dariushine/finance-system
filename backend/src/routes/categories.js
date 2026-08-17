// src/routes/categories.js — Endpoints HTTP de categorías (delegan en services).
const { db } = require('../db');
const { isSystemCategoryName } = require('../services/categories');

module.exports = function registerCategoriesRoutes(app) {
  // Listar categorías. ?type=income|expense filtra por tipo; por defecto solo activas.
  app.get('/api/categories', (req, res) => {
    const { type } = req.query;
    let sql = 'SELECT * FROM categories WHERE isActive = 1';
    const params = [];
    if (type === 'income' || type === 'expense') {
      sql += ' AND type = ?';
      params.push(type);
    }
    db.all(`${sql} ORDER BY name`, params, (err, rows) => {
      if (err) return res.status(500).json({ error: err.message });
      res.json(rows);
    });
  });

  // Crear una categoría.
  app.post('/api/categories', (req, res) => {
    const { name, type, color, icon } = req.body || {};
    const trimmedName = String(name || '').trim();
    if (!trimmedName) return res.status(400).json({ error: 'El nombre es requerido' });
    if (type !== 'income' && type !== 'expense') {
      return res.status(400).json({ error: 'type debe ser income o expense' });
    }
    if (isSystemCategoryName(trimmedName)) {
      return res.status(400).json({ error: `No puedes crear la categoría de sistema '${trimmedName}'` });
    }
    db.run(
      'INSERT INTO categories (name, type, color, icon) VALUES (?, ?, ?, ?)',
      [trimmedName, type, color || (type === 'income' ? '#2ecc71' : '#e74c3c'), icon || null],
      function (err) {
        if (err) return res.status(400).json({ error: err.message });
        db.get('SELECT * FROM categories WHERE id = ?', [this.lastID], (e, row) => {
          if (e) return res.status(500).json({ error: e.message });
          res.status(201).json(row);
        });
      }
    );
  });

  // Editar una categoría (nombre, color, icono). Se bloquea en categorías del sistema.
  app.put('/api/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    db.get('SELECT * FROM categories WHERE id = ? AND isActive = 1', [id], (err, cat) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
      if (isSystemCategoryName(cat.name)) {
        return res.status(400).json({ error: `No puedes editar la categoría de sistema '${cat.name}'` });
      }
      const { name, color, icon } = req.body || {};
      const newName = name != null ? String(name).trim() : cat.name;
      if (!newName) return res.status(400).json({ error: 'El nombre no puede quedar vacío' });
      if (isSystemCategoryName(newName) && newName !== cat.name) {
        return res.status(400).json({ error: `No puedes renombrar a la categoría de sistema '${newName}'` });
      }
      db.run(
        'UPDATE categories SET name = ?, color = ?, icon = ? WHERE id = ?',
        [newName, color != null ? color : cat.color, icon !== undefined ? icon : cat.icon, id],
        (uerr) => {
          if (uerr) return res.status(400).json({ error: uerr.message });
          db.get('SELECT * FROM categories WHERE id = ?', [id], (e, row) => {
            if (e) return res.status(500).json({ error: e.message });
            res.json(row);
          });
        }
      );
    });
  });

  // Soft-delete / reactivar categoría. DELETE marca isActive=0 (conserva historial).
  app.delete('/api/categories/:id', (req, res) => {
    const id = Number(req.params.id);
    db.get('SELECT * FROM categories WHERE id = ? AND isActive = 1', [id], (err, cat) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!cat) return res.status(404).json({ error: 'Categoría no encontrada' });
      if (isSystemCategoryName(cat.name)) {
        return res.status(400).json({ error: `No puedes eliminar la categoría de sistema '${cat.name}'` });
      }
      db.run('UPDATE categories SET isActive = 0 WHERE id = ?', [id], (e) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json({ success: true });
      });
    });
  });

  // Reactivar (deshacer soft-delete)
  app.put('/api/categories/:id/reactivate', (req, res) => {
    const id = Number(req.params.id);
    db.run('UPDATE categories SET isActive = 1 WHERE id = ?', [id], (err) => {
      if (err) return res.status(500).json({ error: err.message });
      db.get('SELECT * FROM categories WHERE id = ?', [id], (e, row) => {
        if (e) return res.status(500).json({ error: e.message });
        res.json(row);
      });
    });
  });
};
