'use client';

import { useState, ReactNode } from 'react';
import { Typography, IconButton, Box, SxProps, Theme } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useHideBalances, maskBalance, maskNumber } from '../lib/hooks/useHideBalances';

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
  /**
   * Texto secundario (gris) que se muestra DEBAJO del saldo, ej: "≈ 2.500,00 USD (tasa 35,00)".
   * Al ocultar, solo se enmascaran sus números (el texto se conserva).
   */
  caption?: string;
  /** Variante tipográfica del caption (por defecto 'caption') */
  captionVariant?: 'caption' | 'body1' | 'body2';
  /** Estilo extra para el contenedor */
  sx?: SxProps<Theme>;
}

export default function BalanceReveal({
  display,
  variant = 'body1',
  color,
  icon,
  iconSize = 'small',
  caption,
  captionVariant = 'caption',
  sx,
}: BalanceRevealProps) {
  const hiddenGlobally = useHideBalances();
  // Revelado puntual de ESTE saldo (por si el usuario quiere verlo sin cambiar la opción)
  const [localReveal, setLocalReveal] = useState(false);

  // Oculto si está activado globalmente y este elemento no fue revelado a mano.
  const hidden = hiddenGlobally && !localReveal;
  const canReveal = hiddenGlobally;

  const mainShown = hidden ? maskBalance(display, true) : display;
  // El caption solo enmascara sus números (texto se conserva). Textos sin números
  // (ej: "Dólares estadounidenses") no se ven afectados.
  const captionShown = caption ? (hidden ? maskNumber(caption) : caption) : '';

  const toggleReveal = (e: React.MouseEvent) => {
    // No dejar que el clic en el ojo active la tarjeta (navegación)
    e.stopPropagation();
    e.preventDefault();
    setLocalReveal((v) => !v);
  };

  const eyeButton = canReveal && (
    <IconButton
      size={iconSize}
      onClick={toggleReveal}
      aria-label={hidden ? 'Mostrar saldo' : 'Ocultar saldo'}
      sx={{ p: 0.5 }}
    >
      {hidden ? (
        <Visibility fontSize={iconSize === 'small' ? 'inherit' : 'medium'} />
      ) : (
        <VisibilityOff fontSize={iconSize === 'small' ? 'inherit' : 'medium'} />
      )}
    </IconButton>
  );

  return (
    <Box sx={{ display: 'block', ...sx }}>
      <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5 }}>
        <Typography component="span" variant={variant} fontWeight="bold" color={color}>
          {mainShown}
        </Typography>
        {eyeButton}
        {icon}
      </Box>
      {caption && (
        <Typography variant={captionVariant} color="text.secondary">
          {captionShown}
        </Typography>
      )}
    </Box>
  );
}