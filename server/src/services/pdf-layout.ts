/**
 * Classic official-document PDF layout — navy & gold "certificate" style.
 *
 * This module is deliberately DB-free. Layout functions build a pure display
 * list of drawing ops (`PdfPage[]`) from plain data, so all pagination
 * decisions (the class of bugs that used to drop the footer on continuation
 * pages, or let remarks collide with the signature block) are unit-testable
 * without Prisma or any I/O. Only `renderPagesToPdf` touches PDFKit, and it
 * executes the ops verbatim.
 */
import PDFDocument from 'pdfkit';

export const PAGE = { width: 595.28, height: 841.89 }; // A4 portrait, pt
export const MARGIN = 46;
export const CONTENT_W = PAGE.width - MARGIN * 2;
export const FOOTER_H = 30;
/** Lowest y a content op may reach — keeps everything clear of the footer band. */
export const CONTENT_BOTTOM = PAGE.height - FOOTER_H - 12;
/** Top of the content area on continuation pages (below the slim band). */
export const CONTINUATION_TOP = 26;

export const COLOR = {
  navy: '#1c3557',
  gold: '#b8933d',
  ink: '#232a33',
  muted: '#5f6b78',
  hairline: '#d9dee4',
  zebra: '#f5f6f8',
  footerText: '#c9d4e6',
  goldSoft: '#e8dfc8',
} as const;

export const FONT = {
  serif: 'Times-Roman',
  serifBold: 'Times-Bold',
  serifItalic: 'Times-Italic',
  sans: 'Helvetica',
  sansBold: 'Helvetica-Bold',
} as const;
export type FontName = (typeof FONT)[keyof typeof FONT];

// ────────────────────────────── Display list ───────────────────────────────

export interface RectOp { kind: 'rect'; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; lineWidth?: number }
export interface LineOp { kind: 'line'; x1: number; y1: number; x2: number; y2: number; color: string; width: number }
export interface TextOp { kind: 'text'; text: string; x: number; y: number; width: number; align: 'left' | 'center' | 'right'; size: number; font: FontName; color: string; charSpacing?: number }
export interface ImageOp { kind: 'image'; data: Buffer; x: number; y: number; fit: [number, number] }
export interface CircleOp { kind: 'circle'; cx: number; cy: number; r: number; fill?: string; stroke?: string; lineWidth?: number }
export type DrawOp = RectOp | LineOp | TextOp | ImageOp | CircleOp;

export interface PdfPage { ops: DrawOp[] }

// ──────────────────────────────── Inputs ───────────────────────────────────

export interface SchoolBrand { name: string; motto: string; badge: Buffer | null }
export interface LegendBand { letter: string; minScore: number; maxScore: number; remark: string }
export interface SignatureSlot { title: string; name: string; png: Buffer | null; /** Printed above the line like a filled-in signature (used for the date). */ prefill?: string }
export interface QrPanel { image: Buffer; caption: string; sub: string }
export interface TableColumn { label: string; width: number; align?: 'left' | 'center' | 'right' }

export interface ReportCardInput {
  school: SchoolBrand;
  docTitle: string;      // e.g. 'Official Student Report Card'
  docSubtitle: string;   // e.g. 'Term 1 · Academic Year 2025/2026'
  details: [string, string][];
  summary: { label: string; value: string }[];
  resultsTitle: string;
  columns: TableColumn[];
  rows: string[][];
  gradeCol?: number;
  legend: LegendBand[];
  remarks: { title: string; body: string }[];
  signatures: (SignatureSlot | null)[];
  qr: QrPanel;
  footerNote: string;
}

export interface TranscriptInput {
  school: SchoolBrand;
  docTitle: string;
  docSubtitle: string;
  details: [string, string][];
  summary: { label: string; value: string }[];
  columns: TableColumn[];
  terms: { heading: string; meta: string; rows: string[][] }[];
  gradeCol?: number;
  cgpaLabel: string;
  legend: LegendBand[];
  signatures: (SignatureSlot | null)[];
  qr: QrPanel;
  footerNote: string;
}

