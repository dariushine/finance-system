'use client';

import { memo, useCallback, useEffect, useState } from 'react';
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
  /** Número de tarjetas montadas a la vez (paginación por "Ver más"). */
  pageSize?: number;
}

// --- Formateadores memoizados a nivel de módulo (NO se reconstruyen por render) ---
const dateFormatter = new Intl.DateTimeFormat('es-VE', { day: '2-digit', month: 'short' });

const currencyFormatters: Record<string, Intl.NumberFormat> = {
  USD: new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 }),
};
const getCurrencyFormatter = (currency: string) => {
  if (!currencyFormatters[currency]) {
    currencyFormatters[currency] = new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
    });
  }
  return currencyFormatters[currency];
};

const formatDate = (dateString: string) => {
  const date = new Date(dateString);
  const now = Date.now();
  const diffMs = now - date.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffHours < 24) {
    return `Hoy ${date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
  } else if (diffHours < 48) {
    return `Ayer ${date.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}`;
  } else {
    return dateFormatter.format(date);
  }
};

const formatCurrency = (amount: number, currency: string = 'USD') =>
  getCurrencyFormatter(currency).format(amount);

// --- Tarjeta individual, memorizada: solo se re-renderiza si SUS props cambian ---
const TransactionAccordionItem = memo(function TransactionAccordionItem({
  transaction,
  isOpen,
  onToggle,
  showFee,
  currency,
  showView,
}: {
  transaction: AccordionTransaction;
  isOpen: boolean;
  onToggle: (id: number) => void;
  showFee: boolean;
  currency: string | undefined;
  showView: boolean;
}) {
  const router = useRouter();
  const isIncome = transaction.type === 'income';
  const hasFee = transaction.fee != null && transaction.fee > 0;
  const resolveCurrency = transaction.walletCurrency || currency;

  return (
    <Accordion
      expanded={isOpen}
      onChange={() => onToggle(transaction.id)}
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
            {formatCurrency(transaction.amount, resolveCurrency)}
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
              <Chip
                label={formatCurrency(transaction.fee!, resolveCurrency)}
                size="small"
                color="warning"
              />
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
});

export default function TransactionAccordionList({
  transactions,
  showFee = false,
  walletCurrencyFallback,
  showView = true,
  pageSize,
}: Props) {
  const [expanded, setExpanded] = useState<number | false>(false);
  const [visibleCount, setVisibleCount] = useState(pageSize ?? transactions.length);

  // Handler ESTABLE: su referencia no cambia entre renders, así React.memo
  // de cada tarjeta solo re-renderiza la que se abre/cierra (no toda la lista).
  const handleToggle = useCallback((id: number) => {
    setExpanded((prev) => (prev === id ? false : id));
  }, []);

  // Si cambian los datos o el pageSize, reinicia la paginación
  useEffect(() => {
    setVisibleCount(pageSize ?? transactions.length);
  }, [transactions, pageSize]);

  const shown = transactions.slice(0, visibleCount);

  return (
    <Box>
      {shown.map((transaction) => (
        <TransactionAccordionItem
          key={transaction.id}
          transaction={transaction}
          isOpen={expanded === transaction.id}
          onToggle={handleToggle}
          showFee={showFee && transaction.fee != null && transaction.fee > 0}
          currency={walletCurrencyFallback}
          showView={showView}
        />
      ))}
      {pageSize && visibleCount < transactions.length && (
        <Box textAlign="center" mt={1}>
          <Button
            size="small"
            onClick={() => setVisibleCount((c) => c + pageSize)}
          >
            Ver más ({transactions.length - visibleCount} restantes)
          </Button>
        </Box>
      )}
    </Box>
  );
}
