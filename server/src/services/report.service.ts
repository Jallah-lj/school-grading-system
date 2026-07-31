import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { computeCgpa, round2 } from '../lib/grading';
import { resolveCardSignatures, type CardSignature } from './signature.service';
import { getSchoolContext, type SchoolContext } from './school.service';

const A4 = { width: 595.28, height: 841.89 };

async function collectPdf(build: (doc: PDFKit.PDFDocument) => void | Promise<void>): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', margin: 42 });
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

function header(doc: PDFKit.PDFDocument, school: SchoolContext, title: string, subtitle: string) {
  doc.roundedRect(42, 42, A4.width - 84, 64, 10).fillAndStroke('#eef2ff', '#c7d2fe');
  if (school.badge) {
    doc.save();
    doc.image(school.badge, 58, 50, { fit: [46, 48] });
    doc.restore();
  }
  doc.fillColor('#312e81').fontSize(17).font('Helvetica-Bold').text(school.name, 42, 56, {
    width: A4.width - 84, align: 'center',
  });
  doc.fontSize(9).font('Helvetica').fillColor('#4f46e5').text(school.motto, { width: A4.width - 84, align: 'center' });
  doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a').text(title, 42, 118, { width: A4.width - 84, align: 'center' });
  doc.fontSize(9).font('Helvetica').fillColor('#64748b').text(subtitle, { width: A4.width - 84, align: 'center' });
  doc.moveTo(42, 152).lineTo(A4.width - 42, 152).lineWidth(1).strokeColor('#cbd5e1').stroke();
}

function infoGrid(doc: PDFKit.PDFDocument, top: number, pairs: [string, string][]) {
  let x = 42;
  let y = top;
  for (const [label, value] of pairs) {
    doc.fontSize(8).font('Helvetica').fillColor('#64748b').text(label.toUpperCase(), x, y);
    doc.fontSize(10).font('Helvetica-Bold').fillColor('#0f172a').text(value, x, y + 10, { width: 170 });
    x += 175;
    if (x > A4.width - 130) { x = 42; y += 34; }
  }
  return y + 40;
}

