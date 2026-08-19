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
  const { formatNumber } = useNumberFormat();
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
  // (no dígito a dígito) y reemplaza todo el campo.
  // Clave: SIEMPRE el último separador (coma o punto) es el decimal si va seguido
  // de 1-2 dígitos, sin importar el separador configurado — porque a veces se copia
  // de un sitio que usa punto y a veces de uno que usa coma.
  //   '2000'          → 200000 (2000,00)
  //   '10,000,000,50' → toma el ',50' como decimales → 10000000,50
  //   '2.000.000,50'  → toma el ',50' → 2000000,50
  //   '1000.5'        → toma el '.5' → 1000,50
  //   '500'           → 500,00
  const parseToCents = (raw: string): number => {
    let s = raw.trim();
    if (!s) return 0;
    // Si el texto termina en [.,] + 1-2 dígitos, ese es el separador decimal real.
    const m = s.match(/([.,])(\d{1,2})$/);
    if (m && m.index !== undefined) {
      // Quitar TODOS los demás separadores de la parte entera y usar '.' como decimal.
      const intPart = s.slice(0, m.index).replace(/[.,]/g, '');
      s = intPart + '.' + m[2];
    } else {
      // Sin decimales finales: todos los separadores son de miles → se eliminan.
      s = s.replace(/[.,]/g, '');
    }
    const num = parseFloat(s);
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
      slotProps={{
        htmlInput: { inputMode: 'numeric' }, // los atributos del <input> nativo van por htmlInput
      }}
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