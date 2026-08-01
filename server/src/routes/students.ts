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

type ClassLookup = {
  byPair: Map<string, string>;
  byName: Map<string, string[]>;
  norm: (s: string) => string;
};

async function buildClassLookup(): Promise<ClassLookup> {
  const classes = await prisma.classRoom.findMany({ select: { id: true, name: true, stream: true } });
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');
  const byPair = new Map(classes.map((c) => [`${norm(c.name)}|${norm(c.stream)}`, c.id]));
  const byName = new Map<string, string[]>();
  for (const c of classes) byName.set(norm(c.name), [...(byName.get(norm(c.name)) ?? []), c.id]);
  return { byPair, byName, norm };
}

function resolveClassId(row: { class: string; stream: string }, lookup: ClassLookup): string | null {
  if (!row.class) return null;
  if (row.stream) return lookup.byPair.get(`${lookup.norm(row.class)}|${lookup.norm(row.stream)}`) ?? null;
  const ids = lookup.byName.get(lookup.norm(row.class));
  return ids?.length === 1 ? ids[0]! : null;
}

/** Friendly, actionable validation messages for import rows. */
function friendlyImportError(path: string, message: string, raw: Record<string, string>): string {
  const field = path || 'row';
  const value = raw[field as keyof typeof raw] ?? '';
  if (field === 'name') return 'Name is required (at least 2 characters).';
  if (field === 'email') {
    if (!value) return 'Email is required — this becomes the student login.';
    return `Invalid email “${value}”. Use a full address like student@school.rw.`;
  }
  if (field === 'dateOfBirth') {
    if (!value) return 'Date of birth is required. Use YYYY-MM-DD (e.g. 2010-05-14).';
    return `Date of birth “${value}” is not valid. Use YYYY-MM-DD (e.g. 2010-05-14).`;
  }
  if (field === 'gender') {
    if (!value) return 'Gender is required. Use MALE, FEMALE or OTHER.';
    return `Gender “${value}” is not recognised. Use MALE, FEMALE or OTHER.`;
  }
  return `${field}: ${message}`;
}

interface ValidatedImportRow {
  row: number;
  name: string;
  email: string;
  gender: string;
  dateOfBirth: string;
  classLabel: string;
  classId: string | null;
  parentEmail: string;
  passwordMode: 'provided' | 'generated';
  ok: true;
}

interface FailedImportRow {
  row: number;
  email: string;
  name: string;
  reason: string;
  ok: false;
}

