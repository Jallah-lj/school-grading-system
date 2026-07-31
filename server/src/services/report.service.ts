import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { computeCgpa, round2 } from '../lib/grading';
import { resolveCardSignatures, type CardSignature } from './signature.service';
import { getSchoolContext, type SchoolContext } from './school.service';

const A4 = { width: 595.28, height: 841.89 };
const MARGIN = 40;
const CONTENT_W = A4.width - MARGIN * 2;

async function collectPdf(build: (doc: PDFKit.PDFDocument) => void | Promise<void>): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: MARGIN, info: {
    Title: 'Student Report Card',
    Author: 'School Grading System',
    Creator: 'School Grading System',
  } });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
  await build(doc);
  doc.end();
  return done;
}

const bandColor = (letter: string): string =>
  letter.startsWith('A') ? '#047857' : letter.startsWith('B') ? '#0369a1' : letter === 'C' ? '#b45309' : '#b91c1c';

const bandBg = (letter: string): string =>
  letter.startsWith('A') ? '#d1fae5' : letter.startsWith('B') ? '#e0f2fe' : letter === 'C' ? '#fef3c7' : '#fee2e2';

/** Professional branded header with crest, school name, motto and document title. */
function drawHeader(
  doc: PDFKit.PDFDocument,
  school: SchoolContext,
  title: string,
  subtitle: string,
) {
  // Top accent bar
  doc.rect(0, 0, A4.width, 6).fill('#4f46e5');

  // Soft header panel
  doc.save();
  doc.roundedRect(MARGIN, 22, CONTENT_W, 88, 12).fill('#eef2ff');
  doc.restore();

  // Left accent stripe on the panel
  doc.save();
  doc.roundedRect(MARGIN, 22, 6, 88, 3).fill('#4f46e5');
  doc.restore();

  const textLeft = school.badge ? MARGIN + 78 : MARGIN + 22;
  const textWidth = school.badge ? CONTENT_W - 100 : CONTENT_W - 36;

  if (school.badge) {
    doc.save();
    // White circle behind badge
    doc.circle(MARGIN + 44, 66, 28).fill('#ffffff');
    doc.image(school.badge, MARGIN + 22, 42, { fit: [44, 48], align: 'center', valign: 'center' });
    doc.restore();
  }

  doc.fillColor('#1e1b4b').fontSize(16).font('Helvetica-Bold')
    .text(school.name, textLeft, 36, { width: textWidth, align: school.badge ? 'left' : 'center' });

  if (school.motto) {
    doc.fontSize(9).font('Helvetica-Oblique').fillColor('#6366f1')
      .text(`“${school.motto}”`, textLeft, 56, { width: textWidth, align: school.badge ? 'left' : 'center' });
  }

  // Document title pill
  const pillY = 78;
  doc.fontSize(9).font('Helvetica-Bold').fillColor('#312e81')
    .text(title.toUpperCase(), textLeft, pillY, { width: textWidth, align: school.badge ? 'left' : 'center' });
  doc.fontSize(8).font('Helvetica').fillColor('#64748b')
    .text(subtitle, textLeft, pillY + 12, { width: textWidth, align: school.badge ? 'left' : 'center' });

  // Thin rule under header
  doc.moveTo(MARGIN, 122).lineTo(A4.width - MARGIN, 122).lineWidth(0.8).strokeColor('#c7d2fe').stroke();
}

/** Key-value info cards in a responsive grid. */
function infoGrid(doc: PDFKit.PDFDocument, top: number, pairs: [string, string][]) {
  const cols = 4;
  const gap = 8;
  const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cardH = 36;
  let x = MARGIN;
  let y = top;
  let col = 0;

  for (const [label, value] of pairs) {
    doc.save();
    doc.roundedRect(x, y, cardW, cardH, 6).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.restore();
    doc.fontSize(7).font('Helvetica').fillColor('#64748b')
      .text(label.toUpperCase(), x + 8, y + 6, { width: cardW - 16 });
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a')
      .text(value, x + 8, y + 18, { width: cardW - 16, ellipsis: true });
    col += 1;
    if (col >= cols) {
      col = 0;
      x = MARGIN;
      y += cardH + gap;
    } else {
      x += cardW + gap;
    }
  }
  if (col !== 0) y += cardH + gap;
  return y + 6;
}