// ─────────────────────── Text estimation & wrapping ────────────────────────

/** Average glyph width as a fraction of font size (Times/Helvetica core fonts). */
const AVG_W: Record<string, number> = {
  'Times-Roman': 0.48, 'Times-Bold': 0.5, 'Times-Italic': 0.48,
  Helvetica: 0.53, 'Helvetica-Bold': 0.55,
};

export function estimateWidth(text: string, size: number, font: FontName): number {
  return text.length * size * (AVG_W[font] ?? 0.5);
}

/** Greedy word wrap with a hard line cap; the last line is ellipsised on overflow. */
export function wrapText(text: string, size: number, font: FontName, maxW: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['—'];
  const lines: string[] = [];
  let cur = words[0];
  let i = 1;
  while (i < words.length) {
    const next = `${cur} ${words[i]}`;
    if (estimateWidth(next, size, font) <= maxW) { cur = next; i += 1; continue; }
    lines.push(cur);
    cur = words[i];
    i += 1;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines) {
    lines.push(cur);
    return lines;
  }
  // Overflowed the line cap — ellipsise the final line.
  let last = lines[maxLines - 1];
  while (last.length > 1 && estimateWidth(`${last}…`, size, font) > maxW) last = last.slice(0, -1).trimEnd();
  lines[maxLines - 1] = `${last}…`;
  return lines;
}

/** "90–100" style range from a grade band, flooring fractional maxima (89.99 → 89). */
export function bandRange(b: LegendBand): string {
  const hi = b.maxScore >= 100 ? 100 : Math.floor(b.maxScore);
  return `${Math.round(b.minScore)}–${hi}`;
}

// ─────────────────────────────── Builder ───────────────────────────────────

export class LayoutBuilder {
  readonly pages: PdfPage[] = [{ ops: [] }];
  y = 0;
  /** Drawn at the top of every continuation page (slim navy + gold band). */
  onNewPage: ((b: LayoutBuilder) => void) | null = null;

  private get page(): PdfPage { return this.pages[this.pages.length - 1]; }

  emit(op: DrawOp): void { this.page.ops.push(op); }

  startNewPage(): void {
    this.pages.push({ ops: [] });
    this.y = CONTINUATION_TOP;
    this.onNewPage?.(this);
  }

  /** Pagination guard: if `needed` points don't fit above the footer, break the page first. */
  ensureSpace(needed: number): void {
    if (this.y + needed > CONTENT_BOTTOM) this.startNewPage();
  }
}

function continuationBand(b: LayoutBuilder): void {
  b.emit({ kind: 'rect', x: 0, y: 0, w: PAGE.width, h: 6, fill: COLOR.navy });
  b.emit({ kind: 'rect', x: 0, y: 6, w: PAGE.width, h: 1.6, fill: COLOR.gold });
}

// ───────────────────────────── Page sections ───────────────────────────────

/** Certificate header: navy band + gold rule, crest in a gold ring, serif name,
 *  italic motto, navy/gold double rule, letter-spaced document title. */
