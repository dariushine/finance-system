#!/bin/bash

echo "🚀 CREANDO FRONTEND COMPLETO MULTI-PÁGINA..."

BASE_DIR="/home/node/.openclaw/workspace/finance-system/frontend"
cd "$BASE_DIR"

# ========== 1. PÁGINA DASHBOARD ==========
echo "📊 Creando página Dashboard..."
cat > app/page.tsx << 'EOF'
'use client';

import { Grid, Box, Typography, Alert, CircularProgress } from '@mui/material';
import { useEffect, useState } from 'react';
import BalanceCard from './components/BalanceCard';
import WalletList from './components/WalletList';
import ExchangeForm from './components/ExchangeForm';
import TransactionForm from './components/TransactionForm';
import RecentTransactions from './components/RecentTransactions';
import { API_URL } from './lib/api';

interface DashboardStats {
  totalBalance: number;
  walletCount: number;
  transactionCount: number;
  recentTransactions: any[];
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        const [balanceRes, walletsRes, transactionsRes] = await Promise.all([
          fetch(`${API_URL}/balance`),
          fetch(`${API_URL}/wallets?limit=5`),
          fetch(`${API_URL}/transactions?limit=5`)
        ]);

        if (!balanceRes.ok || !walletsRes.ok || !transactionsRes.ok) {
          throw new Error('Error al cargar datos del dashboard');
        }

        const balance = await balanceRes.json();
        const wallets = await walletsRes.json();
        const transactions = await transactionsRes.json();

        setStats({
          totalBalance: balance.totalUSD || 0,
          walletCount: Array.isArray(wallets) ? wallets.length : 0,
          transactionCount: transactions.pagination?.total || transactions.length || 0,
          recentTransactions: Array.isArray(transactions.data) ? transactions.data : transactions
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Error desconocido');
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error) {
    return (
      <Alert severity="error" sx={{ mt: 2 }}>
        {error}
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="h4" gutterBottom fontWeight="bold">
        Dashboard Financiero
      </Typography>
      <Typography variant="body1" color="text.secondary" gutterBottom mb={4}>
        Resumen de tus finanzas y operaciones recientes
      </Typography>

      <Grid container spacing={3}>
        {/* Balance y Estadísticas */}
        <Grid item xs={12}>
          <BalanceCard />
        </Grid>

        {/* Quick Actions - 2 columnas en desktop, 1 en mobile */}
        <Grid item xs={12} md={6}>
          <TransactionForm />
        </Grid>
        
        <Grid item xs={12} md={6}>
          <ExchangeForm />
        </Grid>

        {/* Billeteras */}
        <Grid item xs={12}>
          <WalletList />
        </Grid>

        {/* Transacciones Recientes */}
        <Grid item xs={12}>
          <RecentTransactions transactions={stats?.recentTransactions || []} />
        </Grid>
      </Grid>

      {/* Stats Footer */}
      <Box mt={4} pt={3} borderTop="1px solid" borderColor="divider">
        <Grid container spacing={2}>
          <Grid item xs={12} sm={4}>
            <Box textAlign="center">
              <Typography variant="h6" color="primary">
                ${stats?.totalBalance.toLocaleString() || '0'}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Balance Total (USD)
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Box textAlign="center">
              <Typography variant="h6" color="primary">
                {stats?.walletCount || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Billeteras Activas
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Box textAlign="center">
              <Typography variant="h6" color="primary">
                {stats?.transactionCount || 0}
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Transacciones Totales
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Box>
    </Box>
  );
}
EOF

# ========== 2. PÁGINA BILLETERAS ==========
echo "💰 Creando página Billeteras..."
cat > app/wallets/page.tsx << 'EOF'
'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Avatar,
  Chip,
  LinearProgress,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  MenuItem,
  Alert,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Tooltip
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  AccountBalance as BankIcon,
  AttachMoney as CashIcon,
  CreditCard as CardIcon,
  Savings as CryptoIcon,
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon
} from '@mui/icons-material';
import { API_URL } from '../lib/api';

interface Wallet {
  id: number;
  name: string;
  type: string;
  currency: string;
  balance: number;
  description?: string;
  isActive: number;
}

interface WalletFormData {
  name: string;
  type: string;
  currency: string;
  description: string;
}

export default function WalletsPage() {
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [openDialog, setOpenDialog] = useState(false);
  const [editingWallet, setEditingWallet] = useState<Wallet | null>(null);
  const [formData, setFormData] = useState<WalletFormData>({
    name: '',
    type: 'cash',
    currency: 'USD',
    description: ''
  });

  const walletTypes = [
    { value: 'bank', label: 'Banco', icon: <BankIcon /> },
    { value: 'cash', label: 'Efectivo', icon: <CashIcon /> },
    { value: 'crypto', label: 'Cripto', icon: <CryptoIcon /> },
    { value: 'card', label: 'Tarjeta', icon: <CardIcon /> },
  ];

  const currencies = ['USD', 'VES', 'EUR', 'COP'];

  useEffect(() => {
    loadWallets();
  }, []);

  const loadWallets = async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/wallets`);
      if (!response.ok) throw new Error('Error al cargar billeteras');
      const data = await response.json();
      setWallets(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenDialog = (wallet: Wallet | null = null) => {
    if (wallet) {
      setEditingWallet(wallet);
      setFormData({
        name: wallet.name,
        type: wallet.type,
        currency: wallet.currency,
        description: wallet.description || ''
      });
    } else {
      setEditingWallet(null);
      setFormData({
        name: '',
        type: 'cash',
        currency: 'USD',
        description: ''
      });
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
    setEditingWallet(null);
  };

  const handleSubmit = async () => {
    try {
      const url = editingWallet 
        ? `${API_URL}/wallets/${editingWallet.id}`
        : `${API_URL}/wallets`;
      
      const method = editingWallet ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      if (!response.ok) throw new Error('Error al guardar billetera');
      
      handleCloseDialog();
      loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('¿Estás seguro de eliminar esta billetera?')) return;
    
    try {
      const response = await fetch(`${API_URL}/wallets/${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Error al eliminar billetera');
      
      loadWallets();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al eliminar');
    }
  };

  const handleChangePage = (event: unknown, newPage: number) => {
    setPage(newPage);
  };

  const handleChangeRowsPerPage = (event: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(event.target.value, 10));
    setPage(0);
  };

