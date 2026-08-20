import ExcelJS from 'exceljs';

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

/*
 * ===== Export XLSX (con exceljs) =====
 * Los encabezados aquí SÍ pueden llevar tildes/ñ (XLSX es un formato binario
 * con codificación correcta, a diferencia del CSV en crudo).
 */

const XLSX_HEADER_STYLE = {
  font: { bold: true, color: { argb: 'FFFFFFFF' } },
  fill: { type: 'pattern' as const, pattern: 'solid' as const, fgColor: { argb: 'FF455A64' } },
  alignment: { vertical: 'middle' as const },
};

/** Descarga un archivo XLSX a partir del encabezado + filas. */
export async function downloadXLSX(
  filename: string,
  sheetName: string,
  header: string[],
  rows: unknown[][],
  numberColumns: number[] = []
): Promise<void> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Finance App';
  const ws = wb.addWorksheet(sheetName);

  const headerRow = ws.addRow(header);
  headerRow.eachCell((cell) => {
    cell.font = XLSX_HEADER_STYLE.font;
    cell.fill = XLSX_HEADER_STYLE.fill as any;
    cell.alignment = XLSX_HEADER_STYLE.alignment;
  });

  rows.forEach((r) => {
    ws.addRow(r);
  });

  // Formatea como número las columnas indicadas (montos/fechas numéricas).
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // encabezado
    numberColumns.forEach((colIdx) => {
      const cell = row.getCell(colIdx);
      if (cell.value !== '' && cell.value != null && typeof cell.value !== 'number') {
        const n = Number(String(cell.value));
        if (Number.isFinite(n)) cell.value = n;
      }
    });
  });

  // Ajuste de ancho de columnas.
  header.forEach((_, i) => {
    const col = ws.getColumn(i + 1);
    let maxLen = header[i].length;
    ws.eachRow((row) => {
      const v = row.getCell(i + 1).value;
      if (v != null) maxLen = Math.max(maxLen, String(v).length);
    });
    col.width = Math.min(Math.max(maxLen + 2, 8), 40);
  });

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
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
