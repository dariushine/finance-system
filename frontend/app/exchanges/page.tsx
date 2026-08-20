'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Button,
  Alert,
  CircularProgress,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useMediaQuery,
  Divider,
  Stack,
  useTheme,
} from '@mui/material';
import {
  Visibility as ViewIcon,
  Download as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { API_URL } from '../lib/api';
import { useNumberFormat } from '../lib/NumberFormat';
import { useTimeZone } from '../lib/timeZone';
import { useOnDataChanged } from '../lib/dataEvents';
import DateRangeFilter from '../components/DateRangeFilter';
import EmptyState from '../components/EmptyState';
import { CurrencyExchange as ExchangeIcon } from '@mui/icons-material';

interface Exchange {
  id: number;
  fromWalletId: number;
  toWalletId: number;
  fromAmount: number;
  toAmount: number;
  rate: number;
  fee?: number;
  description?: string;
  createdAt: string;
  /** Fecha seleccionada por el usuario (YYYY-MM-DD) */
  date?: string;
  /** Hora seleccionada por el usuario (HH:MM:SS) */
  time?: string | null;
  fromWalletName?: string;
  toWalletName?: string;
  fromCurrency?: string;
  toCurrency?: string;
}

// Muestra una hora cruda HH:MM o HH:MM:SS sin pasar por parseLocalDate.
const formatTimeOnly = (time?: string | null) => {
  if (!time) return '';
  return time.slice(0, 5); // HH:MM
};

// Muestra fecha/hora seleccionada por el usuario si existe; si no, la de creación.
const formatExchangeDate = (exchange: Exchange) => {
  if (exchange.date) {
    const [y, m, d] = exchange.date.split('-').map(Number);
    const dt = new Date(y, (m || 1) - 1, d || 1);
    const dateStr = dt.toLocaleDateString('es-VE');
    const timeStr = exchange.time ? exchange.time.slice(0, 5) : '';
    return timeStr ? `${dateStr} · ${timeStr}` : dateStr;
  }
  const c = new Date(exchange.createdAt);
  if (isNaN(c.getTime())) return '';
  return `${c.toLocaleDateString('es-VE')} · ${c.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
};

// --- Tarjeta móvil memorizada: solo se re-renderiza si SUS props cambian ---
const ExchangeAccordionItem = memo(function ExchangeAccordionItem({
  exchange,
  isOpen,
  onToggle,
  onView,
  formatCurrency,
}: {
  exchange: Exchange;
  isOpen: boolean;
  onToggle: (id: number) => void;
  onView: (id: number) => void;
  formatCurrency: (amount: number, currency?: string) => string;
}) {
  return (
    <Accordion
      expanded={isOpen}
      onChange={() => onToggle(exchange.id)}
      disableGutters
      sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 1, boxShadow: 'none' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.5, minHeight: 48 }}>
        <Box width="100%" pr={1}>
          {/* Fila superior: fecha a la izquierda, residbetter resumen a la derecha */}
          <Box display="flex" alignItems="center" justifyContent="space-between" gap={1}>
            <Typography variant="caption" color="text.secondary">{formatExchangeDate(exchange)}</Typography>
            <Typography variant="caption" fontStyle="italic" noWrap>
              {exchange.fromWalletName || `Wallet ${exchange.fromWalletId}`} → {exchange.toWalletName || `Wallet ${exchange.toWalletId}`}
            </Typography>
          </Box>
          {/* Fila principal: la transición de montos */}
          <Box display="flex" alignItems="center" justifyContent="space-between" gap={1} mt={0.5}>
            <Typography variant="body2" color="error.main" fontWeight="bold" noWrap>
              -{formatCurrency(exchange.fromAmount, exchange.fromCurrency)}
            </Typography>
            <Typography variant="body2" color="text.secondary">→</Typography>
            <Typography variant="body2" color="success.main" fontWeight="bold" noWrap>
              +{formatCurrency(exchange.toAmount, exchange.toCurrency)}
            </Typography>
          </Box>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1.5, pt: 0 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Stack spacing={1}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Tasa</Typography>
            <Chip label={exchange.rate.toFixed(4)} size="small" color="primary" />
          </Box>
          {exchange.fee != null && exchange.fee > 0 && (
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Fee</Typography>
              <Chip
                label={`${exchange.fee.toFixed(2)} ${exchange.fromCurrency || ''}`}
                size="small"
                color="warning"
              />
            </Box>
          )}
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Descripción</Typography>
            <Typography variant="body2" textAlign="right">{exchange.description || '—'}</Typography>
          </Box>
          <Box display="flex" justifyContent="flex-end" pt={1}>
            <Button
              size="small"
              startIcon={<ViewIcon fontSize="small" />}
              onClick={(e) => {
                e.stopPropagation();
                onView(exchange.id);
              }}
            >
              Ver detalle
            </Button>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
});

export default function ExchangesPage() {
  const theme = useTheme();
  const router = useRouter();
  const { formatCurrency } = useNumberFormat();
  const { userTimeZone } = useTimeZone();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [expanded, setExpanded] = useState<number | false>(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Filtro por período / rango de fechas
  const [period, setPeriod] = useState<string>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [applied, setApplied] = useState<{ period: string; from: string; to: string }>({ period: 'all', from: '', to: '' });

  // Handler ESTABLE: solo se re-renderiza la tarjeta que se abre/cierra.
  const handleToggle = useCallback((id: number) => {
    setExpanded((prev) => (prev === id ? false : id));
  }, []);

  useEffect(() => {
    loadExchanges();
  }, [page, rowsPerPage, applied]);

  // Recargar al crear/editar/borrar (FAB u otra acción).
  useOnDataChanged(() => { loadExchanges(); }, []);

  const loadExchanges = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page + 1), limit: String(rowsPerPage) });
      if (applied.period) params.set('period', applied.period);
      if (applied.from) params.set('from', applied.from);
      if (applied.to) params.set('to', applied.to);
      params.set('tz', userTimeZone);
      const response = await fetch(`${API_URL}/exchanges?${params.toString()}`);
      if (!response.ok) throw new Error('Error al cargar exchanges');
      
      const data: { data: Exchange[] } | Exchange[] = await response.json();
      const list = Array.isArray(data) ? data : data.data;
      setExchanges(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const handlePeriodChange = (v: string) => {
    setPeriod(v);
    if (v === 'custom') return;
    setPage(0);
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
      setPage(0);
      setApplied({ period: 'custom', from, to });
    } else {
      setPage(0);
      setApplied({ period, from: '', to: '' });
    }
  };

  const exportToCSV = () => {
    const headers = ['Desde', 'Hacia', 'Monto Desde', 'Monto Hacia', 'Tasa', 'Fee', 'Fecha'];
    const rows = exchanges.map(ex => [
      ex.fromWalletName || `Billetera ${ex.fromWalletId}`,
      ex.toWalletName || `Billetera ${ex.toWalletId}`,
      ex.fromAmount,
      ex.toAmount,
      ex.rate.toFixed(4),
      ex.fee ? ex.fee.toFixed(2) : '',
      formatExchangeDate(ex)
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `exchanges_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (loading && !exchanges.length) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h4" gutterBottom fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            Exchanges
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Cambios entre billeteras y monedas
          </Typography>
        </Box>
        <Box display="flex" gap={1}>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={exportToCSV}
          >
            Exportar
          </Button>
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

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* All Exchanges Table */}
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h6">
              Todos los Exchanges
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {exchanges.length} registros
            </Typography>
          </Box>

          {isMobile ? (
            // MOBILE: acordeón por exchange (o estado vacío amigable si no hay registros)
            exchanges.length === 0 ? (
              <EmptyState
                icon={<ExchangeIcon sx={{ fontSize: 32, color: 'text.secondary' }} />}
                title="No hay exchanges todavía"
                description="Cuando conviertas fondos entre billeteras o monedas, aparecerá aquí con su detalle."
              />
            ) : (
              <Box>
                {exchanges.map((exchange) => (
                  <ExchangeAccordionItem
                    key={exchange.id}
                    exchange={exchange}
                    isOpen={expanded === exchange.id}
                    onToggle={handleToggle}
                    onView={(id) => router.push(`/exchanges/${id}`)}
                    formatCurrency={formatCurrency}
                  />
                ))}
              </Box>
            )
          ) : (
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell>From → To</TableCell>
                  <TableCell>From Amount</TableCell>
                  <TableCell>To Amount</TableCell>
                  <TableCell>Fee</TableCell>
                  <TableCell>Descripción</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {exchanges
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((exchange) => (
                    <TableRow key={exchange.id} hover onClick={() => router.push(`/exchanges/${exchange.id}`)} sx={{ cursor: 'pointer' }}>
                      <TableCell>
                        <Typography variant="body2">
                          {exchange.date ? exchange.date.split('-').reverse().join('/') : new Date(exchange.createdAt).toLocaleDateString('es-VE')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {exchange.time ? formatTimeOnly(exchange.time) : new Date(exchange.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Box>
                          <Typography variant="body2" fontWeight="medium">
                            {exchange.fromWalletName || `Wallet ${exchange.fromWalletId}`}
                          </Typography>
                          <Typography variant="caption" color="text.secondary">
                            →
                          </Typography>
                          <Typography variant="body2" fontWeight="medium">
                            {exchange.toWalletName || `Wallet ${exchange.toWalletId}`}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="error.main">
                          -{formatCurrency(exchange.fromAmount, exchange.fromCurrency)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" color="success.main">
                          +{formatCurrency(exchange.toAmount, exchange.toCurrency)}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        {exchange.fee && exchange.fee > 0 ? (
                          <Chip
                            label={`${(exchange.fee || 0).toFixed(2)} ${exchange.fromCurrency || ''}`}
                            size="small"
                            color="warning"
                            variant="outlined"
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            -
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" noWrap maxWidth={150}>
                          {exchange.description || '-'}
                        </Typography>
                      </TableCell>
                    </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          )}

          <TablePagination
            rowsPerPageOptions={[5, 10, 25, 50]}
            component="div"
            count={exchanges.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage="Filas por página:"
          />
        </CardContent>
      </Card>
    </Box>
  );
}
