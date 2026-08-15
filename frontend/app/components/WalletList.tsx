'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, Grid, Typography, Box, Avatar, LinearProgress, CircularProgress, Alert } from '@mui/material';
import { AccountBalance, AttachMoney, CreditCard, Savings } from '@mui/icons-material';
import { financeApi, Wallet } from '../services/financeApi';

export default function WalletList() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchWallets = async () => {
      try {
        setLoading(true);
        const data = await financeApi.getWallets();
        setWallets(data);
        setError(null);
      } catch (err) {
        setError('Error al cargar billeteras');
        console.error(err);
      } finally {
        setLoading(false);
      }
    };

    fetchWallets();
    const interval = setInterval(fetchWallets, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <Card>
        <CardContent sx={{ textAlign: 'center', py: 4 }}>
          <CircularProgress />
          <Typography variant="body2" sx={{ mt: 2 }}>Cargando billeteras...</Typography>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent>
          <Alert severity="error">{error}</Alert>
        </CardContent>
      </Card>
    );
  }

  const getWalletIcon = (type: string) => {
    switch (type) {
      case 'bank': return <AccountBalance />;
      case 'cash': return <AttachMoney />;
      case 'crypto': return <Savings />;
      case 'card': return <CreditCard />;
      default: return <AccountBalance />;
    }
  };

  const getWalletColor = (index: number) => {
    const colors = ['#2196f3', '#f44336', '#4caf50', '#ff9800', '#9c27b0', '#00bcd4'];
    return colors[index % colors.length];
  };

  const totalUSD = wallets
    .filter(w => w.currency === 'USD')
    .reduce((sum, w) => sum + w.balance, 0);
  
  const totalVES = wallets
    .filter(w => w.currency === 'VES')
    .reduce((sum, w) => sum + w.balance, 0);

  const totalBalance = totalUSD + (totalVES / 635); // Assuming VES rate
  const progressValue = Math.min(100, (totalBalance / 5000) * 100); // Assuming $5k target

  return (
    <Card>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          💰 Billeteras
        </Typography>
        <Box mb={3}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Total USD: ${totalUSD.toLocaleString()} | Total VES: {totalVES.toLocaleString()} VES
          </Typography>
          <LinearProgress variant="determinate" value={70} sx={{ height: 8, borderRadius: 4 }} />
        </Box>

        <Box mb={3}>
          <Typography variant="body2" color="text.secondary" gutterBottom>
            Total USD: ${totalUSD.toLocaleString()} | Total VES: {totalVES.toLocaleString()} VES
          </Typography>
          <LinearProgress variant="determinate" value={progressValue} sx={{ height: 8, borderRadius: 4 }} />
        </Box>

        <Grid container spacing={2}>
          {wallets.map((wallet, index) => (
            <Grid item xs={12} sm={6} md={4} key={wallet.id}>
              <Card variant="outlined" sx={{ p: 2, height: '100%' }}>
                <Box display="flex" alignItems="center" mb={2}>
                  <Avatar sx={{ bgcolor: getWalletColor(index), mr: 2 }}>
                    {getWalletIcon(wallet.type || 'bank')}
                  </Avatar>
                  <div>
                    <Typography variant="subtitle2" fontWeight="bold">
                      {wallet.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {wallet.type || 'bank'} • {wallet.currency}
                    </Typography>
                  </div>
                </Box>
                <Typography variant="h5" fontWeight="bold" color="primary">
                  {wallet.balance.toLocaleString()} {wallet.currency}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  ≈ ${(wallet.currency === 'VES' ? wallet.balance / 635 : wallet.balance).toFixed(2)} USD
                </Typography>
              </Card>
            </Grid>
          ))}
          {wallets.length === 0 && (
            <Grid item xs={12}>
              <Alert severity="info">No hay billeteras configuradas. Agrega una para comenzar.</Alert>
            </Grid>
          )}
        </Grid>
      </CardContent>
    </Card>
  );
}