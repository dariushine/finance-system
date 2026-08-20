'use client';

import { useState, useCallback, useEffect } from 'react';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
  Typography,
  IconButton,
  ToggleButton,
  ToggleButtonGroup,
  Divider,
  Stack,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  DeleteOutlined,
  Restore as RestoreIcon,
  Label as LabelIcon,
} from '@mui/icons-material';
import {
  getCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  reactivateCategory,
  type Category,
} from '../lib/api';
import { isSystemCategoryName, categoryLabel } from '../lib/hooks';

const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#1abc9c', '#3498db', '#9b59b6', '#ff6b6b', '#34495e', '#95a5a6', '#27ae60', '#e84393'];

interface FormState {
  name: string;
  type: 'expense' | 'income';
  color: string;
}

const emptyForm = (type: 'expense' | 'income'): FormState => ({
  name: '',
  type,
  color: type === 'income' ? '#2ecc71' : '#e74c3c',
});

export default function CategoriesPage() {
  const [filterType, setFilterType] = useState<'expense' | 'income'>('expense');
  const [active, setActive] = useState<Category[]>([]);
  const [inactive, setInactive] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Dialog create
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm('expense'));
  const [saving, setSaving] = useState(false);

  // Dialog edit
  const [editing, setEditing] = useState<Category | null>(null);
  const [editName, setEditName] = useState('');
  const [editColor, setEditColor] = useState('');

  // Confirmación de borrado (Dialog MUI en vez de window.confirm)
  const [deleting, setDeleting] = useState<Category | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [act, inact] = await Promise.all([
        getCategories(filterType),
        getCategories(filterType, { includingInactive: true }).then((all) =>
          all.filter((c) => !c.isActive)
        ),
      ]);
      // Nunca mostramos las categorías de sistema en la UI de usuario.
      setActive(act.filter((c) => !isSystemCategoryName(c.name)));
      setInactive(inact.filter((c) => !isSystemCategoryName(c.name)));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar categorías');
    } finally {
      setLoading(false);
    }
  }, [filterType]);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = (type: 'expense' | 'income') => {
    setForm(emptyForm(type));
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setError('El nombre es requerido');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await createCategory({ ...form, name: form.name.trim() });
      setCreateOpen(false);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al crear');
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (cat: Category) => {
    setEditing(cat);
    setEditName(cat.name);
    setEditColor(cat.color || '#3498db');
  };

  const handleEdit = async () => {
    if (!editing) return;
    if (!editName.trim()) {
      setError('El nombre es requerido');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await updateCategory(editing.id, { name: editName.trim(), color: editColor });
      setEditing(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (cat: Category) => {
    try {
      await deleteCategory(cat.id);
      setDeleting(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al desactivar');
      setDeleting(null);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteSaving(true);
    await handleDelete(deleting);
    setDeleteSaving(false);
  };

  const handleReactivate = async (cat: Category) => {
    try {
      await reactivateCategory(cat.id);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al reactivar');
    }
  };

  const renderRow = (cat: Category) => (
    <Card
      key={cat.id}
      variant="outlined"
      sx={{ mb: 1 }}
    >
      <CardContent sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
        <Box
          sx={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            bgcolor: cat.color || '#999',
            flexShrink: 0,
          }}
        />
        <Typography variant="body1" sx={{ flexGrow: 1 }}>
          {categoryLabel(cat.name)}
        </Typography>
        {!cat.isActive && (
          <Chip label="Inactiva" size="small" variant="outlined" color="default" />
        )}
        <IconButton size="small" onClick={() => openEdit(cat)} aria-label="Editar">
          <EditIcon fontSize="small" />
        </IconButton>
        {cat.isActive ? (
          <IconButton size="small" onClick={() => setDeleting(cat)} aria-label="Desactivar">
            <DeleteOutlined fontSize="small" />
          </IconButton>
        ) : (
          <IconButton size="small" onClick={() => handleReactivate(cat)} aria-label="Reactivar">
            <RestoreIcon fontSize="small" />
          </IconButton>
        )}
      </CardContent>
    </Card>
  );

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={2} flexWrap="wrap" gap={1}>
        <Typography variant="h5">Categorías</Typography>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => openCreate(filterType)}
          disabled={loading}
        >
          Nueva
        </Button>
      </Box>

      <ToggleButtonGroup
        value={filterType}
        exclusive
        onChange={(_, v) => v && setFilterType(v)}
        size="small"
        sx={{ mb: 2 }}
      >
        <ToggleButton value="expense" color="error">Gastos</ToggleButton>
        <ToggleButton value="income" color="success">Ingresos</ToggleButton>
      </ToggleButtonGroup>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          <Typography variant="subtitle2" color="text.secondary" gutterBottom>
            {active.length} activa{active.length !== 1 ? 's' : ''}
          </Typography>
          {active.length === 0 && (
            <Typography variant="body2" color="text.secondary" sx={{ my: 2 }}>
              No hay categorías de {filterType === 'expense' ? 'gasto' : 'ingreso'} activas. Crea una nueva.
            </Typography>
          )}
          {active.map(renderRow)}

          {inactive.length > 0 && (
            <>
              <Divider sx={{ my: 3 }} />
              <Typography variant="subtitle2" color="text.secondary" gutterBottom>
                Desactivadas ({inactive.length})
              </Typography>
              {inactive.map(renderRow)}
            </>
          )}

          <Box mt={3} sx={{ color: 'text.secondary' }}>
            <Typography variant="caption">
              Las categorías de sistema (fee, exchange) están ocultas y no se pueden editar.
            </Typography>
          </Box>
        </>
      )}

      {/* Dialog: crear */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} fullWidth maxWidth="xs">
        <DialogTitle>Nueva categoría · {form.type === 'expense' ? 'Gasto' : 'Ingreso'}</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              autoFocus
              placeholder="ej: comida, transporte, freelance…"
            />
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1}>Color</Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {colors.map((c) => (
                  <Box
                    key={c}
                    onClick={() => setForm({ ...form, color: c })}
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      bgcolor: c,
                      cursor: 'pointer',
                      border: form.color === c ? '3px solid #000' : '2px solid transparent',
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button onClick={handleCreate} variant="contained" disabled={saving || !form.name.trim()}>
            {saving ? 'Creando…' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: editar */}
      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="xs">
        <DialogTitle>Editar categoría</DialogTitle>
        <DialogContent>
          <Stack spacing={2} mt={1}>
            <TextField
              label="Nombre"
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              autoFocus
            />
            <Box>
              <Typography variant="body2" color="text.secondary" mb={1}>Color</Typography>
              <Box display="flex" flexWrap="wrap" gap={1}>
                {colors.map((c) => (
                  <Box
                    key={c}
                    onClick={() => setEditColor(c)}
                    sx={{
                      width: 28,
                      height: 28,
                      borderRadius: '50%',
                      bgcolor: c,
                      cursor: 'pointer',
                      border: editColor === c ? '3px solid #000' : '2px solid transparent',
                    }}
                  />
                ))}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Cancelar</Button>
          <Button onClick={handleEdit} variant="contained" disabled={saving || !editName.trim()}>
            {saving ? 'Guardando…' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Dialog: confirmar desactivación */}
      <Dialog open={!!deleting} onClose={() => setDeleting(null)} fullWidth maxWidth="xs">
        <DialogTitle>Desactivar categoría</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Desactivar la categoría <b>{deleting ? categoryLabel(deleting.name) : ''}</b>? Las transacciones existentes se conservan.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button onClick={confirmDelete} variant="contained" color="error" disabled={deleteSaving}>
            {deleteSaving ? 'Desactivando…' : 'Desactivar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
