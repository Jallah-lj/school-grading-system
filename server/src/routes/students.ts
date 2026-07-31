import { Router } from 'express';
import { z } from 'zod';
import crypto from 'node:crypto';
import ExcelJS from 'exceljs';
import { Gender, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import {
  ah, getActiveSemester, pagination, parseBody, parseQuery,
  passwordSchema, sortDirection, USER_SAFE_SELECT,
} from '../lib/helpers';
import { hashPassword } from '../lib/password';
import { logAudit } from '../lib/audit';
import { assertPasswordConfirmed, authenticate, authorize } from '../middleware/auth';
import { ensureEnrollments } from '../services/results.service';
import { generateAdmissionNumber, withIdRetry } from '../lib/idgen';
import { getSchoolContext } from '../services/school.service';
import { parseSpreadsheetFile, spreadsheetUpload } from '../lib/spreadsheet';

export const studentsRouter = Router();
studentsRouter.use(authenticate);

const STUDENT_INCLUDE = {
  user: { select: USER_SAFE_SELECT },
  classRoom: { select: { id: true, name: true, stream: true } },
  parent: { select: { id: true, user: { select: { name: true, email: true, phone: true } } } },
} as const;

// GET /api/students — search, filter, sort, paginate
studentsRouter.get('/', authorize(Role.ADMIN, Role.TEACHER), ah(async (req, res) => {
  const query = parseQuery(z.object({
    search: z.string().optional(),
    classId: z.string().optional(),
    gender: z.nativeEnum(Gender).optional(),
    sortBy: z.enum(['name', 'admissionNumber', 'createdAt']).optional(),
    sortDir: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().optional(),
    pageSize: z.coerce.number().optional(),
  }), req);
  const { skip, take, page, pageSize } = pagination(query);

  const where = {
    ...(query.classId ? { classId: query.classId } : {}),
    ...(query.gender ? { gender: query.gender } : {}),
    ...(query.search
      ? { OR: [
          { admissionNumber: { contains: query.search, mode: 'insensitive' as const } },
          { user: { name: { contains: query.search, mode: 'insensitive' as const } } },
          { user: { email: { contains: query.search, mode: 'insensitive' as const } } },
        ] }
      : {}),
  };

  const orderBy =
    query.sortBy === 'admissionNumber' ? { admissionNumber: sortDirection(query.sortDir) } :
    query.sortBy === 'name' ? { user: { name: sortDirection(query.sortDir) } } :
    { createdAt: sortDirection(query.sortDir) };

  const [data, total] = await Promise.all([
    prisma.studentProfile.findMany({ where, include: STUDENT_INCLUDE, orderBy, skip, take }),
    prisma.studentProfile.count({ where }),
  ]);
  res.json({ data, total, page, pageSize });
}));

// The system assigns admission numbers automatically; manual override kept
// optional on the API for imports/migrations. It is immutable after creation.
const upsertStudentSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  admissionNumber: z.string().min(3).optional(),
  dateOfBirth: z.coerce.date(),
  gender: z.nativeEnum(Gender),
  classId: z.string().nullable().optional(),
  parentEmail: z.string().email().nullable().optional(),
  address: z.string().optional(),
  guardianPhone: z.string().optional(),
  photoUrl: z.string().url().optional(),
});
const updateStudentSchema = upsertStudentSchema.omit({ admissionNumber: true }).partial();

// POST /api/students — admin registers a student (creates login account + profile)
studentsRouter.post('/', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(upsertStudentSchema.extend({ password: passwordSchema }), req);

  const parent = body.parentEmail
    ? await prisma.parentProfile.findFirst({ where: { user: { email: body.parentEmail.toLowerCase() } } })
    : null;
  if (body.parentEmail && !parent) {
    throw AppError.badRequest(`No parent account found with email ${body.parentEmail}`);
  }

  const school = await getSchoolContext();
  let year = new Date().getFullYear();
  const active = await prisma.semester.findFirst({ where: { isCurrent: true }, include: { academicYear: true } });
  if (active) year = new Date(active.academicYear.startDate).getFullYear();

  const student = await withIdRetry(() => prisma.$transaction(async (tx) => {
    const admissionNumber = body.admissionNumber ?? (await generateAdmissionNumber(tx, school.studentIdPrefix, year));
    const user = await tx.user.create({
      data: {
        email: body.email.toLowerCase(),
        name: body.name,
        role: Role.STUDENT,
        passwordHash: await hashPassword(body.password),
      },
    });
    const profile = await tx.studentProfile.create({
      data: {
        userId: user.id,
        admissionNumber,
        dateOfBirth: body.dateOfBirth,
        gender: body.gender,
        classId: body.classId ?? null,
        parentId: parent?.id ?? null,
        address: body.address,
        guardianPhone: body.guardianPhone,
        photoUrl: body.photoUrl,
      },
      include: STUDENT_INCLUDE,
    });

    // Enroll into the active semester immediately when a class is assigned.
    if (body.classId) {
      try {
        const semester = await getActiveSemester();
        await tx.enrollment.upsert({
          where: { studentId_semesterId: { studentId: profile.id, semesterId: semester.id } },
          create: { studentId: profile.id, classId: body.classId, semesterId: semester.id },
          update: { classId: body.classId },
        });
      } catch { /* no active semester yet — harmless */ }
    }
    return profile;
  }));

  await logAudit(req, 'CREATE_STUDENT', 'StudentProfile', student.id, { admissionNumber: student.admissionNumber });
  res.status(201).json(student);
}));

