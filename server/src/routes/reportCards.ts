import crypto from 'crypto';

import { Role } from '@prisma/client';
import { Router } from 'express';
import QRCode from 'qrcode';
import { z } from 'zod';

import { env } from '../config/env';
import { logAudit } from '../lib/audit';
import { AppError } from '../lib/errors';
import { ah, parseBody, parseQuery } from '../lib/helpers';
import { prisma } from '../lib/prisma';
import { authenticate, authorize } from '../middleware/auth';
import { notifyUsers, ExtendedNotificationService } from '../services/notify';
import {
  buildReportCardPdf,
  buildTranscriptPdf,
  loadReportCardDataFull,
} from '../services/report.service';
import { ensureEnrollments } from '../services/results.service';
import { getSchoolContext } from '../services/school.service';

export const reportCardsRouter = Router();

const autoRemark = (gpa: number): string =>
  gpa >= 3.7
    ? 'An outstanding performance. Keep up the excellent work.'
    : gpa >= 3.0
      ? 'A very good performance. Aim even higher next term.'
      : gpa >= 2.5
        ? 'A good performance with room to grow in a few subjects.'
        : gpa >= 2.0
          ? 'A fair performance. More consistent effort is needed.'
          : 'Performance is below expectations. A support plan is recommended.';

// POST /api/report-cards/generate { classId, semesterId } — bulk generate for a class
reportCardsRouter.post(
  '/generate',
  authenticate,
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const { classId, semesterId } = parseBody(
      z.object({ classId: z.string(), semesterId: z.string() }),
      req,
    );
    await ensureEnrollments(classId, semesterId);

    const enrollments = await prisma.enrollment.findMany({
      where: { classId, semesterId },
      select: { studentId: true },
    });
    let generated = 0;
    const skipped: string[] = [];

    for (const { studentId } of enrollments) {
      const gpa = await prisma.gPARecord.findUnique({
        where: { studentId_semesterId: { studentId, semesterId } },
      });
      if (!gpa) {
        skipped.push(studentId);
        continue;
      } // approve grades first

      await prisma.reportCard.upsert({
        where: { studentId_semesterId: { studentId, semesterId } },
        create: {
          studentId,
          semesterId,
          verificationCode: crypto.randomBytes(5).toString('hex').toUpperCase(),
          teacherRemarks: autoRemark(gpa.gpa),
        },
        update: {},
      });
      generated++;
    }

    await logAudit(req, 'GENERATE_REPORT_CARDS', 'ReportCard', undefined, {
      classId,
      semesterId,
      generated,
    });
    res.json({ generated, skipped: skipped.length });
  }),
);

// GET /api/report-cards?classId&semesterId
reportCardsRouter.get(
  '/',
  authenticate,
  authorize(Role.ADMIN, Role.TEACHER),
  ah(async (req, res) => {
    const { classId, semesterId } = parseQuery(
      z.object({ classId: z.string(), semesterId: z.string() }),
      req,
    );
    const enrollments = await prisma.enrollment.findMany({
      where: { classId, semesterId },
      select: { studentId: true },
    });
    const studentIds = enrollments.map((e) => e.studentId);

    const cards = await prisma.reportCard.findMany({
      where: { semesterId, studentId: { in: studentIds } },
      include: {
        student: {
          include: {
            user: { select: { name: true } },
            classRoom: { select: { name: true, stream: true } },
          },
        },
        semester: { include: { academicYear: { select: { name: true } } } },
      },
      orderBy: { student: { user: { name: 'asc' } } },
    });

    const gpas = await prisma.gPARecord.findMany({
      where: { semesterId, studentId: { in: cards.map((c) => c.studentId) } },
    });
    const gpaByStudent = new Map(gpas.map((g) => [g.studentId, g]));

    res.json({
      data: cards.map((c) => ({
        id: c.id,
        status: c.status,
        verificationCode: c.verificationCode,
        teacherRemarks: c.teacherRemarks,
        principalRemarks: c.principalRemarks,
        publishedAt: c.publishedAt,
        student: {
          id: c.studentId,
          name: c.student.user.name,
          admissionNumber: c.student.admissionNumber,
          className: c.student.classRoom
            ? `${c.student.classRoom.name} ${c.student.classRoom.stream}`
            : '—',
        },
        semesterName: `${c.semester.name} — ${c.semester.academicYear.name}`,
        gpa: gpaByStudent.get(c.studentId)?.gpa ?? null,
        position: gpaByStudent.get(c.studentId)?.position ?? null,
      })),
    });
  }),
);