/** Summary KPI strip (GPA / Average / Position). */
function summaryStrip(
  doc: PDFKit.PDFDocument,
  top: number,
  items: { label: string; value: string; accent: string }[],
) {
  const gap = 10;
  const cardW = (CONTENT_W - gap * (items.length - 1)) / items.length;
  const cardH = 48;
  items.forEach((item, i) => {
    const x = MARGIN + i * (cardW + gap);
    doc.save();
    doc.roundedRect(x, top, cardW, cardH, 8).fill(item.accent);
    doc.restore();
    doc.fontSize(7.5).font('Helvetica').fillColor('#ffffff')
      .text(item.label.toUpperCase(), x + 12, top + 10, { width: cardW - 24 });
    doc.fontSize(18).font('Helvetica-Bold').fillColor('#ffffff')
      .text(item.value, x + 12, top + 22, { width: cardW - 24 });
  });
  return top + cardH + 14;
}

function table(
  doc: PDFKit.PDFDocument,
  top: number,
  columns: { label: string; width: number; align?: 'left' | 'right' | 'center' }[],
  rows: string[][],
  colorCol?: number,
) {
  const x0 = MARGIN;
  let y = top;
  const tableW = CONTENT_W;
  const rowH = 20;

  // Header bar
  doc.save();
  doc.roundedRect(x0, y, tableW, 22, 4).fill('#312e81');
  doc.restore();
  let x = x0;
  for (const col of columns) {
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#e0e7ff')
      .text(col.label.toUpperCase(), x + 5, y + 7, { width: col.width - 10, align: col.align ?? 'left' });
    x += col.width;
  }
  y += 24;

  doc.font('Helvetica').fontSize(9);
  rows.forEach((row, i) => {
    if (y > A4.height - 150) {
      doc.addPage();
      // Mini header on continuation pages
      doc.rect(0, 0, A4.width, 4).fill('#4f46e5');
      y = 36;
      doc.save();
      doc.roundedRect(x0, y, tableW, 22, 4).fill('#312e81');
      doc.restore();
      let hx = x0;
      for (const col of columns) {
        doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#e0e7ff')
          .text(col.label.toUpperCase(), hx + 5, y + 7, { width: col.width - 10, align: col.align ?? 'left' });
        hx += col.width;
      }
      y += 24;
    }

    if (i % 2 === 0) {
      doc.rect(x0, y - 2, tableW, rowH).fill('#f8fafc');
    }

    let cx = x0;
    row.forEach((cell, ci) => {
      const col = columns[ci];
      if (ci === colorCol) {
        // Grade pill
        const pillW = 28;
        const pillX = cx + (col.width - pillW) / 2;
        doc.save();
        doc.roundedRect(pillX, y + 1, pillW, 14, 7).fill(bandBg(cell));
        doc.restore();
        doc.fillColor(bandColor(cell)).font('Helvetica-Bold').fontSize(8.5)
          .text(cell, pillX, y + 3.5, { width: pillW, align: 'center' });
      } else {
        doc.fillColor('#0f172a')
          .font(ci === 0 || ci === 1 ? 'Helvetica-Bold' : 'Helvetica')
          .fontSize(ci === 0 ? 8 : 9)
          .text(cell, cx + 5, y + 3, { width: col.width - 10, align: col.align ?? 'left' });
      }
      cx += col.width;
    });
    y += rowH;
  });

  // Bottom border
  doc.moveTo(x0, y).lineTo(A4.width - MARGIN, y).lineWidth(0.6).strokeColor('#cbd5e1').stroke();
  return y + 14;
}

function remarksBlock(doc: PDFKit.PDFDocument, y: number, title: string, body: string) {
  doc.save();
  doc.roundedRect(MARGIN, y, CONTENT_W, 52, 8).fillAndStroke('#f8fafc', '#e2e8f0');
  doc.restore();
  // Left accent
  doc.save();
  doc.roundedRect(MARGIN, y, 4, 52, 2).fill('#6366f1');
  doc.restore();
  doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#475569')
    .text(title.toUpperCase(), MARGIN + 14, y + 8, { width: CONTENT_W - 28 });
  doc.fontSize(9).font('Helvetica').fillColor('#0f172a')
    .text(body || '—', MARGIN + 14, y + 22, { width: CONTENT_W - 28, height: 24, ellipsis: true });
  return y + 60;
}

