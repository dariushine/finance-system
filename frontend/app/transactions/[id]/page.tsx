'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Divider,
  Stack,
  Typography,
  useTheme,
} from '@mui/material';
import {
  ArrowBack,
  ArrowUpward,
  ArrowDownward,
  AccountBalanceWallet,
  ReceiptLong,
  CalendarMonth,
  Notes,
  Tag,
  ChevronRight,
} from '@mui/icons-material';
import { getTransaction, TransactionDetail } from '../../lib/api';

const formatDate = (dateString?: string) => {
  if (!dateString) return '—';
  return new Date(dateString).toLocaleDateString('es-VE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatTime = (dateString?: string) => {
  if (!dateString) return '—';
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
};

const formatCurrency = (n: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
};

export default function TransactionDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);
  const theme = useTheme();

  const [tx, setTx] = useState<TransactionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getTransaction(id);
      setTx(data);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar la transacción');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !tx) {
    return (
      <Box>
        <Button startIcon={<ArrowBack />} onClick={() => router.push('/transactions')} sx={{ mb: 2 }}>
          Volver a transacciones
        </Button>
        <Alert severity="error">{error || 'Transacción no encontrada'}</Alert>
      </Box>
    );
  }

  const isIncome = tx.type === 'income';
  const currency = tx.walletCurrency || 'USD';
  const children = tx.children || [];
  const hasChildren = children.length > 0;

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => router.push('/transactions')} sx={{ mb: 2 }}>
        Volver a transacciones
      </Button>

      {/* Header / monto principal */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2} alignItems="center" textAlign="center">
            <Avatar
              sx={{
                width: { xs: 64, sm: 72 },
                height: { xs: 64, sm: 72 },
                bgcolor: isIncome ? theme.palette.success.light : theme.palette.error.light,
              }}
            >
              {isIncome ? <ArrowUpward fontSize="large" /> : <ArrowDownward fontSize="large" />}
            </Avatar>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" textTransform="uppercase" letterSpacing={1}>
                {isIncome ? 'Ingreso' : 'Gasto'} · {tx.category}
              </Typography>
              <Typography
                variant="h3"
                fontWeight="bold"
                color={isIncome ? 'success.main' : 'error.main'}
                sx={{ fontSize: { xs: '2rem', sm: '2.5rem' } }}
              >
                {isIncome ? '+' : '-'}{formatCurrency(tx.amount, currency)}
              </Typography>
            </Box>
            {tx.fee && tx.fee > 0 && (
              <Chip
                icon={<ReceiptLong />}
                label={`Comisión ${formatCurrency(tx.fee, currency)}`}
                color="warning"
                variant="outlined"
              />
            )}
          </Stack>
        </CardContent>
      </Card>

      <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={3} mb={3}>
        {/* Detalle */}
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <ReceiptLong color="action" />
              <Typography variant="h6">Detalle</Typography>
            </Box>
            <Stack divider={<Divider flexItem />} spacing={1.5}>
              <InfoRow label="Categoría" value={<Chip size="small" label={tx.category} variant="outlined" />} />
              <InfoRow
                label="Tipo"
                value={
                  <Chip
                    size="small"
                    label={isIncome ? 'Ingreso' : 'Gasto'}
                    color={isIncome ? 'success' : 'error'}
                    variant="outlined"
                  />
                }
              />
              <Box display="flex" justifyContent="space-between" gap={2}>
                <Typography variant="body2" color="text.secondary">Billetera</Typography>
                <Box display="flex" alignItems="center" gap={0.5}>
                  <AccountBalanceWallet fontSize="small" color="action" />
                  <Typography variant="body2">{tx.walletName || `#${tx.walletId}`}</Typography>
                </Box>
              </Box>
              {tx.date && (
                <Box display="flex" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">Fecha</Typography>
                  <Box textAlign="right">
                    <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                      <CalendarMonth fontSize="small" color="action" />
                      <Typography variant="body2">{formatDate(tx.date)}</Typography>
                    </Box>
                    <Typography variant="caption" color="text.secondary">{formatTime(tx.createdAt || tx.date)}</Typography>
                  </Box>
                </Box>
              )}
              {tx.description && (
                <Box display="flex" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">Descripción</Typography>
                  <Box display="flex" alignItems="flex-start" gap={0.5}>
                    <Notes fontSize="small" color="action" sx={{ mt: 0.25 }} />
                    <Typography variant="body2" textAlign="right">{tx.description}</Typography>
                  </Box>
                </Box>
              )}
              {tx.balanceAfter != null && (
                <InfoRow
                  label="Saldo resultante"
                  value={
                    <Typography variant="body1" fontWeight="bold" color="primary.main">
                      {formatCurrency(tx.balanceAfter, currency)}
                    </Typography>
                  }
                />
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Transacciones asociadas */}
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <Tag color="action" />
              <Typography variant="h6">Transacciones asociadas</Typography>
              {hasChildren && <Chip size="small" label={`${children.length}`} />}
            </Box>
            {hasChildren ? (
              <Stack spacing={1}>
                {children.map((c) => (
                  <TransactionChildRow key={c.id} child={c} currency={currency} onClick={() => router.push(`/transactions/${c.id}`)} />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">Sin transacciones asociadas.</Typography>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box display="flex" justifyContent="space-between" gap={2}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Box>{value}</Box>
    </Box>
  );
}

function TransactionChildRow({
  child,
  currency,
  onClick,
}: {
  child: TransactionDetail;
  currency: string;
  onClick: () => void;
}) {
  const isIncome = child.type === 'income';
  return (
    <Card
      variant="outlined"
      onClick={onClick}
      sx={{
        boxShadow: 'none',
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
        '&:hover': { backgroundColor: 'action.hover' },
      }}
    >
      <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" gap={1}>
          <Stack spacing={0.25}>
            <Typography variant="body2" fontWeight="bold">{child.category}</Typography>
            {child.description && (
              <Typography variant="caption" color="text.secondary">{child.description}</Typography>
            )}
          </Stack>
          <Box display="flex" alignItems="center" gap={0.5}>
            <Typography variant="body1" fontWeight="bold" color={isIncome ? 'success.main' : 'error.main'}>
              {isIncome ? '+' : '-'}{formatCurrency(child.amount, child.walletCurrency || currency)}
            </Typography>
            <ChevronRight fontSize="small" color="action" />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
