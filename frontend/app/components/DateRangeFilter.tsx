'use client';

import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Select,
  TextField,
} from '@mui/material';

export const PERIODS = [
  { value: 'day', label: 'Hoy' },
  { value: 'week', label: 'Semana' },
  { value: 'month', label: 'Mes' },
  { value: '3m', label: 'Últimos 3 meses' },
  { value: 'year', label: 'Año' },
  { value: 'all', label: 'Todo' },
  { value: 'custom', label: 'Rango personalizado' },
];

type Period = string;

interface Props {
  value: Period;
  onChange: (value: Period) => void;
  from: string;
  to: string;
  onRangeChange: (from: string, to: string) => void;
  onApply: () => void;
}

/**
 * Filtro de período / rango de fechas reutilizable.
 * - Presets (Hoy, Semana, Mes, ...) o "Rango personalizado".
 * - Los selectores de fecha solo aparecen en modo custom.
 * - El botón "Aplicar" solo se habilita en modo custom con ambas fechas.
 */
export default function DateRangeFilter({
  value,
  onChange,
  from,
  to,
  onRangeChange,
  onApply,
}: Props) {
  return (
    <Box display="flex" gap={1} flexWrap="wrap" alignItems="center">
      <FormControl size="small" sx={{ minWidth: { xs: 130, sm: 180 } }}>
        <InputLabel>Período</InputLabel>
        <Select
          value={value}
          label="Período"
          onChange={(e) => onChange(e.target.value as string)}
        >
          {PERIODS.map((p) => (
            <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>
          ))}
        </Select>
      </FormControl>
      {value !== 'custom' && (
        <Button size="small" onClick={onApply}>
          Aplicar
        </Button>
      )}
      {value === 'custom' && (
        <Box display="flex" gap={0.5} alignItems="center" flexWrap="wrap">
          <TextField
            size="small"
            type="date"
            label="Desde"
            value={from}
            onChange={(e) => onRangeChange(e.target.value, to)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            size="small"
            type="date"
            label="Hasta"
            value={to}
            onChange={(e) => onRangeChange(from, e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Button variant="contained" onClick={onApply} disabled={!from || !to}>
            Aplicar
          </Button>
        </Box>
      )}
    </Box>
  );
}
