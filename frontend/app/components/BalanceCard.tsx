'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Box, CircularProgress, Chip } from '@mui/material';
import { AttachMoney, TrendingUp, ErrorOutline } from '@mui/icons-material';
import { financeApi, Stats } from '../services/financeApi';
import BalanceReveal from './BalanceReveal';
import { useNumberFormat } from '../lib/NumberFormat';
import { useTimeZone } from '../lib/timeZone';

interface DailyRate { date: string; bcv: number; paralelo: number }

export default function BalanceCard() {
  const { formatAmount } = useNumberFormat();
  const { userTimeZone } = useTimeZone();
  const [stats, setStats] = useState<Stats | null>(null);
  const [rate, setRate] = useState<DailyRate | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
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

    fetchData();
    // Refresh every 60 seconds
    const interval = setInterval(fetchData, 60000);
    return () => clearInterval(interval);
  }, []);

  // Tasa del día (para los chips dentro de la tarjeta de balance)
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

        {/* Chips de tasas (estilo menú superior), dentro de la tarjeta de balance */}
        <Box display="flex" gap={1} flexWrap="wrap" mt={2}>
          {rate ? (
            <>
              <Chip size="small" label={`BCV: ${rate.bcv.toFixed(2)}`} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.6)', bgcolor: 'rgba(255,255,255,0.12)' }} variant="outlined" />
              <Chip size="small" label={`Paralelo: ${rate.paralelo.toFixed(2)}`} sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.6)', bgcolor: 'rgba(255,255,255,0.12)' }} variant="outlined" />
            </>
          ) : (
            <Chip size="small" label="Tasas —" sx={{ color: 'white', borderColor: 'rgba(255,255,255,0.4)' }} variant="outlined" />
          )}
        </Box>
      </CardContent>
    </Card>
  );
}
