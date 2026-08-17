'use client';

import { useState } from 'react';
import {
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Box,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  Snackbar,
  CircularProgress,
  Chip,
} from '@mui/material';
import { Add, Remove } from '@mui/icons-material';
import { useWallets } from '../lib/hooks';
import CategoryAutocomplete from './CategoryAutocomplete';
import {
  createRecurringPayment,
  updateRecurringPayment,
  getCategories,
  createCategory,
  type Category,
  type Wallet,
} from '../lib/api';

interface RecurringPaymentFormProps {
  /** Datos iniciales si se está editando un pago existente. */
  initial?: {
    id: number;
    name: string;
    description?: string | null;
    amount: number;
    fee?: number | null;
    currency: string;
    type: 'income' | 'expense';
    categoryId: number;
    categoryName: string;
    walletId?: number | null;
  } | null;
  /** Se dispara con el id del pago guardado (para navegar al detalle). */
  onSuccess?: (id: number) => void;
  onCancel?: () => void;
}

export default function RecurringPaymentForm({ initial, onSuccess, onCancel }: RecurringPaymentFormProps) {
  const isEdit = Boolean(initial);
  const [type, setType] = useState<'expense' | 'income'>(initial?.type || 'expense');
  const [name, setName] = useState(initial?.name || '');
  const [amount, setAmount] = useState(initial ? String(initial.amount) : '');
  const [currency, setCurrency] = useState(initial?.currency || 'USD');
  const [description, setDescription] = useState(initial?.description || '');
  const [wallet, setWallet] = useState(initial?.walletId != null ? String(initial.walletId) : '');
  const [fee, setFee] = useState(initial?.fee ? String(initial.fee) : '');
  // Categoría: guardamos el nombre (resuelto por valueName) y el id si es existente.
  const [categoryName, setCategoryName] = useState(initial?.categoryName || '');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { wallets, loading: walletsLoading, error: walletsError } = useWallets();

  const handleWalletChange = (walletId: string) => {
    setWallet(walletId);
    // La moneda se sincroniza con la billetera preferida (si se elige una).
    const w: Wallet | undefined = wallets.find((x) => String(x.id) === walletId);
    if (w) setCurrency(w.currency);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = Number(amount);
    const parsedFee = fee ? Number(fee) : 0;
    // Billetera opcional: '' o null = "ninguno"
    const walletObj = wallet ? wallets.find((w) => String(w.id) === wallet) : undefined;
    const finalWalletId = walletObj ? walletObj.id : null;

    if (!name.trim()) { setError('Escribe un nombre para el pago frecuente.'); return; }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) { setError('El monto debe ser mayor a cero.'); return; }
    if (!Number.isFinite(parsedFee) || parsedFee < 0) { setError('La comisión no puede ser negativa.'); return; }
    if (!categoryName.trim()) { setError('Selecciona o escribe una categoría.'); return; }

    // Resolver categoría: si es nueva (no existe), crear la categoría primero.
    const cats = await getCategories(type);
    const found: Category | undefined = cats.find((c) => c.name === categoryName.trim());
    let resolvedId = found ? found.id : -1;

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      // Si la categoría no existe, crearla primero.
      if (resolvedId === -1) {
        const createdCat: Category = await createCategory({ name: categoryName.trim(), type });
        resolvedId = createdCat.id;
      }

      const payload = {
        name: name.trim(),
        description: description || undefined,
        amount: parsedAmount,
        fee: parsedFee > 0 ? parsedFee : undefined,
        currency,
        type,
        categoryId: resolvedId,
        walletId: finalWalletId,
      };

      let saved;
      if (isEdit && initial) {
        saved = await updateRecurringPayment(initial.id, payload);
      } else {
        saved = await createRecurringPayment(payload);
      }

      setSuccess(true);
      onSuccess?.(saved.id);
    } catch (err: any) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {isEdit ? 'Editar Pago Frecuente' : 'Nuevo Pago Frecuente'}
        </Typography>

        {!isEdit && (
          <Box display="flex" gap={1} mb={2}>
            <Button
              variant={type === 'expense' ? 'contained' : 'outlined'}
              startIcon={<Remove />}
              onClick={() => setType('expense')}
              color="error"
              fullWidth
            >
              Gasto
            </Button>
            <Button
              variant={type === 'income' ? 'contained' : 'outlined'}
              startIcon={<Add />}
              onClick={() => setType('income')}
              color="success"
              fullWidth
            >
              Ingreso
            </Button>
          </Box>
        )}
        {isEdit && (
          <Box display="flex" alignItems="center" gap={1} mb={2}>
            <Typography variant="body2" color="text.secondary" component="span">
              Tipo:
            </Typography>
            <Chip
              size="small"
              icon={type === 'income' ? <Add /> : <Remove />}
              label={type === 'income' ? 'Ingreso' : 'Gasto'}
              color={type === 'income' ? 'success' : 'error'}
              variant="outlined"
            />
            <Typography variant="caption" color="text.secondary" component="span">
              El tipo no se puede cambiar al editar.
            </Typography>
          </Box>
        )}

        <form onSubmit={handleSubmit}>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Nombre"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ej: Netflix"
              required
              disabled={loading}
            />

            <TextField
              label="Monto"
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej: 1200"
              required
              disabled={loading}
              onWheel={(e) => e.currentTarget.blur()}
              InputProps={{ endAdornment: <span>{currency}</span> }}
            />

            <FormControl fullWidth required>
              <InputLabel>Moneda</InputLabel>
              <Select
                value={currency}
                label="Moneda"
                onChange={(e) => setCurrency(e.target.value)}
                disabled={loading}
              >
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="VES">VES</MenuItem>
              </Select>
            </FormControl>

            <FormControl fullWidth>
              <InputLabel>Billetera preferida (opcional)</InputLabel>
              <Select
                value={wallet}
                label="Billetera preferida (opcional)"
                onChange={(e) => handleWalletChange(e.target.value)}
                disabled={loading || walletsLoading}
              >
                <MenuItem value="">Ninguna</MenuItem>
                {wallets.map((w) => (
                  <MenuItem key={w.id} value={String(w.id)}>
                    {w.name} ({w.currency})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Comisión (opcional)"
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="Ej: 3.75"
              disabled={loading}
              onWheel={(e) => e.currentTarget.blur()}
              InputProps={{ endAdornment: <span>{currency}</span> }}
            />

            <CategoryAutocomplete
              type={type}
              valueName={categoryName}
              onChange={(cat) => setCategoryName(cat ? cat.name : '')}
              disabled={loading}
              allowCreate
            />

            <TextField
              label="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              multiline
              rows={2}
              disabled={loading}
            />

            <Button
              type="submit"
              variant="contained"
              color={type === 'expense' ? 'error' : 'success'}
              size="large"
              fullWidth
              disabled={loading}
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : null}
            >
              {loading ? 'Guardando...' : (isEdit ? 'Guardar cambios' : 'Guardar pago frecuente')}
            </Button>

            {onCancel && (
              <Button onClick={onCancel} disabled={loading}>
                Cancelar
              </Button>
            )}
          </Box>
        </form>

        {(error || walletsError) && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error || walletsError}
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          💡 La moneda se sincroniza con la billetera preferida (si eliges una). La categoría se crea si no existe.
        </Typography>
      </CardContent>

      <Snackbar
        open={success}
        autoHideDuration={3000}
        onClose={() => setSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccess(false)}>
          Pago frecuente guardado ✨
        </Alert>
      </Snackbar>
    </Card>
  );
}
