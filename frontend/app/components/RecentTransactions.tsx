'use client';

import { useEffect, useState, memo, useCallback } from 'react';
import {
  Card,
  CardContent,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Box,
  Button,
  CircularProgress,
  Alert,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useMediaQuery,
  Divider,
  Stack,
  useTheme,
} from '@mui/material';
import {
  TrendingUp as IncomeIcon,
  TrendingDown as ExpenseIcon,
  Visibility as ViewIcon,
  Refresh as RefreshIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';

interface Transaction {
  id: number;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  description?: string;
  date: string;
  walletName?: string;
  walletCurrency?: string;
}

const MAX_ROWS = 5;

// --- Formateadores a nivel de módulo (referencias estables, no se reconstruyen por render) ---
const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 24) {
    return `Hoy ${date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffHours < 48) {
    return `Ayer ${date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
  }
};

const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

const getTypeColor = (type: string) => type === 'income' ? 'success' : 'error';
const getTypeIcon = (type: string) => type === 'income' ? <IncomeIcon /> : <ExpenseIcon />;

// --- Tarjeta móvil memorizada: solo se re-renderiza si SUS props cambian ---
const MobileTransactionItem = memo(function MobileTransactionItem({
  transaction,
  isOpen,
  onToggle,
  onView,
}: {
  transaction: Transaction;
  isOpen: boolean;
  onToggle: (id: number) => void;
  onView: (id: number) => void;
}) {
  const isIncome = transaction.type === 'income';

  return (
    <Accordion
      expanded={isOpen}
      onChange={() => onToggle(transaction.id)}
      disableGutters
      sx={{
        '&:before': { display: 'none' },
        border: '1px solid',
        borderColor: 'divider',
        borderRadius: 1,
        mb: 1,
        boxShadow: 'none',
      }}
    >
      <AccordionSummary
        expandIcon={<ExpandMoreIcon />}
        sx={{ px: 1.5, minHeight: 48 }}
      >
        <Box display="flex" alignItems="center" justifyContent="space-between" width="100%" pr={1}>
          <Stack spacing={0.25}>
            <Typography variant="body2" color="text.secondary">
              {formatDate(transaction.date)}
            </Typography>
            <Chip
              icon={getTypeIcon(transaction.type)}
              label={transaction.type === 'income' ? 'Ingreso' : 'Gasto'}
              color={getTypeColor(transaction.type)}
              size="small"
              sx={{ height: 22, '& .MuiChip-icon': { fontSize: 16 } }}
            />
          </Stack>
          <Typography
            variant="body1"
            fontWeight="bold"
            color={isIncome ? 'success.main' : 'error.main'}
          >
            {isIncome ? '+' : '-'}
            {formatCurrency(transaction.amount, transaction.walletCurrency)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1.5, pt: 0 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Stack spacing={1}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Categoría</Typography>
            <Chip label={transaction.category || '—'} size="small" variant="outlined" />
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Billetera</Typography>
            <Typography variant="body2">{transaction.walletName || '—'}</Typography>
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Descripción</Typography>
            <Typography variant="body2" textAlign="right">{transaction.description || '—'}</Typography>
          </Box>
          <Box display="flex" justifyContent="flex-end">
            <Button
              size="small"
              startIcon={<ViewIcon />}
              onClick={() => onView(transaction.id)}
            >
              Ver detalles
            </Button>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
});

export default function RecentTransactions() {
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expanded, setExpanded] = useState<number | false>(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(MAX_ROWS);

  const load = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/transactions?limit=100');
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar las transacciones');
      const list: Transaction[] = Array.isArray(payload) ? payload : payload.data || [];
      // Ordenar de más reciente a más antigua
      list.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setTransactions(list);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const displayed = transactions.slice(0, visibleCount);

  // Handler ESTABLE: su referencia no cambia entre renders, así el memo de cada
  // tarjeta solo re-renderiza la que se abre/cierra (no toda la lista).
  const handleToggle = useCallback((id: number) => {
    setExpanded((prev) => (prev === id ? false : id));
  }, []);

  const handleView = useCallback((id: number) => {
    router.push(`/transactions/${id}`);
  }, [router]);

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            🕒 Últimas transacciones
          </Typography>
          <Box display="flex" alignItems="center" gap={1}>
            <Tooltip title="Recargar">
              <IconButton size="small" onClick={load} aria-label="Recargar">
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Button size="small" onClick={() => router.push('/transactions')}>
              Ver todas
            </Button>
          </Box>
        </Box>

        {loading ? (
          <Box display="flex" justifyContent="center" py={4}>
            <CircularProgress />
          </Box>
        ) : error ? (
          <Alert severity="error" onClose={() => setError(null)}>{error}</Alert>
        ) : !transactions.length ? (
          <Box textAlign="center" py={3}>
            <Typography variant="body1" color="text.secondary">
              No hay transacciones recientes
            </Typography>
          </Box>
        ) : isMobile ? (
          // MOBILE: acordeón por transacción
          <Box>
            {displayed.map((transaction) => (
              <MobileTransactionItem
                key={transaction.id}
                transaction={transaction}
                isOpen={expanded === transaction.id}
                onToggle={handleToggle}
                onView={handleView}
              />
            ))}
          </Box>
        ) : (
          // DESKTOP: tabla completa
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell width="120px">Fecha</TableCell>
                  <TableCell>Categoría</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell align="right">Monto</TableCell>
                  <TableCell align="center">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayed.map((transaction) => (
                  <TableRow key={transaction.id} hover>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDate(transaction.date)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip label={transaction.category} size="small" variant="outlined" />
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={getTypeIcon(transaction.type)}
                        label={transaction.type === 'income' ? 'Ingreso' : 'Gasto'}
                        color={getTypeColor(transaction.type)}
                        size="small"
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography
                        variant="body2"
                        fontWeight="bold"
                        color={transaction.type === 'income' ? 'success.main' : 'error.main'}
                      >
                        {formatCurrency(transaction.amount, transaction.walletCurrency)}
                      </Typography>
                      {transaction.walletName && (
                        <Typography variant="caption" color="text.secondary" display="block">
                          {transaction.walletName}
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="center">
                      <Tooltip title="Ver detalles">
                        <IconButton size="small" onClick={() => router.push(`/transactions/${transaction.id}`)}>
                          <ViewIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        {visibleCount < transactions.length && (
          <Box display="flex" justifyContent="center" mt={2}>
            <Button
              size="small"
              startIcon={<ExpandMoreIcon />}
              onClick={() => setVisibleCount((c) => c + MAX_ROWS)}
            >
              Ver más ({transactions.length - visibleCount} restantes)
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
