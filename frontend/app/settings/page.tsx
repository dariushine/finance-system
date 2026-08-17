'use client';

import { useState } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  Alert,
  Divider,
  Stack,
} from '@mui/material';
import { VisibilityOff } from '@mui/icons-material';
import { useHideBalances, setHideBalances } from '../lib/hooks/useHideBalances';

export default function OpcionesPage() {
  const hidden = useHideBalances();
  const [justChanged, setJustChanged] = useState(false);

  const handleToggle = (checked: boolean) => {
    setHideBalances(checked);
    setJustChanged(true);
    setTimeout(() => setJustChanged(false), 2500);
  };

  return (
    <Box sx={{ width: '100%', maxWidth: 720, mx: 'auto' }}>
      <Box mb={3}>
        <Typography
          variant="h4"
          fontWeight="bold"
          gutterBottom
          sx={{ fontSize: { xs: '1.5rem', sm: '2.125rem' } }}
        >
          Opciones
        </Typography>
        <Typography variant="body1" color="text.secondary">
          Configura cómo se muestran tus datos en la aplicación.
        </Typography>
      </Box>

      <Card variant="outlined">
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Box display="flex" alignItems="center" gap={2}>
              <VisibilityOff color="primary" />
              <Box>
                <Typography variant="h6" fontWeight="bold">
                  Ocultar saldos
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  Muestra el total del dashboard y los saldos de las billeteras ocultos, con un
                  icono de ojo para revelarlos puntualmente.
                </Typography>
              </Box>
            </Box>
            <FormControlLabel
              control={
                <Switch checked={hidden} onChange={(e) => handleToggle(e.target.checked)} />
              }
              label={hidden ? 'Activado' : 'Desactivado'}
              labelPlacement="start"
            />
          </Stack>

          {justChanged && (
            <Alert severity="success" sx={{ mt: 2 }}>
              Preferencia guardada. Se aplica el cambio al instante.
            </Alert>
          )}
        </CardContent>
      </Card>

      <Box mt={3}>
        <Typography variant="body2" color="text.secondary">
          Los saldos ocultos son:
        </Typography>
        <Stack component="ul" spacing={0.5} sx={{ mt: 1, pl: 2, color: 'text.secondary' }}>
          <li>Total del dashboard (Balance Total)</li>
          <li>Saldo de billeteras en el dashboard</li>
          <li>Saldo de billeteras en la página de billeteras</li>
          <li>Se siguen mostrando en el detalle de la billetera y en reportes.</li>
        </Stack>
      </Box>

      <Divider sx={{ my: 3 }} />
      <Typography variant="caption" color="text.disabled">
        Esta preferencia se guarda en este dispositivo y solo afecta la visualización (no altera ningún dato).
      </Typography>
    </Box>
  );
}