'use client';

import { useState } from 'react';
import { Card, CardContent, Typography, TextField, Button, Box, MenuItem, Select, FormControl, InputLabel, Chip, Alert, Snackbar, CircularProgress, Collapse, IconButton } from '@mui/material';
import { SwapHoriz, ExpandMore, ExpandLess } from '@mui/icons-material';
import { useWallets } from '../lib/hooks';
import MoneyField from './MoneyField';
import { useTimeZone, todayInZone, nowTimeInZone } from '../lib/timeZone';

interface ExchangeFormProps {
  onSuccess?: () => void;
}

export default function ExchangeForm({ onSuccess }: ExchangeFormProps) {
  const { userTimeZone } = useTimeZone();
  const [fromWalletId, setFromWalletId] = useState<number | ''>('');
  const [toWalletId, setToWalletId] = useState<number | ''>('');
  const [fromAmount, setFromAmount] = useState(0);
  const [toAmount, setToAmount] = useState(0);
  const [fee, setFee] = useState(0);
  const [creditFee, setCreditFee] = useState(0);
  const [description, setDescription] = useState('');
  // Fecha del exchange (débito/crédito): por defecto hoy EN LA ZONA DEL USUARIO.
  const todayISODate = todayInZone(userTimeZone);
  const [date, setDate] = useState(todayISODate);
  // Hora del exchange (HH:MM). Prellenada con la hora actual en la zona del usuario.
  const [time, setTime] = useState(nowTimeInZone(userTimeZone));
  const [loading, setLoading] = useState(false);
  const [showOptional, setShowOptional] = useState(false);
  const [snackbar, setSnackbar] = useState<{ open: boolean; severity: 'success' | 'error' | 'warning'; message: string }>({
    open: false,
    severity: 'success',
    message: '',
  });
  
  const { wallets, error } = useWallets();

  const calculateRate = () => {
    if (!fromAmount || !toAmount) return null;
    const from = fromAmount;
    const to = toAmount;
    if (from === 0) return null;

    // Tasa real: solo con el monto, la comisión NO afecta la tasa.
    // Ej: 100 USD -> 87.000 VES = 870 bs/$, con comisión 3.75 aparte.
    const rate = to / from;
    // Comisión en la moneda de origen
    const commission = fee;
    // Comisión en la moneda de destino
    const creditCommission = creditFee;
    // Total que se descuenta de la billetera origen (monto + comisión)
    const fromTotal = from + commission;
    // Total que se descuenta de la billetera destino (monto recibido - comisión)
    const creditTotal = to - creditCommission;
    
    return { rate, netRate: rate, commission, creditCommission, fromTotal, creditTotal };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const rateData = calculateRate();
    if (!rateData) {
      setSnackbar({ open: true, severity: 'warning', message: 'Debe ingresar montos válidos' });
      setLoading(false);
      return;
    }
    
    try {
      // Ya tenemos los IDs
      const fromWalletObj = wallets.find(w => w.id === fromWalletId);
      const toWalletObj = wallets.find(w => w.id === toWalletId);
      
      if (!fromWalletObj || !toWalletObj) {
        throw new Error('Billetera no encontrada');
      }
      
      // Construir el objeto de exchange (API espera IDs)
      const exchangeData = {
        fromWalletId: fromWalletId,
        toWalletId: toWalletId,
        fromAmount: fromAmount,
        toAmount: toAmount,
        fee: rateData.commission || undefined,
        creditFee: rateData.creditCommission || undefined,
        description: description || undefined,
        date: date || undefined,
        time,
        tz: userTimeZone,
      };
      
      // Hacer la llamada al endpoint de exchanges
      const response = await fetch('/api/exchanges', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(exchangeData)
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error en el exchange');
      }
      
      const result = await response.json();
      
      // Mostrar resultado
      const fromCurrency = wallets.find(w => w.id === fromWalletId)?.currency || '';
      const toCurrency = wallets.find(w => w.id === toWalletId)?.currency || '';
      
      setSnackbar({
        open: true,
        severity: 'success',
        message: `Exchange registrado: ${fromAmount} ${fromCurrency} → ${toAmount} ${toCurrency} (tasa ${rateData.rate.toFixed(2)})`,
      });
      
      // Reset form
      setFromAmount(0);
      setToAmount(0);
      setFee(0);
      setCreditFee(0);
      setDescription('');
      setDate(todayInZone(userTimeZone));
      setTime(nowTimeInZone(userTimeZone));

      // Notificar éxito al componente padre
      onSuccess?.();
      
    } catch (error) {
      console.error('Exchange error:', error);
      setSnackbar({
        open: true,
        severity: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    } finally {
      setLoading(false);
    }
  };

  const rateData = calculateRate();

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          💱 Exchange entre Billeteras
        </Typography>

        <form onSubmit={handleSubmit}>
          <Box display="flex" flexDirection="column" gap={2}>
            {/* Origen */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                De (Origen)
              </Typography>
              <Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: '3fr 2fr' }} gap={1} alignItems="center">
                <FormControl required>
                  <Select
                    value={fromWalletId}
                    onChange={(e) => setFromWalletId(Number(e.target.value) || '')}
                    displayEmpty
                    disabled={loading}
                  >
                    <MenuItem value="" disabled>Seleccionar billetera</MenuItem>
                    {wallets.map((w) => (
                      <MenuItem key={w.id} value={w.id}>
                        {w.name} ({w.currency}) - {w.balance.toFixed(2)}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <MoneyField
                  value={fromAmount}
                  onValueChange={setFromAmount}
                  required
                  disabled={loading}
                  currency={fromWalletId ? (
                    wallets.find(w => w.id === fromWalletId)?.currency || ''
                  ) : undefined}
                />
              </Box>
            </Box>

            {/* Destino */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                A (Destino)
              </Typography>
              <Box display="grid" gridTemplateColumns={{ xs: '1fr', sm: '3fr 2fr' }} gap={1} alignItems="center">
                <FormControl required>
                  <Select
                    value={toWalletId}
                    onChange={(e) => setToWalletId(Number(e.target.value) || '')}
                    displayEmpty
                    disabled={loading}
                  >
                    <MenuItem value="" disabled>Seleccionar billetera</MenuItem>
                    {wallets.map((w) => (
                      <MenuItem key={w.id} value={w.id}>
                        {w.name} ({w.currency})
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
                <MoneyField
                  value={toAmount}
                  onValueChange={setToAmount}
                  required
                  disabled={loading}
                  currency={toWalletId ? (
                    wallets.find(w => w.id === toWalletId)?.currency || ''
                  ) : undefined}
                />
              </Box>
            </Box>

            {/* Opcionales (comisión, fecha, hora) en bloque colapsable */}
            <Box>
              <Box
                onClick={() => setShowOptional((v) => !v)}
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'text.secondary', userSelect: 'none', '&:hover': { color: 'text.primary' } }}
              >
                <Typography variant="body2">Detalles</Typography>
                <IconButton size="small" sx={{ ml: 0.5 }}>
                  {showOptional ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </IconButton>
              </Box>
              <Collapse in={showOptional}>
                <Box display="flex" flexDirection="column" gap={2} mt={1}>
                  {/* Tasa de mercado: eliminada. El spread se compara contra la tasa diaria
                      (BCV/paralelo) que ya vive en la entidad daily_rates. */}
                  <TextField
                    label="Fecha"
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    disabled={loading}
                    required
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    error={date > todayISODate}
                    helperText={date > todayISODate
                      ? '⚠️ Es una fecha futura. Verifica que sea correcta.'
                      : 'Registra exchanges de hoy o de días anteriores'}
                  />

                  <TextField
                    label="Hora"
                    type="time"
                    value={time}
                    onChange={(e) => setTime(e.target.value)}
                    disabled={loading}
                    required
                    fullWidth
                    InputLabelProps={{ shrink: true }}
                    helperText="Hora de la operación"
                  />

                  <MoneyField
                    label="Comisión débito"
                    value={fee}
                    onValueChange={setFee}
                    disabled={loading}
                    currency={fromWalletId ? (
                      wallets.find(w => w.id === fromWalletId)?.currency || ''
                    ) : undefined}
                  />

                  <MoneyField
                    label="Comisión crédito"
                    value={creditFee}
                    onValueChange={setCreditFee}
                    disabled={loading}
                    currency={toWalletId ? (
                      wallets.find(w => w.id === toWalletId)?.currency || ''
                    ) : undefined}
                  />
                </Box>
              </Collapse>
            </Box>

            <Box>
              <TextField
                label="Descripción"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Ej: Cambio Binance"
                multiline
                rows={2}
                fullWidth
                disabled={loading}
              />
            </Box>

            {rateData && (() => {
              const fromCur = wallets.find(w => w.id === fromWalletId)?.currency || '';
              const toCur = wallets.find(w => w.id === toWalletId)?.currency || '';
              return (
              <Box bgcolor="grey.50" p={2} borderRadius={1}>
                <Typography variant="subtitle2" gutterBottom>
                  📊 Cálculo del exchange
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1}>
                  <Chip
                    label={`Tasa: ${rateData.netRate.toFixed(2)} ${toCur}/${fromCur}`}
                    color="primary"
                    size="small"
                  />
                  {rateData.commission > 0 && (
                    <Chip
                      label={`Comisión: ${rateData.commission.toFixed(2)} ${fromCur}`}
                      color="warning"
                      size="small"
                    />
                  )}
                  {rateData.creditCommission > 0 && (
                    <Chip
                      label={`Comisión crédito: ${rateData.creditCommission.toFixed(2)} ${toCur}`}
                      color="warning"
                      size="small"
                    />
                  )}
                  {rateData.commission > 0 && (
                    <Chip
                      label={`Se descuenta: ${rateData.fromTotal.toFixed(2)} ${fromCur}`}
                      color="default"
                      size="small"
                      variant="outlined"
                    />
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {rateData.commission > 0 && `La comisión (${rateData.commission.toFixed(2)} ${fromCur}) es aparte del monto. `}
                </Typography>
              </Box>
              );
            })()}

            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
              fullWidth
              startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <SwapHoriz />}
              disabled={loading || !fromWalletId || !toWalletId || fromWalletId === toWalletId || !fromAmount || !toAmount}
            >
              {loading ? 'Procesando...' : 'Realizar Exchange'}
            </Button>
          </Box>
        </form>
      </CardContent>
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
    </Card>
  );
}
