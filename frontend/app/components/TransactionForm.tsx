'use client';

import { useState } from 'react';
import {
  Card, CardContent, Typography, TextField, Button, Box, MenuItem, Select,
  FormControl, InputLabel, Alert, Snackbar, CircularProgress, Collapse, IconButton
} from '@mui/material';
import { Add, Remove, ExpandMore, ExpandLess } from '@mui/icons-material';
import { useWallets } from '../lib/hooks';
import CategoryAutocomplete from './CategoryAutocomplete';
import MoneyField from './MoneyField';
import type { Category } from '../lib/api';
import { useTimeZone, todayInZone, nowTimeInZone } from '../lib/timeZone';

interface TransactionFormProps {
  onSuccess?: () => void;
}

export default function TransactionForm({ onSuccess }: TransactionFormProps) {
  const { userTimeZone } = useTimeZone();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState(0);
  const [fee, setFee] = useState(0);
  const [wallet, setWallet] = useState('');
  const [category, setCategory] = useState('');
  const [description, setDescription] = useState('');
  // Fecha de la transacción: por defecto hoy EN LA ZONA DEL USUARIO.
  const todayISODate = todayInZone(userTimeZone);
  const [date, setDate] = useState(todayISODate);
  // Hora de la transacción (HH:MM). Prellenada con la hora actual en la zona del usuario.
  const [time, setTime] = useState(nowTimeInZone(userTimeZone));
  const [loading, setLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const { wallets, loading: walletsLoading, error: walletsError } = useWallets();

  // Categoría seleccionada (objeto). El nombre se envía al backend, que lo crea si falta.
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const walletObj = wallets.find((w) => w.name === wallet);
    const parsedAmount = amount;
    const parsedFee = fee;

    if (!walletObj || !Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setError('Selecciona una billetera e introduce un monto mayor que cero.');
      return;
    }
    if (!selectedCategory || !selectedCategory.name) {
      setError('Escribe o selecciona una categoría.');
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
          categoryName: selectedCategory?.name || category,
          type,
          amount: parsedAmount,
          fee: parsedFee > 0 ? parsedFee : undefined,
          description: description || undefined,
          // Fecha opcional: solo se envía si es distinta de hoy, para no romper
          // llamadas que dependen del default backend.
          date: date || undefined,
          // Hora siempre enviada (prellenada con la hora actual en la zona del usuario).
          time,
          tz: userTimeZone,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Error al registrar la transacción');
      }

      // Reset form
      setAmount(0);
      setFee(0);
      setWallet('');
      setCategory('');
      setSelectedCategory(null);
      setDescription('');
      setDate(todayInZone(userTimeZone));
      setTime(nowTimeInZone(userTimeZone));
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
            <MoneyField
              label="Monto"
              value={amount}
              onValueChange={setAmount}
              currency={
                wallets.find((w) => w.name === wallet)?.currency || 'USD/VES'
              }
              required
              disabled={loading}
            />

            {/* Opcionales (fecha, hora, comisión) en bloque colapsable */}
            <Box>
              <Box
                onClick={() => setShowOptional((v) => !v)}
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'text.secondary', userSelect: 'none', '&:hover': { color: 'text.primary' } }}
              >
                <Typography variant="body2">Opcionales</Typography>
                <IconButton size="small" sx={{ ml: 0.5 }}>
                  {showOptional ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </IconButton>
              </Box>
              <Collapse in={showOptional}>
                <Box display="flex" flexDirection="column" gap={2} mt={1}>

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
                    label="Hora"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    disabled={loading}
                    required
                    InputLabelProps={{ shrink: true }}
                    helperText="Hora de la operación"
                  />

                  <MoneyField
                    label="Comisión (opcional)"
                    value={fee}
                    onValueChange={setFee}
                    currency={wallet ? (

                      wallets.find((w) => w.name === wallet)?.currency || ''
                    ) : undefined}
                    disabled={loading}
                    helperText="Se descuenta aparte del monto"
                  />

                </Box>
              </Collapse>
            </Box>

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

            <CategoryAutocomplete
              type={type}
              value={selectedCategory ? String(selectedCategory.id) : null}
              onChange={(cat) => {
                setSelectedCategory(cat);
                setCategory(cat ? cat.name : '');
              }}
              disabled={loading}
              allowCreate
            />

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
