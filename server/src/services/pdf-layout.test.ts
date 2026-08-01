/* Self-contained layout regression tests:  npx tsx src/services/pdf-layout.test.ts
 *
 * These run against the pure display list (no DB, no PDFKit needed except the
 * final smoke check). They encode the invariants that used to break:
 *   1. every page carries the page-numbered footer band (footer page-break bug);
 *   2. no content ever dips into the footer area (signature/legend collisions);
 *   3. term headings are never orphaned from their tables.
 */
import assert from 'node:assert/strict';
import {
  buildReportCardPages, buildTranscriptPages, renderPagesToPdf, wrapText, bandRange,
  PAGE, FOOTER_H, CONTENT_BOTTOM, COLOR, FONT,
  type DrawOp, type ImageOp, type PdfPage, type QrPanel, type ReportCardInput,
  type LegendBand, type SchoolBrand, type TableColumn, type TextOp, type TranscriptInput,
} from './pdf-layout';

const school: SchoolBrand = { name: 'Greenfield Hill Academy', motto: 'Wisdom Lights the Way', badge: null };

const LEGEND: LegendBand[] = [
  { letter: 'A+', minScore: 90, maxScore: 100, remark: 'Excellent' },
  { letter: 'A', minScore: 80, maxScore: 89.99, remark: 'Very Good' },
  { letter: 'B+', minScore: 70, maxScore: 79.99, remark: 'Good' },
  { letter: 'B', minScore: 60, maxScore: 69.99, remark: 'Credit' },
  { letter: 'C', minScore: 50, maxScore: 59.99, remark: 'Pass' },
  { letter: 'F', minScore: 0, maxScore: 49.99, remark: 'Fail' },
];

// 1×1 white PNG so the PDFKit smoke test can embed a real image.
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const QR: QrPanel = { image: PNG_1PX, caption: 'Scan to verify', sub: 'SGS-TEST-01' };

const REPORT_COLUMNS: TableColumn[] = [
  { label: 'Code', width: 46 },
  { label: 'Subject', width: 158 },
  { label: 'Score', width: 52, align: 'right' },
  { label: 'Grade', width: 44, align: 'center' },
  { label: 'Point', width: 42, align: 'center' },
  { label: 'Rank', width: 40, align: 'center' },
  { label: 'Remark', width: PAGE.width - 46 * 2 - 382 },
];

const SUBJECTS = ['Mathematics', 'English', 'Biology', 'Chemistry', 'Physics', 'History', 'Geography', 'Kinyarwanda', 'French', 'Computer Studies'];

function subjectRows(n: number): string[][] {
  return Array.from({ length: n }, (_, i) => [
    `S${String(i + 1).padStart(3, '0')}`,
    i < SUBJECTS.length ? SUBJECTS[i] : `${SUBJECTS[i % SUBJECTS.length]} (Elective ${Math.floor(i / SUBJECTS.length)})`,
    `${(88 - (i % 37)).toFixed(1)}%`,
    ['A+', 'A', 'B+', 'B', 'C', 'F'][i % 6],
    (3.9 - (i % 6) * 0.5).toFixed(1),
    String((i % 30) + 1),
    'Good progress',
  ]);
}

function reportInput(rowCount: number): ReportCardInput {
  return {
    school,
    docTitle: 'Official Student Report Card',
    docSubtitle: 'Term 1  ·  Academic Year 2025/2026',
    details: [
      ['Student Name', 'Aline Uwase Ingabire'],
      ['Admission No.', 'GH-2026-014'],
      ['Class', 'S3 Blue'],
      ['Term', 'Term 1'],
      ['Year', '2025/2026'],
      ['Class Size', '38'],
      ['Credits', '27'],
      ['Date Issued', '2026-08-01'],
    ],
    summary: [
      { label: 'Term GPA', value: '3.85' },
      { label: 'Average', value: '87.2%' },
      { label: 'Class Position', value: '3 of 38' },
    ],
    resultsTitle: 'Subject Performance',
    columns: REPORT_COLUMNS,
    rows: subjectRows(rowCount),
    gradeCol: 3,
    legend: LEGEND,
    remarks: [
      { title: "Class Teacher's Remarks", body: 'An excellent, focused term. Aline consistently supports her classmates and leads discussions.' },
      { title: "Principal's Remarks", body: 'Outstanding conduct and scholarship. Keep aiming high.' },
    ],
    signatures: [
      { title: 'Class Teacher', name: 'J. Mugisha', png: null },
      { title: 'Principal / Head of School', name: 'Dr. K. Umutoni', png: null },
    ],
    qr: QR,
    footerNote: 'Greenfield Hill Academy  ·  Generated 2026-08-01  ·  School Grading System  ·  Authenticated via QR',
  };
}

