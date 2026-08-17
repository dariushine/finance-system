'use client';

import { useState, useEffect, useCallback } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Alert, Box, Button, CircularProgress, Typography } from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import RecurringPaymentForm from '../../../components/RecurringPaymentForm';
import { getRecurringPayment, type RecurringPayment } from '../../../lib/api';

export default function EditRecurringPaymentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = Number(params.id);

  const [payment, setPayment] = useState<RecurringPayment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getRecurringPayment(id);
      setPayment(data);
    } catch (e: any) {
      setError(e?.message || 'Error al cargar el pago frecuente');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress />
      </Box>
    );
  }

  if (error || !payment) {
    return (
      <Box>
        <Button startIcon={<ArrowBack />} onClick={() => router.push('/recurring-payments')} sx={{ mb: 2 }}>
          Volver a pagos frecuentes
        </Button>
        <Alert severity="error">{error || 'Pago frecuente no encontrado'}</Alert>
      </Box>
    );
  }

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto' }}>
      <Button startIcon={<ArrowBack />} onClick={() => router.push(`/recurring-payments/${id}`)} sx={{ mb: 2 }}>
        Volver al detalle
      </Button>
      <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
        Editar Pago Frecuente
      </Typography>
      <RecurringPaymentForm
        initial={{
          id: payment.id,
          name: payment.name,
          description: payment.description,
          amount: payment.amount,
          currency: payment.currency,
          type: payment.type,
          categoryId: payment.categoryId,
          categoryName: payment.categoryName,
          walletId: payment.walletId,
        }}
        onSuccess={(newId) => router.push(`/recurring-payments/${newId}`)}
        onCancel={() => router.push(`/recurring-payments/${id}`)}
      />
    </Box>
  );
}