export interface ReportCardSignatures {
  classTeacher: CardSignature | null;
  principal: CardSignature | null;
}

export interface ReportCardData {
  verificationCode: string;
  status: string;
  signatures?: ReportCardSignatures;
  teacherRemarks: string | null;
  principalRemarks: string | null;
  publishedAt: Date | null;
  student: { name: string; admissionNumber: string; className: string };
  semester: { name: string; academicYear: string };
  results: { code: string; name: string; percentage: number; letterGrade: string; gradePoint: number; remark: string; position: number | null }[];
  gpa: { gpa: number; average: number; position: number | null; classSize: number | null; totalCredits: number } | null;
}

export async function loadReportCardData(reportCardId: string): Promise<ReportCardData | null> {
  const card = await prisma.reportCard.findUnique({
    where: { id: reportCardId },
    include: {
      student: { include: { user: { select: { name: true } }, classRoom: true } },
      semester: { include: { academicYear: true } },
    },
  });
  if (!card) return null;

  const [results, gpa] = await Promise.all([
    prisma.subjectResult.findMany({
      where: { studentId: card.studentId, semesterId: card.semesterId },
      include: { subject: { select: { code: true, name: true } } },
      orderBy: { subject: { code: 'asc' } },
    }),
    prisma.gPARecord.findUnique({
      where: { studentId_semesterId: { studentId: card.studentId, semesterId: card.semesterId } },
    }),
  ]);

  return {
    verificationCode: card.verificationCode,
    status: card.status,
    teacherRemarks: card.teacherRemarks,
    principalRemarks: card.principalRemarks,
    publishedAt: card.publishedAt,
    student: {
      name: card.student.user.name,
      admissionNumber: card.student.admissionNumber,
      className: card.student.classRoom ? `${card.student.classRoom.name} ${card.student.classRoom.stream}` : '—',
    },
    semester: { name: card.semester.name, academicYear: card.semester.academicYear.name },
    results: results.map((r) => ({
      code: r.subject.code, name: r.subject.name, percentage: r.percentage,
      letterGrade: r.letterGrade, gradePoint: r.gradePoint, remark: r.remark, position: r.position,
    })),
    gpa: gpa ? { gpa: gpa.gpa, average: gpa.average, position: gpa.position, classSize: gpa.classSize, totalCredits: gpa.totalCredits } : null,
  };
}

/** Same as loadReportCardData, plus resolved digital signatures. */
export async function loadReportCardDataFull(reportCardId: string): Promise<ReportCardData | null> {
  const card = await prisma.reportCard.findUnique({
    where: { id: reportCardId },
    select: { student: { select: { classId: true } }, publishedById: true },
  });
  if (!card) return null;
  const [data, signatures] = await Promise.all([
    loadReportCardData(reportCardId),
    resolveCardSignatures(card.student.classId, card.publishedById),
  ]);
  if (!data) return null;
  return { ...data, signatures };
}

