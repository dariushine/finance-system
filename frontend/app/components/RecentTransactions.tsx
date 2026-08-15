'use client';

import { useState } from 'react';
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
  Button
} from '@mui/material';
import {
  TrendingUp as IncomeIcon,
  TrendingDown as ExpenseIcon,
  Visibility as ViewIcon,
  MoreHoriz as MoreIcon
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';

interface Transaction {
  id: number;
  walletId: number;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  description?: string;
  date: string;
  walletName?: string;
  walletCurrency?: string;
}

interface RecentTransactionsProps {
  transactions: Transaction[];
  maxRows?: number;
}

export default function RecentTransactions({ transactions, maxRows = 5 }: RecentTransactionsProps) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  
  const displayedTransactions = showAll ? transactions : transactions.slice(0, maxRows);

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

  const getTypeColor = (type: string) => {
    return type === 'income' ? 'success' : 'error';
  };

  const getTypeIcon = (type: string) => {
    return type === 'income' ? <IncomeIcon /> : <ExpenseIcon />;
  };

  if (!transactions.length) {
    return (
      <Card>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Transacciones Recientes
          </Typography>
          <Box textAlign="center" py={3}>
            <Typography variant="body1" color="text.secondary">
              No hay transacciones recientes
            </Typography>
          </Box>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={2}>
          <Typography variant="h6">
            Transacciones Recientes
          </Typography>
          <Button
            size="small"
            onClick={() => router.push('/transactions')}
          >
            Ver todas
          </Button>
        </Box>

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
              {displayedTransactions.map((transaction) => (
                <TableRow key={transaction.id} hover>
                  <TableCell>
                    <Typography variant="body2" color="text.secondary">
                      {formatDate(transaction.date)}
                    </Typography>
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={transaction.category}
                      size="small"
                      variant="outlined"
                    />
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

        {transactions.length > maxRows && (
          <Box mt={2} textAlign="center">
            <Button
              size="small"
              onClick={() => setShowAll(!showAll)}
              endIcon={<MoreIcon />}
            >
              {showAll ? 'Mostrar menos' : `Ver ${transactions.length - maxRows} más`}
            </Button>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}