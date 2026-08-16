'use client';

import { useState, useEffect, useCallback, ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
  Typography,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  IconButton,
  Divider,
  Stack,
  TablePagination,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import {
  AccountBalance,
  AttachMoney,
  CreditCard,
  Savings,
  ShowChart,
  ArrowBack,
  Edit as EditIcon,
  DeleteOutline,
  TrendingUp,
  TrendingDown,
  CalendarMonth,
  Download,
} from '@mui/icons-material';
import TransactionAccordionList from '../../components/TransactionAccordionList';
import {
  getWallet,
  getWalletReport,
  updateWallet,
  deleteWallet,
  getEffectiveRate,
  Wallet,
  WalletReport,
} from '../../lib/api';
import theme from '../../theme';

const icons: Record<string, ReactNode> = {
  bank: <AccountBalance />,
  cash: <AttachMoney />,
  card: <CreditCard />,
  crypto: <Savings />,
  investment: <ShowChart />,
};

const iconKeys = ['bank', 'cash', 'card', 'crypto', 'investment'];
const colors = ['#0077b6', '#e63946', '#2a9d8f', '#588157', '#f0b90b', '#00b4d8', '#9b59b6', '#e76f51'];

const periods = [
  { value: 'day', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: '3m', label: 'Últimos 3 meses' },
  { value: 'year', label: 'Año' },
  { value: 'all', label: 'Todo' },
  { value: 'custom', label: 'Rango personalizado' },
];

const formatUsd = (n: number) =>
  new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }).format(n);

