'use client';

import { useState, useEffect, memo, useCallback } from 'react';
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
  IconButton,
  Tooltip,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
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
  Add as AddIcon,
  Visibility as ViewIcon,
  Download as DownloadIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { API_URL } from '../lib/api';
import ExchangeForm from '../components/ExchangeForm';
import DateRangeFilter from '../components/DateRangeFilter';

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
  fromWalletName?: string;
  toWalletName?: string;
  fromCurrency?: string;
  toCurrency?: string;
}

// --- Formateador a nivel de módulo (referencia estable) ---
const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

// --- Tarjeta móvil memorizada: solo se re-renderiza si SUS props cambian ---
const ExchangeAccordionItem = memo(function ExchangeAccordionItem({
  exchange,
  isOpen,
  onToggle,
}: {
  exchange: Exchange;
  isOpen: boolean;
  onToggle: (id: number) => void;
}) {
  return (
    <Accordion
      expanded={isOpen}
      onChange={() => onToggle(exchange.id)}
      disableGutters
      sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 1, boxShadow: 'none' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.5, minHeight: 48 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" width="100%" pr={1}>
          <Stack spacing={0.25}>
            <Typography variant="body2" color="text.secondary">{new Date(exchange.createdAt).toLocaleDateString('es-VE')} · {new Date(exchange.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}</Typography>
            <Typography variant="body2">{exchange.fromWalletName || `Wallet ${exchange.fromWalletId}`}</Typography>
          </Stack>
          <Typography variant="body2" fontWeight="bold" color="success.main">
            +{formatCurrency(exchange.toAmount, exchange.toCurrency)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1.5, pt: 0 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Stack spacing={1}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Hacia</Typography>
            <Typography variant="body2">{exchange.toWalletName || `Wallet ${exchange.toWalletId}`}</Typography>
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Enviado</Typography>
            <Typography variant="body2" color="error.main">-{formatCurrency(exchange.fromAmount, exchange.fromCurrency)}</Typography>
          </Box>
          {exchange.fee != null && exchange.fee > 0 && (
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Fee</Typography>
              <Typography variant="body2">{exchange.fee.toFixed(2)} {exchange.fromCurrency || ''}</Typography>
            </Box>
          )}
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Descripción</Typography>
            <Typography variant="body2" textAlign="right">{exchange.description || '—'}</Typography>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
});

export default function ExchangesPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [expanded, setExpanded] = useState<number | false>(false);
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openNewExchange, setOpenNewExchange] = useState(false);

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

  const loadExchanges = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({ page: String(page + 1), limit: String(rowsPerPage) });
      if (applied.period) params.set('period', applied.period);
      if (applied.from) params.set('from', applied.from);
      if (applied.to) params.set('to', applied.to);
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
    const headers = ['ID', 'Desde', 'Hacia', 'Monto Desde', 'Monto Hacia', 'Tasa', 'Fee', 'Fecha'];
    const rows = exchanges.map(ex => [
      ex.id,
      ex.fromWalletName || `Billetera ${ex.fromWalletId}`,
      ex.toWalletName || `Billetera ${ex.toWalletId}`,
      ex.fromAmount,
      ex.toAmount,
      ex.rate.toFixed(4),
      ex.fee ? ex.fee.toFixed(2) : '',
      new Date(ex.createdAt).toLocaleString('es-VE')
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
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
          <Button
            variant="contained"
            startIcon={<AddIcon />}
            onClick={() => setOpenNewExchange(true)}
          >
            Nuevo Exchange
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

      {/* Exchange Form Dialog */}
      <Dialog 
        open={openNewExchange} 
        onClose={() => setOpenNewExchange(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle>
          Nuevo Exchange
        </DialogTitle>
        <DialogContent>
          <ExchangeForm 
            onSuccess={() => {
              setOpenNewExchange(false);
              loadExchanges();
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenNewExchange(false)}>
            Cancelar
          </Button>
        </DialogActions>
      </Dialog>

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
            // MOBILE: acordeón por exchange
            <Box>
              {exchanges.map((exchange) => (
                <ExchangeAccordionItem
                  key={exchange.id}
                  exchange={exchange}
                  isOpen={expanded === exchange.id}
                  onToggle={handleToggle}
                />
              ))}
            </Box>
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
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {exchanges
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((exchange) => (
                    <TableRow key={exchange.id} hover>
                      <TableCell>
                        <Typography variant="body2">
                          {new Date(exchange.createdAt).toLocaleDateString('es-VE')}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {new Date(exchange.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
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
                      <TableCell align="right">
                        <Tooltip title="Ver detalles">
                          <IconButton size="small">
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