function transcriptInput(termCount: number): TranscriptInput {
  return {
    school,
    docTitle: 'Official Academic Transcript',
    docSubtitle: 'Cumulative record of academic performance',
    details: [
      ['Student Name', 'Aline Uwase Ingabire'],
      ['Admission No.', 'GH-2026-014'],
      ['Class', 'S3 Blue'],
      ['Date Issued', '2026-08-01'],
    ],
    summary: [
      { label: 'CGPA', value: '3.85' },
      { label: 'Terms Completed', value: String(termCount) },
      { label: 'Subjects Recorded', value: String(termCount * 10) },
    ],
    columns: [
      { label: 'Code', width: 55 },
      { label: 'Subject', width: 205 },
      { label: 'Credits', width: 52, align: 'center' },
      { label: 'Score', width: 60, align: 'right' },
      { label: 'Grade', width: 55, align: 'center' },
      { label: 'Point', width: PAGE.width - 46 * 2 - 427, align: 'center' },
    ],
    gradeCol: 4,
    terms: Array.from({ length: termCount }, (_, t) => ({
      heading: `Term ${t + 1} — 202${5 - Math.floor(t / 3)}/${2026 - Math.floor(t / 3)}`,
      meta: `GPA 3.8${t}   ·   Average 8${t}.5%   ·   Position ${t + 1} of 38`,
      rows: subjectRows(10).map((r) => [r[0], r[1], '3', r[2], r[3], r[4]]),
    })),
    cgpaLabel: 'CUMULATIVE GPA (CGPA):  3.85',
    legend: LEGEND,
    signatures: [
      { title: 'Registrar / Principal', name: 'Dr. K. Umutoni', png: null },
      { title: 'Date', name: '', png: null, prefill: '2026-08-01' },
    ],
    qr: QR,
    footerNote: 'Greenfield Hill Academy  ·  Official Transcript  ·  School Grading System',
  };
}

// ────────────────────────────── op inspection ─────────────────────────────

const texts = (p: PdfPage): TextOp[] => p.ops.filter((o): o is TextOp => o.kind === 'text');
const images = (p: PdfPage): ImageOp[] => p.ops.filter((o): o is ImageOp => o.kind === 'image');
const hasText = (p: PdfPage, needle: string | RegExp) =>
  texts(p).some((t) => (typeof needle === 'string' ? t.text === needle : needle.test(t.text)));

function opBottom(op: DrawOp): number {
  switch (op.kind) {
    case 'rect': return op.y + op.h;
    case 'line': return Math.max(op.y1, op.y2) + op.width / 2;
    case 'text': return op.y + op.size * 1.4; // ascent + descent allowance
    case 'image': return op.y + op.fit[1];
    case 'circle': return op.cy + op.r + (op.lineWidth ?? 1) / 2;
  }
}

/** Footer ops are the final 4 appends (gold rule, navy band, note, page number). */
const contentOps = (p: PdfPage): DrawOp[] => p.ops.slice(0, -4);

function assertPageFooter(p: PdfPage, index: number, total: number): void {
  const [goldRule, band, note, pageNo] = p.ops.slice(-4);
  assert.equal(goldRule.kind, 'rect', 'footer gold rule missing');
  assert.equal((goldRule as { fill?: string }).fill, COLOR.gold);
  assert.equal(band.kind, 'rect', 'footer band missing');
  const bandRect = band as { y: number; h: number; fill?: string };
  assert.equal(bandRect.fill, COLOR.navy, 'footer band must be navy');
  assert.equal(bandRect.y, PAGE.height - FOOTER_H, 'footer band must sit at the page bottom');
  assert.equal(bandRect.h, FOOTER_H);
  assert.equal(note.kind, 'text');
  assert.equal(pageNo.kind, 'text');
  assert.equal((pageNo as TextOp).text, `Page ${index + 1} of ${total}`, 'wrong page-number label');
}

