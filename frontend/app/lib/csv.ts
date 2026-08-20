// Utilidades compartidas de exportación CSV.
//
// Reglas aplicadas (consistente para todos los exports):
//  - Fecha en formato dd/MM/aaaa con ceros a la izquierda (03/05/2026).
//  - Celdas escapadas: se encierran entre comillas dobles, y toda comilla
//    interna se duplica ("...""). Soporta comas, saltos de línea y tildes.
//  - Se antepone un BOM (\uFEFF) para que Excel/hojas de cálculo abran las
//    tildes y caracteres especiales con la codificación correcta.
//  - Los encabezados se escriben SIN tildes ni ñ (evita corrupción de encoding).

/** Formatea "2026-03-05" como "05/03/2026" (dd/MM/yyyy con ceros). */
export function formatCSVDate(date?: string | null): string {
  if (!date) return '';
  const [y, m, d] = date.split('-');
  if (!y || !m || !d) return date;
  const pad = (n: string) => n.padStart(2, '0');
  return `${pad(d)}/${pad(m)}/${y}`;
}

/**
 * Combina fecha (dd/MM/yyyy) + hora (HH:MM si existe): "05/03/2026" o "05/03/2026 14:30".
 * `time` puede venir como "HH:MM", "HH:MM:SS" o null/undefined.
 */
export function formatCSVDateTime(date?: string | null, time?: string | null): string {
  const d = formatCSVDate(date);
  if (!d) return '';
  const t = time ? time.slice(0, 5) : '';
  return t ? `${d} ${t}` : d;
}

/** Escapa un valor para CSV (comillas, comas, saltos de línea, tabs). */
export function csvCell(value: unknown): string {
  if (value == null) return '';
  const s = String(value);
  if (s === '') return '';
  // Normaliza saltos de línea para que no rompan el CSV.
  const normalized = s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  return `"${normalized.replace(/"/g, '""')}"`;
}

/** Genera el contenido CSV completo (con BOM) a partir de encabezado + filas. */
export function buildCSV(header: string[], rows: unknown[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvCell).join(','));
  // BOM al inicio: hace que las tildes/ñ abran bien en Excel.
  return '\uFEFF' + lines.join('\n') + '\n';
}

/** Descarga el contenido CSV con un nombre de archivo dado. */
export function downloadCSV(filename: string, header: string[], rows: unknown[][]): void {
  const blob = new Blob([buildCSV(header, rows)], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
