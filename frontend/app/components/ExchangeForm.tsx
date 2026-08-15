'use client';

import { useState } from 'react';
import { Card, CardContent, Typography, TextField, Button, Box, MenuItem, Select, FormControl, InputLabel, Chip } from '@mui/material';
import { SwapHoriz, TrendingUp, TrendingDown } from '@mui/icons-material';
import { useWallets } from '../lib/hooks';

interface ExchangeFormProps {
  onSuccess?: () => void;
}

export default function ExchangeForm({ onSuccess }: ExchangeFormProps) {
  const [fromWalletId, setFromWalletId] = useState<number | ''>('');
  const [toWalletId, setToWalletId] = useState<number | ''>('');
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [marketRate, setMarketRate] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { wallets, error } = useWallets();

  const calculateRate = () => {
    if (!fromAmount || !toAmount) return null;
    const from = parseFloat(fromAmount);
    const to = parseFloat(toAmount);
    if (from === 0) return null;
    
    const rate = to / from;
    const market = marketRate ? parseFloat(marketRate) : null;
    const spread = market ? ((market - rate) / market) * 100 : null;
    
    return { rate, market, spread };
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    
    const rateData = calculateRate();
    if (!rateData) {
      alert('Debe ingresar montos válidos');
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
        fromAmount: parseFloat(fromAmount),
        toAmount: parseFloat(toAmount),
        marketRate: rateData.market || undefined,
        description: description || undefined
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
      const fromWalletName = wallets.find(w => w.id === fromWalletId)?.name || 'Desconocida';
      const toWalletName = wallets.find(w => w.id === toWalletId)?.name || 'Desconocida';
      const fromCurrency = wallets.find(w => w.id === fromWalletId)?.currency || '';
      const toCurrency = wallets.find(w => w.id === toWalletId)?.currency || '';
      
      alert(`✅ Exchange registrado exitosamente\nDe: ${fromAmount} ${fromCurrency} (${fromWalletName})\nA: ${toAmount} ${toCurrency} (${toWalletName})\nTasa: ${rateData.rate.toFixed(2)} ${toCurrency}/${fromCurrency}\n${rateData.spread ? `Spread: ${rateData.spread.toFixed(2)}%` : ''}`);
      
      // Reset form
      setFromAmount('');
      setToAmount('');
      setMarketRate('');
      setDescription('');

      // Notificar éxito al componente padre
      onSuccess?.();
      
    } catch (error) {
      console.error('Exchange error:', error);
      alert(`❌ Error: ${error instanceof Error ? error.message : String(error)}`);
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
              <Box display="flex" gap={1}>
                <FormControl fullWidth required>
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
                <TextField
                  placeholder="Monto"
                  type="number"
                  value={fromAmount}
                  onChange={(e) => setFromAmount(e.target.value)}
                  sx={{ width: '120px' }}
                  required
                  disabled={loading}
                  InputProps={{
                    endAdornment: fromWalletId ? (
                      wallets.find(w => w.id === fromWalletId)?.currency || ''
                    ) : ''
                  }}
                />
              </Box>
            </Box>

            {/* Destino */}
            <Box>
              <Typography variant="subtitle2" gutterBottom>
                A (Destino)
              </Typography>
              <Box display="flex" gap={1}>
                <FormControl fullWidth required>
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
                <TextField
                  placeholder="Monto"
                  type="number"
                  value={toAmount}
                  onChange={(e) => setToAmount(e.target.value)}
                  sx={{ width: '120px' }}
                  required
                  disabled={loading}
                  InputProps={{
                    endAdornment: toWalletId ? (
                      wallets.find(w => w.id === toWalletId)?.currency || ''
                    ) : ''
                  }}
                />
              </Box>
            </Box>

            {/* Tasa de mercado (opcional) */}
            <TextField
              label="Tasa de mercado (opcional)"
              type="number"
              value={marketRate}
              onChange={(e) => setMarketRate(e.target.value)}
              placeholder="Ej: 635 VES/USD"
              disabled={loading}
              helperText="Proporcionar tasa de mercado para calcular spread"
            />

            {rateData && (
              <Box bgcolor="grey.50" p={2} borderRadius={1}>
                <Typography variant="subtitle2" gutterBottom>
                  📊 Cálculo del exchange
                </Typography>
                <Box display="flex" flexWrap="wrap" gap={1}>
                  <Chip
                    label={`Tasa usada: ${rateData.rate.toFixed(2)} VES/USD`}
                    color="primary"
                    size="small"
                  />
                  {rateData.market && (
                    <Chip
                      label={`Mercado: ${rateData.market} VES/USD`}
                      color="secondary"
                      size="small"
                    />
                  )}
                  {rateData.spread !== null && (
                    <Chip
                      label={`Spread: ${rateData.spread.toFixed(2)}%`}
                      color={rateData.spread > 0 ? 'success' : 'error'}
                      size="small"
                      icon={rateData.spread > 0 ? <TrendingUp /> : <TrendingDown />}
                    />
                  )}
                </Box>
                <Typography variant="caption" color="text.secondary">
                  {rateData.spread !== null 
                    ? (rateData.spread > 0 ? '🎉 Spread positivo' : '⚠️ Spread negativo')
                    : 'ℹ️ No se calculó spread (falta tasa de mercado)'}
                </Typography>
              </Box>
            )}

            <TextField
              label="Descripción"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Ej: Cambio Binance"
              multiline
              rows={2}
              disabled={loading}
            />

            <Button
              type="submit"
              variant="contained"
              color="primary"
              size="large"
              fullWidth
              startIcon={<SwapHoriz />}
              disabled={loading || !fromWalletId || !toWalletId || fromWalletId === toWalletId || !fromAmount || !toAmount}
            >
              {loading ? 'Procesando...' : 'Realizar Exchange'}
            </Button>
          </Box>
        </form>

        <Typography variant="caption" color="text.secondary" sx={{ mt: 2, display: 'block' }}>
          💡 Ejemplo: 100 USD → 60,000 VES (tasa 600 VES/USD)
          {marketRate && ` vs mercado ${marketRate} VES/USD`}
        </Typography>
      </CardContent>
    </Card>
  );
}