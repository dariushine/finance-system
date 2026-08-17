'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
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
  FormControl,
  IconButton,
  InputLabel,
  ListItemIcon,
  Menu,
  MenuItem,
  Select,
  Snackbar,
  Stack,
  TextField,
  Typography,
  useTheme,
} from '@mui/material';
import {
  ArrowBack,
  ArrowUpward,
  ArrowDownward,
  AccountBalanceWallet,
  Schedule as ScheduleIcon,
  Edit as EditIcon,
  DeleteOutline,
  PlayArrow,
  Notes,
  Tag,
  Close,
} from '@mui/icons-material';
import {
  getRecurringPayment,
  deleteRecurringPayment,
  executeRecurringPayment,
  type RecurringPayment,
} from '../../lib/api';
import { useWallets } from '../../lib/hooks';
import CategoryAutocomplete from '../../components/CategoryAutocomplete';

const formatCurrency = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

const todayISODate = () => new Date().toISOString().split('T')[0];

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box display="flex" justifyContent="space-between" gap={2} alignItems="center">
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Box display="flex" alignItems="center" gap={0.5}>{value}</Box>
    </Box>
  );
}

export default function RecurringPaymentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const id = Number(params.id);
  const theme = useTheme();

  const [payment, setPayment] = useState<RecurringPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Menú hamburguesa
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const closeMenu = () => setMenuAnchor(null);

  // Eliminar
  const [delOpen, setDelOpen] = useState(false);

  // Ejecutar (Realizar)
  const [execOpen, setExecOpen] = useState(false);
  const [execAmount, setExecAmount] = useState('');
  const [execDescription, setExecDescription] = useState('');
  const [execWallet, setExecWallet] = useState('');
  const [execDate, setExecDate] = useState(todayISODate());
  const [execTime, setExecTime] = useState('');
  const [execType, setExecType] = useState<'income' | 'expense'>('expense');
  const [execCategory, setExecCategory] = useState('');
  const [execSaving, setExecSaving] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);

  const { wallets, loading: walletsLoading } = useWallets();

  const [snackbar, setSnackbar] = useState<{ open: boolean; severity: 'success' | 'error' | 'warning'; message: string }>({
    open: false, severity: 'success', message: '',
  });
  const notice = (message: string, severity: 'success' | 'error' | 'warning' = 'success') =>
    setSnackbar({ open: true, severity, message });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getRecurringPayment(id);
      setPayment(data);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar el pago frecuente');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  // Auto-abrir "Realizar" si vienen con ?action=execute
  useEffect(() => {
    if (searchParams.get('action') === 'execute' && payment && !loading) {
      openExecute();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, payment, loading]);

  const openExecute = () => {
    if (!payment) return;
    // Prellenar todos los campos desde el pago frecuente (editable)
    setExecAmount(String(payment.amount));
    setExecDescription(payment.description || '');
    setExecWallet(String(payment.walletId));
    setExecDate(todayISODate());
    setExecTime('');
    setExecType(payment.type);
    setExecCategory(payment.categoryName);
    setExecError(null);
    setExecOpen(true);
  };

  const confirmDelete = async () => {
    setExecSaving(true);
    try {
      await deleteRecurringPayment(id);
      setDelOpen(false);
      notice('Pago frecuente eliminado');
      router.push('/recurring-payments');
    } catch (e: any) {
      notice(e?.message || 'Error al eliminar', 'error');
      setDelOpen(false);
    } finally {
      setExecSaving(false);
    }
  };

  const submitExecute = async () => {
    if (!payment) return;
    const amount = Number(execAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setExecError('El monto debe ser mayor a 0.');
      return;
    }
    if (!execWallet) {
      setExecError('Selecciona una billetera.');
      return;
    }
    if (!execCategory.trim()) {
      setExecError('Escribe o selecciona una categoría.');
      return;
    }
    setExecSaving(true);
    setExecError(null);
    try {
      const res = await executeRecurringPayment(id, {
        overrideAmount: amount,
        overrideType: execType,
        overrideCategoryName: execCategory.trim(),
        overrideWalletId: Number(execWallet),
        description: execDescription || undefined,
        date: execDate || undefined,
        time: execTime || undefined,
      });
      const txId = res?.transaction?.id;
      setExecOpen(false);
      if (txId) {
        router.push(`/transactions/${txId}`);
      } else {
        router.refresh();
        notice('Transacción creada desde el pago frecuente');
      }
    } catch (e: any) {
      setExecError(e?.message || 'Error al realizar el pago');
    } finally {
      setExecSaving(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !payment) {
    return (
      <Box>
        <Button startIcon={<ArrowBack />} onClick={() => router.push('/recurring-payments')} sx={{ mb: 2 }}>
          Volver a pagos frecuentes
        </Button>
        <Alert severity="error">{error || 'Pago frecuente no encontrado'}</Alert>
      </Box>
    );
  }

  const isIncome = payment.type === 'income';
  const currency = payment.currency || payment.walletCurrency || 'USD';

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => router.push('/recurring-payments')} sx={{ mb: 2 }}>
        Volver a pagos frecuentes
      </Button>

      {/* Header / monto */}
      <Card sx={{ mb: 3, position: 'relative' }}>
        <Box display="flex" justifyContent="flex-end" px={2} pt={1}>
          <IconButton aria-label="Acciones" onClick={(e) => setMenuAnchor(e.currentTarget)} size="medium">
            <ScheduleIcon />
          </IconButton>
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
                Pago frecuente · {isIncome ? 'Ingreso' : 'Gasto'}
              </Typography>
              <Typography variant="h3" fontWeight="bold" color={isIncome ? 'success.main' : 'error.main'} sx={{ fontSize: { xs: '1.8rem', sm: '2.4rem' } }}>
                {isIncome ? '+' : '-'}{formatCurrency(payment.amount, currency)}
              </Typography>
              <Typography variant="h6" fontWeight="bold">
                {payment.name}
              </Typography>
              <Box display="flex" alignItems="center" justifyContent="center" gap={0.75} mt={1}>
                <AccountBalanceWallet fontSize="small" color="action" />
                <Typography variant="body1" fontWeight="medium">{payment.walletName}</Typography>
              </Box>
            </Box>

            {/* Botón central Realizar */}
            <Button
              variant="contained"
              color="primary"
              size="large"
              startIcon={<PlayArrow />}
              onClick={openExecute}
              sx={{ mt: 1, px: 4 }}
            >
              Realizar
            </Button>
          </Stack>
        </CardContent>

        {/* Menú hamburguesa de acciones */}
        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={closeMenu}
          anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
          transformOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <MenuItem onClick={() => { closeMenu(); router.push(`/recurring-payments/${id}/edit`); }}>
            <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>
            Editar
          </MenuItem>
          <MenuItem onClick={() => { closeMenu(); setDelOpen(true); }}>
            <ListItemIcon><DeleteOutline fontSize="small" color="error" /></ListItemIcon>
            Eliminar
          </MenuItem>
        </Menu>
      </Card>

      {/* Detalle */}
      <Card>
        <CardContent>
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <ScheduleIcon color="action" />
            <Typography variant="h6">Detalle</Typography>
          </Box>
          <Stack divider={<Divider flexItem />} spacing={1.5}>
            <InfoRow
              label="Tipo"
              value={
                <Chip size="small" label={isIncome ? 'Ingreso' : 'Gasto'} color={isIncome ? 'success' : 'error'} variant="outlined" />
              }
            />
            <InfoRow
              label="Categoría"
              value={<Chip size="small" label={payment.categoryName} variant="outlined" icon={<Tag />} />}
            />
            <InfoRow
              label="Moneda"
              value={<Chip size="small" label={currency} variant="outlined" />}
            />
            <InfoRow
              label="Billetera preferida"
              value={
                <Box display="flex" alignItems="center" gap={0.5}>
                  <AccountBalanceWallet fontSize="small" color="action" />
                  <Typography variant="body2">{payment.walletName}</Typography>
                </Box>
              }
            />
            {payment.description && (
              <InfoRow
                label="Descripción"
                value={
                  <Box display="flex" alignItems="flex-start" gap={0.5}>
                    <Notes fontSize="small" color="action" sx={{ mt: 0.25 }} />
                    <Typography variant="body2" textAlign="right">{payment.description}</Typography>
                  </Box>
                }
              />
            )}
          </Stack>
        </CardContent>
      </Card>

      {/* Diálogo Eliminar */}
      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Eliminar pago frecuente</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Seguro que quieres eliminar <b>{payment.name}</b>? No se elimina de la base, solo se oculta. No afecta transacciones ya creadas.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={execSaving}>
            {execSaving ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Diálogo Ejecutar (Realizar) — prellenado y editable */}
      <Dialog open={execOpen} onClose={() => setExecOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          Realizar: {payment.name}
          <IconButton onClick={() => setExecOpen(false)} aria-label="Cerrar" size="small">
            <Close />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            <Box display="flex" gap={1}>
              <Button
                variant={execType === 'expense' ? 'contained' : 'outlined'}
                color="error"
                fullWidth
                onClick={() => setExecType('expense')}
              >
                Gasto
              </Button>
              <Button
                variant={execType === 'income' ? 'contained' : 'outlined'}
                color="success"
                fullWidth
                onClick={() => setExecType('income')}
              >
                Ingreso
              </Button>
            </Box>
            <TextField
              label="Monto"
              type="number"
              value={execAmount}
              onChange={(e) => setExecAmount(e.target.value)}
              fullWidth
              autoFocus
              InputProps={{ endAdornment: <span>{currency}</span> }}
            />
            <FormControl fullWidth required>
              <InputLabel>Billetera</InputLabel>
              <Select
                value={execWallet}
                label="Billetera"
                onChange={(e) => setExecWallet(e.target.value)}
                disabled={walletsLoading}
              >
                {wallets.map((w) => (
                  <MenuItem key={w.id} value={String(w.id)}>{w.name} ({w.currency})</MenuItem>
                ))}
              </Select>
            </FormControl>
            <CategoryAutocomplete
              type={execType}
              valueName={execCategory}
              onChange={(cat) => setExecCategory(cat ? cat.name : '')}
              allowCreate
            />
            <TextField
              label="Descripción"
              value={execDescription}
              onChange={(e) => setExecDescription(e.target.value)}
              multiline
              rows={2}
              fullWidth
            />
            <TextField
              label="Fecha"
              type="date"
              value={execDate}
              onChange={(e) => setExecDate(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Hora (opcional)"
              type="time"
              value={execTime}
              onChange={(e) => setExecTime(e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
              helperText="Si la dejas vacía se usa la hora actual"
            />
            {execError && <Alert severity="error">{execError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExecOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="primary" onClick={submitExecute} disabled={execSaving}>
            {execSaving ? 'Creando transacción...' : 'Crear transacción'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Snackbar */}
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
