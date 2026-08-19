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

  // Lee los dígitos del texto escrito. Funciona igual con teclado físico Y virtual
  // (Gboard/Android/iOS), porque usa onChange real en vez de interceptar keydown.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Quedarse solo con los dígitos: omite separadores, letras, signos y la coma/punto decimal.
    const digits = e.target.value.replace(/\D/g, '').slice(0, 12); // límite de 12 dígitos en centavos
    commit(Math.min(digits ? Number(digits) : 0, 999999999999));
  };

  // El pegado también lo maneja onChange (el evento paste nativo ya inserta el texto
  // y luego onChange le quita lo que no sean dígitos). Solo filtramos aquí por claridad.
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 12);
    commit(Math.min(digits ? Number(digits) : 0, 999999999999));
  };

  return (
    <TextField
      label={label}
      value={formatNumber(cents / 100)}
      onChange={handleChange}
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