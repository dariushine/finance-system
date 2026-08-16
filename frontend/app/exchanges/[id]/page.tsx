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
  CompareArrows,
  AccountBalanceWallet,
  ReceiptLong,
  CalendarMonth,
  Notes,
  ChevronRight,
  SwapHoriz,
  Percent,
} from '@mui/icons-material';
import { getExchange, getTransaction, ExchangeDetail, TransactionDetail } from '../../lib/api';

const formatTimeOnly = (time?: string | null) => {
  if (!time) return '';
  return time.slice(0, 5); // HH:MM
};

const formatDate = (dateStr?: string) => {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  if (isNaN(dt.getTime())) return dateStr;
  return dt.toLocaleDateString('es-VE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
};

const formatCurrency = (n: number, currency = 'USD') => {
  try {
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
};

export default function ExchangeDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);
  const theme = useTheme();

  const [exchange, setExchange] = useState<ExchangeDetail | null>(null);
  const [transactions, setTransactions] = useState<TransactionDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getExchange(id);
      setExchange(data);

      // Cargar las transacciones que componen el exchange:
      // débito (exchange_out), su(s) fee(s) hijas, y crédito (exchange_in).
      const txs: TransactionDetail[] = [];
      try {
        const debit = await getTransaction(data.debitTransactionId);
        txs.push(debit);
        if (debit.children?.length) txs.push(...debit.children);
      } catch { /* el débito podría no resolverse; se omite */ }
      try {
        const credit = await getTransaction(data.creditTransactionId);
        txs.push(credit);
      } catch { /* el crédito podría no resolverse; se omite */ }
      setTransactions(txs);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar el exchange');
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

  if (error || !exchange) {
    return (
      <Box>
        <Button startIcon={<ArrowBack />} onClick={() => router.push('/exchanges')} sx={{ mb: 2 }}>
          Volver a exchanges
        </Button>
        <Alert severity="error">{error || 'Exchange no encontrado'}</Alert>
      </Box>
    );
  }

  const fromCurrency = exchange.fromCurrency || 'USD';
  const toCurrency = exchange.toCurrency || 'USD';
  const hasFee = (exchange.fee ?? 0) > 0;

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => router.push('/exchanges')} sx={{ mb: 2 }}>
        Volver a exchanges
      </Button>

      {/* Header / monto recibido */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Stack spacing={2} alignItems="center" textAlign="center">
            <Avatar
              sx={{
                width: { xs: 64, sm: 72 },
                height: { xs: 64, sm: 72 },
                bgcolor: theme.palette.primary.main,
              }}
            >
              <CompareArrows fontSize="large" />
            </Avatar>
            <Box>
              <Typography variant="caption" color="text.secondary" display="block" textTransform="uppercase" letterSpacing={1}>
                Exchange
              </Typography>
              <Box
                display="flex"
                flexDirection={{ xs: 'column', sm: 'row' }}
                alignItems="center"
                justifyContent="center"
                gap={{ xs: 1, sm: 3 }}
                sx={{ mt: 1 }}
              >
                {/* Monto de origen (enviado) */}
                <Stack alignItems="center" spacing={0.25}>
                  <WalletLink id={exchange.fromWalletId} name={exchange.fromWalletName} fallback={`Billetera ${exchange.fromWalletId}`} />
                  <Typography variant="h5" fontWeight="bold" color="error.main" sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem' } }}>
                    -{formatCurrency(exchange.fromAmount, fromCurrency)}
                  </Typography>
                </Stack>
                {/* Icono de intercambio: vertical en móvil (debajo del monto origen), horizontal en escritorio */}
                <CompareArrows
                  sx={{
                    color: 'text.secondary',
                    fontSize: { xs: 32, sm: 36 },
                    transform: { xs: 'rotate(90deg)', sm: 'none' },
                    mt: { xs: 0, sm: 2.5 },
                  }}
                />
                {/* Monto de destino (recibido) */}
                <Stack alignItems="center" spacing={0.25}>
                  <WalletLink id={exchange.toWalletId} name={exchange.toWalletName} fallback={`Billetera ${exchange.toWalletId}`} />
                  <Typography variant="h5" fontWeight="bold" color="success.main" sx={{ fontSize: { xs: '1.5rem', sm: '1.75rem' } }}>
                    +{formatCurrency(exchange.toAmount, toCurrency)}
                  </Typography>
                </Stack>
              </Box>
              <Box display="flex" gap={1} justifyContent="center" mt={1} flexWrap="wrap">
                <Chip
                  icon={<Percent />}
                  label={`Tasa ${exchange.rate.toFixed(4)}`}
                  color="primary"
                  variant="outlined"
                />
                {hasFee && (
                  <Chip
                    icon={<ReceiptLong />}
                    label={`Fee ${formatCurrency(exchange.fee!, fromCurrency)}`}
                    color="warning"
                    variant="outlined"
                  />
                )}
              </Box>
            </Box>
          </Stack>
        </CardContent>
      </Card>

      <Box display="grid" gridTemplateColumns={{ xs: '1fr', md: '1fr 1fr' }} gap={3} mb={3}>
        {/* Detalle */}
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <SwapHoriz color="action" />
              <Typography variant="h6">Detalle</Typography>
            </Box>
            <Stack divider={<Divider flexItem />} spacing={1.5}>
              {/* Origen → Destino */}
              <Box display="flex" justifyContent="space-between" gap={2}>
                <Typography variant="body2" color="text.secondary">De → A</Typography>
                <Stack spacing={0.25} alignItems="flex-end">
                  <WalletLink id={exchange.fromWalletId} name={exchange.fromWalletName} fallback={`Billetera ${exchange.fromWalletId}`} />
                  <WalletLink id={exchange.toWalletId} name={exchange.toWalletName} fallback={`Billetera ${exchange.toWalletId}`} />
                </Stack>
              </Box>
              <Row label="Monto enviado" value={`-${formatCurrency(exchange.fromAmount, fromCurrency)}`} color="error.main" />
              <Row label="Monto recibido" value={`+${formatCurrency(exchange.toAmount, toCurrency)}`} color="success.main" />
              <Row label="Tasa" value={`1 = ${exchange.rate.toFixed(4)}`} bold />
              {hasFee && (
                <Row label="Comisión (fee)" value={formatCurrency(exchange.fee!, fromCurrency)} />
              )}
              {exchange.date && (
                <Box display="flex" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">Fecha</Typography>
                  <Box textAlign="right">
                    <Box display="flex" alignItems="center" justifyContent="flex-end" gap={0.5}>
                      <CalendarMonth fontSize="small" color="action" />
                      <Typography variant="body2">{formatDate(exchange.date)}</Typography>
                    </Box>
                    {exchange.time && (
                      <Typography variant="caption" color="text.secondary">{formatTimeOnly(exchange.time)}</Typography>
                    )}
                  </Box>
                </Box>
              )}
              {exchange.description && (
                <Box display="flex" justifyContent="space-between" gap={2}>
                  <Typography variant="body2" color="text.secondary">Descripción</Typography>
                  <Box display="flex" alignItems="flex-start" gap={0.5}>
                    <Notes fontSize="small" color="action" sx={{ mt: 0.25 }} />
                    <Typography variant="body2" textAlign="right">{exchange.description}</Typography>
                  </Box>
                </Box>
              )}
            </Stack>
          </CardContent>
        </Card>

        {/* Transacciones del exchange */}
        <Card>
          <CardContent>
            <Box display="flex" alignItems="center" gap={1} mb={2}>
              <ReceiptLong color="action" />
              <Typography variant="h6">Transacciones</Typography>
              {transactions.length > 0 && <Chip size="small" label={`${transactions.length}`} />}
            </Box>
            {transactions.length > 0 ? (
              <Stack spacing={1}>
                {transactions.map((t) => (
                  <ExchangeTxRow key={t.id} tx={t} onClick={() => router.push(`/transactions/${t.id}`)} />
                ))}
              </Stack>
            ) : (
              <Typography variant="body2" color="text.secondary">
                No se pudieron cargar las transacciones de este exchange.
              </Typography>
            )}
          </CardContent>
        </Card>
      </Box>
    </Box>
  );
}

