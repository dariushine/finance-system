'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Add } from '@mui/icons-material';
import TransactionForm from '../components/TransactionForm';
import TransactionAccordionList from '../components/TransactionAccordionList';
import DateRangeFilter from '../components/DateRangeFilter';
import { API_URL } from '../lib/api';

interface Transaction {
  id: number;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  fee?: number;
  description?: string;
  date: string;
  walletName?: string;
  walletCurrency?: string;
}

export default function TransactionsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  // Filtro por período / rango de fechas
  const [period, setPeriod] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<{ period: string; from: string; to: string }>({ period: 'all', from: '', to: '' });

  const loadTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (applied.period) params.set('period', applied.period);
      if (applied.from) params.set('from', applied.from);
      if (applied.to) params.set('to', applied.to);
      const response = await fetch(`${API_URL}/transactions?${params.toString()}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar las transacciones');
      setTransactions(Array.isArray(payload) ? payload : payload.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, [applied]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  const handlePeriodChange = (v: string) => {
    setPeriod(v);
    if (v === 'custom') return;
    // Preset: aplicar de una vez
    setApplied({ period: v, from: '', to: '' });
    setFrom('');
    setTo('');
  };

  const handleRangeChange = (f: string, t: string) => {
    setFrom(f);
    setTo(t);
  };

  const handleApply = () => {
    if (period === 'custom') {
      if (!from || !to) return;
      setApplied({ period: 'custom', from, to });
    } else {
      setApplied({ period, from: '', to: '' });
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>Transacciones</Typography>
          <Typography variant="body1" color="text.secondary">Historial de ingresos y gastos.</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => setFormOpen(true)}>Nueva transacción</Button>
      </Box>

      <Box mb={2}>
        <DateRangeFilter
          value={period}
          onChange={handlePeriodChange}
          from={from}
          to={to}
          onRangeChange={handleRangeChange}
          onApply={handleApply}
        />
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <CardContent>
          {loading ? <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box> : isMobile ? (
            <TransactionAccordionList
              transactions={transactions}
              showFee
              showView={false}
              pageSize={10}
            />
          ) : (
            <TableContainer>
              <Table>
                <TableHead><TableRow>
                  <TableCell>Fecha</TableCell><TableCell>Categoría</TableCell><TableCell>Billetera</TableCell>
                  <TableCell>Tipo</TableCell><TableCell align="right">Monto</TableCell><TableCell align="right">Fee</TableCell><TableCell>Descripción</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id} hover>
                      <TableCell>{new Date(transaction.date).toLocaleDateString('es-VE')}</TableCell>
                      <TableCell><Chip label={transaction.category} size="small" variant="outlined" /></TableCell>
                      <TableCell>{transaction.walletName || '—'}</TableCell>
                      <TableCell><Chip label={transaction.type === 'income' ? 'Ingreso' : 'Gasto'} color={transaction.type === 'income' ? 'success' : 'error'} size="small" /></TableCell>
                      <TableCell align="right" sx={{ color: transaction.type === 'income' ? 'success.main' : 'error.main', fontWeight: 600 }}>
                        {transaction.type === 'income' ? '+' : '-'}{transaction.amount.toLocaleString('es-VE')} {transaction.walletCurrency || ''}
                      </TableCell>
                      <TableCell align="right">
                        {transaction.fee && transaction.fee > 0 ? (
                          <Chip label={`${transaction.fee.toFixed(2)} ${transaction.walletCurrency || ''}`} size="small" color="warning" variant="outlined" />
                        ) : '—'}
                      </TableCell>
                      <TableCell>{transaction.description || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!transactions.length && <Typography color="text.secondary" textAlign="center" py={4}>No hay transacciones registradas.</Typography>}
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nueva transacción</DialogTitle>
        <DialogContent><TransactionForm onSuccess={() => { setFormOpen(false); loadTransactions(); }} /></DialogContent>
        <DialogActions><Button onClick={() => setFormOpen(false)}>Cancelar</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
