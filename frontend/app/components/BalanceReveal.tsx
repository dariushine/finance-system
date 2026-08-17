'use client';

import { useState, ReactNode } from 'react';
import { Typography, IconButton, Box, SxProps, Theme } from '@mui/material';
import { Visibility, VisibilityOff } from '@mui/icons-material';
import { useHideBalances, maskBalance, maskEquivalentAmount } from '../lib/hooks/useHideBalances';

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
  const captionShown = caption ? (hidden ? maskEquivalentAmount(caption) : caption) : ''; 

  const toggleReveal = (e: React.MouseEvent) => {
    // No dejar que el clic en el ojo active la tarjeta (navegación)
    e.stopPropagation();
    e.preventDefault();
    setLocalReveal((v) => !v);
  };

  const eyeButton = canReveal && (
    // OJO: CardActionArea renderiza un <button>, así que el icono debe ser un
    // <span> (con component="span") para evitar <button> anidado → error de hydration.
    <IconButton
      component="span"
      role="button"
      tabIndex={0}
      size={iconSize}
      onClick={toggleReveal}
      onKeyDown={(e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.stopPropagation();
          e.preventDefault();
          setLocalReveal((v) => !v);
        }
      }}
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
    <Box sx={{ display: 'block', width: '100%', ...sx }}>
      {/* Bloque independiente: evita que el caption (variant="caption" es inline)
          se pegue a la derecha del monto en las tarjetas del dashboard. */}
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, width: 'fit-content' }}>
        <Typography component="span" variant={variant} fontWeight="bold" color={color}>
          {mainShown}
        </Typography>
        {eyeButton}
        {icon}
      </Box>
      {caption && (
        <Box component="div" sx={{ display: 'block', width: '100%' }}>
          <Typography component="span" variant={captionVariant} color="text.secondary" sx={{ display: 'block' }}>
            {captionShown}
          </Typography>
        </Box>
      )}
    </Box>
  );
}