'use client';

import { useEffect, useState } from 'react';
import {
  Card, CardContent, Grid, Typography, Box, Avatar, CircularProgress, Alert,
  CardActionArea, Chip, Pagination
} from '@mui/material';
import { AccountBalance, AttachMoney, CreditCard, Savings, ShowChart, ChevronRight } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { useWallets } from '../lib/hooks';
import theme from '../theme';

const icons: Record<string, React.ReactNode> = {
  bank: <AccountBalance />,
  cash: <AttachMoney />,
  card: <CreditCard />,
  crypto: <Savings />,
  investment: <ShowChart />,
};

const formatUsd = (n: number) =>
  new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);

const PER_PAGE = 6;

export default function WalletList() {
  const router = useRouter();
  const { wallets, loading, error } = useWallets();
  const [page, setPage] = useState(1);

  const pageCount = Math.max(1, Math.ceil(wallets.length / PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const shown = wallets.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

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

  const gotoWallet = (id: number) => router.push(`/wallets/${id}`);

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>
            💰 Billeteras
          </Typography>
          <Chip
            label={`${wallets.length} ${wallets.length === 1 ? 'billetera' : 'billeteras'}`}
            size="small"
            variant="outlined"
          />
        </Box>

        <Grid container spacing={2}>
          {shown.map((wallet) => (
            <Grid item xs={12} sm={6} md={4} key={wallet.id}>
              <Card variant="outlined" sx={{ height: '100%' }}>
                <CardActionArea onClick={() => gotoWallet(wallet.id)} sx={{ height: '100%' }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1} mb={1}>
                      <Avatar sx={{ bgcolor: wallet.color || theme.palette.primary.main }}>
                        {icons[wallet.type] || <AccountBalance />}
                      </Avatar>
                      <Box minWidth={0}>
                        <Typography variant="subtitle2" fontWeight="bold" noWrap>
                          {wallet.name}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {wallet.type} · {wallet.currency}
                        </Typography>
                      </Box>
                    </Box>
                    <Typography variant="h5" fontWeight="bold" color="primary">
                      {Number(wallet.balance).toLocaleString('es-VE')} {wallet.currency}
                    </Typography>
                    {wallet.currency !== 'USD' && wallet.usdValue != null ? (
                      <Typography variant="caption" color="text.secondary">
                        ≈ {formatUsd(wallet.usdValue)} USD
                        {wallet.rate ? ` (tasa ${wallet.rate.toFixed(2)})` : ''}
                      </Typography>
                    ) : (
                      <Typography variant="caption" color="text.secondary">
                        Dólares estadounidenses
                      </Typography>
                    )}
                    <Box display="flex" justifyContent="flex-end" mt={1}>
                      <ChevronRight color="disabled" />
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>

        {wallets.length === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>No hay billeteras configuradas. Agrega una para comenzar.</Alert>
        )}

        {pageCount > 1 && (
          <Box display="flex" justifyContent="center" mt={3}>
            <Pagination
              count={pageCount}
              page={currentPage}
              onChange={(_, value) => setPage(value)}
              color="primary"
              size="small"
            />
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
