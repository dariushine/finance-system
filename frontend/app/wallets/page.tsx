'use client';

import { useState, useCallback } from 'react';
import {
  Alert,
  Avatar,
  Box,
  Button,
  Card,
  CardContent,
  CardActionArea,
  CircularProgress,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Grid,
  TextField,
  Typography,
  IconButton,
  MenuItem,
  Select,
  InputLabel,
  FormControl,
  Divider,
  ToggleButton,
  ToggleButtonGroup,
  Switch,
  FormControlLabel,
  Collapse,
} from '@mui/material';
import {
  AccountBalance,
  AttachMoney,
  CreditCard,
  Savings,
  Add as AddIcon,
  DeleteOutlined,
  Restore as RestoreIcon,
  ChevronRight,
  ShowChart,
  ExpandMore,
  ExpandLess,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';
import { useWallets } from '../lib/hooks';
import { useOnDataChanged } from '../lib/dataEvents';
import { useHideBalances } from '../lib/hooks/useHideBalances';
import { useNumberFormat } from '../lib/NumberFormat';
import BalanceReveal from '../components/BalanceReveal';
import {
  getDeletedWallets,
  createWallet,
  reactivateWallet,
  getEffectiveRate,
  Wallet,
} from '../lib/api';
import theme from '../theme';

const icons = {
  bank: <AccountBalance />,
  cash: <AttachMoney />,
  card: <CreditCard />,
  crypto: <Savings />,
  investment: <ShowChart />,
};

const iconKeys = ['bank', 'cash', 'card', 'crypto', 'investment'];
const colors = ['#0077b6', '#e63946', '#2a9d8f', '#588157', '#f0b90b', '#00b4d8', '#9b59b6', '#e76f51'];

export default function WalletsPage() {
  const router = useRouter();
  const ocultarSaldos = useHideBalances();
  const { formatAmount, formatCurrency } = useNumberFormat();
  const [rateType, setRateType] = useState<'bcv' | 'paralelo'>('bcv');
  const { wallets, loading, error, refetch } = useWallets(rateType);

  // Recargar las billeteras al crear/editar/borrar (FAB u otra acción).
  useOnDataChanged(refetch, [refetch]);

  const [deleted, setDeleted] = useState<Wallet[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    alias: '',
    type: 'bank',
    currency: 'USD',
    description: '',
    icon: 'bank',
    color: '#0077b6',
    excludeFromTotal: false,
    hideInDashboard: false,
  });
  const [showOptional, setShowOptional] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const loadDeleted = useCallback(async () => {
    try {
      setDeletedLoading(true);
      const data = await getDeletedWallets();
      setDeleted(data);
    } catch (e) {
      // silencioso
    } finally {
      setDeletedLoading(false);
    }
  }, []);

  // Al cambiar el rate type, recargamos wallets (y su equivalente USD)
  const handleRateType = async (val: 'bcv' | 'paralelo') => {
    setRateType(val);
  };

  const openCreate = () => {
    setForm({ name: '', alias: '', type: 'bank', currency: 'USD', description: '', icon: 'bank', color: '#0077b6', excludeFromTotal: false, hideInDashboard: false });
    setFormError(null);
    setCreateOpen(true);
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      setFormError('El nombre es obligatorio');
      return;
    }
    setSaving(true);
    setFormError(null);
    try {
      await createWallet({
        name: form.name.trim(),
        alias: form.alias.trim() || undefined,
        type: form.type,
        currency: form.currency,
        description: form.description.trim() || undefined,
        icon: form.icon,
        color: form.color,
        excludeFromTotal: form.excludeFromTotal,
        hideInDashboard: form.hideInDashboard,
      });
      setCreateOpen(false);
      await refetch();
    } catch (e: any) {
      setFormError(e?.message || 'Error al crear la billetera');
    } finally {
      setSaving(false);
    }
  };

  const handleReactivate = async (id: number) => {
    try {
      await reactivateWallet(id);
      await loadDeleted();
      await refetch();
    } catch (e) {
      // silencioso
    }
  };

  const gotoWallet = (id: number) => router.push(`/wallets/${id}`);

  if (loading && wallets.length === 0) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      {/* Header */}
      <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" mb={1}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>Billeteras</Typography>
          <Typography variant="body1" color="text.secondary">
            Consulta el saldo de todas tus cuentas y billeteras.
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
          Nueva billetera
        </Button>
      </Box>

      <Box display="flex" alignItems="center" gap={2} mb={3}>
        <ToggleButtonGroup
          size="small"
          exclusive
          value={rateType}
          onChange={(e, val) => val && handleRateType(val)}
        >
          <ToggleButton value="bcv">BCV</ToggleButton>
          <ToggleButton value="paralelo">Paralelo</ToggleButton>
        </ToggleButtonGroup>
        <Typography variant="caption" color="text.secondary">
          Tasa usada para el equivalente en USD de billeteras no-USD.
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Grid container spacing={3}>
        {wallets.map((wallet) => (
          <Grid item xs={12} sm={6} lg={4} key={wallet.id}>
            <Card sx={{ height: '100%' }}>
              <CardActionArea onClick={() => gotoWallet(wallet.id)} sx={{ height: '100%' }}>
                <CardContent>
                  <Box display="flex" alignItems="center" gap={2} mb={1}>
                    <Avatar sx={{ bgcolor: wallet.color || theme.palette.primary.main }}>
                      {icons[wallet.type as keyof typeof icons] || <AccountBalance />}
                    </Avatar>
                    <Box minWidth={0}>
                      <Typography variant="h6" noWrap>{wallet.name}</Typography>
                      {wallet.alias && (
                        <Chip
                          label={wallet.alias}
                          size="small"
                          variant="outlined"
                          sx={{ mt: 0.5 }}
                        />
                      )}
                    </Box>
                  </Box>
                  <Typography variant="caption" color="text.secondary">
                    {wallet.type} · {wallet.currency}
                  </Typography>
                  <Box mt={2}>
                    <BalanceReveal
                      display={`${formatAmount(Number(wallet.balance))} ${wallet.currency}`}
                      variant="h4"
                      color="primary.main"
                      iconSize="medium"
                      captionVariant="body2"
                      caption={
                        wallet.currency !== 'USD' && wallet.usdValue != null
                          ? `≈ ${formatCurrency(wallet.usdValue)} USD${wallet.rate ? ` (tasa ${wallet.rate.toFixed(2)})` : ''}`
                          : wallet.currency === 'USD'
                          ? 'Dólares estadounidenses'
                          : 'Sin tasa disponible'
                      }
                    />
                  </Box>
                  <Box display="flex" justifyContent="flex-end" mt={1}>
                    <ChevronRight color="disabled" />
                  </Box>
                </CardContent>
              </CardActionArea>
            </Card>
          </Grid>
        ))}
      </Grid>

      {!wallets.length && !error && <Alert severity="info" sx={{ mt: 2 }}>No hay billeteras configuradas. Crea una para comenzar.</Alert>}

      {/* Billeteras eliminadas */}
      <Box mt={5}>
        <Box display="flex" alignItems="center" gap={1} mb={1}>
          <Typography variant="h6" fontWeight="bold">Billeteras eliminadas</Typography>
          {deletedLoading && <CircularProgress size={16} />}
          {deleted.length > 0 && <Chip label={`${deleted.length}`} size="small" />}
        </Box>
        <Typography variant="body2" color="text.secondary" mb={2}>
          Las billeteras eliminadas no se borran definitivamente. Puedes reactivarlas aquí.
        </Typography>
        {deleted.length === 0 && !deletedLoading ? (
          <Alert severity="info">No hay billeteras eliminadas.</Alert>
        ) : (
          <Grid container spacing={2}>
            {deleted.map((wallet) => (
              <Grid item xs={12} sm={6} md={4} key={wallet.id}>
                <Card variant="outlined" sx={{ opacity: 0.7 }}>
                  <CardContent>
                    <Box display="flex" alignItems="center" gap={1}>
                      <Avatar sx={{ bgcolor: 'grey.500' }}>
                        {icons[wallet.type as keyof typeof icons] || <AccountBalance />}
                      </Avatar>
                      <Box minWidth={0}>
                        <Typography variant="subtitle2" noWrap>{wallet.name}</Typography>
                        {wallet.alias && (
                          <Typography variant="caption" color="text.secondary">{wallet.alias}</Typography>
                        )}
                      </Box>
                    </Box>
                    <Box mt={1}>
                      <Typography variant="body2">
                        {ocultarSaldos
                          ? `••• ${wallet.currency}`
                          : `${formatAmount(Number(wallet.balance))} ${wallet.currency}`}
                      </Typography>
                      <Typography variant="caption" color="text.secondary">{wallet.type}</Typography>
                    </Box>
                    <Button
                      size="small"
                      startIcon={<RestoreIcon />}
                      sx={{ mt: 1 }}
                      onClick={() => handleReactivate(wallet.id)}
                    >
                      Reactivar
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        )}
      </Box>

      {/* Dialog crear billetera */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nueva billetera</DialogTitle>
        <DialogContent>
          {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
          <Box display="grid" gap={2} pt={1}>
            <TextField
              label="Nombre"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              fullWidth
              required
            />
            <TextField
              label="Alias (opcional)"
              value={form.alias}
              onChange={(e) => setForm({ ...form, alias: e.target.value })}
              fullWidth
              helperText="Nombre corto, ej: BINUSD, BFCVES"
            />
            <Box display="grid" gridTemplateColumns="1fr 1fr" gap={2}>
              <FormControl fullWidth>
                <InputLabel>Tipo</InputLabel>
                <Select
                  value={form.type}
                  label="Tipo"
                  onChange={(e) => setForm({ ...form, type: e.target.value as string })}
                >
                  <MenuItem value="bank">Banco</MenuItem>
                  <MenuItem value="cash">Efectivo</MenuItem>
                  <MenuItem value="card">Tarjeta</MenuItem>
                  <MenuItem value="crypto">Cripto</MenuItem>
                  <MenuItem value="investment">Inversión</MenuItem>
                </Select>
              </FormControl>
              <FormControl fullWidth>
                <InputLabel>Moneda</InputLabel>
                <Select
                  value={form.currency}
                  label="Moneda"
                  onChange={(e) => setForm({ ...form, currency: e.target.value as string })}
                >
                  <MenuItem value="USD">USD</MenuItem>
                  <MenuItem value="VES">VES</MenuItem>
                </Select>
              </FormControl>
            </Box>
            <TextField
              label="Descripción (opcional)"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              fullWidth
              multiline
              minRows={2}
            />
            <Box>
              <Box
                onClick={() => setShowOptional((v) => !v)}
                sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer', color: 'text.secondary', userSelect: 'none' }}
              >
                <Typography variant="body2">Opciones adicionales</Typography>
                <IconButton size="small" sx={{ ml: 0.5 }}>
                  {showOptional ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                </IconButton>
              </Box>
              <Collapse in={showOptional}>
                <Box display="flex" flexDirection="column" gap={2} mt={1}>
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.excludeFromTotal}
                        onChange={(e) => setForm({ ...form, excludeFromTotal: e.target.checked })}
                      />
                    }
                    label="No contar en los totales del dashboard"
                  />
                  <FormControlLabel
                    control={
                      <Switch
                        checked={form.hideInDashboard}
                        onChange={(e) => setForm({ ...form, hideInDashboard: e.target.checked })}
                      />
                    }
                    label="Ocultar de la lista del dashboard"
                  />
                </Box>
              </Collapse>
            </Box>
            <FormControl fullWidth>
              <InputLabel>Icono</InputLabel>
              <Select
                value={form.icon}
                label="Icono"
                onChange={(e) => setForm({ ...form, icon: e.target.value as string })}
              >
                {iconKeys.map((k) => (
                  <MenuItem key={k} value={k}>{icons[k as keyof typeof icons]}{k}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl fullWidth>
              <InputLabel>Color</InputLabel>
              <Select
                value={form.color}
                label="Color"
                onChange={(e) => setForm({ ...form, color: e.target.value as string })}
              >
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
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setCreateOpen(false)}>Cancelar</Button>
          <Button variant="contained" onClick={handleCreate} disabled={saving}>
            {saving ? 'Guardando...' : 'Crear'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
