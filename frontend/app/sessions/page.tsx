'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Chip,
  IconButton,
  Button,
  Stack,
  TextField,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Divider,
  Skeleton,
} from '@mui/material';
import { DeleteOutline, Devices, Add, ContentCopy, Check } from '@mui/icons-material';
import {
  getSessions,
  revokeSession,
  getApiTokens,
  createApiToken,
  deleteApiToken,
  SessionInfo,
  ApiToken,
} from '../lib/api';

interface CreateTokenResult {
  id: number;
  name: string;
  token: string;
  expiresAt: number | null;
}

function fmtDate(ts: number | null): string {
  if (!ts) return 'Nunca';
  return new Date(ts).toLocaleString('es-VE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const EXPIRY_PRESETS: { label: string; value: number | null }[] = [
  { label: 'Sin expiración', value: null },
  { label: '1 día', value: 60 * 60 * 24 },
  { label: '7 días', value: 60 * 60 * 24 * 7 },
  { label: '30 días', value: 60 * 60 * 24 * 30 },
  { label: '1 año', value: 60 * 60 * 24 * 365 },
];

export default function SessionsPage() {
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [tokens, setTokens] = useState<ApiToken[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [tokenName, setTokenName] = useState('');
  const [tokenExpiry, setTokenExpiry] = useState<number | null>(null);
  const [creating, setCreating] = useState(false);
  const [createdToken, setCreatedToken] = useState<CreateTokenResult | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [s, t] = await Promise.all([getSessions(), getApiTokens()]);
      setSessions(s);
      setTokens(t);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al cargar');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRevokeSession = async (jti: string) => {
    try {
      await revokeSession(jti);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al revocar');
    }
  };

  const handleCreateToken = async () => {
    try {
      setCreating(true);
      const res = await createApiToken(tokenName.trim(), tokenExpiry);
      setCreatedToken(res);
      setTokenName('');
      setTokenExpiry(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al crear token');
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    if (!createdToken) return;
    try {
      await navigator.clipboard.writeText(createdToken.token);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* silencioso */
    }
  };

  const handleDeleteToken = async (id: number) => {
    try {
      await deleteApiToken(id);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al revocar token');
    }
  };

  const activeTokens = (tokens || []).filter((t) => t.isActive);

  return (
    <Box sx={{ width: '100%', maxWidth: 760, mx: 'auto' }}>
      <Box mb={3}>
        <Typography variant="h4" fontWeight="bold" gutterBottom sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}>
          Sesiones y acceso
        </Typography>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Sesiones */}
      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="h6" fontWeight="bold">
              Sesiones abiertas
            </Typography>
            {sessions && <Chip label={`${sessions.length}`} size="small" variant="outlined" />}
          </Stack>

          {loading ? (
            <Stack spacing={1.5} py={1}>
              {Array.from({ length: 3 }).map((_, i) => (
                <Box key={i} display="flex" alignItems="center" justifyContent="space-between">
                  <Box display="flex" alignItems="center" gap={2}>
                    <Skeleton variant="circular" width={36} height={36} />
                    <Box>
                      <Skeleton variant="text" width={140} />
                      <Skeleton variant="text" width={100} />
                    </Box>
                  </Box>
                  <Skeleton variant="text" width={60} />
                </Box>
              ))}
            </Stack>
          ) : sessions && sessions.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No hay sesiones abiertas.
            </Typography>
          ) : (
            <Stack divider={<Divider />} spacing={0} mt={1}>
              {(sessions || []).map((s) => (
                <Box key={s.jti} display="flex" alignItems="center" justifyContent="space-between" py={1.5}>
                  <Box display="flex" alignItems="center" gap={2} sx={{ minWidth: 0 }}>
                    <Devices color="action" />
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" alignItems="center" gap={1}>
                        <Typography variant="body1" fontWeight="medium" noWrap>
                          {s.deviceName}
                        </Typography>
                        {s.current && (
                          <Chip label="Actual" size="small" color="primary" variant="outlined" />
                        )}
                      </Stack>
                      <Typography variant="caption" color="text.secondary">
                        Ingresó {fmtDate(s.createdAt)}
                        {s.lastUsedAt ? ` · Última actividad ${fmtDate(s.lastUsedAt)}` : ''}
                        {s.ip ? ` · ${s.ip}` : ''}
                      </Typography>
                    </Box>
                  </Box>
                  <IconButton
                    size="small"
                    onClick={() => handleRevokeSession(s.jti)}
                    disabled={s.current}
                    aria-label="Cerrar sesión"
                  >
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* API tokens */}
      <Card variant="outlined" sx={{ mt: 2 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="h6" fontWeight="bold">
              Tokens de API
            </Typography>
            <Button size="small" variant="contained" startIcon={<Add />} onClick={() => { setCreatedToken(null); setCreateOpen(true); }}>
              Nuevo token
            </Button>
          </Stack>

          {loading ? (
            <Stack spacing={1.5} py={1}>
              {Array.from({ length: 2 }).map((_, i) => (
                <Box key={i} display="flex" alignItems="center" justifyContent="space-between">
                  <Skeleton variant="text" width={140} />
                  <Skeleton variant="text" width={60} />
                </Box>
              ))}
            </Stack>
          ) : activeTokens.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
              No hay tokens de API.
            </Typography>
          ) : (
            <Stack divider={<Divider />} spacing={0} mt={1}>
              {activeTokens.map((t) => (
                <Box key={t.id} display="flex" alignItems="center" justifyContent="space-between" py={1.5}>
                  <Box sx={{ minWidth: 0 }}>
                    <Typography variant="body1" fontWeight="medium" noWrap>
                      {t.name}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      Creado {fmtDate(t.createdAt)}
                      {t.expiresAt ? ` · Expira ${fmtDate(t.expiresAt)}` : ' · Sin expiración'}
                      {t.lastUsedAt ? ` · Último uso ${fmtDate(t.lastUsedAt)}` : ''}
                    </Typography>
                  </Box>
                  <IconButton size="small" onClick={() => handleDeleteToken(t.id)} aria-label="Revocar token">
                    <DeleteOutline fontSize="small" />
                  </IconButton>
                </Box>
              ))}
            </Stack>
          )}
        </CardContent>
      </Card>

      {/* Dialog crear token */}
      <Dialog open={createOpen} onClose={() => { if (!creating) setCreateOpen(false); }} fullWidth maxWidth="sm">
        {!createdToken ? (
          <>
            <DialogTitle>Nuevo token de API</DialogTitle>
            <DialogContent>
              <Stack spacing={2} mt={1}>
                <TextField
                  label="Nombre"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="ej: skill-bot, script-backup"
                  autoFocus
                />
                <FormControl size="small" fullWidth>
                  <InputLabel>Expiración</InputLabel>
                  <Select
                    label="Expiración"
                    value={tokenExpiry ?? 'never'}
                    onChange={(e) => setTokenExpiry(e.target.value === 'never' ? null : e.target.value as number)}
                  >
                    {EXPIRY_PRESETS.map((p) => (
                      <MenuItem key={p.label} value={p.value ?? 'never'}>{p.label}</MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCreateOpen(false)} disabled={creating}>Cancelar</Button>
              <Button
                onClick={handleCreateToken}
                variant="contained"
                disabled={creating || !tokenName.trim()}
              >
                {creating ? 'Creando…' : 'Crear'}
              </Button>
            </DialogActions>
          </>
        ) : (
          <>
            <DialogTitle>Token creado</DialogTitle>
            <DialogContent>
              <Alert severity="warning" sx={{ mb: 2 }}>
                Copia este token ahora: no se mostrará de nuevo.
              </Alert>
              <Box
                sx={{
                  fontFamily: 'monospace',
                  bgcolor: 'background.default',
                  border: '1px solid',
                  borderColor: 'divider',
                  borderRadius: 1,
                  p: 1.5,
                  wordBreak: 'break-all',
                  fontSize: '0.875rem',
                }}
              >
                {createdToken.token}
              </Box>
              <Stack direction="row" spacing={1} mt={1.5}>
                <Button size="small" startIcon={copied ? <Check /> : <ContentCopy />} onClick={handleCopy}>
                  {copied ? 'Copiado' : 'Copiar'}
                </Button>
              </Stack>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setCreateOpen(false)}>Listo</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
}