// === Bulk import from Excel / CSV ===

const IMPORT_HEADERS = ['name', 'email', 'password', 'dateOfBirth', 'gender', 'class', 'stream', 'parentEmail', 'guardianPhone', 'address'] as const;
const HEADER_ALIASES: Record<(typeof IMPORT_HEADERS)[number], string[]> = {
  name: ['name', 'fullname', 'studentname', 'student'],
  email: ['email', 'emailaddress', 'studentemail'],
  password: ['password', 'pass'],
  dateOfBirth: ['dateofbirth', 'dob', 'birthdate'],
  gender: ['gender', 'sex'],
  class: ['class', 'classname', 'grade'],
  stream: ['stream', 'section'],
  parentEmail: ['parentemail', 'parent', 'parentsemail'],
  guardianPhone: ['guardianphone', 'phone', 'parentphone', 'telephone', 'tel'],
  address: ['address', 'homeaddress', 'residence'],
};
const normalizeHeader = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');

function mapRow(raw: Record<string, string>): Record<(typeof IMPORT_HEADERS)[number], string> {
  const byNormalized = new Map(Object.entries(raw).map(([k, v]) => [normalizeHeader(k), v]));
  const out = {} as Record<(typeof IMPORT_HEADERS)[number], string>;
  for (const key of IMPORT_HEADERS) {
    out[key] = (HEADER_ALIASES[key].map((a) => byNormalized.get(a)).find((v) => v !== undefined) ?? '').trim();
  }
  return out;
}

