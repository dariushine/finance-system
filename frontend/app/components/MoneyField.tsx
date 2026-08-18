'use client';

import { useEffect, useState } from 'react';
import { TextField } from '@mui/material';
import { useNumberFormat } from '../lib/NumberFormat';

interface MoneyFieldProps {
  label?: string;
  /** Monto en unidades (centavos = value*100). */
  value: number;
  onValueChange: (n: number) => void;
  currency?: string;
  required?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  fullWidth?: boolean;
  helperText?: string;
  /** Texto de ayuda mostrado SOLO cuando el valor es 0 (sugiere que empiece desde los decimales). */
}

/**
 * Campo de monto estilo banca: los dígitos "entran" desde los decimales.
 * - Empieza en 0,00. Escribir 5 → 0,05 · 0 → 0,50 · 3 → 5,03 · 5 → 50,35.
 * - Se muestran separadores según la preferencia (coma o punto).
 * - Backspace borra el último dígito.
 * - Solo se aceptan dígitos: teclado y pegado (letras/símbolos se ignoran).
 */
export default function MoneyField({
  label,
  value,
  onValueChange,
  currency,
  required,
  disabled,
  autoFocus,
  fullWidth,
  helperText,
}: MoneyFieldProps) {
  const { formatNumber } = useNumberFormat();
  // Monto en centavos (entero), como el "buffer" oculto del teclado bancario.
  const [cents, setCents] = useState<number>(() => Math.round((value || 0) * 100));

  // Sincronizar cuando el valor cambia desde afuera (prefill de edición o reset).
  useEffect(() => {
    const fromProp = Math.round((value || 0) * 100);
    setCents((c) => (c === fromProp ? c : fromProp));
  }, [value]);

  const commit = (newCents: number) => {
    setCents(newCents);
    onValueChange(newCents / 100);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Atajos de edición y navegación se dejan pasar (copiar, pegar, seleccionar, tab, flechas, enter).
    if (e.ctrlKey || e.metaKey) return;
    if (['Tab', 'Enter', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;

    if (e.key === 'Backspace') {
      e.preventDefault();
      commit(Math.floor(cents / 10));
      return;
    }

    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      const next = cents * 10 + Number(e.key);
      if (next <= 999999999999) commit(next); // límite de 12 dígitos en centavos
      return;
    }

    // Cualquier otra tecla (letras, signos, espacios, coma/punto decimal) se ignora.
    e.preventDefault();
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 12);
    if (digits) commit(Math.min(Number(digits), 999999999999));
    // Si no hay dígitos (ej. pegar texto con solo letras), el valor no cambia.
  };

  return (
    <TextField
      label={label}
      value={formatNumber(cents / 100)}
      onChange={() => {}}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      inputMode="numeric"
      required={required}
      disabled={disabled}
      autoFocus={autoFocus}
      fullWidth={fullWidth}
      helperText={helperText}
      InputProps={{
        endAdornment: currency ? <span>{currency}</span> : undefined,
      }}
    />
  );
}