function table(doc: PDFKit.PDFDocument, top: number, columns: { label: string; width: number; align?: 'left' | 'right' | 'center' }[], rows: string[][], colorCol?: number) {
  const x0 = 42;
  let y = top;
  doc.roundedRect(x0, y, A4.width - 84, 20, 3).fill('#f1f5f9');
  let x = x0;
  for (const col of columns) {
    doc.fontSize(8.5).font('Helvetica-Bold').fillColor('#334155')
      .text(col.label.toUpperCase(), x + 4, y + 6, { width: col.width - 8, align: col.align ?? 'left' });
    x += col.width;
  }
  y += 22;
  doc.font('Helvetica').fontSize(9);
  rows.forEach((row, i) => {
    if (y > A4.height - 120) { doc.addPage(); y = 60; }
    if (i % 2 === 0) doc.rect(x0, y - 3, A4.width - 84, 18).fill('#f8fafc');
    let cx = x0;
    row.forEach((cell, ci) => {
      const col = columns[ci];
      doc.fillColor(ci === colorCol ? bandColor(cell) : '#0f172a')
        .font(ci === colorCol ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(9)
        .text(cell, cx + 4, y, { width: col.width - 8, align: col.align ?? 'left' });
      cx += col.width;
    });
    y += 18;
  });
  doc.moveTo(x0, y + 2).lineTo(A4.width - 42, y + 2).lineWidth(0.5).strokeColor('#cbd5e1').stroke();
  return y + 12;
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
  const qr = await QRCode.toBuffer(verifyUrl, { margin: 1, width: 200 });

  return collectPdf(async (doc) => {
    const school = await getSchoolContext();
    header(doc, school, 'STUDENT REPORT CARD', `${data.semester.name} — Academic Year ${data.semester.academicYear}`);

    let y = infoGrid(doc, 164, [
      ['Student Name', data.student.name],
      ['Admission No.', data.student.admissionNumber],
      ['Class', data.student.className],
      ['Term', `${data.semester.name} / ${data.semester.academicYear}`],
      ['Position', data.gpa?.position ? `${data.gpa.position} of ${data.gpa.classSize ?? '—'}` : '—'],
      ['GPA', data.gpa ? data.gpa.gpa.toFixed(2) : '—'],
      ['Average', data.gpa ? `${data.gpa.average.toFixed(1)}%` : '—'],
      ['Credits', data.gpa ? String(data.gpa.totalCredits) : '—'],
    ]);

    y = table(doc, y + 6, [
      { label: 'Code', width: 55 },
      { label: 'Subject', width: 150 },
      { label: 'Score', width: 55, align: 'right' },
      { label: 'Grade', width: 50, align: 'center' },
      { label: 'Point', width: 45, align: 'center' },
      { label: 'Rank', width: 45, align: 'center' },
      { label: 'Remark', width: A4.width - 84 - 400 },
    ], data.results.map((r) => [
      r.code, r.name, r.percentage.toFixed(1), r.letterGrade,
      r.gradePoint.toFixed(1), r.position ? String(r.position) : '—', r.remark,
    ]), 3);

    y += 8;
    doc.fontSize(9).font('Helvetica-Bold').fillColor('#334155').text("CLASS TEACHER'S REMARKS", 42, y);
    doc.font('Helvetica').fontSize(9).fillColor('#0f172a')
      .text(data.teacherRemarks ?? '—', 42, y + 12, { width: A4.width - 84 });
    y += 44;
    doc.font('Helvetica-Bold').fillColor('#334155').text("PRINCIPAL'S REMARKS", 42, y);
    doc.font('Helvetica').fillColor('#0f172a').text(data.principalRemarks ?? '—', 42, y + 12, { width: A4.width - 84 });

    // Signature block + verification QR
    const sigY = A4.height - 120;
    const stamp = (x: number, sig: CardSignature | null, fallbackTitle: string) => {
      if (sig?.png) {
        doc.save();
        doc.image(sig.png, x, sigY - 36, { fit: [150, 34], valign: 'bottom' });
        doc.restore();
      }
      doc.moveTo(x, sigY).lineTo(x + 158, sigY).strokeColor('#94a3b8').stroke();
      doc.fontSize(8).fillColor('#64748b').text(sig?.title ?? fallbackTitle, x, sigY + 4, { width: 158 });
      if (sig?.name) doc.fontSize(7).fillColor('#94a3b8').text(sig.name, x, sigY + 13, { width: 158 });
    };
    stamp(42, data.signatures?.classTeacher ?? null, 'Class Teacher');
    stamp(230, data.signatures?.principal ?? null, 'Principal / Head of School');
    doc.image(qr, A4.width - 130, sigY - 42, { width: 76 });
    doc.fontSize(6.5).fillColor('#64748b').text(`Verify: ${data.verificationCode}`, A4.width - 140, sigY + 38, { width: 98, align: 'center' });
    doc.fontSize(7.5).text(
      `Generated by the School Grading System on ${new Date().toISOString().slice(0, 10)}.`,
      42, A4.height - 56, { width: A4.width - 84, align: 'center' },
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
  const qr = await QRCode.toBuffer(`${env.CLIENT_ORIGINS[0]}/verify/transcript/${code}`, { margin: 1, width: 200 });

  return collectPdf(async (doc) => {
    const school = await getSchoolContext();
    header(doc, school, 'OFFICIAL ACADEMIC TRANSCRIPT', 'Cumulative record of academic performance');
    infoGrid(doc, 164, [
      ['Student Name', student.user.name],
      ['Admission No.', student.admissionNumber],
      ['Class', student.classRoom ? `${student.classRoom.name} ${student.classRoom.stream}` : '—'],
      ['Cumulative GPA', cgpa.toFixed(2)],
    ]);

    let y = 248;
    for (const record of records) {
      if (y > A4.height - 180) { doc.addPage(); y = 60; }
      doc.fontSize(11).font('Helvetica-Bold').fillColor('#312e81')
        .text(`${record.semester.name} — ${record.semester.academicYear.name}`, 42, y);
      doc.fontSize(9).font('Helvetica').fillColor('#475569')
        .text(`GPA: ${record.gpa.toFixed(2)}   Average: ${record.average.toFixed(1)}%   Position: ${record.position ?? '—'} of ${record.classSize ?? '—'}`,
          42, y + 14);
      const termResults = results.filter((r) => r.semesterId === record.semesterId);
      y = table(doc, y + 30, [
        { label: 'Code', width: 60 },
        { label: 'Subject', width: 200 },
        { label: 'Credits', width: 60, align: 'center' },
        { label: 'Score', width: 65, align: 'right' },
        { label: 'Grade', width: 60, align: 'center' },
        { label: 'Point', width: A4.width - 84 - 445, align: 'center' },
      ], termResults.map((r) => [
        r.subject.code, r.subject.name, String(r.subject.creditUnits),
        r.percentage.toFixed(1), r.letterGrade, r.gradePoint.toFixed(1),
      ]), 4) + 14;
    }

    doc.fontSize(12).font('Helvetica-Bold').fillColor('#0f172a')
      .text(`CUMULATIVE GPA (CGPA): ${cgpa.toFixed(2)}`, 42, y + 4, { width: A4.width - 84, align: 'center' });
    doc.image(qr, A4.width / 2 - 32, y + 26, { width: 64 });
    const sigs = await resolveCardSignatures(student.classId ?? null, null);
    const lineY = A4.height - 96;
    if (sigs.principal?.png) {
      doc.save();
      doc.image(sigs.principal.png, 42, lineY - 32, { fit: [150, 30], valign: 'bottom' });
      doc.restore();
    }
    doc.moveTo(42, lineY).lineTo(220, lineY).strokeColor('#94a3b8').stroke();
    doc.fontSize(8).fillColor('#64748b')
      .text(sigs.principal?.title ?? 'Registrar / Principal', 42, lineY + 4)
      .fontSize(7).fillColor('#94a3b8')
      .text(sigs.principal?.name ?? '', 42, lineY + 13);
    doc.fontSize(8).fillColor('#64748b').text(`Date: ${new Date().toISOString().slice(0, 10)}`,
      A4.width - 200, lineY + 4, { width: 158, align: 'right' });
  });
}