export async function buildReportCardPdf(data: ReportCardData): Promise<Buffer> {
  const verifyUrl = `${env.CLIENT_ORIGINS[0]}/verify/${data.verificationCode}`;
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 220, color: { dark: '#1e1b4b', light: '#ffffff' } });

  return collectPdf(async (doc) => {
    const school = await getSchoolContext();
    drawHeader(
      doc,
      school,
      'Official Student Report Card',
      `${data.semester.name}  ·  Academic Year ${data.semester.academicYear}`,
    );

    let y = infoGrid(doc, 134, [
      ['Student Name', data.student.name],
      ['Admission No.', data.student.admissionNumber],
      ['Class', data.student.className],
      ['Term', data.semester.name],
      ['Academic Year', data.semester.academicYear],
      ['Credits Earned', data.gpa ? String(data.gpa.totalCredits) : '—'],
      ['Status', data.status],
      ['Issued', data.publishedAt ? data.publishedAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10)],
    ]);

    y = summaryStrip(doc, y, [
      { label: 'Term GPA', value: data.gpa ? data.gpa.gpa.toFixed(2) : '—', accent: '#4f46e5' },
      { label: 'Average', value: data.gpa ? `${data.gpa.average.toFixed(1)}%` : '—', accent: '#0369a1' },
      {
        label: 'Class Position',
        value: data.gpa?.position ? `${data.gpa.position} / ${data.gpa.classSize ?? '—'}` : '—',
        accent: '#047857',
      },
    ]);

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155')
      .text('SUBJECT PERFORMANCE', MARGIN, y);
    y += 14;

    y = table(doc, y, [
      { label: 'Code', width: 48 },
      { label: 'Subject', width: 155 },
      { label: 'Score', width: 52, align: 'right' },
      { label: 'Grade', width: 48, align: 'center' },
      { label: 'Point', width: 44, align: 'center' },
      { label: 'Rank', width: 40, align: 'center' },
      { label: 'Remark', width: CONTENT_W - 387 },
    ], data.results.map((r) => [
      r.code,
      r.name,
      `${r.percentage.toFixed(1)}%`,
      r.letterGrade,
      r.gradePoint.toFixed(1),
      r.position ? String(r.position) : '—',
      r.remark,
    ]), 3);

    y = remarksBlock(doc, y, "Class Teacher's Remarks", data.teacherRemarks ?? '—');
    y = remarksBlock(doc, y, "Principal's Remarks", data.principalRemarks ?? '—');

    // Signature + verification footer
    const sigY = Math.max(y + 20, A4.height - 130);

    const stamp = (x: number, sig: CardSignature | null, fallbackTitle: string) => {
      if (sig?.png) {
        doc.save();
        doc.image(sig.png, x, sigY - 34, { fit: [140, 32], valign: 'bottom' });
        doc.restore();
      }
      doc.moveTo(x, sigY).lineTo(x + 150, sigY).lineWidth(0.8).strokeColor('#94a3b8').stroke();
      doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155')
        .text(sig?.title ?? fallbackTitle, x, sigY + 5, { width: 150 });
      if (sig?.name) {
        doc.fontSize(7.5).font('Helvetica').fillColor('#64748b')
          .text(sig.name, x, sigY + 15, { width: 150 });
      }
    };
    stamp(MARGIN, data.signatures?.classTeacher ?? null, 'Class Teacher');
    stamp(MARGIN + 170, data.signatures?.principal ?? null, 'Principal / Head of School');

    // QR verification panel
    const qrX = A4.width - MARGIN - 92;
    doc.save();
    doc.roundedRect(qrX - 6, sigY - 48, 98, 100, 8).fillAndStroke('#f8fafc', '#e2e8f0');
    doc.restore();
    doc.image(qr, qrX + 5, sigY - 40, { width: 76 });
    doc.fontSize(6.5).font('Helvetica-Bold').fillColor('#475569')
      .text('SCAN TO VERIFY', qrX - 6, sigY + 40, { width: 98, align: 'center' });
    doc.fontSize(6).font('Helvetica').fillColor('#94a3b8')
      .text(data.verificationCode, qrX - 6, sigY + 50, { width: 98, align: 'center' });

    // Footer bar
    doc.rect(0, A4.height - 28, A4.width, 28).fill('#1e1b4b');
    doc.fontSize(7).font('Helvetica').fillColor('#c7d2fe')
      .text(
        `${school.name}  ·  Generated ${new Date().toISOString().slice(0, 10)}  ·  School Grading System  ·  Authenticated via QR`,
        MARGIN,
        A4.height - 18,
        { width: CONTENT_W, align: 'center' },
      );
  });
}

