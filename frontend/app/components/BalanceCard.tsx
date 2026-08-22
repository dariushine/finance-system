'use client';

import { useEffect, useRef, useState } from 'react';
import { Card, CardContent, Typography, Box, Chip, useMediaQuery, useTheme, ToggleButton, ToggleButtonGroup, Skeleton } from '@mui/material';
import { AttachMoney, TrendingUp, ErrorOutline } from '@mui/icons-material';
import { financeApi, Stats } from '../services/financeApi';
import BalanceReveal from './BalanceReveal';
import { useNumberFormat } from '../lib/NumberFormat';
import { useTimeZone } from '../lib/timeZone';
import { useOnDataChanged } from '../lib/dataEvents';
import { useRatePreference } from '../lib/hooks/useRatePreference';
import { isSessionDead } from '../lib/auth';

interface DailyRate { date: string; bcv: number; paralelo: number }

export default function BalanceCard() {
  const { formatAmount } = useNumberFormat();
  const { userTimeZone } = useTimeZone();
  const theme = useTheme();
  // En desktop el menú superior ya muestra las tasas; los chips solo van en móvil.
  const isMobile = useMediaQuery(theme.breakpoints.down('md'), { defaultMatches: true });
  const [stats, setStats] = useState<Stats | null>(null);
  const [rate, setRate] = useState<DailyRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');
  const [ratePref, setRatePref] = useRatePreference();

  // Ref de la tasa para que el refresh periódico y el recálculo usen siempre
  // el valor más reciente sin depender de closures del render inicial.
  const ratePrefRef = useRef(ratePref);
  ratePrefRef.current = ratePref;
  // Skip del efecto de tasa en el primer render (la carga inicial la hace el otro efecto).
  const firstStatsLoad = useRef(true);

  const loadStats = async (showSpinner: boolean) => {
    const rate = ratePrefRef.current;
    try {
      if (showSpinner) setLoading(true);
      const [statsData] = await Promise.all([
        financeApi.getStats(true, userTimeZone, rate),
      ]);
      setStats(statsData);
      setLastUpdated(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
      setError(null);
    } catch (err) {
      if (showSpinner) setError('Error al cargar datos del backend');
      console.error(err);
    } finally {
      if (showSpinner) setLoading(false);
    }
  };

  // Carga inicial (con spinner) + refresh periódico (sin spinner).
  // Si la sesión muere (401 + refresh fallido), el intervalo se limpia para no
  // seguir haciendo polling en bucle hacia una sesión ya revocada.
  useEffect(() => {
    if (isSessionDead()) return;
    loadStats(true);
    const interval = setInterval(() => {
      if (isSessionDead()) {
        clearInterval(interval);
        return;
      }
      loadStats(false);
    }, 60000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cambio de tasa: recalcular SOLO el monto, sin resetear el panel entero.
  useEffect(() => {
    if (firstStatsLoad.current) {
      firstStatsLoad.current = false;
      return;
    }
    loadStats(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ratePref]);

  // Recargar con spinner al crear/editar/borrar (FAB u otra acción).
  useOnDataChanged(() => loadStats(true), []);

  // Tasa del día (para los chips en móvil; en desktop solo la muestra el menú superior).
  // Se busca siempre (independiente de isMobile) para que al achicar la ventana a móvil
  // los chips ya tengan la tasa cargada y no muestren "Tasas —".
  useEffect(() => {
    let active = true;
    fetch('/api/daily-rates/today')
      .then(async (res) => {
        if (!res.ok) throw new Error('No hay tasa');
        const { data } = await res.json();
        if (active) setRate(data);
      })
      .catch(() => { if (active) setRate(null); });
    return () => { active = false; };
  }, []);

  if (loading) {
    return (
      <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
        <CardContent>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box sx={{ width: '60%' }}>
              <Skeleton variant="text" width="40%" sx={{ bgcolor: 'rgba(255,255,255,0.25)' }} />
              <Skeleton variant="text" width="75%" height={48} sx={{ bgcolor: 'rgba(255,255,255,0.25)' }} />
              <Skeleton variant="text" width="45%" sx={{ bgcolor: 'rgba(255,255,255,0.25)' }} />
            </Box>
            <Skeleton variant="circular" width={48} height={48} sx={{ bgcolor: 'rgba(255,255,255,0.25)' }} />
          </Box>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card sx={{ bgcolor: 'error.main', color: 'white' }}>
        <CardContent sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <ErrorOutline />
          <Typography>{error}</Typography>
        </CardContent>
      </Card>
    );
  }

  const totalBalance = stats?.net_balance || 0;

  return (
    <Card sx={{ bgcolor: 'primary.main', color: 'white' }}>
      <CardContent>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <div>
            <Typography variant="h6" gutterBottom>
              Balance Total
            </Typography>
            <BalanceReveal
              display={`$${formatAmount(totalBalance)} USD`}
              variant="h4"
              color="white"
            />
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Actualizado {lastUpdated}
            </Typography>
          </div>
          <Box display="flex" alignItems="center">
            <AttachMoney sx={{ fontSize: 48, mr: 1 }} />
            <TrendingUp sx={{ fontSize: 32 }} />
          </Box>
        </Box>

        {/* Selector de tasa: chips tappables en móvil, toggle BCV/Paralelo en desktop. */}
        {isMobile ? (
          <Box display="flex" gap={1} flexWrap="wrap" mt={2}>
            {rate ? (
              <>
                <Chip
                  size="small"
                  label={`BCV: ${rate.bcv.toFixed(2)}`}
                  onClick={() => setRatePref('bcv')}
                  sx={{
                    bgcolor: ratePref === 'bcv' ? '#fff' : 'rgba(255,255,255,0.2)',
                    color: ratePref === 'bcv' ? 'primary.main' : 'white',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                />
                <Chip
                  size="small"
                  label={`Paralelo: ${rate.paralelo.toFixed(2)}`}
                  onClick={() => setRatePref('paralelo')}
                  sx={{
                    bgcolor: ratePref === 'paralelo' ? '#fff' : 'rgba(255,255,255,0.2)',
                    color: ratePref === 'paralelo' ? 'primary.main' : 'white',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                />
              </>
            ) : (
              <Chip size="small" label="Tasas —" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
            )}
          </Box>
        ) : (
          <ToggleButtonGroup
            size="small"
            exclusive
            value={ratePref}
            onChange={(e, val) => val && setRatePref(val)}
            sx={{ mt: 2, bgcolor: 'rgba(255,255,255,0.15)', borderRadius: 1 }}
          >
            <ToggleButton
              value="bcv"
              sx={{
                color: 'white',
                borderColor: 'rgba(255,255,255,0.35)',
                '&.Mui-selected': { bgcolor: '#fff', color: 'primary.main' },
              }}
            >
              BCV
            </ToggleButton>
            <ToggleButton
              value="paralelo"
              sx={{
                color: 'white',
                borderColor: 'rgba(255,255,255,0.35)',
                '&.Mui-selected': { bgcolor: '#fff', color: 'primary.main' },
              }}
            >
              Paralelo
            </ToggleButton>
          </ToggleButtonGroup>
        )}
      </CardContent>
    </Card>
  );
}