function assertContentAboveFooter(p: PdfPage, label: string): void {
  for (const op of contentOps(p)) {
    assert.ok(
      opBottom(op) <= CONTENT_BOTTOM + 0.6,
      `${label}: ${op.kind} op at y=${opBottom(op).toFixed(1)} dips into the footer area (limit ${CONTENT_BOTTOM.toFixed(1)})`,
    );
  }
}

function assertAllPagesFootered(pages: PdfPage[], label: string): void {
  pages.forEach((p, i) => {
    assertPageFooter(p, i, pages.length);
    assertContentAboveFooter(p, `${label} page ${i + 1}`);
  });
}

// ─────────────────────────────── Pure helpers ──────────────────────────────

assert.equal(bandRange({ letter: 'A+', minScore: 90, maxScore: 100, remark: '' }), '90–100');
assert.equal(bandRange({ letter: 'A', minScore: 80, maxScore: 89.99, remark: '' }), '80–89');
assert.equal(bandRange({ letter: 'F', minScore: 0, maxScore: 49.99, remark: '' }), '0–49');
assert.deepEqual(wrapText('', 9, FONT.serif, 100, 3), ['—']);
assert.equal(wrapText('one two three four five six seven eight nine ten eleven twelve', 9.3, FONT.serif, 120, 3).length, 3);
assert.ok(wrapText('alpha beta gamma delta epsilon zeta eta theta', 9.3, FONT.serif, 60, 2).at(-1)!.endsWith('…'), 'overflow wraps must ellipsise');
assert.ok(estimateWidthSafe(), 'width estimate monotonic');
function estimateWidthSafe(): boolean {
  const a = wrapText('x '.repeat(200).trim(), 9, FONT.serif, 200, 4);
  return a.length <= 4;
}

// ───────────────────────────── 1· Basic card ───────────────────────────────

{
  const pages = buildReportCardPages(reportInput(8));
  assert.equal(pages.length, 1, 'an 8-subject card fits on one page');
  const p = pages[0];

  // Certificate header: serif letter-spaced title, navy/gold double rule, bands.
  assert.ok(texts(p).some((t) => t.text === 'OFFICIAL STUDENT REPORT CARD' && t.font === FONT.serifBold && (t.charSpacing ?? 0) >= 2), 'letter-spaced serif title missing');
  assert.ok(texts(p).some((t) => t.text === school.name && t.font === FONT.serifBold && t.color === COLOR.navy), 'serif school name missing');
  assert.ok(hasText(p, `“${school.motto}”`), 'italic motto missing');
  assert.ok(p.ops.some((o) => o.kind === 'line' && o.color === COLOR.navy && o.width === 2), 'navy rule missing');
  assert.ok(p.ops.some((o) => o.kind === 'line' && o.color === COLOR.gold), 'gold rule missing');
  assert.ok(p.ops.some((o) => o.kind === 'rect' && o.y === 0 && (o as { fill?: string }).fill === COLOR.navy), 'top navy band missing');

  // Details grid + summary band.
  assert.ok(hasText(p, 'STUDENT NAME') && hasText(p, 'ADMISSION NO.') && hasText(p, 'DATE ISSUED'), 'details grid labels missing');
  assert.ok(p.ops.some((o) => o.kind === 'rect' && (o as { fill?: string }).fill === COLOR.navy && (o as { h: number }).h === 34), 'navy summary band missing');
  assert.ok(hasText(p, 'TERM GPA') && hasText(p, '3.85'), 'summary values missing');

  // Ruled table: navy header + gold underline, grades in bold navy ink (no pills).
  assert.ok(texts(p).some((t) => t.text === 'A+' && t.font === FONT.serifBold && t.color === COLOR.navy), 'grade must print in navy serif ink');
  assert.ok(!p.ops.some((o) => o.kind === 'rect' && (o as { h: number }).h === 14), 'no grade pills allowed');

  // Grading-scale legend from the active scale.
  assert.ok(hasText(p, 'GRADING SCALE'), 'legend title missing');
  for (const b of LEGEND) assert.ok(hasText(p, b.letter), `legend letter ${b.letter} missing`);
  assert.ok(texts(p).some((t) => t.text.includes('90–100')), 'legend range 90–100 missing');
  assert.ok(texts(p).some((t) => t.text.includes('0–49')), 'legend range 0–49 missing');

  // QR panel + footer.
  assert.ok(images(p).length >= 1, 'QR image missing');
  assertAllPagesFootered(pages, 'basic card');
}