export function drawCertificateHeader(b: LayoutBuilder, school: SchoolBrand, title: string, subtitle: string): void {
  b.emit({ kind: 'rect', x: 0, y: 0, w: PAGE.width, h: 9, fill: COLOR.navy });
  b.emit({ kind: 'rect', x: 0, y: 9, w: PAGE.width, h: 2, fill: COLOR.gold });

  let nameY = 34;
  if (school.badge) {
    const cy = 46;
    const r = 24;
    b.emit({ kind: 'circle', cx: PAGE.width / 2, cy, r, fill: '#ffffff', stroke: COLOR.gold, lineWidth: 1.8 });
    b.emit({ kind: 'circle', cx: PAGE.width / 2, cy, r: r - 3, stroke: COLOR.navy, lineWidth: 0.8 });
    b.emit({ kind: 'image', data: school.badge, x: PAGE.width / 2 - 18, y: cy - 18, fit: [36, 36] });
    nameY = cy + r + 9;
  }

  b.emit({ kind: 'text', text: school.name, x: MARGIN, y: nameY, width: CONTENT_W, align: 'center', size: 19, font: FONT.serifBold, color: COLOR.navy, charSpacing: 1 });
  let y = nameY + 25;
  if (school.motto) {
    b.emit({ kind: 'text', text: `“${school.motto}”`, x: MARGIN, y, width: CONTENT_W, align: 'center', size: 9.5, font: FONT.serifItalic, color: COLOR.gold });
    y += 15;
  }
  // Navy + gold double rule
  b.emit({ kind: 'line', x1: MARGIN, y1: y, x2: PAGE.width - MARGIN, y2: y, color: COLOR.navy, width: 2 });
  b.emit({ kind: 'line', x1: MARGIN, y1: y + 3.6, x2: PAGE.width - MARGIN, y2: y + 3.6, color: COLOR.gold, width: 0.9 });
  // Letter-spaced document title + term/year subtitle
  b.emit({ kind: 'text', text: title.toUpperCase(), x: MARGIN, y: y + 12, width: CONTENT_W, align: 'center', size: 12, font: FONT.serifBold, color: COLOR.navy, charSpacing: 3 });
  b.emit({ kind: 'text', text: subtitle, x: MARGIN, y: y + 29, width: CONTENT_W, align: 'center', size: 9.5, font: FONT.serifItalic, color: COLOR.muted });
  b.y = y + 46;
}

/** Formal details grid: navy-edged bordered label/value cells. */
export function drawDetailsGrid(b: LayoutBuilder, pairs: [string, string][]): void {
  const cols = 4;
  const rows = Math.ceil(pairs.length / cols);
  const cellH = 30;
  b.ensureSpace(rows * cellH);
  const top = b.y;
  const cellW = CONTENT_W / cols;

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const pair = pairs[r * cols + c];
      const x = MARGIN + c * cellW;
      const y = top + r * cellH;
      b.emit({ kind: 'rect', x, y, w: cellW, h: cellH, stroke: COLOR.hairline, lineWidth: 0.6 });
      if (pair) {
        b.emit({ kind: 'text', text: pair[0].toUpperCase(), x: x + 7, y: y + 5.5, width: cellW - 14, align: 'left', size: 6.3, font: FONT.sansBold, color: COLOR.navy, charSpacing: 0.5 });
        b.emit({ kind: 'text', text: pair[1], x: x + 7, y: y + 16, width: cellW - 14, align: 'left', size: 10, font: FONT.serifBold, color: COLOR.ink });
      }
    }
  }
  b.emit({ kind: 'rect', x: MARGIN, y: top, w: CONTENT_W, h: rows * cellH, stroke: COLOR.navy, lineWidth: 1.2 });
  b.y = top + rows * cellH + 12;
}

/** Navy summary band with gold dividers (GPA / Average / Class Position …). */
export function drawSummaryBand(b: LayoutBuilder, items: { label: string; value: string }[]): void {
  const h = 34;
  b.ensureSpace(h + 6);
  const top = b.y;
  const cellW = CONTENT_W / items.length;
  b.emit({ kind: 'rect', x: MARGIN, y: top, w: CONTENT_W, h, fill: COLOR.navy });
  items.forEach((item, i) => {
    const x = MARGIN + i * cellW;
    if (i > 0) {
      b.emit({ kind: 'line', x1: x, y1: top + 6, x2: x, y2: top + h - 6, color: COLOR.gold, width: 0.9 });
    }
    b.emit({ kind: 'text', text: item.label.toUpperCase(), x: x + 4, y: top + 6, width: cellW - 8, align: 'center', size: 6.6, font: FONT.sansBold, color: COLOR.footerText, charSpacing: 1 });
    b.emit({ kind: 'text', text: item.value, x: x + 4, y: top + 15.5, width: cellW - 8, align: 'center', size: 13.5, font: FONT.serifBold, color: '#ffffff' });
  });
  b.y = top + h + 12;
}

