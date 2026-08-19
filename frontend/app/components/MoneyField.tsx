'use client';

import { useEffect, useRef, useState } from 'react';
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
  const { formatNumber, separator } = useNumberFormat();
  // Monto en centavos (entero), como el "buffer" oculto del teclado bancario.
  const [cents, setCents] = useState<number>(() => Math.round((value || 0) * 100));
  const inputRef = useRef<HTMLInputElement>(null);
  const pastingRef = useRef(false);

  // Sincronizar cuando el valor cambia desde afuera (prefill de edición o reset).
  useEffect(() => {
    const fromProp = Math.round((value || 0) * 100);
    setCents((c) => (c === fromProp ? c : fromProp));
  }, [value]);

  const commit = (newCents: number) => {
    setCents(newCents);
    onValueChange(newCents / 100);
  };

  // El caret SIEMPRE va al final (último dígito). Así tipear y pegar es determinista:
  // nunca depende de en qué parte del 0,00 haces clic o dónde inserta el navegador.
  const forceCaretEnd = () => {
    const el = inputRef.current;
    if (el && document.activeElement === el) {
      const len = el.value.length;
      el.setSelectionRange(len, len);
    }
  };

  // Tras cada re-render del valor, devolvemos el caret al final.
  useEffect(() => {
    forceCaretEnd();
  }, [cents]);

  // Texto escrito (teclado físico o virtual): el caret ya está al final, así que
  // los dígitos que quedan tras quitar separadores son el buffer completo correcto.
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Si viene de un pegado, lo maneja onPaste (full replace); no lo procesemos aquí.
    if (pastingRef.current) return;
    const digits = e.target.value.replace(/\D/g, '').slice(0, 12); // límite de 12 dígitos en centavos
    commit(Math.min(digits ? Number(digits) : 0, 999999999999));
    forceCaretEnd();
  };

  // Convierte un texto pegado a centavos, interpretándolo como un VALOR real
  // (no como dígitos estilo banca). Respeta el separador de decimales elegido.
  // - '2000'      → 200000 centavos (2000,00)   [antes daba 20,00]
  // - '2000,50'   → 200050 (comma) / '2,000.50' → 200050 (dot)
  // - '2.000'     → 200000 (comma: el punto es miles) / '2,000' → 200000 (dot)
  const parseToCents = (raw: string): number => {
    let s = raw.trim();
    if (!s) return 0;
    let normalized: string;
    if (separator === 'comma') {
      // decimal = coma, miles = punto → '2.000,50' → quitar puntos, coma→punto
      normalized = s.replace(/\./g, '').replace(',', '.');
    } else {
      // decimal = punto, miles = coma → '2,000.50' → quitar comas
      normalized = s.replace(/,/g, '');
    }
    const num = parseFloat(normalized);
    if (!Number.isFinite(num) || num < 0) return 0;
    return Math.round(num * 100);
  };

  // Pegar un monto: se interpreta como valor completo (no dígito a dígito) y reemplaza
  // todo el campo, sin depender del cursor. La bandera pastingRef evita que el onChange
  // posterior doble-procese (comportamiento del navegador móvil si no cancela del todo).
  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    pastingRef.current = true;
    commit(parseToCents(e.clipboardData.getData('text')));
    // Restablecer tras el ciclo de render para no bloquear el siguiente tipeo.
    setTimeout(() => { pastingRef.current = false; forceCaretEnd(); }, 0);
  };

  return (
    <TextField
      label={label}
      value={formatNumber(cents / 100)}
      onChange={handleChange}
      onPaste={handlePaste}
      onClick={forceCaretEnd}
      onFocus={forceCaretEnd}
      inputRef={inputRef}
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