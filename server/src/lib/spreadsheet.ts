import multer from 'multer';
import ExcelJS from 'exceljs';

/** Shared upload config for spreadsheet imports (.xlsx / .csv, ≤ 5 MB, memory). */
export const spreadsheetUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|csv)$/i.test(file.originalname)
      || /spreadsheet|excel|csv/.test(file.mimetype);
    cb(null, ok);
  },
});

/** Minimal RFC-4180-ish CSV parser (quotes, escaped quotes, BOM, CRLF). */
function parseCsvRows(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim() !== '');
  if (lines.length < 2) return [];
  const parseLine = (line: string): string[] => {
    const out: string[] = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; } else cur += ch;
      } else if (ch === '"') inQuotes = true;
      else if (ch === ',') { out.push(cur); cur = ''; }
      else cur += ch;
    }
    out.push(cur);
    return out.map((s) => s.trim());
  };
  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = parseLine(line);
    return Object.fromEntries(headers.map((h, i) => [h, cells[i] ?? '']));
  });
}

/**
 * Parse an uploaded .xlsx (first worksheet) or .csv into records keyed by the
 * header row (row 1). Excel dates become YYYY-MM-DD strings. Empty rows skipped.
 */
export async function parseSpreadsheetFile(file: Express.Multer.File): Promise<Record<string, string>[]> {
  if (/\.csv$/i.test(file.originalname) || file.mimetype === 'text/csv') {
    return parseCsvRows(file.buffer.toString('utf8'));
  }
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(file.buffer as unknown as ExcelJS.Buffer);
  const ws = wb.worksheets[0];
  if (!ws) return [];
  const headers = (ws.getRow(1).values as unknown[]).slice(1).map((v) => String(v ?? ''));
  const rows: Record<string, string>[] = [];
  ws.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const rec: Record<string, string> = {};
    let empty = true;
    row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const header = headers[colNumber - 1];
      if (!header) return;
      const v = cell.value;
      let text: string;
      if (v instanceof Date) text = v.toISOString().slice(0, 10);
      else if (v && typeof v === 'object' && 'result' in (v as object)) text = String((v as ExcelJS.CellFormulaValue).result ?? '');
      else text = cell.text;
      text = String(text).trim();
      if (text) empty = false;
      rec[header] = text;
    });
    if (!empty) rows.push(rec);
  });
  return rows;
}
