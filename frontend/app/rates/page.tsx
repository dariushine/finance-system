'use client';

import { useState, useEffect, useCallback, memo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  TextField,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Alert,
  CircularProgress,
  IconButton,
  Chip,
  Snackbar,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  useMediaQuery,
  Divider,
  Stack,
  useTheme,
} from '@mui/material';
import { Delete as DeleteIcon, Edit as EditIcon, Add as AddIcon, Refresh as RefreshIcon, ExpandMore as ExpandMoreIcon } from '@mui/icons-material';
import { API_URL } from '../lib/api';

interface DailyRate {
  id: number;
  date: string;
  bcv: number;
  paralelo: number;
  source: string;
  created_at: string;
}

// --- Tarjeta móvil memorizada: solo se re-renderiza si SUS props cambian ---
const RateAccordionItem = memo(function RateAccordionItem({
  rate,
  isOpen,
  onToggle,
  onEdit,
  onRemove,
}: {
  rate: DailyRate;
  isOpen: boolean;
  onToggle: (id: number) => void;
  onEdit: (rate: DailyRate) => void;
  onRemove: (rate: DailyRate) => void;
}) {
  return (
    <Accordion
      expanded={isOpen}
      onChange={() => onToggle(rate.id)}
      disableGutters
      sx={{ '&:before': { display: 'none' }, border: '1px solid', borderColor: 'divider', borderRadius: 1, mb: 1, boxShadow: 'none' }}
    >
      <AccordionSummary expandIcon={<ExpandMoreIcon />} sx={{ px: 1.5, minHeight: 48 }}>
        <Box display="flex" alignItems="center" justifyContent="space-between" width="100%" pr={1}>
          <Stack spacing={0.25}>
            <Typography variant="body2">{rate.date}</Typography>
            <Typography variant="caption" color="text.secondary">{rate.source}</Typography>
          </Stack>
          <Chip label={`BCV ${rate.bcv.toFixed(2)}`} size="small" variant="outlined" />
        </Box>
      </AccordionSummary>
      <AccordionDetails sx={{ px: 1.5, pt: 0 }}>
        <Divider sx={{ mb: 1.5 }} />
        <Stack spacing={1}>
          <Box display="flex" justifyContent="space-between">
            <Typography variant="body2" color="text.secondary">Paralelo</Typography>
            <Typography variant="body2">{rate.paralelo.toFixed(2)}</Typography>
          </Box>
          <Box display="flex" justifyContent="space-between" alignItems="center">
            <Typography variant="body2" color="text.secondary">Acciones</Typography>
            <Box>
              <IconButton size="small" onClick={() => onEdit(rate)}>
                <EditIcon fontSize="small" />
              </IconButton>
              <IconButton size="small" color="error" onClick={() => onRemove(rate)}>
                <DeleteIcon fontSize="small" />
              </IconButton>
            </Box>
          </Box>
        </Stack>
      </AccordionDetails>
    </Accordion>
  );
});