function drawSectionHeading(b: LayoutBuilder, title: string): void {
  b.ensureSpace(24);
  b.emit({ kind: 'text', text: title.toUpperCase(), x: MARGIN, y: b.y, width: CONTENT_W, align: 'left', size: 9, font: FONT.serifBold, color: COLOR.navy, charSpacing: 1.8 });
  b.emit({ kind: 'line', x1: MARGIN, y1: b.y + 12, x2: MARGIN + 42, y2: b.y + 12, color: COLOR.gold, width: 1.1 });
  b.y += 18;
}

const HEADER_H = 18;
const GOLD_RULE = 1.4;
const ROW_H = 17.5;

/** Ruled results table: navy header with gold underline, hairline row
 *  separators, subtle zebra, grades set in bold navy (no pills). Re-emits the
 *  header after every page break. */
export function drawRuledTable(
  b: LayoutBuilder,
  columns: TableColumn[],
  rows: string[][],
  gradeCol?: number,
  tailPad = 10,
): void {
  const emitHeader = () => {
    const y = b.y;
    b.emit({ kind: 'rect', x: MARGIN, y, w: CONTENT_W, h: HEADER_H, fill: COLOR.navy });
    b.emit({ kind: 'rect', x: MARGIN, y: y + HEADER_H, w: CONTENT_W, h: GOLD_RULE, fill: COLOR.gold });
    b.emit({ kind: 'line', x1: MARGIN, y1: y, x2: MARGIN, y2: y + HEADER_H, color: COLOR.navy, width: 0.8 });
    b.emit({ kind: 'line', x1: PAGE.width - MARGIN, y1: y, x2: PAGE.width - MARGIN, y2: y + HEADER_H, color: COLOR.navy, width: 0.8 });
    let hx = MARGIN;
    for (const col of columns) {
      b.emit({ kind: 'text', text: col.label.toUpperCase(), x: hx + 5, y: y + 5.5, width: col.width - 10, align: col.align ?? 'left', size: 7.2, font: FONT.sansBold, color: '#ffffff', charSpacing: 0.5 });
      hx += col.width;
    }
    b.y = y + HEADER_H + GOLD_RULE;
  };

  b.ensureSpace(HEADER_H + GOLD_RULE + ROW_H);
  emitHeader();

  rows.forEach((row, i) => {
    if (b.y + ROW_H > CONTENT_BOTTOM) {
      b.startNewPage();
      emitHeader();
    }
    const y = b.y;
    if (i % 2 === 0) {
      b.emit({ kind: 'rect', x: MARGIN, y, w: CONTENT_W, h: ROW_H, fill: COLOR.zebra });
    }
    let cx = MARGIN;
    row.forEach((cell, ci) => {
      const col = columns[ci];
      if (ci === gradeCol) {
        // Grade set in bold navy ink — no pastel pill.
        b.emit({ kind: 'text', text: cell, x: cx + 5, y: y + 4.4, width: col.width - 10, align: col.align ?? 'left', size: 9.5, font: FONT.serifBold, color: COLOR.navy });
      } else {
        const isKey = ci <= 1;
        b.emit({
          kind: 'text', text: cell, x: cx + 5, y: y + 4.6, width: col.width - 10,
          align: col.align ?? 'left', size: ci === 0 ? 8 : 9,
          font: isKey ? FONT.serifBold : FONT.serif, color: ci === row.length - 1 && !isKey ? COLOR.muted : COLOR.ink,
        });
      }
      cx += col.width;
    });
    // Hairline row separator + frame sides
    b.emit({ kind: 'line', x1: MARGIN, y1: y + ROW_H, x2: PAGE.width - MARGIN, y2: y + ROW_H, color: COLOR.hairline, width: 0.5 });
    b.emit({ kind: 'line', x1: MARGIN, y1: y, x2: MARGIN, y2: y + ROW_H, color: COLOR.hairline, width: 0.5 });
    b.emit({ kind: 'line', x1: PAGE.width - MARGIN, y1: y, x2: PAGE.width - MARGIN, y2: y + ROW_H, color: COLOR.hairline, width: 0.5 });
    b.y = y + ROW_H;
  });

  b.emit({ kind: 'line', x1: MARGIN, y1: b.y, x2: PAGE.width - MARGIN, y2: b.y, color: COLOR.navy, width: 0.9 });
  b.y += tailPad;
}

