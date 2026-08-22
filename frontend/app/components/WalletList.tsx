'use client';

import { useEffect, useState } from 'react';
import {
  Card, CardContent, Grid, Typography, Box, Avatar, Alert,
  CardActionArea, Chip, Pagination, Skeleton
} from '@mui/material';
import { AccountBalance, AttachMoney, CreditCard, Savings, ShowChart, ChevronRight } from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { useRef } from 'react';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import { useWallets } from '../lib/hooks';
import { useOnDataChanged } from '../lib/dataEvents';
import theme from '../theme';
import BalanceReveal from './BalanceReveal';
import { useNumberFormat } from '../lib/NumberFormat';

const icons: Record<string, React.ReactNode> = {
  bank: <AccountBalance />,
  cash: <AttachMoney />,
  card: <CreditCard />,
  crypto: <Savings />,
  investment: <ShowChart />,
};

const PER_PAGE = 6;

export default function WalletList() {
  const router = useRouter();
  const theme = useTheme();
  const { formatAmount, formatCurrency } = useNumberFormat();
  // En pantallas grandes (>= md, 3 columnas) no hace falta corregir el scroll;
  // solo en móvil (1 tarjeta por fila) el salto de altura molesta.
  const isSmallScreens = useMediaQuery(theme.breakpoints.down('md'));
  const cardRef = useRef<HTMLDivElement>(null);
  const { wallets, loading, error, refetch } = useWallets();
  const [page, setPage] = useState(1);

  // Recargar las billeteras cuando se crea/edita/borra algo (FAB u otra acción).
  useOnDataChanged(refetch, []);

  // Ocultar del dashboard las billeteras marcadas (hideInDashboard).
  // Las marcas se configuran en la edición de la billetera.
  const visibleWallets = wallets.filter((w) => !w.hideInDashboard);
  const pageCount = Math.max(1, Math.ceil(visibleWallets.length / PER_PAGE));
  const currentPage = Math.min(page, pageCount);
  const shown = visibleWallets.slice((currentPage - 1) * PER_PAGE, currentPage * PER_PAGE);

  // Rastrear página previa para hacer scroll solo cuando el usuario cambia de
  // página (no al montar). El useEffect corre DESPUÉS de que React actualizó el
  // DOM, así la altura ya es la definitiva y el scroll se hace al tope del panel.
  const prevPageRef = useRef(currentPage);
  useEffect(() => {
    if (prevPageRef.current !== currentPage) {
      prevPageRef.current = currentPage;
      if (!isSmallScreens) return; // en grandes no hacemos scroll
      const id = window.setTimeout(() => {
        cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 50);
      return () => window.clearTimeout(id);
    }
  }, [currentPage, isSmallScreens]);

  const handlePageChange = (_: unknown, value: number) => {
    setPage(value);
  };

  if (loading) {
    return (
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
            <Skeleton variant="text" width={160} />
            <Skeleton variant="text" width={80} />
          </Box>
          <Grid container spacing={2}>
            {Array.from({ length: 3 }).map((_, i) => (
              <Grid item xs={12} sm={6} md={4} key={i}>
                <Card variant="outlined" sx={{ height: '100%' }}>
                  <CardContent>
                    <Box display="flex" gap={2} alignItems="center">
                      <Skeleton variant="circular" width={40} height={40} />
                      <Box sx={{ width: '100%' }}>
                        <Skeleton variant="text" width="60%" />
                        <Skeleton variant="text" width="40%" />
                      </Box>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
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
    <Card ref={cardRef}>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6" gutterBottom sx={{ mb: 0 }}>
            💰 Billeteras
          </Typography>
          <Chip
            label={`${visibleWallets.length} ${visibleWallets.length === 1 ? 'billetera' : 'billeteras'}`}
            size="small"
            variant="outlined"
          />
        </Box>

        <Box>
          <Grid container spacing={2} alignItems="flex-start">          {shown.map((wallet) => (
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
                        {wallet.alias ? (
                          <Chip
                            label={wallet.alias}
                            size="small"
                            variant="outlined"
                            sx={{ mt: 0.5, height: 20, fontSize: '0.7rem' }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.secondary">
                            {wallet.type} · {wallet.currency}
                          </Typography>
                        )}
                      </Box>
                    </Box>
                    <BalanceReveal
                      display={`${formatAmount(Number(wallet.balance))} ${wallet.currency}`}
                      variant="h5"
                      color="primary.main"
                      caption={
                        wallet.currency !== 'USD' && wallet.usdValue != null
                          ? `≈ ${formatCurrency(wallet.usdValue)} USD${wallet.rate ? ` (tasa ${wallet.rate.toFixed(2)})` : ''}`
                          : 'Dólares estadounidenses'
                      }
                    />
                    <Box display="flex" justifyContent="flex-end" mt={1}>
                      <ChevronRight color="disabled" />
                    </Box>
                  </CardContent>
                </CardActionArea>
              </Card>
            </Grid>
          ))}
        </Grid>
        </Box>

        {visibleWallets.length === 0 && (
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
