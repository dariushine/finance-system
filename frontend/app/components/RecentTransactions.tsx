'use client';

import { useEffect, useState } from 'react';
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
  Alert
} from '@mui/material';
import {
  TrendingUp as IncomeIcon,
  TrendingDown as ExpenseIcon,
  Visibility as ViewIcon,
  Refresh as RefreshIcon
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

export default function RecentTransactions() {
  const router = useRouter();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  const displayed = transactions.slice(0, MAX_ROWS);

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
      minimumFractionDigits: 2
    }).format(amount);
  };

  const getTypeColor = (type: string) => type === 'income' ? 'success' : 'error';
  const getTypeIcon = (type: string) => type === 'income' ? <IncomeIcon /> : <ExpenseIcon />;

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
        ) : (
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
      </CardContent>
    </Card>
  );
}
