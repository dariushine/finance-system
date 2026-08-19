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
  Collapse,
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
  Menu as MenuIcon,
  ReceiptLong,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import {
  getRecurringPayment,
  deleteRecurringPayment,
  executeRecurringPayment,
  type RecurringPayment,
} from '../../lib/api';
import { useWallets } from '../../lib/hooks';
import CategoryAutocomplete from '../../components/CategoryAutocomplete';
import RecurringPaymentForm from '../../components/RecurringPaymentForm';
import MoneyField from '../../components/MoneyField';
import { useNumberFormat } from '../../lib/NumberFormat';
import { useTimeZone, nowTimeInZone } from '../../lib/timeZone';

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
  const { formatCurrency } = useNumberFormat();
  const { userTimeZone } = useTimeZone();

  const [payment, setPayment] = useState<RecurringPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);

  // Formulario para convertir la plantilla en una transacción real.
  const [execOpen, setExecOpen] = useState(false);
  const [execAmount, setExecAmount] = useState(0);
  const [execFee, setExecFee] = useState(0);
  const [execDescription, setExecDescription] = useState('');
  const [execWallet, setExecWallet] = useState('');
  const [execDate, setExecDate] = useState(todayISODate());
  const [execTime, setExecTime] = useState(nowTimeInZone(userTimeZone));
  const [execCategory, setExecCategory] = useState('');
  const [execSaving, setExecSaving] = useState(false);
  const [execError, setExecError] = useState<string | null>(null);
  const [execShowOptional, setExecShowOptional] = useState(false);

  const { wallets, loading: walletsLoading } = useWallets();
  const [snackbar, setSnackbar] = useState<{ open: boolean; severity: 'success' | 'error'; message: string }>({
    open: false, severity: 'success', message: '',
  });
  const notice = (message: string, severity: 'success' | 'error' = 'success') =>
    setSnackbar({ open: true, severity, message });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPayment(await getRecurringPayment(id));
    } catch (e: any) {
      setError(e?.message || 'Error al cargar el pago frecuente');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const openExecute = useCallback(() => {
    if (!payment) return;
    setExecAmount(payment.amount);
    setExecFee(payment.fee ? payment.fee : 0);
    setExecDescription(payment.description || '');
    setExecWallet(payment.walletId != null ? String(payment.walletId) : '');
    setExecDate(todayISODate());
    setExecTime(nowTimeInZone(userTimeZone));
    setExecCategory(payment.categoryName);
    setExecError(null);
    setExecOpen(true);
  }, [payment]);

  // El acceso rápido desde el listado abre el mismo panel de realizar.
  useEffect(() => {
    if (searchParams.get('action') === 'execute' && payment && !loading) openExecute();
  }, [searchParams, payment, loading, openExecute]);

  const closeMenu = () => setMenuAnchor(null);

  const confirmDelete = async () => {
    setExecSaving(true);
    try {
      await deleteRecurringPayment(id);
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
    const amount = execAmount;
    const fee = execFee;
    if (!Number.isFinite(amount) || amount <= 0) return setExecError('El monto debe ser mayor a 0.');
    if (!Number.isFinite(fee) || fee < 0) return setExecError('La comisión no puede ser negativa.');
    if (!execWallet) return setExecError('Selecciona una billetera para crear la transacción.');
    if (!execCategory.trim()) return setExecError('Escribe o selecciona una categoría.');

    setExecSaving(true);
    setExecError(null);
    try {
      const res = await executeRecurringPayment(id, {
        overrideAmount: amount,
        overrideFee: fee,
        overrideCategoryName: execCategory.trim(),
        overrideWalletId: Number(execWallet),
        description: execDescription || undefined,
        date: execDate || undefined,
        time: execTime,
        tz: userTimeZone,
      });
      setExecOpen(false);
      router.push(`/transactions/${res.transaction.id}`);
    } catch (e: any) {
      setExecError(e?.message || 'Error al realizar el pago');
    } finally {
      setExecSaving(false);
    }
  };

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  }
  if (error || !payment) {
    return (
      <Box>
        <Button startIcon={<ArrowBack />} onClick={() => router.push('/recurring-payments')} sx={{ mb: 2 }}>Volver a pagos frecuentes</Button>
        <Alert severity="error">{error || 'Pago frecuente no encontrado'}</Alert>
      </Box>
    );
  }

  const isIncome = payment.type === 'income';
  const currency = payment.currency || 'USD';
  // Una transacción creada desde la plantilla tiene que respetar su moneda.
  const compatibleWallets = wallets.filter((w) => w.currency === currency);

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => router.push('/recurring-payments')} sx={{ mb: 2 }}>
        Volver a pagos frecuentes
      </Button>

      {/* Cabecera tipo detalle de billetera: describe una plantilla, no una transacción ya hecha. */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar sx={{ width: 56, height: 56, bgcolor: isIncome ? theme.palette.success.main : theme.palette.error.main }}>
                <ScheduleIcon />
              </Avatar>
              <Box>
                <Box display="flex" alignItems="center" gap={1} flexWrap="wrap">
                  <Typography variant="h5" fontWeight="bold">{payment.name}</Typography>
                  <Chip size="small" label={isIncome ? 'Ingreso' : 'Gasto'} color={isIncome ? 'success' : 'error'} variant="outlined" />
                </Box>
                <Typography variant="body2" color="text.secondary">
                  Plantilla de pago frecuente · {payment.categoryName}
                </Typography>
              </Box>
            </Box>
            <IconButton aria-label="Acciones del pago frecuente" onClick={(e) => setMenuAnchor(e.currentTarget)}>
              <MenuIcon />
            </IconButton>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box display="flex" gap={{ xs: 2, sm: 4 }} flexWrap="wrap" alignItems="center">
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Monto al realizar</Typography>
              <Typography variant="h4" fontWeight="bold" color={isIncome ? 'success.main' : 'error.main'}>
                {formatCurrency(payment.amount, currency)}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Comisión</Typography>
              <Typography variant="h6" fontWeight="bold">
                {(payment.fee || 0) > 0 ? formatCurrency(Number(payment.fee), currency) : 'Sin comisión'}
              </Typography>
            </Box>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Billetera preferida</Typography>
              <Box display="flex" alignItems="center" gap={0.5}>
                <AccountBalanceWallet fontSize="small" color="action" />
                <Typography variant="body1" fontWeight="medium">{payment.walletName || 'Ninguna'}</Typography>
              </Box>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={3}>
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <ReceiptLong color="action" />
              <Typography variant="h6">Datos de la plantilla</Typography>
            </Box>
            <Stack divider={<Divider flexItem />} spacing={1.5}>
              <InfoRow label="Tipo" value={<Chip size="small" label={isIncome ? 'Ingreso' : 'Gasto'} color={isIncome ? 'success' : 'error'} variant="outlined" />} />
              <InfoRow label="Categoría" value={<Chip size="small" label={payment.categoryName} variant="outlined" icon={<Tag />} />} />
              <InfoRow label="Moneda" value={<Chip size="small" label={currency} variant="outlined" />} />
              <InfoRow label="Billetera preferida" value={<Typography variant="body2">{payment.walletName || 'Ninguna'}</Typography>} />
              {payment.description && <InfoRow label="Descripción" value={<Box display="flex" alignItems="flex-start" gap={0.5}><Notes fontSize="small" color="action" /><Typography variant="body2" textAlign="right">{payment.description}</Typography></Box>} />}
            </Stack>
          </CardContent>
        </Card>

        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={1}>
              <PlayArrow color="primary" />
              <Typography variant="h6">Usar esta plantilla</Typography>
            </Box>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Crea una transacción nueva con estos datos. Antes de confirmarla podrás ajustar monto, comisión, categoría, descripción, billetera, fecha y hora.
            </Typography>
            <Button variant="contained" startIcon={<PlayArrow />} onClick={openExecute} fullWidth size="large">
              Realizar pago
            </Button>
          </CardContent>
        </Card>
      </Box>

      <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={closeMenu} anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }} transformOrigin={{ vertical: 'top', horizontal: 'right' }}>
        <MenuItem onClick={() => { closeMenu(); setEditOpen(true); }}>
          <ListItemIcon><EditIcon fontSize="small" /></ListItemIcon>Editar
        </MenuItem>
        <MenuItem onClick={() => { closeMenu(); setDelOpen(true); }}>
          <ListItemIcon><DeleteOutline fontSize="small" color="error" /></ListItemIcon>Eliminar
        </MenuItem>
      </Menu>

      {/* Editar en modal, no como página separada. */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar pago frecuente</DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <RecurringPaymentForm
            initial={{
              id: payment.id,
              name: payment.name,
              description: payment.description,
              amount: payment.amount,
              fee: payment.fee || 0,
              currency: payment.currency,
              type: payment.type,
              categoryId: payment.categoryId,
              categoryName: payment.categoryName,
              walletId: payment.walletId ?? null,
            }}
            onSuccess={async () => { setEditOpen(false); await load(); notice('Pago frecuente actualizado'); }}
            onCancel={() => setEditOpen(false)}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={delOpen} onClose={() => setDelOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Eliminar pago frecuente</DialogTitle>
        <DialogContent>
          <Typography>¿Seguro que quieres eliminar <b>{payment.name}</b>? Las transacciones que ya realizaste no se modifican.</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDelOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={confirmDelete} disabled={execSaving}>{execSaving ? 'Eliminando...' : 'Eliminar'}</Button>
        </DialogActions>
      </Dialog>

      {/* El tipo se muestra como chip coloreado: esta plantilla no puede transformarse de gasto a ingreso (ni viceversa) al realizarla. */}
      <Dialog open={execOpen} onClose={() => setExecOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          Realizar: {payment.name}
          <IconButton onClick={() => setExecOpen(false)} aria-label="Cerrar" size="small"><Close /></IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack spacing={2} pt={1}>
            {/* Tipo: chip coloreado en vez de aviso (gasto rojo / ingreso verde) */}
            <Box display="flex" alignItems="center" gap={1}>
              <Chip
                size="small"
                icon={isIncome ? <ArrowUpward /> : <ArrowDownward />}
                label={isIncome ? 'Ingreso' : 'Gasto'}
                color={isIncome ? 'success' : 'error'}
              />
            </Box>

            <MoneyField label="Monto" value={execAmount} onValueChange={setExecAmount} fullWidth autoFocus currency={currency} />

            {/* Opcionales (fecha, hora, comisión) en bloque colapsable, como en el form de transacción */}
            <Box>
              <Box
                onClick={() => setExecShowOptional((v) => !v)}
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'text.secondary', userSelect: 'none', '&:hover': { color: 'text.primary' } }}
              >
                <Typography variant="body2">Detalles</Typography>
                <IconButton size="small" sx={{ ml: 0.5 }}>
                  {execShowOptional ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </IconButton>
              </Box>
              <Collapse in={execShowOptional}>
                <Box display="flex" flexDirection="column" gap={2} mt={1}>
                  <TextField label="Fecha" type="date" value={execDate} onChange={(e) => setExecDate(e.target.value)} required fullWidth InputLabelProps={{ shrink: true }} />
                  <TextField label="Hora" type="time" value={execTime} onChange={(e) => setExecTime(e.target.value)} required fullWidth InputLabelProps={{ shrink: true }} helperText="Hora de la operación" />
                  <MoneyField label="Comisión (opcional)" value={execFee} onValueChange={setExecFee} fullWidth helperText="Se descuenta aparte del monto" currency={currency} />
                </Box>
              </Collapse>
            </Box>

            <FormControl fullWidth required>
              <InputLabel>Billetera</InputLabel>
              <Select value={execWallet} label="Billetera" onChange={(e) => setExecWallet(e.target.value)} disabled={walletsLoading}>
                <MenuItem value="" disabled>Selecciona una billetera</MenuItem>
                {compatibleWallets.map((w) => <MenuItem key={w.id} value={String(w.id)}>{w.name} ({w.currency})</MenuItem>)}
              </Select>
            </FormControl>
            {compatibleWallets.length === 0 && <Alert severity="warning">No tienes billeteras activas en {currency}. Crea una antes de realizar este pago.</Alert>}
            <CategoryAutocomplete type={payment.type} valueName={execCategory} onChange={(cat) => setExecCategory(cat ? cat.name : '')} allowCreate />
            <TextField label="Descripción" value={execDescription} onChange={(e) => setExecDescription(e.target.value)} multiline rows={2} fullWidth />
            {execError && <Alert severity="error">{execError}</Alert>}
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setExecOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={submitExecute} disabled={execSaving || compatibleWallets.length === 0}>{execSaving ? 'Creando transacción...' : 'Crear transacción'}</Button>
        </DialogActions>
      </Dialog>

      <Snackbar open={snackbar.open} autoHideDuration={4000} onClose={() => setSnackbar((s) => ({ ...s, open: false }))} anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}>
        <Alert severity={snackbar.severity} onClose={() => setSnackbar((s) => ({ ...s, open: false }))}>{snackbar.message}</Alert>
      </Snackbar>
    </Box>
  );
}