/** GET /api/students/import/template — .xlsx with headers, guide and valid class values */
studentsRouter.get('/import/template', authorize(Role.ADMIN), ah(async (_req, res) => {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Students');
  ws.columns = [
    { header: 'name', width: 26 }, { header: 'email', width: 30 }, { header: 'password', width: 16 },
    { header: 'dateOfBirth', width: 14 }, { header: 'gender', width: 10 }, { header: 'class', width: 14 },
    { header: 'stream', width: 10 }, { header: 'parentEmail', width: 28 },
    { header: 'guardianPhone', width: 16 }, { header: 'address', width: 24 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE0E7FF' } };

  const classes = await prisma.classRoom.findMany({
    select: { name: true, stream: true },
    orderBy: [{ name: 'asc' }, { stream: 'asc' }],
  });
  const wsClasses = wb.addWorksheet('Classes');
  wsClasses.columns = [{ header: 'class', width: 16 }, { header: 'stream', width: 10 }];
  wsClasses.getRow(1).font = { bold: true };
  for (const c of classes) wsClasses.addRow([c.name, c.stream]);

  const wsNotes = wb.addWorksheet('How to use');
  [
    'Fill the "Students" sheet — one student per row, starting at row 2. Do not change the header row.',
    '',
    'REQUIRED: name, email (unique, becomes the login), dateOfBirth (YYYY-MM-DD), gender (MALE | FEMALE | OTHER).',
    'OPTIONAL: password — leave blank and a secure one is generated for you (you will receive the full credentials list after import).',
    'OPTIONAL: class + stream must exactly match a row on the "Classes" sheet (copied from the system) — leave both blank to enrol later.',
    'OPTIONAL: parentEmail must belong to an existing parent account. guardianPhone and address are free text.',
    '',
    'Admission numbers are assigned automatically by the system. Max 500 rows per file. Rows with problems are skipped and reported — the rest are imported.',
  ].forEach((line) => wsNotes.addRow([line]));
  wsNotes.getColumn(1).width = 120;

  const buf = await wb.xlsx.writeBuffer();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="students_import_template.xlsx"');
  res.send(Buffer.from(buf as ArrayBuffer));
}));

const importRowSchema = z.object({
  name: z.string().min(2, 'name is required'),
  email: z.string().toLowerCase().email('invalid email'),
  password: z.string().optional(),
  dateOfBirth: z.string().refine((s) => s !== '' && !Number.isNaN(Date.parse(s)), 'dateOfBirth must be YYYY-MM-DD'),
  gender: z.string().toUpperCase().pipe(z.nativeEnum(Gender)),
  class: z.string(),
  stream: z.string(),
  parentEmail: z.string().toLowerCase(),
});

/** Random initial password that always satisfies the policy (letters + digits). */
const generatedPassword = () => `Stu${crypto.randomInt(100000, 999999)}x`;

/**
 * POST /api/students/import — multipart { file: .xlsx | .csv } (max 5 MB, 500 rows).
 * Processes row by row: valid rows are created (auto admission number +
 * enrolment into the active term), invalid rows are reported and skipped.
 */
studentsRouter.post('/import', authorize(Role.ADMIN), spreadsheetUpload.single('file'), ah(async (req, res) => {
  if (!req.file) throw AppError.badRequest('Attach an .xlsx or .csv file (max 5 MB)');
  const rawRows = await parseSpreadsheetFile(req.file);
  if (rawRows.length === 0) throw AppError.badRequest('The file contains no data rows below the header');
  if (rawRows.length > 500) throw AppError.badRequest('Too many rows — split the file into batches of 500 students');

  const rows = rawRows.map(mapRow);

  const school = await getSchoolContext();
  let year = new Date().getFullYear();
  const active = await prisma.semester.findFirst({ where: { isCurrent: true }, include: { academicYear: true } });
  if (active) year = new Date(active.academicYear.startDate).getFullYear();
  let activeSemesterId: string | null = null;
  try { activeSemesterId = (await getActiveSemester()).id; } catch { /* no active term — skip enrolment */ }

  const classes = await prisma.classRoom.findMany({ select: { id: true, name: true, stream: true } });
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const byPair = new Map(classes.map((c) => [`${norm(c.name)}|${norm(c.stream)}`, c.id]));
  const byName = new Map<string, string[]>();
  for (const c of classes) byName.set(norm(c.name), [...(byName.get(norm(c.name)) ?? []), c.id]);

  const result = {
    created: 0,
    failed: 0,
    errors: [] as { row: number; email: string; reason: string }[],
    credentials: [] as { name: string; email: string; password: string }[],
  };
  const seenEmails = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 2; // header is row 1 in the spreadsheet
    const raw = rows[i];
    const fail = (reason: string) => {
      result.failed += 1;
      result.errors.push({ row: rowNo, email: raw.email || '—', reason });
    };

    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      fail(`${issue.path.join('.')}: ${issue.message}`);
      continue;
    }
    const row = parsed.data;

    if (row.password) {
      const pwCheck = passwordSchema.safeParse(row.password);
      if (!pwCheck.success) { fail('password must be 8+ characters with a letter and a number'); continue; }
    }
    if (seenEmails.has(row.email)) { fail('duplicate email within the file'); continue; }
    seenEmails.add(row.email);

    let classId: string | null = null;
    if (row.class) {
      classId = row.stream
        ? byPair.get(`${norm(row.class)}|${norm(row.stream)}`) ?? null
        : (byName.get(norm(row.class))?.length === 1 ? byName.get(norm(row.class))![0] : null);
      if (!classId) { fail(`class "${row.class}${row.stream ? ` ${row.stream}` : ''}" not found — see the Classes sheet in the template`); continue; }
    }

    let parentId: string | null = null;
    if (row.parentEmail) {
      const parent = await prisma.parentProfile.findFirst({ where: { user: { email: row.parentEmail } }, select: { id: true } });
      if (!parent) { fail(`no parent account with email ${row.parentEmail}`); continue; }
      parentId = parent.id;
    }

    const effectivePassword = row.password || generatedPassword();
    try {
      await withIdRetry(() => prisma.$transaction(async (tx) => {
        const admissionNumber = await generateAdmissionNumber(tx, school.studentIdPrefix, year);
        const user = await tx.user.create({
          data: { email: row.email, name: row.name, role: Role.STUDENT, passwordHash: await hashPassword(effectivePassword) },
        });
        const profile = await tx.studentProfile.create({
          data: {
            userId: user.id, admissionNumber, dateOfBirth: new Date(row.dateOfBirth),
            gender: row.gender, classId, parentId,
            address: raw.address || undefined, guardianPhone: raw.guardianPhone || undefined,
          },
        });
        if (classId && activeSemesterId) {
          await tx.enrollment.upsert({
            where: { studentId_semesterId: { studentId: profile.id, semesterId: activeSemesterId } },
            create: { studentId: profile.id, classId, semesterId: activeSemesterId },
            update: { classId },
          });
        }
      }));
      result.created += 1;
      result.credentials.push({ name: row.name, email: row.email, password: row.password ? '(set in file)' : effectivePassword });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') fail('email already registered in the system');
      else throw err;
    }
  }

  await logAudit(req, 'BULK_IMPORT_STUDENTS', 'StudentProfile', undefined, {
    file: req.file.originalname, created: result.created, failed: result.failed,
  });
  res.json({ ...result, file: req.file.originalname });
}));