export default function WalletDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));

  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [rate, setRate] = useState<number | null>(null);
  const [rateType, setRateType] = useState<'bcv' | 'paralelo'>('bcv');

  // Report
  const [report, setReport] = useState<WalletReport | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [period, setPeriod] = useState<string>('month');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  // Paginación de transacciones
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(10);

  // Edit dialog
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState<{ name: string; alias: string; description: string; icon: string; color: string }>({
    name: '',
    alias: '',
    description: '',
    icon: 'bank',
    color: '#0077b6',
  });
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  // Delete confirmation
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const chargeRate = useCallback(async () => {
    try {
      const r = await getEffectiveRate(rateType);
      setRate(r.rate);
    } catch (e) {
      setRate(null);
    }
  }, [rateType]);

  const loadReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const useCustom = period === 'custom' && !!from && !!to;
      const data = await getWalletReport(id, {
        period: useCustom ? 'custom' : period,
        from: useCustom ? from : undefined,
        to: useCustom ? to : undefined,
      });
      setReport(data);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar el reporte');
    } finally {
      setReportLoading(false);
    }
  }, [id, period, from, to]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const w = await getWallet(id);
      setWallet(w);
      setEditForm({
        name: w.name,
        alias: w.alias || '',
        description: w.description || '',
        icon: w.icon || 'bank',
        color: w.color || '#0077b6',
      });
    } catch (e: any) {
      setError(e?.message || 'Error al cargar la billetera');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (id) loadReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, period]);

  useEffect(() => {
    chargeRate();
  }, [chargeRate]);

  const handleCustomRange = () => {
    if (!from || !to) return;
    setPage(0);
    loadReport();
  };

  const handleChangePage = (_e: unknown, newPage: number) => setPage(newPage);

  const handleChangeRowsPerPage = (e: React.ChangeEvent<HTMLInputElement>) => {
    setRowsPerPage(parseInt(e.target.value, 10));
    setPage(0);
  };

  // Transacciones visibles en la página actual
  const reportTransactions = report?.transactions || [];
  const startIndex = page * rowsPerPage;
  const pagedTransactions = reportTransactions.slice(startIndex, startIndex + rowsPerPage);

  const exportCSV = () => {
    const header = ['ID', 'Fecha', 'Tipo', 'Categoría', 'Descripción', 'Monto'];
    const rows = reportTransactions.map((t) => [
      t.id,
      t.date,
      t.type === 'income' ? 'Ingreso' : 'Egreso',
      t.category,
      t.description || '',
      t.type === 'income' ? String(t.amount) : `-${t.amount}`,
    ]);
    const csv = [header, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `billetera_${id}_transacciones_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openEdit = () => {
    if (!wallet) return;
    setEditForm({
      name: wallet.name,
      alias: wallet.alias || '',
      description: wallet.description || '',
      icon: wallet.icon || 'bank',
      color: wallet.color || '#0077b6',
    });
    setEditError(null);
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editForm.name.trim()) {
      setEditError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    setEditError(null);
    try {
      await updateWallet(id, {
        name: editForm.name.trim(),
        alias: editForm.alias.trim() || undefined,
        description: editForm.description.trim() || undefined,
        icon: editForm.icon,
        color: editForm.color,
      });
      setEditOpen(false);
      await load();
      await loadReport();
    } catch (e: any) {
      setEditError(e?.message || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteWallet(id);
      setDeleteOpen(false);
      router.push('/wallets');
    } catch (e: any) {
      setError(e?.message || 'Error al eliminar');
      setDeleteOpen(false);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error && !wallet) {
    return (
      <Box>
        <Button startIcon={<ArrowBack />} onClick={() => router.push('/wallets')} sx={{ mb: 2 }}>
          Volver a billeteras
        </Button>
        <Alert severity="error">{error}</Alert>
      </Box>
    );
  }

  if (!wallet) return null;

  const balance = Number(wallet.balance);
  const usdValue = wallet.currency !== 'USD' && rate ? balance / rate : undefined;

  const summary = report?.summary;

  return (
    <Box>
      <Button startIcon={<ArrowBack />} onClick={() => router.push('/wallets')} sx={{ mb: 2 }}>
        Volver a billeteras
      </Button>

      {/* Header */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="flex-start" flexWrap="wrap" gap={2}>
            <Box display="flex" alignItems="center" gap={2}>
              <Avatar sx={{ width: 56, height: 56, bgcolor: wallet.color || theme.palette.primary.main }}>
                {icons[wallet.type as keyof typeof icons] || <AccountBalance />}
              </Avatar>
              <Box>
                <Box display="flex" alignItems="center" gap={1}>
                  <Typography variant="h5" fontWeight="bold">{wallet.name}</Typography>
                  {wallet.alias && <Chip label={wallet.alias} size="small" color="primary" variant="outlined" />}
                </Box>
                <Typography variant="body2" color="text.secondary">
                  {wallet.type} · {wallet.currency}
                  {wallet.description ? ` · ${wallet.description}` : ''}
                </Typography>
              </Box>
            </Box>
            <Box display="flex" gap={1}>
              <Button variant="outlined" startIcon={<EditIcon />} onClick={openEdit}>
                Editar
              </Button>
              <Button variant="outlined" color="error" startIcon={<DeleteOutline />} onClick={() => setDeleteOpen(true)}>
                Eliminar
              </Button>
            </Box>
          </Box>

          <Divider sx={{ my: 2 }} />

          <Box display="flex" gap={4} flexWrap="wrap">
            <Box>
              <Typography variant="caption" color="text.secondary" display="block">Saldo</Typography>
              <Typography variant="h4" color="primary.main" fontWeight="bold">
                {balance.toLocaleString('es-VE')} {wallet.currency}
              </Typography>
            </Box>
            {wallet.currency !== 'USD' && (
              <Box>
                <Typography variant="caption" color="text.secondary" display="block">Equivalente USD</Typography>
                <Typography variant="h5" fontWeight="bold">
                  {usdValue != null ? formatUsd(usdValue) : '—'}
                </Typography>
                <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                  <Select
                    size="small"
                    value={rateType}
                    onChange={(e) => setRateType(e.target.value as 'bcv' | 'paralelo')}
                  >
                    <MenuItem value="bcv">BCV</MenuItem>
                    <MenuItem value="paralelo">Paralelo</MenuItem>
                  </Select>
                  <Typography variant="caption" color="text.secondary">
                    {rate ? `tasa ${rate.toFixed(2)}` : 'Sin tasa'}
                  </Typography>
                </Box>
              </Box>
            )}
          </Box>
        </CardContent>
      </Card>

      {/* Mini reporte */}
      <Grid container spacing={3} mb={3}>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Box display="flex" alignItems="center" justifyContent="center" gap={1} mb={1}>
                <TrendingUp color="success" />
                <Typography variant="body2" color="text.secondary">Ingresos</Typography>
              </Box>
              <Typography variant="h5" color="success.main" fontWeight="bold">
                {summary ? `${summary.income.toLocaleString('es-VE')} ${wallet.currency}` : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Box display="flex" alignItems="center" justifyContent="center" gap={1} mb={1}>
                <TrendingDown color="error" />
                <Typography variant="body2" color="text.secondary">Egresos</Typography>
              </Box>
              <Typography variant="h5" color="error.main" fontWeight="bold">
                {summary ? `${summary.expense.toLocaleString('es-VE')} ${wallet.currency}` : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={4}>
          <Card>
            <CardContent sx={{ textAlign: 'center' }}>
              <Box display="flex" alignItems="center" justifyContent="center" gap={1} mb={1}>
                <ShowChart color={summary && summary.net >= 0 ? 'success' : 'error'} />
                <Typography variant="body2" color="text.secondary">Neto</Typography>
              </Box>
              <Typography variant="h5" color={summary && summary.net >= 0 ? 'success.main' : 'error.main'} fontWeight="bold">
                {summary ? `${summary.net.toLocaleString('es-VE')} ${wallet.currency}` : '—'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Transacciones */}
      <Card>
        <CardContent>
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" gap={2} mb={2}>
            <Box display="flex" alignItems="center" gap={1}>
              <CalendarMonth color="action" />
              <Typography variant="h6">Transacciones</Typography>
              {summary && <Chip size="small" label={`${summary.transactionCount}`} />}
            </Box>
            <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
              <Button size="small" variant="outlined" startIcon={<Download />} onClick={exportCSV} disabled={reportTransactions.length === 0}>
                Exportar
              </Button>
              <FormControl size="small" sx={{ minWidth: { xs: 140, sm: 180 } }}>
                <InputLabel>Período</InputLabel>
                <Select value={period} label="Período" onChange={(e) => {
                  const v = e.target.value as string;
                  setPeriod(v);
                  setPage(0);
                  if (v !== 'custom') { setFrom(''); setTo(''); }
                }}>
                  {periods.map((p) => (
                    <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
              {period === 'custom' && (
                <Box display="flex" gap={0.5} alignItems="center" flexWrap="wrap">
                  <TextField
                    size="small"
                    type="date"
                    label="Desde"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <TextField
                    size="small"
                    type="date"
                    label="Hasta"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    InputLabelProps={{ shrink: true }}
                  />
                  <Button variant="contained" onClick={handleCustomRange} disabled={!from || !to}>
                    Aplicar
                  </Button>
                </Box>
              )}
            </Box>
          </Box>

          {reportLoading ? (
            <Box display="flex" justifyContent="center" py={4}><CircularProgress /></Box>
          ) : !report || report.transactions.length === 0 ? (
            <Alert severity="info">No hay transacciones en este período.</Alert>
          ) : (
            isMobile ? (
              <TransactionAccordionList
                transactions={pagedTransactions}
                walletCurrencyFallback={wallet.currency}
                showView
              />
            ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell>Tipo</TableCell>
                    <TableCell>Categoría</TableCell>
                    <TableCell>Descripción</TableCell>
                    <TableCell align="right">Monto</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {pagedTransactions.map((t) => (
                    <TableRow
                      key={t.id}
                      hover
                      onClick={() => router.push(`/transactions/${t.id}`)}
                      sx={{ cursor: 'pointer' }}
                    >
                      <TableCell>{t.date}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={t.type === 'income' ? 'Ingreso' : 'Egreso'}
                          color={t.type === 'income' ? 'success' : 'error'}
                          variant="outlined"
                        />
                      </TableCell>
                      <TableCell>{t.category}</TableCell>
                      <TableCell>{t.description || '—'}</TableCell>
                      <TableCell align="right">
                        <Typography variant="body2" fontWeight="bold" color={t.type === 'income' ? 'success.main' : 'error.main'}>
                          {t.type === 'income' ? '+' : '-'}{Number(t.amount).toLocaleString('es-VE')} {wallet.currency}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            )
          )}
          {reportTransactions.length > 0 && (
            <TablePagination
              component="div"
              count={reportTransactions.length}
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

      {/* Edit dialog */}
      <Dialog open={editOpen} onClose={() => setEditOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Editar billetera</DialogTitle>
        <DialogContent>
          {editError && <Alert severity="error" sx={{ mb: 2 }}>{editError}</Alert>}
          <Box display="grid" gap={2} pt={1}>
            <TextField label="Nombre" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} fullWidth required />
            <TextField
              label="Alias"
              value={editForm.alias}
              onChange={(e) => setEditForm({ ...editForm, alias: e.target.value })}
              fullWidth
              helperText="Nombre corto, ej: BINUSD, BFCVES"
            />
            <TextField
              label="Descripción"
              value={editForm.description}
              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
            <FormControl fullWidth>
              <InputLabel>Icono</InputLabel>
              <Select value={editForm.icon} label="Icono" onChange={(e) => setEditForm({ ...editForm, icon: e.target.value })}>
                {iconKeys.map((k) => (
                  <MenuItem key={k} value={k}>{icons[k]}{k}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Color</InputLabel>
              <Select value={editForm.color} label="Color" onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}>
                {colors.map((c) => (
                  <MenuItem key={c} value={c}>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Box sx={{ width: 16, height: 16, borderRadius: '50%', bgcolor: c }} />
                      {c}
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="text.secondary">
              La moneda y el tipo no se pueden cambiar una vez creada la billetera.
            </Typography>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleSaveEdit} disabled={saving}>
            {saving ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete confirm dialog */}
      <Dialog open={deleteOpen} onClose={() => setDeleteOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Eliminar billetera</DialogTitle>
        <DialogContent>
          <Typography>
            ¿Seguro que quieres eliminar la billetera <b>{wallet.name}</b>? No se borrará definitivamente: quedará
            disponible en la sección de billeteras eliminadas para reactivarla cuando quieras.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteOpen(false)}>Cancelar</Button>
          <Button variant="contained" color="error" onClick={handleDelete} disabled={deleting}>
            {deleting ? 'Eliminando...' : 'Eliminar'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
