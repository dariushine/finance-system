'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions,
  DialogContent, DialogTitle, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, Typography, Accordion, AccordionSummary, AccordionDetails, useMediaQuery, Divider, Stack, useTheme,
} from '@mui/material';
import { Add, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import TransactionForm from '../components/TransactionForm';
import { API_URL } from '../lib/api';

interface Transaction {
  id: number;
  category: string;
  type: 'income' | 'expense';
  amount: number;
  fee?: number;
  description?: string;
  date: string;
  walletName?: string;
  walletCurrency?: string;
}

export default function TransactionsPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [expanded, setExpanded] = useState<number | false>(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const loadTransactions = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`${API_URL}/transactions?limit=100`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar las transacciones');
      setTransactions(Array.isArray(payload) ? payload : payload.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTransactions(); }, [loadTransactions]);

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="flex-start" gap={2} flexWrap="wrap" mb={3}>
        <Box>
          <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>Transacciones</Typography>
          <Typography variant="body1" color="text.secondary">Historial de ingresos y gastos.</Typography>
        </Box>
        <Button variant="contained" startIcon={<Add />} onClick={() => setFormOpen(true)}>Nueva transacción</Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      <Card>
        <CardContent>
          {loading ? <Box display="flex" justifyContent="center" py={5}><CircularProgress /></Box> : isMobile ? (
            // MOBILE: acordeón por transacción
            <Box>
              {transactions.map((transaction) => {
                const isIncome = transaction.type === 'income';
                const isOpen = expanded === transaction.id;
                return (
                  <Accordion
                    key={transaction.id}
                    expanded={isOpen}
                    onChange={() => setExpanded(isOpen ? false : transaction.id)}
                    disableGutters
                    sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 1, boxShadow: 'none' }}
                  >
                    <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.5, minHeight: 48 }}>
                      <Box display="flex" alignItems="center" justifyContent="space-between" width="100%" pr={1}>
                        <Stack spacing={0.25}>
                          <Typography variant="body2" color="text.secondary">
                            {new Date(transaction.date).toLocaleDateString('es-VE')}
                          </Typography>
                          <Chip label={transaction.category} size="small" variant="outlined" />
                        </Stack>
                        <Typography variant="body1" fontWeight="bold" color={isIncome ? 'success.main' : 'error.main'}>
                          {isIncome ? '+' : '-'}{transaction.amount.toLocaleString('es-VE')} {transaction.walletCurrency || ''}
                        </Typography>
                      </Box>
                    </AccordionSummary>
                    <AccordionDetails sx={{ px: 1.5, pt: 0 }}>
                      <Divider sx={{ mb: 1.5 }} />
                      <Stack spacing={1}>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">Tipo</Typography>
                          <Chip label={transaction.type === 'income' ? 'Ingreso' : 'Gasto'} color={isIncome ? 'success' : 'error'} size="small" />
                        </Box>
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">Billetera</Typography>
                          <Typography variant="body2">{transaction.walletName || '—'}</Typography>
                        </Box>
                        {transaction.fee && transaction.fee > 0 && (
                          <Box display="flex" justifyContent="space-between">
                            <Typography variant="body2" color="text.secondary">Fee</Typography>
                            <Chip label={`${transaction.fee.toFixed(2)} ${transaction.walletCurrency || ''}`} size="small" color="warning" variant="outlined" />
                          </Box>
                        )}
                        <Box display="flex" justifyContent="space-between">
                          <Typography variant="body2" color="text.secondary">Descripción</Typography>
                          <Typography variant="body2" textAlign="right">{transaction.description || '—'}</Typography>
                        </Box>
                      </Stack>
                    </AccordionDetails>
                  </Accordion>
                );
              })}
            </Box>
          ) : (
            <TableContainer>
              <Table>
                <TableHead><TableRow>
                  <TableCell>Fecha</TableCell><TableCell>Categoría</TableCell><TableCell>Billetera</TableCell>
                  <TableCell>Tipo</TableCell><TableCell align="right">Monto</TableCell><TableCell align="right">Fee</TableCell><TableCell>Descripción</TableCell>
                </TableRow></TableHead>
                <TableBody>
                  {transactions.map((transaction) => (
                    <TableRow key={transaction.id} hover>
                      <TableCell>{new Date(transaction.date).toLocaleDateString('es-VE')}</TableCell>
                      <TableCell><Chip label={transaction.category} size="small" variant="outlined" /></TableCell>
                      <TableCell>{transaction.walletName || '—'}</TableCell>
                      <TableCell><Chip label={transaction.type === 'income' ? 'Ingreso' : 'Gasto'} color={transaction.type === 'income' ? 'success' : 'error'} size="small" /></TableCell>
                      <TableCell align="right" sx={{ color: transaction.type === 'income' ? 'success.main' : 'error.main', fontWeight: 600 }}>
                        {transaction.type === 'income' ? '+' : '-'}{transaction.amount.toLocaleString('es-VE')} {transaction.walletCurrency || ''}
                      </TableCell>
                      <TableCell align="right">
                        {transaction.fee && transaction.fee > 0 ? (
                          <Chip label={`${transaction.fee.toFixed(2)} ${transaction.walletCurrency || ''}`} size="small" color="warning" variant="outlined" />
                        ) : '—'}
                      </TableCell>
                      <TableCell>{transaction.description || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {!transactions.length && <Typography color="text.secondary" textAlign="center" py={4}>No hay transacciones registradas.</Typography>}
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={formOpen} onClose={() => setFormOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nueva transacción</DialogTitle>
        <DialogContent><TransactionForm onSuccess={() => { setFormOpen(false); loadTransactions(); }} /></DialogContent>
        <DialogActions><Button onClick={() => setFormOpen(false)}>Cancelar</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
