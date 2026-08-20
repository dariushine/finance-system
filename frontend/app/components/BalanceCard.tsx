'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Box, CircularProgress, Chip, useMediaQuery, useTheme } from '@mui/material';
import { AttachMoney, TrendingUp, ErrorOutline } from '@mui/icons-material';
import { financeApi, Stats } from '../services/financeApi';
import BalanceReveal from './BalanceReveal';
import { useNumberFormat } from '../lib/NumberFormat';
import { useTimeZone } from '../lib/timeZone';
import { useOnDataChanged } from '../lib/dataEvents';

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

  const fetchData = async () => {
    try {
      setLoading(true);
      const [statsData] = await Promise.all([
        financeApi.getStats(true, userTimeZone),
      ]);
      setStats(statsData);
      setLastUpdated(new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }));
      setError(null);
    } catch (err) {
      setError('Error al cargar datos del backend');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Recargar cuando se crea/edita/borra algo (FAB u otra acción).
  useOnDataChanged(fetchData, []);

  // Tasa del día (solo móvil, para los chips). En desktop el menú superior ya la muestra.
  useEffect(() => {
    if (!isMobile) return;
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
      <Card sx={{ bgcolor: 'primary.main', color: 'white', textAlign: 'center', py: 4 }}>
        <CircularProgress color="inherit" />
        <Typography variant="body2" sx={{ mt: 2 }}>Cargando datos...</Typography>
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

        {/* Chips de tasas (solo móvil, donde no hay panel superior) */}
        {isMobile && (
          <Box display="flex" gap={1} flexWrap="wrap" mt={2}>
            {rate ? (
              <>
                <Chip size="small" label={`BCV: ${rate.bcv.toFixed(2)}`} sx={{ bgcolor: '#fff', color: 'primary.main', fontWeight: 600 }} />
                <Chip size="small" label={`Paralelo: ${rate.paralelo.toFixed(2)}`} sx={{ bgcolor: '#fff', color: 'primary.main', fontWeight: 600 }} />
              </>
            ) : (
              <Chip size="small" label="Tasas —" sx={{ bgcolor: 'rgba(255,255,255,0.2)', color: 'white' }} />
            )}
          </Box>
        )}
      </CardContent>
    </Card>
  );
}
