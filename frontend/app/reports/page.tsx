'use client';

import { useState, useEffect, memo, useCallback } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  Paper,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  CircularProgress,
  Chip,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Button,
  ToggleButton,
  ToggleButtonGroup,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useMediaQuery,
  Divider,
  Stack,
  useTheme,
} from '@mui/material';
import {
  TrendingUp as TrendingUpIcon,
  TrendingDown as TrendingDownIcon,
  AttachMoney as MoneyIcon,
  AccountBalance as BankIcon,
  Download as DownloadIcon,
  CalendarMonth as CalendarIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { API_URL } from '../lib/api';

// Simularemos gráficos con componentes MUI por ahora
// En producción, usaríamos Recharts o Chart.js

interface ReportData {
  monthlySummary: Array<{
    month: string;
    income: number;
    expense: number;
    transactionCount: number;
    net: number;
  }>;
  byCategory: Array<{
    category: string;
    count: number;
    total: number;
  }>;
  walletBalances: Array<{
    name: string;
    balance: number;
    currency: string;
  }>;
  exchangeStats: {
    totalExchanges: number;
    averageSpread: number;
    totalFromAmount: number;
    totalToAmount: number;
    totalFee: number;
  };
  byCategoryTotal: number;
  summary: {
    totalTransactions: number;
    totalIncome: number;
    totalExpenses: number;
    net: number;
  };
}

// --- Formateador a nivel de módulo (referencia estable) ---
const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: currency === 'VES' ? 'VES' : 'USD',
    minimumFractionDigits: 2
  }).format(amount);
};