async function validateImportRows(rawRows: Record<string, string>[]): Promise<{
  valid: ValidatedImportRow[];
  failed: FailedImportRow[];
  summary: { total: number; ready: number; problems: number };
}> {
  const rows = rawRows.map(mapRow);
  const lookup = await buildClassLookup();
  const existingEmails = new Set(
    (await prisma.user.findMany({
      where: { email: { in: rows.map((r) => r.email.toLowerCase()).filter(Boolean) } },
      select: { email: true },
    })).map((u) => u.email),
  );
  const parentEmails = [...new Set(rows.map((r) => r.parentEmail.toLowerCase()).filter(Boolean))];
  const parents = parentEmails.length
    ? await prisma.parentProfile.findMany({
      where: { user: { email: { in: parentEmails } } },
      select: { id: true, user: { select: { email: true } } },
    })
    : [];
  const parentByEmail = new Map(parents.map((p) => [p.user.email, p.id]));

  const valid: ValidatedImportRow[] = [];
  const failed: FailedImportRow[] = [];
  const seenEmails = new Set<string>();

  for (let i = 0; i < rows.length; i++) {
    const rowNo = i + 2;
    const raw = rows[i]!;
    const fail = (reason: string) => {
      failed.push({ row: rowNo, email: raw.email || '—', name: raw.name || '—', reason, ok: false });
    };

    // Skip completely empty rows
    if (!raw.name && !raw.email && !raw.dateOfBirth && !raw.gender) continue;

    const parsed = importRowSchema.safeParse(raw);
    if (!parsed.success) {
      const issue = parsed.error.issues[0]!;
      fail(friendlyImportError(String(issue.path[0] ?? ''), issue.message, raw));
      continue;
    }
    const row = parsed.data;

    if (row.password) {
      const pwCheck = passwordSchema.safeParse(row.password);
      if (!pwCheck.success) {
        fail('Password must be at least 8 characters and include both a letter and a number. Leave blank to auto-generate.');
        continue;
      }
    }
    if (seenEmails.has(row.email)) {
      fail(`Duplicate email “${row.email}” appears earlier in this file. Each student needs a unique email.`);
      continue;
    }
    seenEmails.add(row.email);

    if (existingEmails.has(row.email)) {
      fail(`Email “${row.email}” is already registered. Skip this row or use a different email.`);
      continue;
    }

    let classId: string | null = null;
    if (row.class) {
      classId = resolveClassId(row, lookup);
      if (!classId) {
        fail(
          row.stream
            ? `Class “${row.class} ${row.stream}” was not found. Open the template’s Classes sheet and copy the exact name + stream.`
            : `Class “${row.class}” was not found or matches more than one stream. Add the stream column (e.g. A) from the Classes sheet.`,
        );
        continue;
      }
    }

    if (row.parentEmail && !parentByEmail.has(row.parentEmail)) {
      fail(`No parent account exists for “${row.parentEmail}”. Create the parent first, or leave parentEmail blank.`);
      continue;
    }

    valid.push({
      row: rowNo,
      name: row.name,
      email: row.email,
      gender: row.gender,
      dateOfBirth: row.dateOfBirth,
      classLabel: row.class ? `${row.class}${row.stream ? ` ${row.stream}` : ''}` : '— Unassigned —',
      classId,
      parentEmail: row.parentEmail || '',
      passwordMode: row.password ? 'provided' : 'generated',
      ok: true,
    });
  }

  return {
    valid,
    failed,
    summary: { total: valid.length + failed.length, ready: valid.length, problems: failed.length },
  };
}

/**
 * POST /api/students/import/preview — validate a spreadsheet without writing anything.
 * Returns a row-by-row preview so admins can fix problems before committing.
 */
studentsRouter.post('/import/preview', authorize(Role.ADMIN), spreadsheetUpload.single('file'), ah(async (req, res) => {
  if (!req.file) throw AppError.badRequest('Attach an .xlsx or .csv file (max 5 MB)');
  const rawRows = await parseSpreadsheetFile(req.file);
  if (rawRows.length === 0) throw AppError.badRequest('The file contains no data rows below the header. Add students starting at row 2.');
  if (rawRows.length > 500) throw AppError.badRequest('Too many rows — split the file into batches of 500 students or fewer.');

  const validated = await validateImportRows(rawRows);
  res.json({
    file: req.file.originalname,
    ...validated.summary,
    preview: validated.valid.slice(0, 50),
    previewTotal: validated.valid.length,
    errors: validated.failed.map((f) => ({ row: f.row, email: f.email, name: f.name, reason: f.reason })),
  });
}));

/**
 * POST /api/students/import — multipart { file: .xlsx | .csv } (max 5 MB, 500 rows).
 * Processes row by row: valid rows are created (auto admission number +
 * enrolment into the active term), invalid rows are reported and skipped.
 */
