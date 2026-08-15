'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Grid,
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
  TextField,
  Alert,
  CircularProgress,
  Divider,
  LinearProgress
} from '@mui/material';
import {
  Add as AddIcon,
  SwapHoriz as ExchangeIcon,
  TrendingUp as ProfitIcon,
  TrendingDown as LossIcon,
  Visibility as ViewIcon,
  Download as DownloadIcon,
  Info as InfoIcon
} from '@mui/icons-material';
import { API_URL } from '../lib/api';
import ExchangeForm from '../components/ExchangeForm';

interface Exchange {
  id: number;
  fromWalletId: number;
  toWalletId: number;
  fromAmount: number;
  toAmount: number;
  rate: number;
  marketRate?: number;
  spread?: number;
  description?: string;
  createdAt: string;
  fromWalletName?: string;
  toWalletName?: string;
  fromCurrency?: string;
  toCurrency?: string;
}

interface ExchangeStats {
  totalExchanges: number;
  totalFromAmount: number;
  totalToAmount: number;
  averageSpread: number;
  profitLoss: number;
  recentExchanges: Exchange[];
}

export default function ExchangesPage() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
  const [stats, setStats] = useState<ExchangeStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openNewExchange, setOpenNewExchange] = useState(false);

  useEffect(() => {
    loadExchanges();
  }, [page, rowsPerPage]);

  const loadExchanges = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/exchanges?page=${page + 1}&limit=${rowsPerPage}`);
      if (!response.ok) throw new Error('Error al cargar exchanges');
      
      const data: { data: Exchange[] } | Exchange[] = await response.json();
      const list = Array.isArray(data) ? data : data.data;
      setExchanges(list);

      // Calcular estadísticas
      if (list.length > 0) {
        const exchangesData: Exchange[] = list;
        
        const stats: ExchangeStats = {
          totalExchanges: exchangesData.length,
          totalFromAmount: exchangesData.reduce((sum, ex) => sum + ex.fromAmount, 0),
          totalToAmount: exchangesData.reduce((sum, ex) => sum + ex.toAmount, 0),
          averageSpread: exchangesData.filter(ex => ex.spread !== null)
            .reduce((sum, ex) => sum + (ex.spread || 0), 0) / (exchangesData.filter(ex => ex.spread !== null).length || 1),
          profitLoss: exchangesData.reduce((sum, ex) => {
            const value = ex.marketRate ? (ex.fromAmount * ex.marketRate) - ex.toAmount : 0;
            return sum + value;
          }, 0),
          recentExchanges: exchangesData.slice(0, 5)
        };

        setStats(stats);
      }
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

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-VE', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit'
    }).format(date);
  };

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Desde', 'Hacia', 'Monto Desde', 'Monto Hacia', 'Tasa', 'Spread', 'Fecha'];
    const rows = exchanges.map(ex => [
      ex.id,
      ex.fromWalletName || `Billetera ${ex.fromWalletId}`,
      ex.toWalletName || `Billetera ${ex.toWalletId}`,
      ex.fromAmount,
      ex.toAmount,
      ex.rate.toFixed(4),
      ex.spread ? `${ex.spread.toFixed(2)}%` : '',
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
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Box>
          <Typography variant="h4" gutterBottom fontWeight="bold">
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

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Stats Cards */}
      {stats && (
        <Grid container spacing={3} mb={4}>
          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <ExchangeIcon color="primary" />
                  <Typography variant="body2" color="text.secondary">
                    Total Exchanges
                  </Typography>
                </Box>
                <Typography variant="h4">{stats.totalExchanges}</Typography>
                <LinearProgress variant="determinate" value={100} sx={{ mt: 1 }} />
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Typography variant="body2" color="text.secondary">
                    Monto Total Desde
                  </Typography>
                </Box>
                <Typography variant="h4">
                  {formatCurrency(stats.totalFromAmount)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total enviado
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <Typography variant="body2" color="text.secondary">
                    Monto Total Hacia
                  </Typography>
                </Box>
                <Typography variant="h4">
                  {formatCurrency(stats.totalToAmount)}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Total recibido
                </Typography>
              </CardContent>
            </Card>
          </Grid>

          <Grid item xs={12} sm={6} md={3}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  {stats.profitLoss >= 0 ? (
                    <ProfitIcon color="success" />
                  ) : (
                    <LossIcon color="error" />
                  )}
                  <Typography variant="body2" color="text.secondary">
                    Ganancia/Pérdida
                  </Typography>
                </Box>
                <Typography 
                  variant="h4" 
                  color={stats.profitLoss >= 0 ? 'success.main' : 'error.main'}
                >
                  {formatCurrency(Math.abs(stats.profitLoss))}
                </Typography>
                <Typography variant="caption" color="text.secondary">
                  Spread promedio: {stats.averageSpread.toFixed(2)}%
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
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

      {/* Recent Exchanges */}
      <Card sx={{ mb: 4 }}>
        <CardContent>
          <Typography variant="h6" gutterBottom>
            Exchanges Recientes
          </Typography>
          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Fecha</TableCell>
                  <TableCell>Desde</TableCell>
                  <TableCell>Hacia</TableCell>
                  <TableCell>Montos</TableCell>
                  <TableCell>Tasa</TableCell>
                  <TableCell>Spread</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {exchanges.slice(0, 5).map((exchange) => (
                  <TableRow key={exchange.id} hover>
                    <TableCell>
                      <Typography variant="body2">
                        {formatDate(exchange.createdAt)}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {exchange.fromWalletName || `Billetera ${exchange.fromWalletId}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatCurrency(exchange.fromAmount, exchange.fromCurrency)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box>
                        <Typography variant="body2" fontWeight="medium">
                          {exchange.toWalletName || `Billetera ${exchange.toWalletId}`}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {formatCurrency(exchange.toAmount, exchange.toCurrency)}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Box display="flex" flexDirection="column" gap={0.5}>
                        <Chip 
                          label={`${exchange.fromAmount.toFixed(2)} ${exchange.fromCurrency || 'USD'}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                        <Chip 
                          label={`${exchange.toAmount.toFixed(2)} ${exchange.toCurrency || 'USD'}`}
                          size="small"
                          color="secondary"
                          variant="outlined"
                        />
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" fontWeight="bold">
                        {exchange.rate.toFixed(4)}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">
                        {exchange.toCurrency}/{exchange.fromCurrency}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      {exchange.spread !== null && exchange.spread !== undefined ? (
                        <Chip
                          label={`${exchange.spread.toFixed(2)}%`}
                          size="small"
                          color={exchange.spread >= 0 ? 'success' : 'error'}
                          icon={exchange.spread >= 0 ? <ProfitIcon /> : <LossIcon />}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          -
                        </Typography>
                      )}
                      {exchange.marketRate && (
                        <Typography variant="caption" display="block" color="text.secondary">
                          Mercado: {exchange.marketRate}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

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

          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>ID</TableCell>
                  <TableCell>Fecha</TableCell>
                  <TableCell>From → To</TableCell>
                  <TableCell>From Amount</TableCell>
                  <TableCell>To Amount</TableCell>
                  <TableCell>Tasa</TableCell>
                  <TableCell>Spread</TableCell>
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
                        <Typography variant="body2">#{exchange.id}</Typography>
                      </TableCell>
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
                        <Chip
                          label={exchange.rate.toFixed(4)}
                          size="small"
                          color="primary"
                        />
                      </TableCell>
                      <TableCell>
                        {exchange.spread != null ? (
                          <Chip
                            label={`${exchange.spread.toFixed(2)}%`}
                            size="small"
                            color={exchange.spread >= 0 ? 'success' : 'error'}
                          />
                        ) : (
                          <Typography variant="body2" color="text.secondary">
                            Sin spread
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