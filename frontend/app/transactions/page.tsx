'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress,
  Table, TableBody, TableCell, TableContainer, TableHead,
  TablePagination, TableRow, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import { Download } from '@mui/icons-material';
import TransactionAccordionList from '../components/TransactionAccordionList';
import DateRangeFilter from '../components/DateRangeFilter';
import EmptyState from '../components/EmptyState';
import { ReceiptLong as ReceiptIcon } from '@mui/icons-material';
import { API_URL } from '../lib/api';
import { formatLocalDate } from '../lib/dates';
import { useNumberFormat } from '../lib/NumberFormat';
import { useTimeZone } from '../lib/timeZone';
import { useRouter } from 'next/navigation';
import { useOnDataChanged } from '../lib/dataEvents';
import { downloadCSV, downloadXLSX, formatCSVDateTime } from '../lib/csv';

// Fecha + hora (HH:MM) de la transacción proyectada en la zona del usuario.
// El backend manda `time` en cada fila de la lista; si falta, solo fecha.
const formatTxDate = (date: string, time?: string | null) => {
  const base = formatLocalDate(date);
  const t = time ? time.slice(0, 5) : '';
  return t ? `${base} · ${t}` : base;
};

interface Transaction {
  id: number;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  fee?: number;
  description?: string;
  date: string;
  /** Hora (HH:MM) en la zona del usuario, la manda el backend proyectada. */
  time?: string | null;
  walletName?: string;
  walletCurrency?: string;
}