export async function buildTranscriptPdf(studentId: string): Promise<Buffer> {
  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    include: { user: { select: { name: true } }, classRoom: true },
  });
  if (!student) throw new Error('Student not found');

  const records = await prisma.gPARecord.findMany({
    where: { studentId },
    include: { semester: { include: { academicYear: true } } },
    orderBy: { semester: { startDate: 'asc' } },
  });
  const results = await prisma.subjectResult.findMany({
    where: { studentId },
    include: { subject: { select: { code: true, name: true, creditUnits: true } } },
    orderBy: [{ semesterId: 'asc' }, { subject: { code: 'asc' } }],
  });

  const cgpa = computeCgpa(records.map((r) => ({ totalPoints: r.totalPoints, totalCredits: r.totalCredits })));
  const code = student.admissionNumber.replace(/[^A-Za-z0-9]/g, '');
  const qr = await QRCode.toBuffer(`${env.CLIENT_ORIGINS[0]}/verify/transcript/${code}`, {
    margin: 1, width: 200, color: { dark: '#1e1b4b', light: '#ffffff' },
  });

  return collectPdf(async (doc) => {
    const school = await getSchoolContext();
    drawHeader(doc, school, 'Official Academic Transcript', 'Cumulative record of academic performance');
    let y = infoGrid(doc, 134, [
      ['Student Name', student.user.name],
      ['Admission No.', student.admissionNumber],
      ['Class', student.classRoom ? `${student.classRoom.name} ${student.classRoom.stream}` : '—'],
      ['Cumulative GPA', cgpa.toFixed(2)],
    ]);

    y = summaryStrip(doc, y, [
      { label: 'CGPA', value: cgpa.toFixed(2), accent: '#4f46e5' },
      { label: 'Terms Completed', value: String(records.length), accent: '#0369a1' },
      { label: 'Subjects Recorded', value: String(results.length), accent: '#047857' },
    ]);

    for (const record of records) {
      if (y > A4.height - 200) { doc.addPage(); doc.rect(0, 0, A4.width, 4).fill('#4f46e5'); y = 36; }
      doc.fontSize(10).font('Helvetica-Bold').fillColor('#1e1b4b')
        .text(`${record.semester.name} — ${record.semester.academicYear.name}`, MARGIN, y);
      doc.fontSize(8).font('Helvetica').fillColor('#64748b')
        .text(
          `GPA ${record.gpa.toFixed(2)}   ·   Avg ${record.average.toFixed(1)}%   ·   Position ${record.position ?? '—'} of ${record.classSize ?? '—'}`,
          MARGIN, y + 14,
        );
      const termResults = results.filter((r) => r.semesterId === record.semesterId);
      y = table(doc, y + 28, [
        { label: 'Code', width: 55 },
        { label: 'Subject', width: 200 },
        { label: 'Credits', width: 55, align: 'center' },
        { label: 'Score', width: 60, align: 'right' },
        { label: 'Grade', width: 55, align: 'center' },
        { label: 'Point', width: CONTENT_W - 425, align: 'center' },
      ], termResults.map((r) => [
        r.subject.code, r.subject.name, String(r.subject.creditUnits),
        `${r.percentage.toFixed(1)}%`, r.letterGrade, r.gradePoint.toFixed(1),
      ]), 4) + 10;
    }

    // CGPA highlight box
    doc.save();
    doc.roundedRect(MARGIN, y + 4, CONTENT_W, 36, 8).fill('#4f46e5');
    doc.restore();
    doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff')
      .text(`CUMULATIVE GPA (CGPA):  ${cgpa.toFixed(2)}`, MARGIN, y + 15, { width: CONTENT_W, align: 'center' });

    const sigs = await resolveCardSignatures(student.classId ?? null, null);
    const lineY = A4.height - 100;
    if (sigs.principal?.png) {
      doc.save();
      doc.image(sigs.principal.png, MARGIN, lineY - 32, { fit: [150, 30], valign: 'bottom' });
      doc.restore();
    }
    doc.moveTo(MARGIN, lineY).lineTo(MARGIN + 178, lineY).strokeColor('#94a3b8').stroke();
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#334155')
      .text(sigs.principal?.title ?? 'Registrar / Principal', MARGIN, lineY + 4)
      .fontSize(7).font('Helvetica').fillColor('#94a3b8')
      .text(sigs.principal?.name ?? '', MARGIN, lineY + 14);
    doc.fontSize(8).fillColor('#64748b').text(`Date: ${new Date().toISOString().slice(0, 10)}`,
      A4.width - MARGIN - 160, lineY + 4, { width: 158, align: 'right' });

    doc.image(qr, A4.width / 2 - 28, lineY - 40, { width: 56 });

    doc.rect(0, A4.height - 28, A4.width, 28).fill('#1e1b4b');
    doc.fontSize(7).font('Helvetica').fillColor('#c7d2fe')
      .text(
        `${school.name}  ·  Official Transcript  ·  School Grading System`,
        MARGIN, A4.height - 18, { width: CONTENT_W, align: 'center' },
      );

    // silence unused import warning for round2 if tree-shaken differently
    void round2;
  });
}
