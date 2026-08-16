'use client';

import { useState } from 'react';
import {
  Card, CardContent, Typography, TextField, Button, Box, MenuItem, Select,
  FormControl, InputLabel, Alert, Snackbar, CircularProgress
} from '@mui/material';
import { Add, Remove } from '@mui/icons-material';
import { useWallets } from '../lib/hooks';

interface TransactionFormProps {
  onSuccess?: () => void;
}

export default function TransactionForm({ onSuccess }: TransactionFormProps) {
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [fee, setFee] = useState('');
  const [wallet, setWallet] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  // Fecha de la transacción: por defecto hoy (UTC, formato YYYY-MM-DD).
  const todayISODate = new Date().toISOString().split('T')[0];
  const [date, setDate] = useState(todayISODate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { wallets, loading: walletsLoading, error: walletsError } = useWallets();

  const categories = {
    expense: ['food', 'transport', 'housing', 'utilities', 'entertainment', 'health', 'shopping', 'other_expense'],
    income: ['salary', 'freelance', 'investment', 'gift', 'other_income'],
  };

  const categoryLabel = (category: string) => category
    .replace('_expense', '')
    .replace('_income', '')
    .replace(/^./, (letter) => letter.toUpperCase());

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const walletObj = wallets.find((w) => w.name === wallet);
    const parsedAmount = Number(amount);
    const parsedFee = Number(fee) || 0;

    if (!walletObj || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Selecciona una billetera e introduce un monto mayor que cero.');
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch('/api/transactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletId: walletObj?.id,
          categoryName: category,
          type,
          amount: parsedAmount,
          fee: parsedFee > 0 ? parsedFee : undefined,
          description: description || undefined,
          // Fecha opcional: solo se envía si es distinta de hoy, para no romper
          // llamadas que dependen del default backend.
          date: date || undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al registrar la transacción');
      }

      // Reset form
      setAmount('');
      setFee('');
      setWallet('');
      setCategory('');
      setDescription('');
      setDate(todayISODate);
      setSuccess(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {type === 'expense' ? '📤 Registrar Gasto' : '📥 Registrar Ingreso'}
        </Typography>

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

        <form onSubmit={handleSubmit}>
          <Box display="flex" flexDirection="column" gap={2}>
            <TextField
              label="Monto"              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="Ej: 1200"
              required
              disabled={loading}
              onWheel={(e) => e.currentTarget.blur()}
              InputProps={{
                endAdornment: wallet ? (
                  wallets.find((w) => w.name === wallet)?.currency || ''
                ) : 'USD/VES'
              }}
            />

            <TextField
              label="Fecha"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              disabled={loading}
              required
              InputLabelProps={{ shrink: true }}
              error={date > todayISODate}
              helperText={date > todayISODate
                ? '⚠️ Es una fecha futura. Verifica que sea correcta.'
                : 'Registra gastos de hoy o de días anteriores'}
            />

            <TextField
              label="Comisión (opcional)"
              type="number"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              placeholder="Ej: 3.75"
              disabled={loading}
              onWheel={(e) => e.currentTarget.blur()}
              helperText="Se descuenta aparte del monto"
              InputProps={{
                endAdornment: wallet ? (
                  wallets.find((w) => w.name === wallet)?.currency || ''
                ) : ''
              }}
            />

            <FormControl fullWidth required>
              <InputLabel>Billetera</InputLabel>
              <Select
                value={wallet}
                label="Billetera"
                onChange={(e) => setWallet(e.target.value)}
                disabled={loading || walletsLoading}
              >
                {wallets.map((w) => (
                  <MenuItem key={w.id} value={w.name}>
                    {w.name} ({w.currency})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth required>
              <InputLabel>Categoría</InputLabel>
              <Select
                value={category}
                label="Categoría"
                onChange={(e) => setCategory(e.target.value)}
                disabled={loading || walletsLoading}
              >
                {categories[type].map((cat) => (
                  <MenuItem key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <TextField
              label="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Perro caliente"
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
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : (type === 'expense' ? <Remove /> : <Add />)}
            >
              {loading ? 'Registrando...' : (type === 'expense' ? 'Registrar Gasto' : 'Registrar Ingreso')}
            </Button>
          </Box>
        </form>

        {(error || walletsError) && (
          <Alert severity="error" sx={{ mt: 2 }} onClose={() => setError(null)}>
            {error || walletsError}
          </Alert>
        )}

        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          💡 El currency se obtiene automáticamente de la billetera seleccionada
        </Typography>
      </CardContent>

      {/* Feedback visual en vez de alert() */}
      <Snackbar
        open={success}
        autoHideDuration={3000}
        onClose={() => setSuccess(false)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setSuccess(false)}>
          {type === 'expense' ? 'Gasto' : 'Ingreso'} registrado correctamente ✨
        </Alert>
      </Snackbar>
    </Card>
  );
}
