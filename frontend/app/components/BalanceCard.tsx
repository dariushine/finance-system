'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Box, Chip, CircularProgress } from '@mui/material';
import { AttachMoney, TrendingUp, ErrorOutline } from '@mui/icons-material';
import { financeApi, Stats, Wallet } from '../services/financeApi';

export default function BalanceCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1, VES: 635, EUR: 1.07 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [statsData, walletsData, ratesData] = await Promise.all([
          financeApi.getStats(),
          financeApi.getWallets(),
          financeApi.getExchangeRates(),
        ]);
        setStats(statsData);
        setWallets(walletsData);
        if (ratesData?.rates) setRates(ratesData.rates);
        setLastUpdated(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
        setError(null);
      } catch (err) {
        setError('Error al cargar datos del backend');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card sx={{ bgcolor: 'primary.main', color: 'white', textAlign: 'center', py: 4 }}>
        <CircularProgress color="inherit" />
        <Typography variant="body2" sx={{ mt: 2 }}>Cargando datos...</Typography>
      </Card>
    );
  }

  if (error) {
    return (
      <Card sx={{ bgcolor: 'error.main', color: 'white' }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ErrorOutline />
          <Typography>{error}</Typography>
        </CardContent>
      </Card>
    );
  }

  const totalBalance = stats?.net_balance || 0;

  // Convert wallets to currency display usando la tasa real del backend
  const currencies = wallets.map(wallet => ({
    currency: wallet.currency,
    amount: wallet.balance,
    rate: wallet.currency === 'USD' ? 1 : (rates[wallet.currency] ?? 1),
    color: wallet.color === 'green' ? 'success' : 
           wallet.color === 'blue' ? 'primary' : 
           wallet.color === 'orange' ? 'warning' : 'default' as any,
  }));

  return (
    <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <div>
            <Typography variant="h6" gutterBottom>
              Balance Total
            </Typography>
            <Typography variant="h4" fontWeight="bold">
              ${totalBalance.toLocaleString()} USD
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Actualizado {lastUpdated}
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.8, fontSize: '0.875rem', mt: 0.5 }}>
              Ingresos: ${stats?.total_income?.toLocaleString() || '0'} USD | Gastos: ${stats?.total_expense?.toLocaleString() || '0'} USD
            </Typography>
          </div>
          <Box display="flex" alignItems="center">
            <AttachMoney sx={{ fontSize: 48, mr: 1 }} />
            <TrendingUp sx={{ fontSize: 32 }} />
          </Box>
        </Box>
        
        <Box mt={3} display="flex" gap={1} flexWrap="wrap">
          {currencies.map((curr, index) => (
            <Chip
              key={`${curr.currency}-${index}`}
              label={`${curr.currency}: ${curr.amount.toLocaleString()} ($${(curr.amount / curr.rate).toFixed(0)} USD)`}
              color={curr.color as any}
              variant="outlined"
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
            />
          ))}
          {wallets.length === 0 && (
            <Chip
              label="No hay billeteras configuradas"
              color="default"
              variant="outlined"
              sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.3)' }}
            />
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
