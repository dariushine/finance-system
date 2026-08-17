'use client';

import { Box, Typography, Button } from '@mui/material';
import { ReactNode } from 'react';

interface EmptyStateProps {
  /** Título principal, p. ej. "No hay transacciones todavía" */
  title: string;
  /** Texto de apoyo que orienta al usuario */
  description?: string;
  /** Icono ilustrativo (grande, suave) */
  icon?: ReactNode;
  /** Acción opcional de "empezar" */
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Estado vacío amigable y consistente (mismo estilo que "Últimas transacciones").
 * Se usa en Transacciones y Exchanges cuando no hay registros, sobretodo en móvil.
 */
export default function EmptyState({
  title,
  description,
  icon,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <Box
      textAlign="center"
      py={6}
      px={2}
      display="flex"
      flexDirection="column"
      alignItems="center"
      gap={1}
    >
      {icon && (
        <Box
          sx={{
            width: 64,
            height: 64,
            borderRadius: '50%',
            bgcolor: 'action.hover',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            mb: 1,
          }}
        >
          {icon}
        </Box>
      )}
      <Typography variant="h6" color="text.primary">
        {title}
      </Typography>
      {description && (
        <Typography variant="body2" color="text.secondary" maxWidth={320}>
          {description}
        </Typography>
      )}
      {actionLabel && onAction && (
        <Button variant="contained" onClick={onAction} sx={{ mt: 1 }}>
          {actionLabel}
        </Button>
      )}
    </Box>
  );
}