export default function TransactionsPage() {
  const { formatAmount, formatNumber } = useNumberFormat();
  const { userTimeZone } = useTimeZone();
  const router = useRouter();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Paginación (se restaura desde sessionStorage si se vino del detalle)
  const listState = (() => {
    try {
      const raw = sessionStorage.getItem('transactions-list-state');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  })();
  const [page, setPage] = useState<number>(listState && typeof listState.page === 'number' ? listState.page : 0);
  const [rowsPerPage, setRowsPerPage] = useState<number>(listState && typeof listState.rowsPerPage === 'number' ? listState.rowsPerPage : 10);

  // Filtro por período / rango de fechas
  const [period, setPeriod] = useState<string>(listState?.period || 'all');
  const [from, setFrom] = useState<string>(listState?.from || '');
  const [to, setTo] = useState<string>(listState?.to || '');
  const [applied, setApplied] = useState<{ period: string; from: string; to: string }>(
    listState?.applied || { period: 'all', from: '', to: '' }
  );

  // Persistir el estado actual (filtros + paginación) siempre que cambie,
  // para que al volver a esta página (desde el detalle o con el botón atrás)
  // se restaure exactamente donde estaba el usuario.
  useEffect(() => {
    try {
      sessionStorage.setItem('transactions-list-state', JSON.stringify({ period, applied, page, rowsPerPage, from, to }));
    } catch { /* ignorar */ }
  }, [period, applied, page, rowsPerPage, from, to]);

  // Ir al detalle (el estado ya queda persistido por el efecto anterior).
  const goToDetail = (txId: number) => {
    router.push(`/transactions/${txId}`);
  };

  const loadTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ limit: '100' });
      if (applied.period) params.set('period', applied.period);
      if (applied.from) params.set('from', applied.from);
      if (applied.to) params.set('to', applied.to);
      params.set('tz', userTimeZone);
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
  }, [applied, userTimeZone]);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  // Recargar al crear/editar/borrar (FAB u otra acción).
  useOnDataChanged(loadTransactions, [loadTransactions]);

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
    setPage(0);
  };

  const handleChangePage = (_e: unknown, newPage: number) => setPage(newPage);

  const handleChangeRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  };

  // Transacciones visibles en la página actual
  const startIndex = page * rowsPerPage;
  const pagedTransactions = transactions.slice(startIndex, startIndex + rowsPerPage);

  const exportCSV = () => {
    const header = ['ID', 'Fecha', 'Hora', 'Categoria', 'Tipo', 'Billetera', 'Credito', 'Debito', 'Moneda', 'Descripcion'];
    const rows = transactions.map((t) => [
      t.id,
      formatCSVDateTime(t.date, null), // solo fecha dd/MM/aaaa
      t.time ? t.time.slice(0, 5) : '', // hora
      t.category,
      t.type === 'income' ? 'Ingreso' : 'Gasto',
      t.walletName || '',
      t.type === 'income' ? String(t.amount) : '', // crédito
      t.type === 'expense' ? String(t.amount) : '', // débito
      t.walletCurrency || '',
      t.description || '',
    ]);
    downloadCSV(`transacciones_${new Date().toISOString().split('T')[0]}.csv`, header, rows);
  };

  const exportXLSX = () => {
    const header = ['ID', 'Fecha', 'Hora', 'Categoría', 'Tipo', 'Billetera', 'Crédito', 'Débito', 'Moneda', 'Descripción'];
    const rows = transactions.map((t) => [
      t.id,
      formatCSVDateTime(t.date, null), // solo fecha dd/MM/aaaa
      t.time ? t.time.slice(0, 5) : '', // hora
      t.category,
      t.type === 'income' ? 'Ingreso' : 'Gasto',
      t.walletName || '',
      t.type === 'income' ? t.amount : '', // crédito
      t.type === 'expense' ? t.amount : '', // débito
      t.walletCurrency || '',
      t.description || '',
    ]);
    downloadXLSX(`transacciones_${new Date().toISOString().split('T')[0]}.xlsx`, 'Transacciones', header, rows, [6, 7]);
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>Transacciones</Typography>
          <Typography variant="body1" color="text.secondary">Historial de ingresos y gastos.</Typography>
        </Box>
        <Box display="flex" gap={1} flexWrap="wrap">
          <Button variant="outlined" startIcon={<Download />} onClick={exportCSV}>CSV</Button>
          <Button variant="outlined" startIcon={<Download />} onClick={exportXLSX}>XLSX</Button>
        </Box>
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
          {loading ? <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box> : !transactions.length ? (
            <EmptyState
              icon={<ReceiptIcon sx={{ fontSize: 32, color: 'text.secondary' }} />}
              title="No hay transacciones todavía"
              description="Cuando registres un ingreso o un gasto, aparecerá aquí con su detalle."
            />
          ) : isMobile ? (
            <TransactionAccordionList
              transactions={pagedTransactions}
              showFee
              showView
            />
          ) : (
            <TableContainer>
              <Table>
                <TableHead><TableRow>
                  <TableCell>Fecha</TableCell><TableCell>Categoría</TableCell><TableCell>Billetera</TableCell>
                  <TableCell>Tipo</TableCell><TableCell align="right">Monto</TableCell><TableCell align="right">Fee</TableCell><TableCell>Descripción</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {pagedTransactions.map((transaction) => (
                    <TableRow key={transaction.id} hover onClick={() => goToDetail(transaction.id)} sx={{ cursor: 'pointer' }}>
                      <TableCell>{formatTxDate(transaction.date, transaction.time)}</TableCell>
                      <TableCell><Chip label={transaction.category} size="small" variant="outlined" /></TableCell>
                      <TableCell>{transaction.walletName || '—'}</TableCell>
                      <TableCell><Chip label={transaction.type === 'income' ? 'Ingreso' : 'Gasto'} color={transaction.type === 'income' ? 'success' : 'error'} size="small" /></TableCell>
                      <TableCell align="right" sx={{ color: transaction.type === 'income' ? 'success.main' : 'error.main', fontWeight: 600 }}>
                        {transaction.type === 'income' ? '+' : '-'}{formatAmount(transaction.amount)} {transaction.walletCurrency || ''}
                      </TableCell>
                      <TableCell align="right">
                        {transaction.fee && transaction.fee > 0 ? (
                          <Chip label={`${formatNumber(transaction.fee)} ${transaction.walletCurrency || ''}`} size="small" color="warning" variant="outlined" />
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
          {transactions.length > 0 && (
            <TablePagination
              component="div"
              count={transactions.length}
              page={page}
              onPageChange={handleChangePage}
              rowsPerPage={rowsPerPage}
              onRowsPerPageChange={handleChangeRowsPerPage}
              rowsPerPageOptions={[5, 10, 25, 50]}
              labelRowsPerPage="Registros por página"
            />
          )}
        </CardContent>
      </Card>
    </Box>
  );
}
