'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  IconButton,
  ListItemIcon,
  Menu,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Snackbar,
  Stack,
  TextField,
  Typography,
  useTheme,
  Tooltip,
} from '@mui/material';
import {
  ArrowBack,
  ArrowUpward,
  ArrowDownward,
  AccountBalanceWallet,
  ReceiptLong,
  CalendarMonth,
  Notes,
  Tag,
  ChevronRight,
  InfoOutlined,
  SwapHoriz,
  Edit as EditIcon,
  DeleteOutline,
  Add as AddIcon,
  Link as LinkIcon,
  Menu as MenuIcon,
} from '@mui/icons-material';
import {
  getTransaction,
  updateTransaction,
  deleteTransaction,
  addTransactionFee,
  createAssociatedTransaction,
  TransactionDetail,
} from '../../lib/api';
import { parseLocalDate } from '../../lib/dates';

const formatDate = (dateString?: string) => {
  if (!dateString) return '—';
  return parseLocalDate(dateString).toLocaleDateString('es-VE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatTime = (dateString?: string) => {
  if (!dateString) return '—';
  const d = parseLocalDate(dateString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
};

// Muestra una hora cruda HH:MM o HH:MM:SS sin pasar por parseLocalDate.
const formatTimeOnly = (time?: string | null) => {
  if (!time) return '';
  return time.slice(0, 5); // HH:MM
};

const formatCurrency = (n: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
};

const todayISODate = () => new Date().toISOString().split('T')[0];

const EXPENSE_CATEGORIES = ['food', 'transport', 'housing', 'utilities', 'entertainment', 'health', 'shopping', 'other_expense'];
const INCOME_CATEGORIES = ['salary', 'freelance', 'investment', 'gift', 'other_income'];
const SYSTEM_CATEGORIES = ['fee', 'exchange_out', 'exchange_in'];

export default function TransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);
  const theme = useTheme();

  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Diálogos
  const [editOpen, setEditOpen] = useState(false);
  const [feeOpen, setFeeOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [assocOpen, setAssocOpen] = useState(false);

  // Form editar
  const [editForm, setEditForm] = useState({ description: '', amount: '', date: '', time: '' });
  const [editCategory, setEditCategory] = useState('');
  const [saving, setSaving] = useState(false);

  // Form fee
  const [feeAmount, setFeeAmount] = useState('');
  const [feeDate, setFeeDate] = useState('');
  const [feeTime, setFeeTime] = useState('');

  // Form asociada
  const [assocForm, setAssocForm] = useState({ amount: '', type: 'expense' as 'income' | 'expense', categoryName: '', description: '', date: '', time: '' });

  // Feedback
  const [snackbar, setSnackbar] = useState<{ open: boolean; severity: 'success' | 'error' | 'warning'; message: string }>({
    open: false, severity: 'success', message: '',
  });

  // Menú hamburguesa de acciones
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const closeMenu = () => setMenuAnchor(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTransaction(id);
      setTx(data);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar la transacción');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const notice = (message: string, severity: 'success' | 'error' | 'warning' = 'success') =>
    setSnackbar({ open: true, severity, message });

  const isFee = tx ? tx.category === 'fee' : false;
  const isExchange = tx ? !!tx.isExchangeMember : false;

  // Un fee no puede tener comisión ni asociadas; el exchange es inmutable.
  const blockIfExchange = () => {
    if (isExchange) {
      notice('Esta transacción pertenece a un exchange. Edítala desde el panel de exchange (feature futuro).', 'warning');
      return true;
    }
    return false;
  };

  // --- Editar ---
  const openEdit = () => {
    if (!tx) return;
    if (blockIfExchange()) return;
    setEditForm({
      description: tx.description || '',
      amount: String(tx.amount),
      date: tx.date || todayISODate(),
      time: tx.time ? tx.time.slice(0, 5) : '',
    });
    setEditCategory(tx.category);
    setEditOpen(true);
  };

  const saveEdit = async () => {
    if (!tx) return;
    setSaving(true);
    try {
      const payload: any = { description: editForm.description };
      const amount = Number(editForm.amount);
      if (Number.isFinite(amount) && amount > 0) payload.amount = amount;
      if (editForm.date) payload.date = editForm.date;
      payload.time = editForm.time || undefined;
      // Categoría editable solo en no-fee y no-exchange
      if (!isFee && editCategory !== tx.category && !SYSTEM_CATEGORIES.includes(editCategory)) {
        payload.categoryName = editCategory;
      }
      const res = await updateTransaction(id, payload);
      if (!res?.success) throw new Error(res?.error || 'Error al editar');
      notice('Transacción actualizada');
      setEditOpen(false);
      await load();
    } catch (e: any) {
      notice(e?.message || 'Error al editar', 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Eliminar ---
  const confirmDelete = async () => {
    if (!tx) return;
    if (blockIfExchange()) { setDelOpen(false); return; }
    setSaving(true);
    try {
      const res = await deleteTransaction(id);
      if (!res?.success) throw new Error(res?.error || 'Error al eliminar');
      notice('Transacción eliminada');
      setDelOpen(false);
      router.push('/transactions');
    } catch (e: any) {
      notice(e?.message || 'Error al eliminar', 'error');
      setDelOpen(false);
    } finally {
      setSaving(false);
    }
  };

  // --- Agregar comisión ---
  const openFee = () => {
    if (!tx) return;
    if (blockIfExchange()) return;
    if (isFee) { notice('No puedes agregar comisión a una comisión (fee).', 'warning'); return; }
    setFeeAmount('');
    setFeeDate(tx.date || todayISODate());
    setFeeTime(tx.time ? tx.time.slice(0, 5) : '');
    setFeeOpen(true);
  };

  const saveFee = async () => {
    if (!tx) return;
    setSaving(true);
    try {
      const amount = Number(feeAmount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto de la comisión debe ser mayor a 0');
      const res = await addTransactionFee(id, { amount, date: feeDate || undefined, time: feeTime || undefined });
      if (!res?.success) throw new Error(res?.error || 'Error al agregar comisión');
      notice('Comisión agregada');
      setFeeOpen(false);
      await load();
    } catch (e: any) {
      notice(e?.message || 'Error al agregar comisión', 'error');
    } finally {
      setSaving(false);
    }
  };

  // --- Crear asociada ---
  const openAssoc = () => {
    if (!tx) return;
    if (blockIfExchange()) return;
    if (isFee) { notice('No puedes crear transacciones asociadas a una comisión (fee).', 'warning'); return; }
    setAssocForm({ amount: '', type: 'expense', categoryName: '', description: '', date: tx.date || todayISODate(), time: tx.time ? tx.time.slice(0, 5) : '' });
    setAssocOpen(true);
  };

  const saveAssoc = async () => {
    if (!tx) return;
    setSaving(true);
    try {
      const amount = Number(assocForm.amount);
      if (!Number.isFinite(amount) || amount <= 0) throw new Error('El monto debe ser mayor a 0');
      if (SYSTEM_CATEGORIES.includes(assocForm.categoryName)) throw new Error('No puedes usar categorías del sistema (fee, exchange).');
      const res = await createAssociatedTransaction(id, {
        amount,
        type: assocForm.type,
        categoryName: assocForm.categoryName,
        description: assocForm.description || undefined,
        date: assocForm.date || undefined,
        time: assocForm.time || undefined,
      });
      if (!res?.success) throw new Error(res?.error || 'Error al crear asociada');
      notice('Transacción asociada creada');
      setAssocOpen(false);
      await load();
    } catch (e: any) {
      notice(e?.message || 'Error al crear asociada', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !tx) {
    return (
      <Box>
        <Button startIcon={<ArrowBack />} onClick={() => router.push('/transactions')} sx={{ mb: 2 }}>
          Volver a transacciones
        </Button>
        <Alert severity="error">{error || 'Transacción no encontrada'}</Alert>
      </Box>
    );
  }

  const isIncome = tx.type === 'income';
  const currency = tx.walletCurrency || 'USD';
  const children = tx.children || [];
  const hasChildren = children.length > 0;

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => router.push('/transactions')} sx={{ mb: 2 }}>
        Volver a transacciones
      </Button>

      {/* Header / monto principal */}
      <Card sx={{ mb: 3, position: 'relative' }}>
        {/* Menú de acciones (esquina superior derecha) */}
        <Box display="flex" justifyContent="flex-end" px={2} pt={1}>
          <IconButton
            aria-label="Acciones de transacción"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            size="medium"
          >
            <MenuIcon />
          </IconButton>
          <Menu
            anchorEl={menuAnchor}
            open={Boolean(menuAnchor)}
            onClose={closeMenu}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
          >
            <MenuItem onClick={() => { closeMenu(); openEdit(); }}>
              <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
              Editar
            </MenuItem>
            <MenuItem onClick={() => { closeMenu(); if (!blockIfExchange()) setDelOpen(true); }}>
              <ListItemIcon><DeleteOutline fontSize="small" color="error" /></ListItemIcon>
              Eliminar
            </MenuItem>
            <MenuItem onClick={() => { closeMenu(); openFee(); }}>
              <ListItemIcon><ReceiptLong fontSize="small" /></ListItemIcon>
              Agregar comisión
            </MenuItem>
            <MenuItem onClick={() => { closeMenu(); openAssoc(); }}>
              <ListItemIcon><LinkIcon fontSize="small" /></ListItemIcon>
              Crear asociada
            </MenuItem>
          </Menu>
        </Box>

        <CardContent sx={{ pt: 0 }}>
          <Stack spacing={2} alignItems="center" textAlign="center">
            <Avatar
              sx={{
                width: { xs: 64, sm: 72 },
                height: { xs: 64, sm: 72 },
                bgcolor: isIncome ? theme.palette.success.light : theme.palette.error.light,
              }}
            >
              {isIncome ? <ArrowUpward fontSize="large" /> : <ArrowDownward fontSize="large" />}
            </Avatar>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" textTransform="uppercase" letterSpacing={1}>
                {isIncome ? 'Ingreso' : 'Gasto'} · {tx.category}
              </Typography>
              <Typography
                variant="h3"
                fontWeight="bold"
                color={isIncome ? 'success.main' : 'error.main'}
                sx={{ fontSize: { xs: '2rem', sm: '2.5rem' } }}
              >
                {isIncome ? '+' : '-'}{formatCurrency(tx.amount, currency)}
              </Typography>
              {tx.walletName && (
                <Box
                  component="button"
                  onClick={() => router.push(`/wallets/${tx.walletId}`)}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.75,
                    mx: 'auto',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'text.primary',
                    '&:hover': { textDecoration: 'underline', color: 'primary.main' },
                  }}
                >
                  <AccountBalanceWallet fontSize="small" color="action" />
                  <Typography variant="body1" fontWeight="medium">{tx.walletName}</Typography>
                </Box>
              )}
              {/* Comisión debajo de la billetera */}
              {(tx.fee ?? 0) > 0 && (
                <Chip
                  icon={<ReceiptLong />}
                  label={`Comisión ${formatCurrency(tx.fee!, currency)}`}
                  color="warning"
                  variant="outlined"
                  sx={{ display: 'flex', width: 'fit-content', mx: 'auto', mt: 1 }}
                />
              )}
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={3} mb={3}>
        {/* Detalle */}
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <ReceiptLong color="action" />
              <Typography variant="h6">Detalle</Typography>
            </Box>
            <Stack divider={<Divider flexItem />} spacing={1.5}>
              <InfoRow label="Categoría" value={<Chip size="small" label={tx.category} variant="outlined" />} />
              <InfoRow
                label="Tipo"
                value={
                  <Chip
                    size="small"
                    label={isIncome ? 'Ingreso' : 'Gasto'}
                    color={isIncome ? 'success' : 'error'}
                    variant="outlined"
                  />
                }
              />
              <Box display="flex" justifyContent="space-between" gap={2}>
                <Typography variant="body2" color="text.secondary">Billetera</Typography>
                <Box
                  component="button"
                  onClick={() => router.push(`/wallets/${tx.walletId}`)}
                  sx={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 0.5,
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    color: 'text.primary',
                    '&:hover': { textDecoration: 'underline', color: 'primary.main' },
                  }}
                >
                  <AccountBalanceWallet fontSize="small" color="action" />
                  <Typography variant="body2">{tx.walletName || `#${tx.walletId}`}</Typography>
                  <ChevronRight fontSize="small" color="action" />
                </Box>
              </Box>
              {tx.date && (
                <Box display="flex" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">Fecha</Typography>
                  <Box textAlign="right">
                    <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                      <CalendarMonth fontSize="small" color="action" />
                      <Typography variant="body2">{formatDate(tx.date)}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">{tx.time ? formatTimeOnly(tx.time) : formatTime(tx.createdAt || tx.date)}</Typography>
                  </Box>
                </Box>
              )}
              {tx.description && (
                <Box display="flex" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">Descripción</Typography>
                  <Box display="flex" alignItems="flex-start" gap={0.5}>
                    <Notes fontSize="small" color="action" sx={{ mt: 0.25 }} />
                    <Typography variant="body2" textAlign="right">{tx.description}</Typography>
                  </Box>
                </Box>
              )}
              {tx.balanceAfter != null && (
                <InfoRow
                  label="Saldo resultante"
                  value={
                    <Typography variant="body1" fontWeight="bold" color="primary.main">
                      {formatCurrency(tx.balanceAfter, currency)}
                    </Typography>
                  }
                  hint="Saldo de la billetera después de esta transacción, sin contar la comisión (se aplica aparte)"
                />
              )}
              {tx.parentTransactionId != null && (
                <Box display="flex" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">Transacción asociada</Typography>
                  <Box
                    component="button"
                    onClick={() => router.push(`/transactions/${tx.parentTransactionId!}`)}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'primary.main',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    <ReceiptLong fontSize="small" />
                    #{tx.parentTransactionId}
                    <ChevronRight fontSize="small" />
                  </Box>
                </Box>
              )}
              {tx.isExchangeMember && tx.exchangeId != null && (
                <Box display="flex" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">Exchange</Typography>
                  <Box
                    component="button"
                    onClick={() => router.push(`/exchanges/${tx.exchangeId}`)}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                      color: 'primary.main',
                      fontWeight: 600,
                      fontSize: '0.875rem',
                      '&:hover': { textDecoration: 'underline' },
                    }}
                  >
                    <SwapHoriz fontSize="small" />
                    #{tx.exchangeId}
                    <ChevronRight fontSize="small" />
                  </Box>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Transacciones asociadas */}
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <Tag color="action" />
              <Typography variant="h6">Transacciones asociadas</Typography>
              {hasChildren && <Chip size="small" label={`${children.length}`} />}
            </Box>
            {hasChildren ? (
              <Stack spacing={1}>
                {children.map((c) => (
                  <TransactionChildRow key={c.id} child={c} currency={currency} onClick={() => router.push(`/transactions/${c.id}`)} />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">Sin transacciones asociadas.</Typography>
            )}
          </CardContent>
        </Card>
      </Box>

      {/* Diálogo editar */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar transacción</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <TextField
              label="Descripción"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />
            <TextField
              label="Monto"
              type="number"
              value={editForm.amount}
              onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
              fullWidth
              InputProps={{ endAdornment: <span>{currency}</span> }}
            />
            <TextField
              label="Fecha"
              type="date"
              value={editForm.date}
              onChange={(e) => setEditForm({ ...editForm, date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="No puede ser anterior a su padre ni posterior a sus asociadas"
            />
            <TextField
              label="Hora (opcional)"
              type="time"
              value={editForm.time}
              onChange={(e) => setEditForm({ ...editForm, time: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Se aplica la misma regla de fecha a la hora"
            />
            <FormControl fullWidth disabled={isFee}>
              <InputLabel>Categoría</InputLabel>
              <Select
                value={editCategory}
                label="Categoría"
                onChange={(e) => setEditCategory(e.target.value as string)}
              >
                {(tx.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)
                  .filter((c) => !SYSTEM_CATEGORIES.includes(c))
                  .map((c) => (
                    <MenuItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</MenuItem>
                  ))}
              </Select>
            </FormControl>
            {isFee && (
              <Typography variant="caption" color="text.secondary">
                La categoría de una comisión (fee) no se puede cambiar.
              </Typography>
            )}
            {isExchange && (
              <Typography variant="caption" color="text.secondary">
                Transacciones de exchange: immutables desde aquí.
              </Typography>
            )}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={saveEdit} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo eliminar */}
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Eliminar transacción</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Seguro que quieres eliminar esta transacción de <b>{formatCurrency(tx.amount, currency)}</b>?
            Se eliminará virtualmente (no se borra de la base) y el balance de la billetera se ajustará.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={saving}>
            {saving ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo agregar comisión */}
      <Dialog open={feeOpen} onClose={() => setFeeOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Agregar comisión</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <Typography variant="body2" color="text.secondary">
              Se creará una nueva transacción de tipo comisión (fee). Si la transacción ya tiene una comisión, se agrega otra adicional.
            </Typography>
            <TextField
              label="Monto de la comisión"
              type="number"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
              fullWidth
              autoFocus
              InputProps={{ endAdornment: <span>{currency}</span> }}
            />
            <TextField
              label="Fecha (opcional)"
              type="date"
              value={feeDate}
              onChange={(e) => setFeeDate(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Por defecto la de la transacción; no puede ser anterior"
            />
            <TextField
              label="Hora (opcional)"
              type="time"
              value={feeTime}
              onChange={(e) => setFeeTime(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Por defecto la de la transacción; no puede ser anterior"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setFeeOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={saveFee} disabled={saving}>
            {saving ? 'Agregando...' : 'Agregar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo crear asociada */}
      <Dialog open={assocOpen} onClose={() => setAssocOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Crear transacción asociada</DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <TextField
              label="Monto"
              type="number"
              value={assocForm.amount}
              onChange={(e) => setAssocForm({ ...assocForm, amount: e.target.value })}
              fullWidth
              autoFocus
              InputProps={{ endAdornment: <span>{currency}</span> }}
            />
            <FormControl fullWidth>
              <InputLabel>Tipo</InputLabel>
              <Select
                value={assocForm.type}
                label="Tipo"
                onChange={(e) => setAssocForm({ ...assocForm, type: e.target.value as 'income' | 'expense', categoryName: '' })}
              >
                <MenuItem value="expense">Gasto</MenuItem>
                <MenuItem value="income">Ingreso</MenuItem>
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Categoría</InputLabel>
              <Select
                value={assocForm.categoryName}
                label="Categoría"
                onChange={(e) => setAssocForm({ ...assocForm, categoryName: e.target.value as string })}
              >
                {(assocForm.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES)
                  .filter((c) => !SYSTEM_CATEGORIES.includes(c))
                  .map((c) => (
                    <MenuItem key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</MenuItem>
                  ))}
              </Select>
            </FormControl>
            <TextField
              label="Descripción"
              value={assocForm.description}
              onChange={(e) => setAssocForm({ ...assocForm, description: e.target.value })}
              multiline
              rows={2}
              fullWidth
            />
            <TextField
              label="Fecha (opcional)"
              type="date"
              value={assocForm.date}
              onChange={(e) => setAssocForm({ ...assocForm, date: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Por defecto la de la transacción; no puede ser anterior"
            />
            <TextField
              label="Hora (opcional)"
              type="time"
              value={assocForm.time}
              onChange={(e) => setAssocForm({ ...assocForm, time: e.target.value })}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Por defecto la de la transacción; no puede ser anterior"
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAssocOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={saveAssoc} disabled={saving || !assocForm.categoryName}>
            {saving ? 'Creando...' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar de feedback */}
      <Snackbar
        open={snackbar.open}
        autoHideDuration={4000}
        onClose={() => setSnackbar((s) => ({ ...s, open: false }))}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

function InfoRow({ label, value, hint }: { label: string; value: React.ReactNode; hint?: string }) {
  return (
    <Box display="flex" justifyContent="space-between" gap={2}>
      <Box display="flex" alignItems="center" gap={0.5}>
        <Typography variant="body2" color="text.secondary">{label}</Typography>
        {hint && (
          <Tooltip title={hint} arrow placement="top">
            <InfoOutlined
              fontSize="small"
              sx={{ color: 'text.disabled', cursor: 'help', fontSize: 15 }}
            />
          </Tooltip>
        )}
      </Box>
      <Box>{value}</Box>
    </Box>
  );
}

function TransactionChildRow({
  child,
  currency,
  onClick,
}: {
  child: TransactionDetail;
  currency: string;
  onClick: () => void;
}) {
  const isIncome = child.type === 'income';
  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        boxShadow: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        '&:hover': { backgroundColor: 'action.hover' },
      }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" gap={1}>
          <Stack spacing={0.25}>
            <Typography variant="body2" fontWeight="bold">{child.category}</Typography>
            {child.description && (
              <Typography variant="caption" color="text.secondary">{child.description}</Typography>
            )}
          </Stack>
          <Box display="flex" alignItems="center" gap={0.5}>
            <Typography variant="body1" fontWeight="bold" color={isIncome ? 'success.main' : 'error.main'}>
              {isIncome ? '+' : '-'}{formatCurrency(child.amount, child.walletCurrency || currency)}
            </Typography>
            <ChevronRight fontSize="small" color="action" />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