/** Grading-scale legend compiled from the active grade scale, kept whole. */
export function drawLegend(b: LayoutBuilder, bands: LegendBand[]): void {
  if (bands.length === 0) return;
  const perRow = 6;
  const rows = Math.ceil(bands.length / perRow);
  const titleH = 13;
  const rowH = 21;
  b.ensureSpace(titleH + rows * rowH + 8);

  b.emit({ kind: 'text', text: 'GRADING SCALE', x: MARGIN, y: b.y, width: CONTENT_W, align: 'left', size: 7.2, font: FONT.sansBold, color: COLOR.muted, charSpacing: 1.4 });
  const top = b.y + titleH;
  const cellW = CONTENT_W / Math.min(bands.length, perRow);
  bands.forEach((band, i) => {
    const r = Math.floor(i / perRow);
    const c = i % perRow;
    const x = MARGIN + c * cellW;
    const y = top + r * rowH;
    b.emit({ kind: 'rect', x, y, w: cellW, h: rowH, stroke: COLOR.hairline, lineWidth: 0.5 });
    b.emit({ kind: 'text', text: band.letter, x, y: y + 3.5, width: cellW, align: 'center', size: 8.5, font: FONT.serifBold, color: COLOR.navy });
    b.emit({ kind: 'text', text: `${bandRange(band)} · ${band.remark}`, x, y: y + 12.5, width: cellW, align: 'center', size: 6.3, font: FONT.sans, color: COLOR.muted });
  });
  b.y = top + rows * rowH + 10;
}

/** Bordered remarks block (classical frame, serif body, capped at 4 lines). */
export function drawRemarksBlock(b: LayoutBuilder, title: string, body: string): void {
  const lines = wrapText(body || '—', 9.3, FONT.serif, CONTENT_W - 22, 4);
  const h = 17 + lines.length * 11 + 7;
  b.ensureSpace(h);
  const top = b.y;
  b.emit({ kind: 'rect', x: MARGIN, y: top, w: CONTENT_W, h, stroke: COLOR.hairline, lineWidth: 0.8 });
  b.emit({ kind: 'text', text: title.toUpperCase(), x: MARGIN + 11, y: top + 6, width: CONTENT_W - 22, align: 'left', size: 7.2, font: FONT.sansBold, color: COLOR.navy, charSpacing: 0.9 });
  lines.forEach((line, i) => {
    b.emit({ kind: 'text', text: line, x: MARGIN + 11, y: top + 17 + i * 11, width: CONTENT_W - 22, align: 'left', size: 9.3, font: FONT.serif, color: COLOR.ink });
  });
  b.y = top + h + 8;
}

/** Signature lines (with optional scanned PNGs / prefilled values) + a bordered
 *  QR verification panel. Kept whole via a pagination guard so signatures can
 *  never collide with the remarks above. */
