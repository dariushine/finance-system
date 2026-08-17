'use client';

import { useState, useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogContent,
  DialogTitle,
  Fab,
  IconButton,
  Typography,
  Avatar,
} from '@mui/material';
import {
  Add as AddIcon,
  ArrowUpward,
  ArrowDownward,
  PlayArrow,
  ChevronRight,
  Schedule as ScheduleIcon,
  Close as CloseIcon,
} from '@mui/icons-material';
import { useTheme } from '@mui/material/styles';
import {
  getRecurringPayments,
  type RecurringPayment,
} from '../lib/api';
import RecurringPaymentForm from '../components/RecurringPaymentForm';
import RecurringPaymentExecuteDialog from '../components/RecurringPaymentExecuteDialog';

const formatCurrency = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency, minimumFractionDigits: 2 }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

export default function RecurringPaymentsPage() {
  const router = useRouter();
  const theme = useTheme();
  const [payments, setPayments] = useState<RecurringPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [executePayment, setExecutePayment] = useState<RecurringPayment | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await getRecurringPayments();
      setPayments(data);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al cargar pagos frecuentes');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={1}>
        <Box>
          <Typography variant="h4" gutterBottom fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
            Pagos Frecuentes
          </Typography>
          <Typography variant="body1" color="text.secondary">
            Plantillas para crear transacciones con un solo toque
          </Typography>
        </Box>
        <Button
          variant="contained"
          startIcon={<AddIcon />}
          onClick={() => setCreateOpen(true)}
          disabled={loading}
        >
          Nuevo
        </Button>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {loading ? (
        <Box display="flex" justifyContent="center" py={6}>
          <CircularProgress />
        </Box>
      ) : payments.length === 0 ? (
        <Card variant="outlined">
          <CardContent sx={{ textAlign: 'center', py: 6 }}>
            <ScheduleIcon sx={{ fontSize: 48, color: 'text.disabled', mb: 1 }} />
            <Typography variant="h6">Sin pagos frecuentes</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
              Crea tu primer pago frecuente para registrar transacciones repetidas en un toque.
            </Typography>
            <Button variant="contained" startIcon={<AddIcon />} onClick={() => setCreateOpen(true)}>
              Crear pago frecuente
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Box>
          {payments.map((p) => {
            const isIncome = p.type === 'income';
            return (
              <Card
                key={p.id}
                variant="outlined"
                sx={{ mb: 1.5, cursor: 'pointer', transition: 'background-color 0.15s ease', '&:hover': { backgroundColor: 'action.hover' } }}
                onClick={() => router.push(`/recurring-payments/${p.id}`)}
              >
                <CardContent sx={{ py: 1.5, display: 'flex', alignItems: 'center', gap: 1.5 }}>
                  <Avatar
                    sx={{
                      width: 40,
                      height: 40,
                      bgcolor: isIncome ? 'success.light' : 'error.light',
                      flexShrink: 0,
                    }}
                  >
                    {isIncome ? <ArrowUpward /> : <ArrowDownward />}
                  </Avatar>
                  <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                    <Typography variant="body1" fontWeight="bold" noWrap>
                      {p.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary" noWrap>
                      {isIncome ? 'Ingreso' : 'Gasto'} · {p.categoryName} · {p.walletName || 'Sin billetera'}
                    </Typography>
                  </Box>
                  <Box display="flex" alignItems="center" gap={1.5} sx={{ flexShrink: 0 }}>
                    <Typography
                      variant="body1"
                      fontWeight="bold"
                      color={isIncome ? 'success.main' : 'error.main'}
                    >
                      {isIncome ? '+' : '-'}{formatCurrency(p.amount, p.currency)}
                    </Typography>
                    {/* Botón de acción "Realizar": icono play en fondo primario */}
                    <Fab
                      size="small"
                      color="primary"
                      aria-label={`Realizar ${p.name}`}
                      title="Realizar"
                      onClick={(e) => {
                        e.stopPropagation();
                        setExecutePayment(p);
                      }}
                      sx={{
                        width: 34,
                        height: 34,
                        minHeight: 0,
                        boxShadow: theme.shadows[2],
                        '& .MuiSvgIcon-root': { fontSize: 19 },
                      }}
                    >
                      <PlayArrow />
                    </Fab>
                    <ChevronRight fontSize="small" color="action" />
                  </Box>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}

      {/* Modal Nuevo pago frecuente */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', pr: 1 }}>
          Nuevo Pago Frecuente
          <IconButton onClick={() => setCreateOpen(false)} aria-label="Cerrar" size="small">
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pb: 2 }}>
          <RecurringPaymentForm
            onSuccess={(id) => router.push(`/recurring-payments/${id}`)}
            onCancel={() => setCreateOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* Modal Realizar (abre aquí mismo desde el listado) */}
      <RecurringPaymentExecuteDialog
        payment={executePayment}
        open={Boolean(executePayment)}
        onClose={() => setExecutePayment(null)}
      />
    </Box>
  );
}
