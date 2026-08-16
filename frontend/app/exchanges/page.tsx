'use client';

import { useState, useEffect } from 'react';
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
  CircularProgress
} from '@mui/material';
import {
  Add as AddIcon,
  Visibility as ViewIcon,
  Download as DownloadIcon,
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
  description?: string;
  createdAt: string;
  fromWalletName?: string;
  toWalletName?: string;
  fromCurrency?: string;
  toCurrency?: string;
}

export default function ExchangesPage() {
  const [exchanges, setExchanges] = useState<Exchange[]>([]);
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

  const formatCurrency = (amount: number, currency: string = 'USD') => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  };

  const exportToCSV = () => {
    const headers = ['ID', 'Desde', 'Hacia', 'Monto Desde', 'Monto Hacia', 'Tasa', 'Fecha'];
    const rows = exchanges.map(ex => [
      ex.id,
      ex.fromWalletName || `Billetera ${ex.fromWalletId}`,
      ex.toWalletName || `Billetera ${ex.toWalletId}`,
      ex.fromAmount,
      ex.toAmount,
      ex.rate.toFixed(4),
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
