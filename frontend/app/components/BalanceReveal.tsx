'use client';

import { useState, ReactNode } from 'react';
import { Typography, IconButton, Box, SxProps, Theme } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useHideBalances, maskBalance } from '../lib/hooks/useHideBalances';

interface BalanceRevealProps {
  /** Texto formateado del saldo, ej: "$1.234,56 USD" */
  display: string;
  /** Clase tipográfica del valor, ej: 'h5', 'h4', 'body1'... */
  variant?: 'h4' | 'h5' | 'h6' | 'body1' | 'body2' | 'subtitle1' | 'subtitle2';
  /** Opcional: color del texto */
  color?: string;
  /** Icono a mostrar a la derecha del ojo (opcional) */
  icon?: ReactNode;
  /** Tamaño del botón de ojo (por defecto 'small') */
  iconSize?: 'small' | 'medium';
  /** Estilo extra para el contenedor */
  sx?: SxProps<Theme>;
}

export default function BalanceReveal({
  display,
  variant = 'body1',
  color,
  icon,
  iconSize = 'small',
  sx,
}: BalanceRevealProps) {
  const hiddenGlobally = useHideBalances();
  // Revelado puntual de ESTE saldo (por si el usuario quiere verlo sin cambiar la opción)
  const [localReveal, setLocalReveal] = useState(false);

  const hidden = hiddenGlobally && !localReveal;
  const shownValue = hidden ? maskBalance(display, true) : display;
  // Ya ocultado globalmente pero revelado a mano => mostramos el ojo "tapado"
  // para volver a ocultar; si no está oculto globalmente, no mostramos nada.
  const canReveal = hiddenGlobally;

  const text = (
    <Typography component="span" variant={variant} fontWeight="bold" color={color}>
      {shownValue}
    </Typography>
  );

  if (!canReveal) {
    return (
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, ...sx }}>
        {text}
        {icon}
      </Box>
    );
  }

  return (
    <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, ...sx }}>
      {text}
      <IconButton
        size={iconSize}
        onClick={() => setLocalReveal((v) => !v)}
        aria-label={hidden ? 'Mostrar saldo' : 'Ocultar saldo'}
        sx={{ p: 0.5 }}
      >
        {hidden ? (
          <Visibility fontSize={iconSize === 'small' ? 'inherit' : 'medium'} />
        ) : (
          <VisibilityOff fontSize={iconSize === 'small' ? 'inherit' : 'medium'} />
        )}
      </IconButton>
      {icon}
    </Box>
  );
}