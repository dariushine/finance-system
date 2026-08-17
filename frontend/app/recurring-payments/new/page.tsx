'use client';

import { useRouter } from 'next/navigation';
import {
  Box,
  Button,
  Typography,
} from '@mui/material';
import { ArrowBack } from '@mui/icons-material';
import RecurringPaymentForm from '../../components/RecurringPaymentForm';

export default function NewRecurringPaymentPage() {
  const router = useRouter();

  return (
    <Box sx={{ maxWidth: 560, mx: 'auto' }}>
      <Button startIcon={<ArrowBack />} onClick={() => router.push('/recurring-payments')} sx={{ mb: 2 }}>
        Volver a pagos frecuentes
      </Button>
      <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2rem' } }}>
        Nuevo Pago Frecuente
      </Typography>
      <RecurringPaymentForm
        onSuccess={(id) => router.push(`/recurring-payments/${id}`)}
        onCancel={() => router.push('/recurring-payments')}
      />
    </Box>
  );
}