export function drawSignatureRow(b: LayoutBuilder, slots: (SignatureSlot | null)[], qr: QrPanel): void {
  const H = 96;
  b.ensureSpace(H);
  const top = b.y;
  const lineY = top + 50;
  const slotW = 168;
  const gap = 26;

  slots.forEach((sig, i) => {
    const x = MARGIN + i * (slotW + gap);
    if (sig?.png) {
      b.emit({ kind: 'image', data: sig.png, x: x + 14, y: lineY - 36, fit: [slotW - 28, 34] });
    } else if (sig?.prefill) {
      b.emit({ kind: 'text', text: sig.prefill, x, y: lineY - 14, width: slotW, align: 'left', size: 10.5, font: FONT.serif, color: COLOR.ink });
    }
    b.emit({ kind: 'line', x1: x, y1: lineY, x2: x + slotW, y2: lineY, color: '#8a94a0', width: 0.9 });
    if (sig) {
      b.emit({ kind: 'text', text: sig.title.toUpperCase(), x, y: lineY + 5, width: slotW, align: 'left', size: 7.6, font: FONT.sansBold, color: COLOR.ink, charSpacing: 0.6 });
      if (sig.name) {
        b.emit({ kind: 'text', text: sig.name, x, y: lineY + 15.5, width: slotW, align: 'left', size: 8, font: FONT.serifItalic, color: COLOR.muted });
      }
    }
  });

  // Bordered QR verification panel
  const qx = PAGE.width - MARGIN - 78;
  b.emit({ kind: 'rect', x: qx, y: top + 2, w: 78, h: 90, stroke: COLOR.hairline, lineWidth: 0.8 });
  b.emit({ kind: 'image', data: qr.image, x: qx + 9, y: top + 8, fit: [60, 60] });
  b.emit({ kind: 'text', text: qr.caption.toUpperCase(), x: qx, y: top + 74, width: 78, align: 'center', size: 5.8, font: FONT.sansBold, color: COLOR.muted, charSpacing: 0.8 });
  b.emit({ kind: 'text', text: qr.sub, x: qx, y: top + 82, width: 78, align: 'center', size: 6.4, font: FONT.sans, color: COLOR.muted });

  b.y = top + H;
}

/** Navy box with the cumulative GPA, guarded so it lands whole on one page. */
export function drawCgpaBox(b: LayoutBuilder, label: string): void {
  b.ensureSpace(40);
  const top = b.y + 2;
  b.emit({ kind: 'rect', x: MARGIN, y: top, w: CONTENT_W, h: 1.2, fill: COLOR.gold });
  b.emit({ kind: 'rect', x: MARGIN, y: top + 1.2, w: CONTENT_W, h: 26, fill: COLOR.navy });
  b.emit({ kind: 'rect', x: MARGIN, y: top + 27.2, w: CONTENT_W, h: 1.2, fill: COLOR.gold });
  b.emit({ kind: 'text', text: label, x: MARGIN, y: top + 9, width: CONTENT_W, align: 'center', size: 11.5, font: FONT.serifBold, color: '#ffffff', charSpacing: 1 });
  b.y = top + 28.4 + 12;
}

/** Page-numbered navy footer band on **every** page. Applied after layout, so
 *  continuation pages can never be left footered-out (regression guard). */
export function attachFooters(b: LayoutBuilder, note: string): void {
  const total = b.pages.length;
  b.pages.forEach((page, i) => {
    page.ops.push({ kind: 'rect', x: 0, y: PAGE.height - FOOTER_H - 1.6, w: PAGE.width, h: 1.6, fill: COLOR.gold });
    page.ops.push({ kind: 'rect', x: 0, y: PAGE.height - FOOTER_H, w: PAGE.width, h: FOOTER_H, fill: COLOR.navy });
    page.ops.push({ kind: 'text', text: note, x: MARGIN, y: PAGE.height - FOOTER_H + 10, width: CONTENT_W - 100, align: 'left', size: 7, font: FONT.sans, color: COLOR.footerText });
    page.ops.push({ kind: 'text', text: `Page ${i + 1} of ${total}`, x: PAGE.width - MARGIN - 92, y: PAGE.height - FOOTER_H + 10, width: 92, align: 'right', size: 7, font: FONT.sansBold, color: COLOR.goldSoft });
  });
}

// ─────────────────────────── Full page builders ────────────────────────────

export function buildReportCardPages(input: ReportCardInput): PdfPage[] {
  const b = new LayoutBuilder();
  b.onNewPage = continuationBand;

  drawCertificateHeader(b, input.school, input.docTitle, input.docSubtitle);
  drawDetailsGrid(b, input.details);
  drawSummaryBand(b, input.summary);
  drawSectionHeading(b, input.resultsTitle);
  drawRuledTable(b, input.columns, input.rows, input.gradeCol);
  drawLegend(b, input.legend);
  for (const r of input.remarks) drawRemarksBlock(b, r.title, r.body);
  drawSignatureRow(b, input.signatures, input.qr);

  attachFooters(b, input.footerNote);
  return b.pages;
}