  const getWalletIcon = (type: string) => {
    const walletType = walletTypes.find(t => t.value === type);
    return walletType ? walletType.icon : <AccountBalance />;
  };

  const getCurrencyColor = (currency: string) => {
    switch (currency) {
      case 'USD': return 'success';
      case 'VES': return 'primary';
      case 'EUR': return 'warning';
      case 'COP': return 'error';
      default: return 'default';
    }
  };

  const calculateTotals = () => {
    const byCurrency: Record<string, number> = {};
    let grandTotal = 0;
    
    wallets.forEach(wallet => {
      byCurrency[wallet.currency] = (byCurrency[wallet.currency] || 0) + wallet.balance;
      grandTotal += wallet.balance;
    });
    
    return { byCurrency, grandTotal };
  };

  const { byCurrency, grandTotal } = calculateTotals();

  if (loading) {
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
            Billeteras
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Gestiona todas tus billeteras y cuentas
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Nueva Billetera
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Summary Cards */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} md={4}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Total General
              </Typography>
              <Typography variant="h4" color="primary" gutterBottom>
                ${grandTotal.toLocaleString()}
              </Typography>
              <LinearProgress variant="determinate" value={100} color="primary" />
            </CardContent>
          </Card>
        </Grid>
        
        {Object.entries(byCurrency).map(([currency, amount]) => (
          <Grid item xs={6} md={2} key={currency}>
            <Card>
              <CardContent sx={{ textAlign: 'center' }}>
                <Chip
                  label={currency}
                  color={getCurrencyColor(currency) as any}
                  size="small"
                  sx={{ mb: 1 }}
                />
                <Typography variant="h6">
                  {amount.toLocaleString()}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      {/* Wallets Table */}
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
            <Typography variant="h6">
              Todas las Billeteras ({wallets.length})
            </Typography>
          </Box>

          <TableContainer component={Paper} variant="outlined">
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Nombre</TableCell>
                  <TableCell>Tipo</TableCell>
                  <TableCell>Moneda</TableCell>
                  <TableCell align="right">Balance</TableCell>
                  <TableCell align="right">Acciones</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {wallets
                  .slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage)
                  .map((wallet) => (
                    <TableRow key={wallet.id} hover>
                      <TableCell>
                        <Box display="flex" alignItems="center" gap={2}>
                          <Avatar sx={{ bgcolor: 'primary.light' }}>
                            {getWalletIcon(wallet.type)}
                          </Avatar>
                          <Box>
                            <Typography variant="body2" fontWeight="medium">
                              {wallet.name}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {wallet.description}
                            </Typography>
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={walletTypes.find(t => t.value === wallet.type)?.label || wallet.type}
                          size="small"
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={wallet.currency}
                          color={getCurrencyColor(wallet.currency) as any}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="right">
                        <Typography
                          variant="body2"
                          fontWeight="bold"
                          color={wallet.balance >= 0 ? 'success.main' : 'error.main'}
                        >
                          {wallet.balance.toLocaleString()} {wallet.currency}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          ~${(wallet.currency === 'VES' ? wallet.balance * 0.0016 : wallet.balance).toFixed(2)} USD
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title="Editar">
                          <IconButton size="small" onClick={() => handleOpenDialog(wallet)}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Eliminar">
                          <IconButton size="small" onClick={() => handleDelete(wallet.id)}>
                            <DeleteIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          </TableContainer>

          <TablePagination
            rowsPerPageOptions={[5, 10, 25]}
            component="div"
            count={wallets.length}
            rowsPerPage={rowsPerPage}
            page={page}
            onPageChange={handleChangePage}
            onRowsPerPageChange={handleChangeRowsPerPage}
            labelRowsPerPage="Filas por página:"
            labelDisplayedRows={({ from, to, count }) => 
              `${from}-${to} de ${count !== -1 ? count : `más de ${to}`}`
            }
          />
        </CardContent>
      </Card>

      {/* Add/Edit Dialog */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>
          {editingWallet ? 'Editar Billetera' : 'Nueva Billetera'}
        </DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={3} pt={2}>
            <TextField
              label="Nombre"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              fullWidth
              required
            />
            
            <TextField
              select
              label="Tipo"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              fullWidth
            >
              {walletTypes.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  <Box display="flex" alignItems="center" gap={1}>
                    {type.icon}
                    {type.label}
                  </Box>
                </MenuItem>
              ))}
            </TextField>
            
            <TextField
              select
              label="Moneda"
              value={formData.currency}
              onChange={(e) => setFormData({ ...formData, currency: e.target.value })}
              fullWidth
            >
              {currencies.map((currency) => (
                <MenuItem key={currency} value={currency}>
                  {currency}
                </MenuItem>
              ))}
            </TextField>
            
            <TextField
              label="Descripción"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              multiline
              rows={3}
              fullWidth
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained">
            {editingWallet ? 'Actualizar' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
EOF

# ========== 3. PÁGINA TRANSACCIONES ==========
echo "💸 Creando página Transacciones..."
cat > app/transactions/page.tsx << 'EOF'
'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  Paper,
  Chip,
  IconButton,
  Tooltip,
  TextField,
  MenuItem,
  Grid,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  InputAdornment
} from '@mui/material';
import {
  Search as SearchIcon,
  FilterList as FilterIcon,
  Download as DownloadIcon,
  Visibility as ViewIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  TrendingUp as IncomeIcon,
  TrendingDown as ExpenseIcon,
  CalendarToday as CalendarIcon
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { API_URL } from '../lib/api';
import esLocale from 'date-fns/locale/es';

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

interface Filters {
  walletId: string;
  category: string;
  type: string;
  startDate: Date | null;
  endDate: Date | null;
  search: string;
}

export default function TransactionsPage() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);
  const [total, setTotal] = useState(0);
  const [wallets, setWallets] = useState<any[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [filters, setFilters] = useState<Filters>({
    walletId: '',
    category: '',
    type: '',
    startDate: null,
    endDate: null,
    search: ''
  });
  const [openFilters, setOpenFilters] = useState(false);

  useEffect(() => {
    loadWallets();
    loadTransactions();
  }, [page, rowsPerPage, filters]);

  const loadWallets = async () => {
    try {
      const response = await fetch(`${API_URL}/wallets?limit=50`);
      if (response.ok) {
        const data = await response.json();
        setWallets(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Error loading wallets:', err);
    }
  };

  const loadTransactions = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        page: (page + 1).toString(),
        limit: rowsPerPage.toString(),
        orderBy: 'date',
        order: 'desc'
      });

      if (filters.walletId) params.append('walletId', filters.walletId);
      if (filters.category) params.append('category', filters.category);
      if (filters.type) params.append('type', filters.type);
      if (filters.startDate) params.append('startDate', filters.startDate.toISOString().split('T')[0]);
      if (filters.endDate) params.append('endDate', filters.endDate.toISOString().split('T')[0]);

      const response = await fetch(`${API_URL}/transactions?${params}`);
      if (!response.ok) throw new Error('Error al cargar transacciones');
      
      const data = await response.json();
      
      setTransactions(Array.isArray(data.data) ? data.data : data);
      setTotal(data.pagination?.total || data.length || 0);
      
      // Extract unique categories
      const allCategories = new Set<string>();
      const txns = Array.isArray(data.data) ? data.data : data;
      txns.forEach((tx: Transaction) => allCategories.add(tx.category));
      setCategories(Array.from(allCategories));
      
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

  const handleFilterChange = (field: keyof Filters, value: any) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPage(0);
  };

  const clearFilters = () => {
    setFilters({
      walletId: '',
      category: '',
      type: '',
      startDate: null,
      endDate: null,
      search: ''
    });
    setPage(0);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    }).format(date);
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

  const exportToCSV = () => {
    const headers = ['ID', 'Fecha', 'Categoría', 'Tipo', 'Monto', 'Moneda', 'Billetera', 'Descripción'];
    const rows = transactions.map(tx => [
      tx.id,
      new Date(tx.date).toLocaleDateString('es-VE'),
      tx.category,
      tx.type === 'income' ? 'Ingreso' : 'Gasto',
      tx.amount,
      tx.walletCurrency || 'USD',
      tx.walletName || 'Desconocida',
      tx.description || ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transacciones_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={esLocale}>
      <Box>
        {/* Header */}
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
          <Box>
            <Typography variant="h4" gutterBottom fontWeight="bold">
              Transacciones
            </Typography>
            <Typography variant="body1" color="text.secondary">
              Historial completo de ingresos y gastos
            </Typography>
          </Box>
          <Box display="flex" gap={1}>
            <Button
              variant="outlined"
              startIcon={<FilterIcon />}
              onClick={() => setOpenFilters(true)}
            >
              Filtros
            </Button>
            <Button
              variant="outlined"
              startIcon={<DownloadIcon />}
              onClick={exportToCSV}
            >
              Exportar
            </Button>
          </Box>
        </Box>

        {error && (
          <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
            {error}
          </Alert>
        )}

        {/* Filters Dialog */}
        <Dialog open={openFilters} onClose={() => setOpenFilters(false)} maxWidth="sm" fullWidth>
          <DialogTitle>Filtrar Transacciones</DialogTitle>
          <DialogContent>
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12}>
                <TextField
                  select
                  label="Billetera"
                  value={filters.walletId}
                  onChange={(e) => handleFilterChange('walletId', e.target.value)}
                  fullWidth
                >
                  <MenuItem value="">Todas las billeteras</MenuItem>
                  {wallets.map(wallet => (
                    <MenuItem key={wallet.id} value={wallet.id}>
                      {wallet.name} ({wallet.currency})
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  label="Categoría"
                  value={filters.category}
                  onChange={(e) => handleFilterChange('category', e.target.value)}
                  fullWidth
                >
                  <MenuItem value="">Todas las categorías</MenuItem>
                  {categories.map(category => (
                    <MenuItem key={category} value={category}>
                      {category}
                    </MenuItem>
                  ))}
                </TextField>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <TextField
                  select
                  label="Tipo"
                  value={filters.type}
                  onChange={(e) => handleFilterChange('type', e.target.value)}
                  fullWidth
                >
                  <MenuItem value="">Todos los tipos</MenuItem>
                  <MenuItem value="income">Ingresos</MenuItem>
                  <MenuItem value="expense">Gastos</MenuItem>
                </TextField>
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Fecha desde"
                  value={filters.startDate}
                  onChange={(date) => handleFilterChange('startDate', date)}
                  slotProps={{
                    textField: {
                      fullWidth: true
                    }
                  }}
                />
              </Grid>
              
              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Fecha hasta"
                  value={filters.endDate}
                  onChange={(date) => handleFilterChange('endDate', date)}
                  slotProps={{
                    textField: {
                      fullWidth: true
                    }
                  }}
                />
              </Grid>
              
              <Grid item xs={12}>
                <TextField
                  label="Buscar"
                  value={filters.search}
                  onChange={(e) => handleFilterChange('search', e.target.value)}
                  fullWidth
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon />
                      </InputAdornment>
                    )
                  }}
                />
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions>
            <Button onClick={clearFilters}>Limpiar</Button>
            <Button onClick={() => setOpenFilters(false)} variant="contained">
              Aplicar
            </Button>
          </DialogActions>
        </Dialog>

        {/* Stats Summary */}
        <Grid container spacing={2} mb={3}>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  Total Transacciones
                </Typography>
                <Typography variant="h4">{total.toLocaleString()}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <IncomeIcon color="success" />
                  <Typography variant="body2" color="text.secondary">
                    Total Ingresos
                  </Typography>
                </Box>
                <Typography variant="h4" color="success.main">
                  {formatCurrency(
                    transactions
                      .filter(t => t.type === 'income')
                      .reduce((sum, t) => sum + t.amount, 0)
                  )}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={4}>
            <Card>
              <CardContent>
                <Box display="flex" alignItems="center" gap={1} mb={1}>
                  <ExpenseIcon color="error" />
                  <Typography variant="body2" color="text.secondary">
                    Total Gastos
                  </Typography>
                </Box>
                <Typography variant="h4" color="error.main">
                  {formatCurrency(
                    transactions
                      .filter(t => t.type === 'expense')
                      .reduce((sum, t) => sum + t.amount, 0)
                  )}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>

        {/* Transactions Table */}
        <Card>
          <CardContent>
            {loading ? (
              <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress />
              </Box>
            ) : transactions.length === 0 ? (
              <Box textAlign="center" p={4}>
                <Typography variant="body1" color="text.secondary">
                  No hay transacciones para mostrar
                </Typography>
                <Button variant="outlined" sx={{ mt: 2 }}>
                  Crear primera transacción
                </Button>
              </Box>
            ) : (
              <>
                <TableContainer component={Paper} variant="outlined">
                  <Table>
                    <TableHead>
                      <TableRow>
                        <TableCell>Fecha</TableCell>
                        <TableCell>Categoría</TableCell>
                        <TableCell>Tipo</TableCell>
                        <TableCell>Monto</TableCell>
                        <TableCell>Billetera</TableCell>
                        <TableCell>Descripción</TableCell>
                        <TableCell align="right">Acciones</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {transactions.map((transaction) => (
                        <TableRow key={transaction.id} hover>
                          <TableCell>
                            <Box display="flex" alignItems="center" gap={1}>
                              <CalendarIcon fontSize="small" color="action" />
                              <Typography variant="body2">
                                {formatDate(transaction.date)}
                              </Typography>
                            </Box>
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
                          <TableCell>
                            <Typography
                              variant="body2"
                              fontWeight="bold"
                              color={transaction.type === 'income' ? 'success.main' : 'error.main'}
                            >
                              {formatCurrency(transaction.amount, transaction.walletCurrency)}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2">
                              {transaction.walletName || 'Desconocida'}
                            </Typography>
                            <Typography variant="caption" color="text.secondary">
                              {transaction.walletCurrency}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Typography variant="body2" noWrap maxWidth={200}>
                              {transaction.description || '-'}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Tooltip title="Ver detalles">
                              <IconButton size="small">
                                <ViewIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Editar">
                              <IconButton size="small">
                                <EditIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                            <Tooltip title="Eliminar">
                              <IconButton size="small">
                                <DeleteIcon fontSize="small" />
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
                  count={total}
                  rowsPerPage={rowsPerPage}
                  page={page}
                  onPageChange={handleChangePage}
                  onRowsPerPageChange={handleChangeRowsPerPage}
                  labelRowsPerPage="Filas por página:"
                  labelDisplayedRows={({ from, to, count }) => 
                    `${from}-${to} de ${count !== -1 ? count : `más de ${to}`}`
                  }
                />
              </>
            )}
          </CardContent>
        </Card>
      </Box>
    </LocalizationProvider>
  );
}
EOF

echo "✅ Frontend multi-página creado!"
echo "🎯 Para probar:"
echo "1. Asegurar que el API enhanced esté corriendo: node backend/exchange-server-correct.js"
echo "2. Instalar dependencias adicionales: npm install @mui/x-date-pickers date-fns"
echo "3.