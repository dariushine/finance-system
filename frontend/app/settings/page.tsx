'use client';

import {
  Box,
  Typography,
  Card,
  CardContent,
  Switch,
  FormControlLabel,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
} from '@mui/material';
import { VisibilityOff } from '@mui/icons-material';
import { useHideBalances, setHideBalances } from '../lib/hooks/useHideBalances';
import { useNumberFormat } from '../lib/NumberFormat';

export default function OpcionesPage() {
  const hidden = useHideBalances();
  const { separator, setSeparator } = useNumberFormat();

  const handleToggle = (checked: boolean) => {
    setHideBalances(checked);
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
                  Muestra el saldo oculto con un icono de ojo para revelarlo puntualmente.
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
        </CardContent>
      </Card>

      <Card variant="outlined" sx={{ mt: 2 }}>
        <CardContent>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={2}>
            <Typography variant="h6" fontWeight="bold">
              Separador de decimales
            </Typography>
            <ToggleButtonGroup
              exclusive
              size="small"
              value={separator}
              onChange={(_, v) => v && setSeparator(v)}
            >
              <ToggleButton value="comma">( , )</ToggleButton>
              <ToggleButton value="dot">( . )</ToggleButton>
            </ToggleButtonGroup>
          </Stack>
        </CardContent>
      </Card>
    </Box>
  );
}