// GET /api/report-cards/mine?studentId — student sees own cards, parent passes a child id
reportCardsRouter.get(
  '/mine',
  authenticate,
  authorize(Role.STUDENT, Role.PARENT),
  ah(async (req, res) => {
    const me = req.user!;
    let studentId: string | undefined;

    if (me.role === Role.STUDENT) {
      const profile = await prisma.studentProfile.findFirst({
        where: { userId: me.id },
        select: { id: true },
      });
      studentId = profile?.id;
    } else {
      const { studentId: qs } = parseQuery(z.object({ studentId: z.string() }), req);
      const child = await prisma.studentProfile.findFirst({
        where: { id: qs, parent: { userId: me.id } },
        select: { id: true },
      });
      if (!child) throw AppError.forbidden('This student is not linked to your account');
      studentId = child.id;
    }
    if (!studentId) throw AppError.notFound('Student profile');

    const cards = await prisma.reportCard.findMany({
      where: { studentId, status: 'PUBLISHED' },
      include: { semester: { include: { academicYear: { select: { name: true } } } } },
      orderBy: { semester: { startDate: 'desc' } },
    });
    res.json({
      data: cards.map((c) => ({
        id: c.id,
        verificationCode: c.verificationCode,
        semesterName: `${c.semester.name} — ${c.semester.academicYear.name}`,
        publishedAt: c.publishedAt,
      })),
    });
  }),
);

type FullCard = NonNullable<Awaited<ReturnType<typeof loadReportCardDataFull>>>;

async function schoolPayload() {
  const s = await getSchoolContext();
  return { name: s.name, motto: s.motto, hasBadge: s.hasBadge };
}

/** Convert signature Buffers into browser-friendly data URLs. */
function serializeSignatures(data: FullCard) {
  const sig = (s: { name: string; title: string; png: Buffer | null } | null) =>
    s === null
      ? null
      : {
          name: s.name,
          title: s.title,
          dataUrl: s.png ? `data:image/png;base64,${s.png.toString('base64')}` : null,
        };
  return {
    ...data,
    signatures: {
      classTeacher: sig(data.signatures?.classTeacher ?? null),
      principal: sig(data.signatures?.principal ?? null),
    },
  };
}

// GET /api/report-cards/verify/:code — PUBLIC verification used by the QR code
reportCardsRouter.get(
  '/verify/:code',
  ah(async (req, res) => {
    const card = await prisma.reportCard.findUnique({
      where: { verificationCode: req.params.code },
    });
    if (!card) throw AppError.notFound('Report card');
    const data = await loadReportCardDataFull(card.id);
    if (!data || data.status !== 'PUBLISHED') {
      throw new AppError(403, 'This report card has not been published yet', 'NOT_PUBLISHED');
    }
    const verifyUrl = `${env.CLIENT_ORIGINS[0]}/verify/${data.verificationCode}`;
    res.json({
      school: await schoolPayload(),
      ...serializeSignatures(data),
      qr: await QRCode.toDataURL(verifyUrl, { margin: 1, width: 220 }),
    });
  }),
);

function canAccessCard(
  user: Express.Request['user'],
  cardStudent: { userId: string; parent: { userId: string } | null },
  status: string,
) {
  if (user!.role === Role.ADMIN) return true;
  if (status !== 'PUBLISHED') return false;
  return cardStudent.userId === user!.id || cardStudent.parent?.userId === user!.id;
}