// ─────────────── 2· Stress card — regression: footer page break ────────────

{
  const pages = buildReportCardPages(reportInput(30));
  assert.ok(pages.length >= 2, 'a 30-subject stress card must span pages');

  // The exact historical bug: continuation pages lost their footer band.
  assertAllPagesFootered(pages, 'stress card');
  pages.forEach((p, i) => assert.ok(hasText(p, `Page ${i + 1} of ${pages.length}`), `page ${i + 1} is missing its page number`));

  // Table continues with a fresh navy header on page 2.
  assert.ok(hasText(pages[1], 'SUBJECT'), 'results table header must repeat on the continuation page');
  assert.ok(pages[1].ops.some((o) => o.kind === 'rect' && o.y === 0 && (o as { fill?: string }).fill === COLOR.navy), 'continuation band missing');

  // Signatures survived intact on the last page, above the footer.
  const last = pages[pages.length - 1];
  const sigLines = last.ops.filter((o) => o.kind === 'line' && o.color === '#8a94a0');
  assert.equal(sigLines.length, 2, 'both signature lines must be drawn');
  assert.ok(hasText(last, 'PRINCIPAL / HEAD OF SCHOOL'), 'principal caption missing');
  assert.ok(hasText(last, 'CLASS TEACHER'), 'class-teacher caption missing');
}

// ─────────────────────── 3· 6-term stress transcript ───────────────────────

{
  const pages = buildTranscriptPages(transcriptInput(6));
  assert.ok(pages.length >= 2, 'a 6-term transcript must span pages');
  assertAllPagesFootered(pages, 'transcript');

  // CGPA box survives whole on the last page.
  const last = pages[pages.length - 1];
  assert.ok(hasText(last, /CUMULATIVE GPA \(CGPA\):\s+3\.85/), 'CGPA box label missing');

  // No orphaned term heading: every heading is followed by its table header on
  // the same page (keep-with-next guard).
  pages.forEach((p) => {
    for (const t of texts(p).filter((x) => x.text.startsWith('Term '))) {
      const followed = p.ops.some((o) => o.kind === 'rect'
        && (o as { fill?: string }).fill === COLOR.navy
        && Math.abs((o as { h: number }).h - 18) < 0.01
        && o.y > t.y && o.y < t.y + 60);
      assert.ok(followed, `term heading "${t.text}" is orphaned from its table`);
    }
  });
  for (let tN = 1; tN <= 6; tN += 1) {
    assert.ok(pages.some((p) => hasText(p, new RegExp(`^Term ${tN} —`))), `term ${tN} heading missing`);
  }
}

// ─────────────────── 4· Real PDF smoke test (PDFKit executor) ──────────────

async function main(): Promise<void> {
  const single = buildReportCardPages(reportInput(8));
  const stress = buildReportCardPages(reportInput(30));
  const transcript = buildTranscriptPages(transcriptInput(6));

  const [pdfOne, pdfMany, pdfTranscript] = await Promise.all([
    renderPagesToPdf(single, 'Report Card'),
    renderPagesToPdf(stress, 'Report Card'),
    renderPagesToPdf(transcript, 'Transcript'),
  ]);

  const pageCount = (buf: Buffer) => (buf.toString('latin1').match(/\/Type\s*\/Page[^s]/g) ?? []).length;

  for (const buf of [pdfOne, pdfMany, pdfTranscript]) {
    assert.ok(buf.subarray(0, 5).toString('latin1') === '%PDF-', 'not a PDF');
  }
  assert.equal(pageCount(pdfOne), 1, 'smoke: single-page PDF');
  assert.equal(pageCount(pdfMany), stress.length, 'smoke: multi-page PDF page count');
  assert.equal(pageCount(pdfTranscript), transcript.length, 'smoke: transcript page count');

  console.log('pdf-layout.test.ts: all assertions passed ✔');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
