// Utilidades de fecha para el frontend.
//
// El backend guarda las fechas como "YYYY-MM-DD" (fecha pura, sin zona horaria).
// Al hacer `new Date("2026-08-14")` JavaScript la interpreta como MEDIANOCHE UTC,
// y al formatearla en una zona local al oeste de UTC (ej: Venezuela, UTC-4) se
// recorre UN DÍA ATRÁS → muestra el 13 en vez del 14.
//
// La solución es construir el Date usando los componentes de la fecha en zona
// local (año, mes, día) en vez de dejar que el parser la interprete como UTC.

/** Convierte "YYYY-MM-DD" a un Date local SIN desviarse de día. */
export function parseLocalDate(dateString: string): Date {
  const [y, m, d] = dateString.split('-').map(Number);
  // new Date(y, m-1, d) crea la medianoche en hora LOCAL → sin corrimiento.
  return new Date(y, (m || 1) - 1, d || 1);
}

/** Formatea "YYYY-MM-DD" como fecha local legible (ej: jueves, 14 de agosto de 2026). */
export function formatLocalDate(dateString: string, opts?: Intl.DateTimeFormatOptions): string {
  if (!dateString) return '—';
  return parseLocalDate(dateString).toLocaleDateString('es-VE', opts);
}