function Row({ label, value, color, bold }: { label: string; value: string; color?: string; bold?: boolean }) {
  return (
    <Box display="flex" justifyContent="space-between" gap={2}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body1" fontWeight={bold ? 'bold' : 'medium'} color={color || 'text.primary'}>
        {value}
      </Typography>
    </Box>
  );
}

function WalletLink({ id, name, fallback }: { id: number; name?: string; fallback: string }) {
  const router = useRouter();
  return (
    <Box
      component="button"
      onClick={() => router.push(`/wallets/${id}`)}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.5,
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
        color: 'text.primary',
        '&:hover': { textDecoration: 'underline', color: 'primary.main' },
      }}
    >
      <AccountBalanceWallet fontSize="small" color="action" />
      <Typography variant="body2">{name || fallback}</Typography>
      <ChevronRight fontSize="small" color="action" />
    </Box>
  );
}

function ExchangeTxRow({ tx, onClick }: { tx: TransactionDetail; onClick: () => void }) {
  const isIncome = tx.type === 'income';
  const currency = tx.walletCurrency || 'USD';
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
            <Typography variant="body2" fontWeight="bold">{tx.category}</Typography>
            {tx.description && (
              <Typography variant="caption" color="text.secondary">{tx.description}</Typography>
            )}
          </Stack>
          <Box display="flex" alignItems="center" gap={0.5}>
            <Typography variant="body1" fontWeight="bold" color={isIncome ? 'success.main' : 'error.main'}>
              {isIncome ? '+' : '-'}{formatCurrency(tx.amount, currency)}
            </Typography>
            <ChevronRight fontSize="small" color="action" />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