// --- Tarjetas móviles memorizadas: solo se re-renderizan si SUS props cambian ---
const MonthlyAccordionItem = memo(function MonthlyAccordionItem({
  month,
  prevNet,
  isOpen,
  index,
  onToggle,
}: {
  month: ReportData['monthlySummary'][number];
  prevNet?: number;
  isOpen: boolean;
  index: number;
  onToggle: (index: number) => void;
}) {
  return (
    <Accordion
      expanded={isOpen}
      onChange={() => onToggle(index)}
      disableGutters
      sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 1, boxShadow: 'none' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.5, minHeight: 48 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" width="100%" pr={1}>
          <Typography variant="body1" fontWeight="bold">{month.month}</Typography>
          <Typography variant="body2" fontWeight="bold" color={month.net >= 0 ? 'success.main' : 'error.main'}>
            {formatCurrency(month.net)}
          </Typography>
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1.5, pt: 0 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Stack spacing={1}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Ingresos</Typography>
            <Typography variant="body2" color="success.main">{formatCurrency(month.income)}</Typography>
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Gastos</Typography>
            <Typography variant="body2" color="error.main">{formatCurrency(month.expense)}</Typography>
          </Box>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Transacciones</Typography>
            <Chip label={month.transactionCount} size="small" />
          </Box>
          {prevNet != null && (
            <Box display="flex" justifyContent="space-between">
              <Typography variant="body2" color="text.secondary">Tendencia</Typography>
              <Chip
                icon={month.net > prevNet ? <TrendingUpIcon /> : <TrendingDownIcon />}
                label={`${((month.net - prevNet) / Math.abs(prevNet || 1) * 100).toFixed(1)}%`}
                size="small"
                color={month.net > prevNet ? 'success' : 'error'}
              />
            </Box>
          )}
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
});

const CategoryAccordionItem = memo(function CategoryAccordionItem({
  category,
  totalExpenses,
  isOpen,
  index,
  onToggle,
}: {
  category: ReportData['byCategory'][number];
  totalExpenses: number;
  isOpen: boolean;
  index: number;
  onToggle: (index: number) => void;
}) {
  return (
    <Accordion
      expanded={isOpen}
      onChange={() => onToggle(index)}
      disableGutters
      sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 1, boxShadow: 'none' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.5, minHeight: 48 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" width="100%" pr={1}>
          <Typography variant="body1">{category.category}</Typography>
          <Chip
            label={`${(category.total / totalExpenses * 100).toFixed(1)}%`}
            size="small"
            color="primary"
            variant="outlined"
          />
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1.5, pt: 0 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Stack spacing={1}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Monto</Typography>
            <Typography variant="body2">{formatCurrency(category.total)}</Typography>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
});

const WalletRow = memo(function WalletRow({
  wallet,
}: {
  wallet: ReportData['walletBalances'][number];
}) {
  return (
    <Box
      display="flex"
      alignItems="center"
      justifyContent="space-between"
      sx={{ py: 1, borderBottom: '1px solid', borderColor: 'divider' }}
    >
      <Typography variant="body1">{wallet.name}</Typography>
      <Typography variant="body2" fontWeight="bold" color={wallet.balance >= 0 ? 'success.main' : 'error.main'}>
        {formatCurrency(wallet.balance, wallet.currency)}
      </Typography>
    </Box>
  );
});

export default function ReportsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [monthlyExpanded, setMonthlyExpanded] = useState<number | false>(false);
  const [categoryExpanded, setCategoryExpanded] = useState<number | false>(false);
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState('6m');
  const [rateType, setRateType] = useState<'bcv' | 'paralelo'>('bcv');

  // Handlers ESTABLES: cada uno solo re-renderiza la tarjeta que se abre/cierra.
  const handleMonthlyToggle = useCallback((index: number) => {
    setMonthlyExpanded((prev) => (prev === index ? false : index));
  }, []);
  const handleCategoryToggle = useCallback((index: number) => {
    setCategoryExpanded((prev) => (prev === index ? false : index));
  }, []);

  useEffect(() => {
    loadReportData();
  }, [timeRange, rateType]);

  const loadReportData = async () => {
    try {
      setLoading(true);
      // El rango se pasa al backend: period=1m|3m|6m|1y|all
      const statsResponse = await fetch(`${API_URL}/stats?rate=${rateType}&period=${timeRange}`);
      const walletsResponse = await fetch(`${API_URL}/wallets`);

      if (!statsResponse.ok) {
        throw new Error('Error al cargar datos de reportes');
      }

      const stats = await statsResponse.json();
      const wallets = await walletsResponse.json();

      // Procesar datos para reportes (las estadísticas de exchange vienen del backend)
      const reportData: ReportData = {
        monthlySummary: stats.monthly || [],
        byCategory: stats.byCategory || [],
        byCategoryTotal: stats.byCategoryTotal || 0,
        walletBalances: Array.isArray(wallets) ? wallets.map((w: any) => ({
          name: w.name,
          balance: w.balance || 0,
          currency: w.currency || 'USD'
        })) : [],
        exchangeStats: stats.exchangeStats || {
          totalExchanges: 0,
          averageSpread: 0,
          totalFromAmount: 0,
          totalToAmount: 0,
          totalFee: 0
        },
        summary: stats.summary || {
          totalTransactions: 0,
          totalIncome: 0,
          totalExpenses: 0,
          net: 0
        }
      };

      setData(reportData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  };

  const exportReport = () => {
    if (!data) return;

    const report = {
      generado: new Date().toISOString(),
      rango: timeRange,
      resumen: data.summary,
      categorias: data.byCategory,
      mensual: data.monthlySummary,
      billeteras: data.walletBalances,
      exchanges: data.exchangeStats
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `reporte_finanzas_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

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

  if (!data) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        No hay datos disponibles para generar reportes
      </Alert>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h4" gutterBottom fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            Reportes
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Análisis y estadísticas de tus finanzas
          </Typography>
        </Box>
        <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <ToggleButtonGroup
            size="small"
            exclusive
            value={rateType}
            onChange={(e, val) => val && setRateType(val)}
          >
            <ToggleButton value="bcv">BCV</ToggleButton>
            <ToggleButton value="paralelo">Paralelo</ToggleButton>
          </ToggleButtonGroup>
          <FormControl size="small" sx={{ minWidth: 120 }}>
            <InputLabel>Rango</InputLabel>
            <Select
              value={timeRange}
              label="Rango"
              onChange={(e) => setTimeRange(e.target.value)}
            >
              <MenuItem value="1m">Último mes</MenuItem>
              <MenuItem value="3m">Últimos 3 meses</MenuItem>
              <MenuItem value="6m">Últimos 6 meses</MenuItem>
              <MenuItem value="1y">Último año</MenuItem>
              <MenuItem value="all">Todo</MenuItem>
            </Select>
          </FormControl>
          <Button
            variant="outlined"
            startIcon={<DownloadIcon />}
            onClick={exportReport}
          >
            Exportar
          </Button>
        </Box>
      </Box>

      {/* Summary Stats */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <MoneyIcon color="primary" />
                <Typography variant="body2" color="text.secondary">
                  Ingresos Totales
                </Typography>
              </Box>
              <Typography variant="h4" color="success.main" gutterBottom>
                {formatCurrency(data.summary.totalIncome)}
              </Typography>
              <Chip
                label={`${data.summary.totalTransactions} transacciones`}
                size="small"
                variant="outlined"
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <TrendingDownIcon color="error" />
                <Typography variant="body2" color="text.secondary">
                  Gastos Totales
                </Typography>
              </Box>
              <Typography variant="h4" color="error.main" gutterBottom>
                {formatCurrency(data.summary.totalExpenses)}
              </Typography>
              {data.summary.totalIncome > 0 && (
                <Typography variant="caption" color="text.secondary">
                  {(data.summary.totalExpenses / data.summary.totalIncome * 100).toFixed(1)}% de ingresos
                </Typography>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <TrendingUpIcon color={data.summary.net >= 0 ? 'success' : 'error'} />
                <Typography variant="body2" color="text.secondary">
                  Balance Neto
                </Typography>
              </Box>
              <Typography 
                variant="h4" 
                color={data.summary.net >= 0 ? 'success.main' : 'error.main'}
                gutterBottom
              >
                {formatCurrency(data.summary.net)}
              </Typography>
              <Chip
                icon={data.summary.net >= 0 ? <TrendingUpIcon /> : <TrendingDownIcon />}
                label={data.summary.net >= 0 ? 'Positivo' : 'Negativo'}
                color={data.summary.net >= 0 ? 'success' : 'error'}
                size="small"
              />
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={3}>
          <Card>
            <CardContent>
              <Box display="flex" alignItems="center" gap={1} mb={2}>
                <BankIcon color="secondary" />
                <Typography variant="body2" color="text.secondary">
                  Billeteras Activas
                </Typography>
              </Box>
              <Typography variant="h4" gutterBottom>
                {data.walletBalances.length}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Monthly Performance */}
      <Grid container spacing={3} mb={4}>
        <Grid item xs={12} lg={8}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom mb={3}>
                Performance Mensual
              </Typography>

              {data.monthlySummary.length > 0 ? (
                isMobile ? (
                  // MOBILE: acordeón por mes
                  <Box>
                    {data.monthlySummary.map((month, index) => (
                      <MonthlyAccordionItem
                        key={index}
                        month={month}
                        prevNet={index > 0 ? data.monthlySummary[index - 1].net : undefined}
                        isOpen={monthlyExpanded === index}
                        index={index}
                        onToggle={handleMonthlyToggle}
                      />
                    ))}
                  </Box>
                ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Mes</TableCell>
                        <TableCell align="right">Ingresos</TableCell>
                        <TableCell align="right">Gastos</TableCell>
                        <TableCell align="right">Neto</TableCell>
                        <TableCell align="right">Transacciones</TableCell>
                        <TableCell align="center">Tendencia</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.monthlySummary.map((month, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Typography variant="body2">
                              {month.month}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="success.main">
                              {formatCurrency(month.income)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography variant="body2" color="error.main">
                              {formatCurrency(month.expense)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Typography 
                              variant="body2" 
                              fontWeight="bold"
                              color={month.net >= 0 ? 'success.main' : 'error.main'}
                            >
                              {formatCurrency(month.net)}
                            </Typography>
                          </TableCell>
                          <TableCell align="right">
                            <Chip
                              label={month.transactionCount}
                              size="small"
                            />
                          </TableCell>
                          <TableCell align="center">
                            {index > 0 && data.monthlySummary[index - 1] && (
                              <Chip
                                icon={month.net > data.monthlySummary[index - 1].net ? 
                                  <TrendingUpIcon /> : <TrendingDownIcon />}
                                label={`${((month.net - data.monthlySummary[index - 1].net) / Math.abs(data.monthlySummary[index - 1].net || 1) * 100).toFixed(1)}%`}
                                size="small"
                                color={month.net > data.monthlySummary[index - 1].net ? 'success' : 'error'}
                              />
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                )
              ) : (
                <Box textAlign="center" py={4}>
                  <Typography variant="body1" color="text.secondary">
                    No hay datos mensuales disponibles
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        {/* Category Breakdown */}
        <Grid item xs={12} lg={4}>
          <Card sx={{ height: '100%' }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Gastos por Categoría
              </Typography>
              
              {data.byCategory.length > 0 ? (
                isMobile ? (
                  // MOBILE: acordeón por categoría
                  <Box>
                    {data.byCategory.slice(0, 8).map((category, index) => (
                      <CategoryAccordionItem
                        key={index}
                        category={category}
                        totalExpenses={data.summary.totalExpenses}
                        isOpen={categoryExpanded === index}
                        index={index}
                        onToggle={handleCategoryToggle}
                      />
                    ))}
                  </Box>
                ) : (
                <Box>
                  {data.byCategory.slice(0, 6).map((category, index) => (
                    <Box key={index} mb={1.5}>
                      <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                        <Typography variant="body2" sx={{ textTransform: 'capitalize' }}>
                          {category.category}
                        </Typography>
                        <Typography variant="body2" fontWeight="medium">
                          {formatCurrency(category.total)}
                        </Typography>
                      </Box>
                      <Box
                        sx={{
                          width: '100%',
                          bgcolor: 'divider',
                          borderRadius: 1,
                          height: 8,
                        }}
                      >
                        <Box
                          sx={{
                            width: `${Math.min((category.total / (data.byCategoryTotal || data.summary.totalExpenses || 1)) * 100, 100)}%`,
                            bgcolor: 'error.main',
                            borderRadius: 1,
                            height: 8,
                            transition: 'width 0.3s',
                          }}
                        />
                      </Box>
                    </Box>
                  ))}
                  {data.byCategory.length > 6 && (
                    <Typography variant="caption" color="text.secondary">
                      +{data.byCategory.length - 6} categorías más
                    </Typography>
                  )}
                  <Divider sx={{ my: 1.5 }} />
                  <Box display="flex" justifyContent="space-between" alignItems="center">
                    <Typography variant="body2" fontWeight="bold">Total</Typography>
                    <Typography variant="body2" fontWeight="bold" color="error.main">
                      {formatCurrency(data.byCategoryTotal || data.summary.totalExpenses)}
                    </Typography>
                  </Box>
                </Box>
                )
              ) : (
                <Box textAlign="center" py={4}>
                  <Typography variant="body1" color="text.secondary">
                    No hay datos por categoría
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Wallet Balances & Exchange Stats */}
      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Balances por Billetera
              </Typography>
              
              {data.walletBalances.length > 0 ? (
                isMobile ? (
                  // MOBILE: lista simple por billetera (sin acordeón, la moneda va en el monto)
                  <Box>
                    {data.walletBalances.map((wallet, index) => (
                      <WalletRow key={index} wallet={wallet} />
                    ))}
                  </Box>
                ) : (
                <TableContainer component={Paper} variant="outlined">
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        <TableCell>Billetera</TableCell>
                        <TableCell>Moneda</TableCell>
                        <TableCell align="right">Balance</TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.walletBalances.map((wallet, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            <Typography variant="body2">
                              {wallet.name}
                            </Typography>
                          </TableCell>
                          <TableCell>
                            <Chip
                              label={wallet.currency}
                              size="small"
                              variant="outlined"
                            />
                          </TableCell>
                          <TableCell align="right">
                            <Typography 
                              variant="body2"
                              fontWeight="medium"
                              color={wallet.balance >= 0 ? 'success.main' : 'error.main'}
                            >
                              {formatCurrency(wallet.balance, wallet.currency)}
                            </Typography>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                )
              ) : (
                <Box textAlign="center" py={2}>
                  <Typography variant="body1" color="text.secondary">
                    No hay billeteras configuradas
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>
                Estadísticas de Exchanges
              </Typography>
              
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="primary" gutterBottom>
                        {data.exchangeStats.totalExchanges}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Exchanges Totales
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                
                <Grid item xs={6}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="warning.main" gutterBottom>
                        {formatCurrency(data.exchangeStats.totalFee)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Comisiones
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                
                <Grid item xs={6}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="error.main" gutterBottom>
                        {formatCurrency(data.exchangeStats.totalFromAmount)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Enviado
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
                
                <Grid item xs={6}>
                  <Card variant="outlined">
                    <CardContent sx={{ textAlign: 'center' }}>
                      <Typography variant="h4" color="success.main" gutterBottom>
                        {formatCurrency(data.exchangeStats.totalToAmount)}
                      </Typography>
                      <Typography variant="body2" color="text.secondary">
                        Total Recibido
                      </Typography>
                    </CardContent>
                  </Card>
                </Grid>
              </Grid>
              
              <Box mt={3}>
                <Typography variant="body2" color="text.secondary">
                  Las tasas de exchange se calculan automáticamente en base a los montos enviados y recibidos.
                </Typography>
              </Box>
            </CardContent>
          </Card>
        </Grid>
      </Grid>
    </Box>
  );
}