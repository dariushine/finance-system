'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Chip,
  Collapse,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControl,
  IconButton,
  InputLabel,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import {
  ArrowUpward,
  ArrowDownward,
  Close,
  ExpandMore as ExpandMoreIcon,
  ExpandLess as ExpandLessIcon,
} from '@mui/icons-material';
import { executeRecurringPayment, type RecurringPayment } from '../lib/api';
import { useWallets } from '../lib/hooks';
import CategoryAutocomplete from './CategoryAutocomplete';
import MoneyField from './MoneyField';

const todayISODate = () => new Date().toISOString().split('T')[0];

interface RecurringPaymentExecuteDialogProps {
  payment: RecurringPayment | null;
  open: boolean;
  onClose: () => void;
}

/**
 * Convierte una plantilla de pago frecuente en una transacción real.
 * El tipo queda fijo (según la plantilla); el resto de campos se rellenan
 * prellenados y son editables, con el mismo orden que el formulario de transacción
 * (opcionales = fecha/hora/comisión en un collapsible).
 */
export default function RecurringPaymentExecuteDialog({ payment, open, onClose }: RecurringPaymentExecuteDialogProps) {
  const router = useRouter();
  const { wallets, loading: walletsLoading } = useWallets();

  const [amount, setAmount] = useState(0);
  const [fee, setFee] = useState(0);
  const [description, setDescription] = useState('');
  const [wallet, setWallet] = useState('');
  const [date, setDate] = useState(todayISODate());
  const [time, setTime] = useState('');
  const [category, setCategory] = useState('');
  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => {
    if (!payment) return;
    setAmount(payment.amount);
    setFee(payment.fee ? payment.fee : 0);
    setDescription(payment.description || '');
    setWallet(payment.walletId != null ? String(payment.walletId) : '');
    setDate(todayISODate());
    setTime('');
    setCategory(payment.categoryName);
    setShowOptional(false);
    setError(null);
  };

  // Resetear el formulario cada vez que se abre con una plantilla (o al cerrar).
  const handleOpen = () => {
    if (payment) reset();
  };

  const close = () => {
    onClose();
  };

  const submit = async () => {
    if (!payment) return;
    const parsedAmount = amount;
    const parsedFee = fee;
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) return setError('El monto debe ser mayor a 0.');
    if (!Number.isFinite(parsedFee) || parsedFee < 0) return setError('La comisión no puede ser negativa.');
    if (!wallet) return setError('Selecciona una billetera para crear la transacción.');
    if (!category.trim()) return setError('Escribe o selecciona una categoría.');

    setSaving(true);
    setError(null);
    try {
      const res = await executeRecurringPayment(payment.id, {
        overrideAmount: parsedAmount,
        overrideFee: parsedFee,
        overrideCategoryName: category.trim(),
        overrideWalletId: Number(wallet),
        description: description || undefined,
        date: date || undefined,
        time: time || undefined,
      });
      close();
      router.push(`/transactions/${res.transaction.id}`);
    } catch (e: any) {
      setError(e?.message || 'Error al realizar el pago');
    } finally {
      setSaving(false);
    }
  };

  if (!payment) return null;

  const isIncome = payment.type === 'income';
  const currency = payment.currency || 'USD';
  const compatibleWallets = wallets.filter((w) => w.currency === currency);

  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth TransitionProps={{ onEnter: handleOpen }}>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
        Realizar: {payment.name}
        <IconButton onClick={close} aria-label="Cerrar" size="small"><Close /></IconButton>
      </DialogTitle>
      <DialogContent>
        <Stack spacing={2} pt={1}>
          {/* Tipo: chip coloreado (gasto rojo / ingreso verde), no editable */}
          <Box>
            <Chip
              size="small"
              icon={isIncome ? <ArrowUpward /> : <ArrowDownward />}
              label={isIncome ? 'Ingreso' : 'Gasto'}
              color={isIncome ? 'success' : 'error'}
            />
          </Box>

          <MoneyField label="Monto" value={amount} onValueChange={setAmount} fullWidth autoFocus currency={currency} />

          {/* Opcionales (fecha, hora, comisión) en bloque colapsable */}
          <Box>
            <Box
              onClick={() => setShowOptional((v) => !v)}
              sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'text.secondary', userSelect: 'none', '&:hover': { color: 'text.primary' } }}
            >
              <Typography variant="body2">Opcionales</Typography>
              <IconButton size="small" sx={{ ml: 0.5 }}>
                {showOptional ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
              </IconButton>
            </Box>
            <Collapse in={showOptional}>
              <Box display="flex" flexDirection="column" gap={2} mt={1}>
                <TextField label="Fecha" type="date" value={date} onChange={(e) => setDate(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} />
                <TextField label="Hora (opcional)" type="time" value={time} onChange={(e) => setTime(e.target.value)} fullWidth InputLabelProps={{ shrink: true }} helperText="Si la dejas vacía se usa la hora actual" />
                <MoneyField label="Comisión (opcional)" value={fee} onValueChange={setFee} fullWidth helperText="Se descuenta aparte del monto" currency={currency} />
              </Box>
            </Collapse>
          </Box>

          <FormControl fullWidth required>
            <InputLabel>Billetera</InputLabel>
            <Select value={wallet} label="Billetera" onChange={(e) => setWallet(e.target.value)} disabled={walletsLoading}>
              <MenuItem value="" disabled>Selecciona una billetera</MenuItem>
              {compatibleWallets.map((w) => <MenuItem key={w.id} value={String(w.id)}>{w.name} ({w.currency})</MenuItem>)}
            </Select>
          </FormControl>
          {compatibleWallets.length === 0 && <Alert severity="warning">No tienes billeteras activas en {currency}. Crea una antes de realizar este pago.</Alert>}
          <CategoryAutocomplete type={payment.type} valueName={category} onChange={(cat) => setCategory(cat ? cat.name : '')} allowCreate />
          <TextField label="Descripción" value={description} onChange={(e) => setDescription(e.target.value)} multiline rows={2} fullWidth />
          {error && <Alert severity="error">{error}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={close}>Cancelar</Button>
        <Button variant="contained" onClick={submit} disabled={saving || compatibleWallets.length === 0}>{saving ? 'Creando transacción...' : 'Crear transacción'}</Button>
      </DialogActions>
    </Dialog>
  );
}