studentsRouter.post('/import', authorize(Role.ADMIN), spreadsheetUpload.single('file'), ah(async (req, res) => {
  if (!req.file) throw AppError.badRequest('Attach an .xlsx or .csv file (max 5 MB)');
  const rawRows = await parseSpreadsheetFile(req.file);
  if (rawRows.length === 0) throw AppError.badRequest('The file contains no data rows below the header. Add students starting at row 2.');
  if (rawRows.length > 500) throw AppError.badRequest('Too many rows — split the file into batches of 500 students or fewer.');

  const rows = rawRows.map(mapRow);
  const validated = await validateImportRows(rawRows);

  const school = await getSchoolContext();
  let year = new Date().getFullYear();
  const active = await prisma.semester.findFirst({ where: { isCurrent: true }, include: { academicYear: true } });
  if (active) year = new Date(active.academicYear.startDate).getFullYear();
  let activeSemesterId: string | null = null;
  try { activeSemesterId = (await getActiveSemester()).id; } catch { /* no active term — skip enrolment */ }

  // Map original row data by row number for password / address fields
  const rawByRow = new Map<number, Record<(typeof IMPORT_HEADERS)[number], string>>();
  for (let i = 0; i < rows.length; i++) rawByRow.set(i + 2, rows[i]!);

  const parents = await prisma.parentProfile.findMany({
    where: { user: { email: { in: validated.valid.map((v) => v.parentEmail).filter(Boolean) } } },
    select: { id: true, user: { select: { email: true } } },
  });
  const parentByEmail = new Map(parents.map((p) => [p.user.email, p.id]));

  const result = {
    created: 0,
    failed: validated.failed.length,
    errors: validated.failed.map((f) => ({ row: f.row, email: f.email, reason: f.reason })),
    credentials: [] as { name: string; email: string; password: string }[],
  };

  for (const row of validated.valid) {
    const raw = rawByRow.get(row.row)!;
    const effectivePassword = raw.password || generatedPassword();
    const parentId = row.parentEmail ? parentByEmail.get(row.parentEmail) ?? null : null;
    try {
      await withIdRetry(() => prisma.$transaction(async (tx) => {
        const admissionNumber = await generateAdmissionNumber(tx, school.studentIdPrefix, year);
        const user = await tx.user.create({
          data: { email: row.email, name: row.name, role: Role.STUDENT, passwordHash: await hashPassword(effectivePassword) },
        });
        const profile = await tx.studentProfile.create({
          data: {
            userId: user.id, admissionNumber, dateOfBirth: new Date(row.dateOfBirth),
            gender: row.gender as Gender, classId: row.classId, parentId,
            address: raw.address || undefined, guardianPhone: raw.guardianPhone || undefined,
          },
        });
        if (row.classId && activeSemesterId) {
          await tx.enrollment.upsert({
            where: { studentId_semesterId: { studentId: profile.id, semesterId: activeSemesterId } },
            create: { studentId: profile.id, classId: row.classId, semesterId: activeSemesterId },
            update: { classId: row.classId },
          });
        }
      }));
      result.created += 1;
      result.credentials.push({
        name: row.name,
        email: row.email,
        password: raw.password ? '(set in file)' : effectivePassword,
      });
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') {
        result.failed += 1;
        result.errors.push({ row: row.row, email: row.email, reason: `Email “${row.email}” is already registered. Skip this row or use a different email.` });
      } else throw err;
    }
  }

  await logAudit(req, 'BULK_IMPORT_STUDENTS', 'StudentProfile', undefined, {
    file: req.file.originalname, created: result.created, failed: result.failed,
  });
  res.json({ ...result, file: req.file.originalname });
}));

studentsRouter.get('/:id', authorize(Role.ADMIN, Role.TEACHER), ah(async (req, res) => {
  const student = await prisma.studentProfile.findUnique({
    where: { id: req.params.id },
    include: {
      ...STUDENT_INCLUDE,
      enrollments: {
        include: {
          classRoom: { select: { id: true, name: true, stream: true } },
          semester: { select: { id: true, name: true, academicYear: { select: { name: true } } } },
        },
        orderBy: { semester: { startDate: 'desc' } },
      },
      gpaRecords: {
        include: {
          semester: { select: { id: true, name: true, academicYear: { select: { name: true } } } },
        },
        orderBy: { semester: { startDate: 'desc' } },
        take: 12,
      },
      reportCards: {
        select: {
          id: true, status: true, verificationCode: true, publishedAt: true,
          semester: { select: { name: true, academicYear: { select: { name: true } } } },
        },
        orderBy: { generatedAt: 'desc' },
        take: 8,
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
