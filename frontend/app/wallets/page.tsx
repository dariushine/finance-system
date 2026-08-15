'use client';

import { Alert, Avatar, Box, Card, CardContent, CircularProgress, Grid, Typography } from '@mui/material';
import { AccountBalance, AttachMoney, CreditCard, Savings } from '@mui/icons-material';
import { useWallets } from '../lib/hooks';
import theme from '../theme';

const icons = {
  bank: <AccountBalance />,
  cash: <AttachMoney />,
  card: <CreditCard />,
  crypto: <Savings />,
};

export default function WalletsPage() {
  const { wallets, loading, error } = useWallets();

  if (loading) {
    return <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px"><CircularProgress /></Box>;
  }

  return (
    <Box>
      <Typography variant="h4" fontWeight="bold" gutterBottom>Billeteras</Typography>
      <Typography variant="body1" color="text.secondary" mb={3}>
        Consulta el saldo de todas tus cuentas y billeteras.
      </Typography>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {wallets.map((wallet) => (
          <Grid item xs={12} sm={6} lg={4} key={wallet.id}>
            <Card sx={{ height: '100%' }}>
              <CardContent>
                <Box display="flex" alignItems="center" gap={2} mb={2}>
                  <Avatar sx={{ bgcolor: theme.palette.primary.main }}>{icons[wallet.type as keyof typeof icons] || <AccountBalance />}</Avatar>
                  <Box>
                    <Typography variant="h6">{wallet.name}</Typography>
                    <Typography variant="body2" color="text.secondary">{wallet.type} · {wallet.currency}</Typography>
                  </Box>
                </Box>
                <Typography variant="h4" color="primary.main" fontWeight="bold">
                  {wallet.balance.toLocaleString('es-VE')} {wallet.currency}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {!wallets.length && !error && <Alert severity="info">No hay billeteras configuradas.</Alert>}
    </Box>
  );
}
