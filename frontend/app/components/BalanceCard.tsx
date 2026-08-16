'use client';

import { useEffect, useState } from 'react';
import { Card, CardContent, Typography, Box, CircularProgress } from '@mui/material';
import { AttachMoney, TrendingUp, ErrorOutline } from '@mui/icons-material';
import { financeApi, Stats } from '../services/financeApi';

export default function BalanceCard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<string>('');

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const [statsData] = await Promise.all([
          financeApi.getStats(),
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
            <Typography variant="h4" fontWeight="bold">
              ${totalBalance.toLocaleString()} USD
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9 }}>
              Actualizado {lastUpdated}
            </Typography>
          </div>
          <Box display="flex" alignItems="center">
            <AttachMoney sx={{ fontSize: 48, mr: 1 }} />
            <TrendingUp sx={{ fontSize: 32 }} />
          </Box>
        </Box>
      </CardContent>
    </Card>
  );
}