// GET /api/report-cards/transcript/:studentId/pdf — cumulative transcript
reportCardsRouter.get(
  '/transcript/:studentId/pdf',
  authenticate,
  ah(async (req, res) => {
    const student = await prisma.studentProfile.findUnique({
      where: { id: req.params.studentId },
      select: { userId: true, parent: { select: { userId: true } } },
    });
    if (!student) throw AppError.notFound('Student');
    const me = req.user!;
    const allowed =
      me.role === Role.ADMIN ||
      me.role === Role.TEACHER ||
      student.userId === me.id ||
      student.parent?.userId === me.id;
    if (!allowed) throw AppError.forbidden();

    const pdf = await buildTranscriptPdf(req.params.studentId);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="transcript.pdf"`);
    res.send(pdf);
  }),
);

// GET /api/report-cards/:id — JSON detail (admin any; student/parent when published)
reportCardsRouter.get(
  '/:id',
  authenticate,
  ah(async (req, res) => {
    const card = await prisma.reportCard.findUnique({
      where: { id: req.params.id },
      include: { student: { select: { userId: true, parent: { select: { userId: true } } } } },
    });
    if (!card) throw AppError.notFound('Report card');
    if (!canAccessCard(req.user, card.student, card.status)) throw AppError.forbidden();
    const data = (await loadReportCardDataFull(card.id))!;
    res.json({ school: await schoolPayload(), ...serializeSignatures(data) });
  }),
);

// GET /api/report-cards/:id/pdf — download the PDF report card
reportCardsRouter.get(
  '/:id/pdf',
  authenticate,
  ah(async (req, res) => {
    const card = await prisma.reportCard.findUnique({
      where: { id: req.params.id },
      include: { student: { select: { userId: true, parent: { select: { userId: true } } } } },
    });
    if (!card) throw AppError.notFound('Report card');
    if (!canAccessCard(req.user, card.student, card.status)) throw AppError.forbidden();

    const data = await loadReportCardDataFull(card.id);
    const pdf = await buildReportCardPdf(data!);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="report_card_${data!.student.admissionNumber}.pdf"`,
    );
    res.send(pdf);
  }),
);

// PATCH /api/report-cards/:id/remarks
reportCardsRouter.patch(
  '/:id/remarks',
  authenticate,
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const body = parseBody(
      z.object({
        teacherRemarks: z.string().optional(),
        principalRemarks: z.string().optional(),
      }),
      req,
    );
    const card = await prisma.reportCard.findUnique({ where: { id: req.params.id } });
    if (!card) throw AppError.notFound('Report card');
    if (card.status === 'PUBLISHED') throw AppError.conflict('Published cards cannot be edited');
    await prisma.reportCard.update({ where: { id: card.id }, data: body });
    await logAudit(req, 'EDIT_REMARKS', 'ReportCard', card.id);
    res.json({ success: true });
  }),
);

// POST /api/report-cards/:id/publish + /publish-all
async function publishCards(cardIds: string[], adminId: string) {
  const cards = await prisma.reportCard.findMany({
    where: { id: { in: cardIds } },
    include: { student: { select: { userId: true, parent: { select: { userId: true } } } } },
  });
  await prisma.reportCard.updateMany({
    where: { id: { in: cardIds }, status: 'GENERATED' },
    data: { status: 'PUBLISHED', publishedAt: new Date(), publishedById: adminId },
  });
  const audience = cards.flatMap(
    (c) => [c.student.userId, c.student.parent?.userId].filter(Boolean) as string[],
  );
  await notifyUsers(
    audience,
    'REPORT_CARD_AVAILABLE',
    'Report card available',
    'Your report card for this term is now available. Open the Report Cards page to view or download it.',
    '/report-cards',
  );

  const extService = new ExtendedNotificationService();
  const { emailSent, smsSent } = await extService.notifyExternal(
    audience,
    'REPORT_CARD_AVAILABLE',
    'Report card available',
    'Your report card for this term is now available. View it at /report-cards',
    '/report-cards',
    true,
    false,
  );
  return { inApp: audience.length, emailSent, smsSent };
}

reportCardsRouter.post(
  '/:id/publish',
  authenticate,
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const result = await publishCards([req.params.id], req.user!.id);
    await logAudit(req, 'PUBLISH_REPORT_CARD', 'ReportCard', req.params.id);
    res.json({ success: true, notifiedInApp: result.inApp, notifiedEmail: result.emailSent, notifiedSMS: result.smsSent });
  }),
);

reportCardsRouter.post(
  '/publish-all',
  authenticate,
  authorize(Role.ADMIN),
  ah(async (req, res) => {
    const { classId, semesterId } = parseBody(
      z.object({ classId: z.string(), semesterId: z.string() }),
      req,
    );
    const enrollments = await prisma.enrollment.findMany({
      where: { classId, semesterId },
      select: { studentId: true },
    });
    const cards = await prisma.reportCard.findMany({
      where: {
        semesterId,
        studentId: { in: enrollments.map((e) => e.studentId) },
        status: 'GENERATED',
      },
      select: { id: true },
    });
    const result = await publishCards(
      cards.map((c) => c.id),
      req.user!.id,
    );
    await logAudit(req, 'PUBLISH_REPORT_CARDS', 'ReportCard', undefined, { count: cards.length });
    res.json({ published: cards.length, notifiedInApp: result.inApp, notifiedEmail: result.emailSent, notifiedSMS: result.smsSent });
  }),
);