studentsRouter.get('/:id', ah(async (req, res) => {
  const student = await prisma.studentProfile.findUnique({
    where: { id: req.params.id },
    include: {
      ...STUDENT_INCLUDE,
      enrollments: {
        include: { classRoom: { select: { name: true, stream: true } }, semester: { select: { name: true } } },
      },
    },
  });
  if (!student) throw AppError.notFound('Student');
  res.json(student);
}));

// PUT /api/students/:id
studentsRouter.put('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const body = parseBody(updateStudentSchema, req);
  const existing = await prisma.studentProfile.findUnique({ where: { id: req.params.id } });
  if (!existing) throw AppError.notFound('Student');

  const student = await prisma.$transaction(async (tx) => {
    if (body.name || body.email) {
      await tx.user.update({
        where: { id: existing.userId },
        data: {
          ...(body.name ? { name: body.name } : {}),
          ...(body.email ? { email: body.email.toLowerCase() } : {}),
        },
      });
    }
    const updated = await tx.studentProfile.update({
      where: { id: existing.id },
      data: {
        dateOfBirth: body.dateOfBirth,
        gender: body.gender,
        classId: body.classId === null ? null : body.classId ?? undefined,
        address: body.address,
        guardianPhone: body.guardianPhone,
        photoUrl: body.photoUrl,
      },
      include: STUDENT_INCLUDE,
    });
    if (body.classId) {
      try {
        const semester = await getActiveSemester();
        await tx.enrollment.upsert({
          where: { studentId_semesterId: { studentId: updated.id, semesterId: semester.id } },
          create: { studentId: updated.id, classId: body.classId, semesterId: semester.id },
          update: { classId: body.classId },
        });
      } catch { /* no active semester yet */ }
    }
    return updated;
  });

  await logAudit(req, 'UPDATE_STUDENT', 'StudentProfile', student.id);
  res.json(student);
}));

// DELETE /api/students/:id — destructive: requires the admin to re-enter their
// own password (body: { password }). Failed confirmations are recorded as
// security events in the audit log.
studentsRouter.delete('/:id', authorize(Role.ADMIN), ah(async (req, res) => {
  const existing = await prisma.studentProfile.findUnique({ where: { id: req.params.id } });
  if (!existing) throw AppError.notFound('Student');
  try {
    await assertPasswordConfirmed(req);
  } catch (err) {
    if (err instanceof AppError && err.code === 'PASSWORD_CONFIRMATION_FAILED') {
      await logAudit(req, 'DELETE_STUDENT_DENIED', 'StudentProfile', existing.id, {
        admissionNumber: existing.admissionNumber, reason: 'password_verification_failed',
      });
    }
    throw err;
  }
  await prisma.user.delete({ where: { id: existing.userId } }); // cascades
  await logAudit(req, 'DELETE_STUDENT', 'StudentProfile', existing.id, { admissionNumber: existing.admissionNumber });
  res.json({ success: true });
}));

/**
 * GET /api/students/:id/results?semesterId=
 * Published subject results + GPA record. Access: the student, their parent,
 * any teacher, or admin. Admins/teachers may pass all=true to see unpublished.
 */
studentsRouter.get('/:id/results', ah(async (req, res) => {
  const studentId = req.params.id;
  const { semesterId: qsSemester, all } = parseQuery(z.object({
    semesterId: z.string().optional(),
    all: z.enum(['true', 'false']).optional(),
  }), req);

  const student = await prisma.studentProfile.findUnique({
    where: { id: studentId },
    select: { id: true, userId: true, parent: { select: { userId: true } } },
  });
  if (!student) throw AppError.notFound('Student');

  const me = req.user!;
  const isSelf = student.userId === me.id;
  const isParent = student.parent?.userId === me.id;
  const privileged = me.role === Role.ADMIN || me.role === Role.TEACHER;
  if (!isSelf && !isParent && !privileged) throw AppError.forbidden();

  const includeUnpublished = privileged && all === 'true';
  const semesterId = qsSemester ?? (await getActiveSemester()).id;
  const semester = await prisma.semester.findUnique({
    where: { id: semesterId },
    include: { academicYear: true },
  });
  if (!semester) throw AppError.notFound('Semester');

  const visibility = includeUnpublished ? {} : { isPublished: true };
  const [results, gpa] = await Promise.all([
    prisma.subjectResult.findMany({
      where: { studentId, semesterId, ...visibility },
      include: { subject: { select: { code: true, name: true, creditUnits: true } } },
      orderBy: { subject: { code: 'asc' } },
    }),
    prisma.gPARecord.findFirst({ where: { studentId, semesterId, ...visibility } }),
  ]);

  res.json({ semester, results, gpa });
}));
