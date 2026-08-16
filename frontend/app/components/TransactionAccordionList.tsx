'use client';

import { useState } from 'react';
import {
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Box,
  Chip,
  Divider,
  Stack,
  Typography,
  Button,
} from '@mui/material';
import {
  TrendingUp as IncomeIcon,
  TrendingDown as ExpenseIcon,
  ExpandMore as ExpandMoreIcon,
} from '@mui/icons-material';
import { useRouter } from 'next/navigation';

export interface AccordionTransaction {
  id: number;
  type: 'income' | 'expense';
  category?: string;
  description?: string;
  date: string;
  amount: number;
  fee?: number;
  walletName?: string;
  walletCurrency?: string;
}

interface Props {
  transactions: AccordionTransaction[];
  /** Muestra la fila de comisión (fee) dentro del acordeón */
  showFee?: boolean;
  /** Moneda a usar cuando la transacción no trae walletCurrency */
  walletCurrencyFallback?: string;
  /** Muestra el botón "Ver detalles" (navega a /transactions/:id) */
  showView?: boolean;
}

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 24) {
    return `Hoy ${date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffHours < 48) {
    return `Ayer ${date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    return date.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
  }
};

const formatCurrency = (amount: number, currency: string = 'USD') => {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount);
};

export default function TransactionAccordionList({
  transactions,
  showFee = false,
  walletCurrencyFallback,
  showView = true,
}: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState<number | false>(false);

  return (
    <Box>
      {transactions.map((transaction) => {
        const isIncome = transaction.type === 'income';
        const isOpen = expanded === transaction.id;
        const currency = transaction.walletCurrency || walletCurrencyFallback;
        const hasFee = transaction.fee != null && transaction.fee > 0;

        return (
          <Accordion
            key={transaction.id}
            expanded={isOpen}
            onChange={() => setExpanded(isOpen ? false : transaction.id)}
            disableGutters
            sx={{
              '&:before': { display: 'none' },
              border: '1px solid',
              borderColor: 'divider',
              borderRadius: 1,
              mb: 1,
              boxShadow: 'none',
            }}
          >
            <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.5, minHeight: 48 }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" width="100%" pr={1}>
                <Stack spacing={0.25}>
                  <Typography variant="body2" color="text.secondary">
                    {formatDate(transaction.date)}
                  </Typography>
                  <Chip
                    icon={isIncome ? <IncomeIcon /> : <ExpenseIcon />}
                    label={transaction.category || (isIncome ? 'Ingreso' : 'Gasto')}
                    color={isIncome ? 'success' : 'error'}
                    size="small"
                    sx={{ height: 22, '& .MuiChip-icon': { fontSize: 16 } }}
                  />
                </Stack>
                <Typography
                  variant="body1"
                  fontWeight="bold"
                  color={isIncome ? 'success.main' : 'error.main'}
                >
                  {isIncome ? '+' : '-'}
                  {formatCurrency(transaction.amount, currency)}
                </Typography>
              </Box>
            </AccordionSummary>
            <AccordionDetails sx={{ px: 1.5, pt: 0 }}>
              <Divider sx={{ mb: 1.5 }} />
              <Stack spacing={1}>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Categoría</Typography>
                  <Typography variant="body2">{transaction.category || '—'}</Typography>
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Tipo</Typography>
                  <Chip
                    label={isIncome ? 'Ingreso' : 'Gasto'}
                    color={isIncome ? 'success' : 'error'}
                    size="small"
                  />
                </Box>
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Billetera</Typography>
                  <Typography variant="body2">{transaction.walletName || '—'}</Typography>
                </Box>
                {showFee && hasFee && (
                  <Box display="flex" justifyContent="space-between">
                    <Typography variant="body2" color="text.secondary">Comisión</Typography>
                    <Typography variant="body2">
                      {formatCurrency(transaction.fee!, currency)}
                    </Typography>
                  </Box>
                )}
                <Box display="flex" justifyContent="space-between">
                  <Typography variant="body2" color="text.secondary">Descripción</Typography>
                  <Typography variant="body2" textAlign="right">{transaction.description || '—'}</Typography>
                </Box>
                {showView && (
                  <Box display="flex" justifyContent="flex-end">
                    <Button
                      size="small"
                      onClick={() => router.push(`/transactions/${transaction.id}`)}
                    >
                      Ver detalles
                    </Button>
                  </Box>
                )}
              </Stack>
            </AccordionDetails>
          </Accordion>
        );
      })}
    </Box>
  );
}