function drawTermBlock(b: LayoutBuilder, columns: TableColumn[], gradeCol: number | undefined, term: { heading: string; meta: string; rows: string[][] }): void {
  const headH = 14;
  const metaH = 12;
  // Keep the term heading together with at least the table header + one row.
  b.ensureSpace(headH + metaH + HEADER_H + GOLD_RULE + ROW_H);
  b.emit({ kind: 'text', text: term.heading, x: MARGIN, y: b.y, width: CONTENT_W, align: 'left', size: 11, font: FONT.serifBold, color: COLOR.navy });
  b.emit({ kind: 'line', x1: MARGIN, y1: b.y + 13, x2: MARGIN + 34, y2: b.y + 13, color: COLOR.gold, width: 0.9 });
  b.y += headH + 2;
  b.emit({ kind: 'text', text: term.meta, x: MARGIN, y: b.y, width: CONTENT_W, align: 'left', size: 8, font: FONT.sans, color: COLOR.muted });
  b.y += metaH + 2;
  drawRuledTable(b, columns, term.rows, gradeCol, 12);
}

export function buildTranscriptPages(input: TranscriptInput): PdfPage[] {
  const b = new LayoutBuilder();
  b.onNewPage = continuationBand;

  drawCertificateHeader(b, input.school, input.docTitle, input.docSubtitle);
  drawDetailsGrid(b, input.details);
  drawSummaryBand(b, input.summary);
  for (const term of input.terms) drawTermBlock(b, input.columns, input.gradeCol, term);
  drawCgpaBox(b, input.cgpaLabel);
  drawLegend(b, input.legend);
  drawSignatureRow(b, input.signatures, input.qr);

  attachFooters(b, input.footerNote);
  return b.pages;
}

// ─────────────────────────── PDFKit executor ───────────────────────────────

function applyOp(doc: PDFKit.PDFDocument, op: DrawOp): void {
  doc.save();
  switch (op.kind) {
    case 'rect':
      if (op.fill && op.stroke) doc.rect(op.x, op.y, op.w, op.h).lineWidth(op.lineWidth ?? 1).fillAndStroke(op.fill, op.stroke);
      else if (op.fill) doc.rect(op.x, op.y, op.w, op.h).fill(op.fill);
      else doc.rect(op.x, op.y, op.w, op.h).lineWidth(op.lineWidth ?? 1).stroke(op.stroke ?? '#000000');
      break;
    case 'circle':
      if (op.fill && op.stroke) doc.circle(op.cx, op.cy, op.r).lineWidth(op.lineWidth ?? 1).fillAndStroke(op.fill, op.stroke);
      else if (op.fill) doc.circle(op.cx, op.cy, op.r).fill(op.fill);
      else doc.circle(op.cx, op.cy, op.r).lineWidth(op.lineWidth ?? 1).stroke(op.stroke ?? '#000000');
      break;
    case 'line':
      doc.moveTo(op.x1, op.y1).lineTo(op.x2, op.y2).lineWidth(op.width).stroke(op.color);
      break;
    case 'text':
      doc.font(op.font).fontSize(op.size).fillColor(op.color);
      doc.text(op.text, op.x, op.y, {
        width: op.width, align: op.align, lineBreak: false,
        characterSpacing: op.charSpacing ?? 0, ellipsis: true,
      });
      break;
    case 'image':
      doc.image(op.data, op.x, op.y, { fit: op.fit, align: 'center', valign: 'center' });
      break;
  }
  doc.restore();
}

/** Execute a laid-out display list into a real PDF buffer. */
export async function renderPagesToPdf(pages: PdfPage[], title: string): Promise<Buffer> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 0,
    info: { Title: title, Author: 'School Grading System', Creator: 'School Grading System' },
  });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  pages.forEach((page, i) => {
    if (i > 0) doc.addPage();
    for (const op of page.ops) applyOp(doc, op);
  });
  doc.end();
  return done;
}