export default function RatesPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('lg'));
  const [expanded, setExpanded] = useState<number | false>(false);
  const [rates, setRates] = useState<DailyRate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [openEditor, setOpenEditor] = useState(false);
  const [editing, setEditing] = useState<DailyRate | null>(null);
  const [form, setForm] = useState({ date: '', bcv: '', paralelo: '' });
  const [snackbar, setSnackbar] = useState<string | null>(null);

  // Handler ESTABLE: solo se re-renderiza la tarjeta que se abre/cierra.
  const handleToggle = useCallback((id: number) => {
    setExpanded((prev) => (prev === id ? false : id));
  }, []);

  const loadRates = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/daily-rates`);
      if (!res.ok) throw new Error('No se pudieron cargar las tasas');
      const json = await res.json();
      setRates(json.data || []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadRates(); }, [loadRates]);

  const openCreate = () => {
    setEditing(null);
    setForm({ date: new Date().toISOString().split('T')[0], bcv: '', paralelo: '' });
    setOpenEditor(true);
  };

  const openEdit = useCallback((rate: DailyRate) => {
    setEditing(rate);
    setForm({ date: rate.date, bcv: String(rate.bcv), paralelo: String(rate.paralelo) });
    setOpenEditor(true);
  }, []);

  const save = async () => {
    if (!form.date || !form.bcv || !form.paralelo) {
      setSnackbar('Llena fecha, BCV y paralelo');
      return;
    }
    const body = { date: form.date, bcv: Number(form.bcv), paralelo: Number(form.paralelo) };
    try {
      const res = editing
        ? await fetch(`${API_URL}/daily-rates/${editing.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          })
        : await fetch(`${API_URL}/daily-rates`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'Error al guardar');
      }
      setOpenEditor(false);
      setSnackbar(editing ? 'Tasa actualizada' : 'Tasa creada');
      loadRates();
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : 'Error al guardar');
    }
  };

  const remove = useCallback(async (rate: DailyRate) => {
    if (!confirm(`¿Eliminar la tasa del ${rate.date}?`)) return;
    try {
      const res = await fetch(`${API_URL}/daily-rates/${rate.id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Error al eliminar');
      setSnackbar('Tasa eliminada');
      loadRates();
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : 'Error al eliminar');
    }
  }, [loadRates]);

  const syncToday = async () => {
    try {
      const res = await fetch(`${API_URL}/daily-rates/today`);
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || 'No se pudo obtener la tasa del día');
      }
      const { data } = await res.json();
      setSnackbar(`Tasa del ${data.date}: BCV=${data.bcv}, Paralelo=${data.paralelo}`);
      loadRates();
    } catch (err) {
      setSnackbar(err instanceof Error ? err.message : 'Error al sincronizar');
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3} flexWrap="wrap" gap={2}>
        <Box>
          <Typography variant="h4" fontWeight="bold" sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>Tasas Diarias</Typography>
          <Typography variant="body1" color="text.secondary">
            Gestiona las tasas BCV y paralelo por día
          </Typography>
        </Box>
        <Box display="flex" gap={2}>
          <Button variant="outlined" startIcon={<RefreshIcon />} onClick={syncToday}>
            Sincronizar hoy
          </Button>
          <Button variant="contained" startIcon={<AddIcon />} onClick={openCreate}>
            Nueva tasa
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

      <Card>
        <CardContent>
          {loading ? (
            <Box display="flex" justifyContent="center" py={6}>
              <CircularProgress />
            </Box>
          ) : rates.length === 0 ? (
            <Box textAlign="center" py={6}>
              <Typography variant="body1" color="text.secondary">
                No hay tasas registradas. Pulsa &quot;Sincronizar hoy&quot; o &quot;Nueva tasa&quot;.
              </Typography>
            </Box>
          ) : isMobile ? (
            // MOBILE: acordeón por tasa
            <Box>
              {rates.map((rate) => (
                <RateAccordionItem
                  key={rate.id}
                  rate={rate}
                  isOpen={expanded === rate.id}
                  onToggle={handleToggle}
                  onEdit={openEdit}
                  onRemove={remove}
                />
              ))}
            </Box>
          ) : (
            <TableContainer component={Paper} variant="outlined">
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Fecha</TableCell>
                    <TableCell align="right">BCV</TableCell>
                    <TableCell align="right">Paralelo</TableCell>
                    <TableCell>Origen</TableCell>
                    <TableCell align="center">Acciones</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rates.map((rate) => (
                    <TableRow key={rate.id}>
                      <TableCell>{rate.date}</TableCell>
                      <TableCell align="right">{rate.bcv.toFixed(2)}</TableCell>
                      <TableCell align="right">{rate.paralelo.toFixed(2)}</TableCell>
                      <TableCell>{rate.source}</TableCell>
                      <TableCell align="center">
                        <IconButton size="small" onClick={() => openEdit(rate)}>
                          <EditIcon fontSize="small" />
                        </IconButton>
                        <IconButton size="small" color="error" onClick={() => remove(rate)}>
                          <DeleteIcon fontSize="small" />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </CardContent>
      </Card>

      <Dialog open={openEditor} onClose={() => setOpenEditor(false)} fullWidth maxWidth="xs">
        <DialogTitle>{editing ? `Editar tasa del ${editing.date}` : 'Nueva tasa'}</DialogTitle>
        <DialogContent>
          <Box display="flex" flexDirection="column" gap={2} mt={1}>
            <TextField
              label="Fecha"
              type="date"
              value={form.date}
              onChange={(e) => setForm({ ...form, date: e.target.value })}
              fullWidth
              disabled={!!editing}
              InputLabelProps={{ shrink: true }}
            />
            <TextField
              label="Tasa BCV (VES/USD)"
              type="number"
              value={form.bcv}
              onChange={(e) => setForm({ ...form, bcv: e.target.value })}
              fullWidth
              onWheel={(e) => e.currentTarget.blur()}
            />
            <TextField
              label="Tasa paralelo (VES/USD)"
              type="number"
              value={form.paralelo}
              onChange={(e) => setForm({ ...form, paralelo: e.target.value })}
              fullWidth
              onWheel={(e) => e.currentTarget.blur()}
            />
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpenEditor(false)}>Cancelar</Button>
          <Button variant="contained" onClick={save}>Guardar</Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!snackbar}
        autoHideDuration={4000}
        onClose={() => setSnackbar(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="info" onClose={() => setSnackbar(null)}>{snackbar}</Alert>
      </Snackbar>
    </Box>
  );
}
