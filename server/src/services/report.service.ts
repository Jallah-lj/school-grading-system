import QRCode from 'qrcode';
import { env } from '../config/env';
import { prisma } from '../lib/prisma';
import { computeCgpa } from '../lib/grading';
import { resolveCardSignatures, type CardSignature } from './signature.service';
import { getSchoolContext } from './school.service';
import {
  buildReportCardPages, buildTranscriptPages, renderPagesToPdf,
  COLOR, type LegendBand, type QrPanel, type SchoolBrand, type SignatureSlot,
} from './pdf-layout';

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

// ─────────────────────── PDF assembly (DB → layout) ────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

function toSchoolBrand(s: { name: string; motto: string; badge: Buffer | null }): SchoolBrand {
  return { name: s.name, motto: s.motto, badge: s.badge };
}

const sigSlot = (s: CardSignature | null, fallbackTitle: string): SignatureSlot =>
  ({ title: s?.title ?? fallbackTitle, name: s?.name ?? '', png: s?.png ?? null });

/** Grading-scale legend pulled from the active grade scale. */
async function activeScaleLegend(): Promise<LegendBand[]> {
  const scale = await prisma.gradeScale.findFirst({
    where: { isActive: true },
    include: { bands: { orderBy: { minScore: 'desc' } } },
  });
  return scale?.bands.map((b) => ({
    letter: b.letter, minScore: b.minScore, maxScore: b.maxScore, remark: b.remark,
  })) ?? [];
}

async function qrPanel(url: string, sub: string): Promise<QrPanel> {
  const image = await QRCode.toBuffer(url, {
    margin: 1, width: 220, color: { dark: COLOR.navy, light: '#ffffff' },
  });
  return { image, caption: 'Scan to verify', sub };
}

export async function buildReportCardPdf(data: ReportCardData): Promise<Buffer> {
  const verifyUrl = `${env.CLIENT_ORIGINS[0]}/verify/${data.verificationCode}`;
  const [school, legend, qr] = await Promise.all([
    getSchoolContext(),
    activeScaleLegend(),
    qrPanel(verifyUrl, data.verificationCode),
  ]);

  const pages = buildReportCardPages({
    school: toSchoolBrand(school),
    docTitle: 'Official Student Report Card',
    docSubtitle: `${data.semester.name}  ·  Academic Year ${data.semester.academicYear}`,
    details: [
      ['Student Name', data.student.name],
      ['Admission No.', data.student.admissionNumber],
      ['Class', data.student.className],
      ['Term', data.semester.name],
      ['Year', data.semester.academicYear],
      ['Class Size', data.gpa?.classSize ? String(data.gpa.classSize) : '—'],
      ['Credits', data.gpa ? String(data.gpa.totalCredits) : '—'],
      ['Date Issued', data.publishedAt ? data.publishedAt.toISOString().slice(0, 10) : today()],
    ],
    summary: [
      { label: 'Term GPA', value: data.gpa ? data.gpa.gpa.toFixed(2) : '—' },
      { label: 'Average', value: data.gpa ? `${data.gpa.average.toFixed(1)}%` : '—' },
      { label: 'Class Position', value: data.gpa?.position ? `${data.gpa.position} of ${data.gpa.classSize ?? '—'}` : '—' },
    ],
    resultsTitle: 'Subject Performance',
    columns: [
      { label: 'Code', width: 46 },
      { label: 'Subject', width: 158 },
      { label: 'Score', width: 52, align: 'right' },
      { label: 'Grade', width: 44, align: 'center' },
      { label: 'Point', width: 42, align: 'center' },
      { label: 'Rank', width: 40, align: 'center' },
      { label: 'Remark', width: 503.28 - 382 },
    ],
    rows: data.results.map((r) => [
      r.code,
      r.name,
      `${r.percentage.toFixed(1)}%`,
      r.letterGrade,
      r.gradePoint.toFixed(1),
      r.position ? String(r.position) : '—',
      r.remark,
    ]),
    gradeCol: 3,
    legend,
    remarks: [
      { title: "Class Teacher's Remarks", body: data.teacherRemarks ?? '—' },
      { title: "Principal's Remarks", body: data.principalRemarks ?? '—' },
    ],
    signatures: [
      sigSlot(data.signatures?.classTeacher ?? null, 'Class Teacher'),
      sigSlot(data.signatures?.principal ?? null, 'Principal / Head of School'),
    ],
    qr,
    footerNote: `${school.name}  ·  Generated ${today()}  ·  School Grading System  ·  Authenticated via QR`,
  });

  return renderPagesToPdf(pages, `Report Card — ${data.student.name}`);
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
  const [school, legend, qr, sigs] = await Promise.all([
    getSchoolContext(),
    activeScaleLegend(),
    qrPanel(`${env.CLIENT_ORIGINS[0]}/verify/transcript/${code}`, code),
    resolveCardSignatures(student.classId ?? null, null),
  ]);

  const pages = buildTranscriptPages({
    school: toSchoolBrand(school),
    docTitle: 'Official Academic Transcript',
    docSubtitle: 'Cumulative record of academic performance',
    details: [
      ['Student Name', student.user.name],
      ['Admission No.', student.admissionNumber],
      ['Class', student.classRoom ? `${student.classRoom.name} ${student.classRoom.stream}` : '—'],
      ['Date Issued', today()],
    ],
    summary: [
      { label: 'CGPA', value: cgpa.toFixed(2) },
      { label: 'Terms Completed', value: String(records.length) },
      { label: 'Subjects Recorded', value: String(results.length) },
    ],
    columns: [
      { label: 'Code', width: 55 },
      { label: 'Subject', width: 205 },
      { label: 'Credits', width: 52, align: 'center' },
      { label: 'Score', width: 60, align: 'right' },
      { label: 'Grade', width: 55, align: 'center' },
      { label: 'Point', width: 503.28 - 427, align: 'center' },
    ],
    gradeCol: 4,
    terms: records.map((record) => ({
      heading: `${record.semester.name} — ${record.semester.academicYear.name}`,
      meta: `GPA ${record.gpa.toFixed(2)}   ·   Average ${record.average.toFixed(1)}%   ·   Position ${record.position ?? '—'} of ${record.classSize ?? '—'}`,
      rows: results.filter((r) => r.semesterId === record.semesterId).map((r) => [
        r.subject.code, r.subject.name, String(r.subject.creditUnits),
        `${r.percentage.toFixed(1)}%`, r.letterGrade, r.gradePoint.toFixed(1),
      ]),
    })),
    cgpaLabel: `CUMULATIVE GPA (CGPA):  ${cgpa.toFixed(2)}`,
    legend,
    signatures: [
      { title: sigs.principal?.title ?? 'Registrar / Principal', name: sigs.principal?.name ?? '', png: sigs.principal?.png ?? null },
      { title: 'Date', name: '', png: null, prefill: today() },
    ],
    qr,
    footerNote: `${school.name}  ·  Official Transcript  ·  School Grading System`,
  });

  return renderPagesToPdf(pages, `Transcript — ${student.user.name}`);
}
