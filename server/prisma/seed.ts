/**
 * Seed script — populates a fully working demo school:
 * npx tsx prisma/seed.ts
 *
 * Creates: grading scale (spec table), academic year with 3 terms, subjects
 * with weighted assessment components, classes, teachers with assignments,
 * students (linked to a parent), enrollments, and a complete set of already
 * published Term-2 results computed through the same engine the API uses.
 */
import { PrismaClient, Role, Gender, ComponentType } from '@prisma/client';
import sharp from 'sharp';

import { hashPassword } from '../src/lib/password';
import {
  ensureEnrollments,
  recomputeGpas,
  recomputeSubjectResults,
} from '../src/services/results.service';

const prisma = new PrismaClient();

/** Deterministic RNG so demo data is stable between runs. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260130);

async function main() {
  console.log(' Seeding School Grading System…');

  // ── Clean slate (children first) ───────────────────────────────────────────
  await prisma.$transaction([
    prisma.notification.deleteMany(),
    prisma.auditLog.deleteMany(),
    prisma.schoolSetting.deleteMany(),
    prisma.idSequence.deleteMany(),
    prisma.reportCard.deleteMany(),
    prisma.gPARecord.deleteMany(),
    prisma.subjectResult.deleteMany(),
    prisma.gradeEntry.deleteMany(),
    prisma.enrollment.deleteMany(),
    prisma.teacherAssignment.deleteMany(),
    prisma.assessmentComponent.deleteMany(),
    prisma.gradeScaleBand.deleteMany(),
    prisma.gradeScale.deleteMany(),
    prisma.subject.deleteMany(),
    prisma.studentProfile.deleteMany(),
    prisma.teacherProfile.deleteMany(),
    prisma.parentProfile.deleteMany(),
    prisma.classRoom.deleteMany(),
    prisma.semester.deleteMany(),
    prisma.academicYear.deleteMany(),
    prisma.signature.deleteMany(),
    prisma.refreshToken.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // ── Grading scale (from the specification) ─────────────────────────────────
  const scale = await prisma.gradeScale.create({
    data: {
      name: 'Standard Scale (A+ to F)',
      isActive: true,
      bands: {
        create: [
          { minScore: 90, maxScore: 100, letter: 'A+', gradePoint: 4.0, remark: 'Excellent' },
          { minScore: 80, maxScore: 89.99, letter: 'A', gradePoint: 3.7, remark: 'Very Good' },
          { minScore: 70, maxScore: 79.99, letter: 'B+', gradePoint: 3.3, remark: 'Good' },
          { minScore: 60, maxScore: 69.99, letter: 'B', gradePoint: 3.0, remark: 'Credit' },
          { minScore: 50, maxScore: 59.99, letter: 'C', gradePoint: 2.0, remark: 'Pass' },
          { minScore: 0, maxScore: 49.99, letter: 'F', gradePoint: 0.0, remark: 'Fail' },
        ],
      },
    },
    include: { bands: true },
  });
  console.log(` grading scale: ${scale.name} (${scale.bands.length} bands)`);

  // ── Users ──────────────────────────────────────────────────────────────────
  const [adminHash, teacherHash, studentHash, parentHash] = await Promise.all([
    hashPassword('Admin@123'),
    hashPassword('Teacher@123'),
    hashPassword('Student@123'),
    hashPassword('Parent@123'),
  ]);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@school.rw',
      name: 'Aline Uwase',
      role: Role.ADMIN,
      passwordHash: adminHash,
    },
  });
  const parentUser = await prisma.user.create({
    data: {
      email: 'parent@school.rw',
      name: 'Jean Bosco Nkurunziza',
      role: Role.PARENT,
      passwordHash: parentHash,
    },
  });
  const parent = await prisma.parentProfile.create({ data: { userId: parentUser.id } });

  const teacherDefs = [
    {
      email: 'm.habimana@school.rw',
      name: 'Emmanuel Habimana',
      staffNumber: 'STF-001',
      qualification: 'B.Ed Mathematics',
    },
    {
      email: 'c.mukamana@school.rw',
      name: 'Claudine Mukamana',
      staffNumber: 'STF-002',
      qualification: 'B.Ed Sciences',
    },
    {
      email: 'p.nsengimana@school.rw',
      name: 'Patrick Nsengimana',
      staffNumber: 'STF-003',
      qualification: 'B.Ed Humanities',
    },
  ];
  const teachers = [] as { id: string; userId: string }[];
  for (const t of teacherDefs) {
    const user = await prisma.user.create({
      data: { email: t.email, name: t.name, role: Role.TEACHER, passwordHash: teacherHash },
    });
    const profile = await prisma.teacherProfile.create({
      data: { userId: user.id, staffNumber: t.staffNumber, qualification: t.qualification },
    });
    teachers.push({ id: profile.id, userId: user.id });
  }

  // ── Academic year with 3 terms (current = Term 3) ──────────────────────────
  const year = await prisma.academicYear.create({
    data: {
      name: '2025–2026',
      startDate: new Date('2025-09-08'),
      endDate: new Date('2026-07-10'),
      isActive: true,
      semesters: {
        create: [
          {
            name: 'Term 1',
            number: 1,
            kind: 'TERM',
            startDate: new Date('2025-09-08'),
            endDate: new Date('2025-12-05'),
          },
          {
            name: 'Term 2',
            number: 2,
            kind: 'TERM',
            startDate: new Date('2026-01-12'),
            endDate: new Date('2026-04-03'),
          },
          {
            name: 'Term 3',
            number: 3,
            kind: 'TERM',
            startDate: new Date('2026-04-28'),
            endDate: new Date('2026-07-10'),
            isCurrent: true,
          },
        ],
      },
    },
    include: { semesters: true },
  });
  const term2 = year.semesters.find((s) => s.number === 2)!;
  const term3 = year.semesters.find((s) => s.number === 3)!;
  console.log(
    ` academic year ${year.name} with ${year.semesters.length} terms (current: ${term3.name})`,
  );

  // ── Classes ────────────────────────────────────────────────────────────────
  const s1a = await prisma.classRoom.create({
    data: {
      name: 'Senior 1',
      level: 1,
      stream: 'A',
      academicYearId: year.id,
      homeroomTeacherId: teachers[0].id,
    },
  });
  const s2a = await prisma.classRoom.create({
    data: {
      name: 'Senior 2',
      level: 2,
      stream: 'A',
      academicYearId: year.id,
      homeroomTeacherId: teachers[1].id,
    },
  });

  // ── Subjects + assessment components (weights sum to 100) ──────────────────
  const defaultComponents = [
    { type: ComponentType.ASSIGNMENT, name: 'Assignments', weight: 10, maxScore: 100 },
    { type: ComponentType.QUIZ, name: 'Quizzes', weight: 10, maxScore: 100 },
    { type: ComponentType.CAT, name: 'CAT', weight: 20, maxScore: 100 },
    { type: ComponentType.MIDTERM, name: 'Midterm Exam', weight: 20, maxScore: 100 },
    { type: ComponentType.FINAL, name: 'Final Exam', weight: 40, maxScore: 100 },
  ];
  const csComponents = [
    { type: ComponentType.ASSIGNMENT, name: 'Assignments', weight: 10, maxScore: 100 },
    { type: ComponentType.QUIZ, name: 'Quizzes', weight: 5, maxScore: 100 },
    { type: ComponentType.CAT, name: 'CAT', weight: 15, maxScore: 100 },
    { type: ComponentType.PROJECT, name: 'Project', weight: 15, maxScore: 100 },
    { type: ComponentType.MIDTERM, name: 'Midterm Exam', weight: 15, maxScore: 100 },
    { type: ComponentType.FINAL, name: 'Final Exam', weight: 40, maxScore: 100 },
  ];

  const subjectDefs = [
    { code: 'MAT', name: 'Mathematics', creditUnits: 4, department: 'Sciences', teacher: 0 },
    { code: 'ENG', name: 'English', creditUnits: 3, department: 'Languages', teacher: 2 },
    { code: 'KIN', name: 'Kinyarwanda', creditUnits: 2, department: 'Languages', teacher: 2 },
    { code: 'PHY', name: 'Physics', creditUnits: 3, department: 'Sciences', teacher: 1 },
    { code: 'CHM', name: 'Chemistry', creditUnits: 3, department: 'Sciences', teacher: 1 },
    { code: 'BIO', name: 'Biology', creditUnits: 3, department: 'Sciences', teacher: 1 },
    { code: 'HIS', name: 'History', creditUnits: 2, department: 'Humanities', teacher: 2 },
    { code: 'CSC', name: 'Computer Science', creditUnits: 3, department: 'Sciences', teacher: 0 },
  ];

  const subjects = [] as { id: string; code: string; name: string; teacherIdx: number }[];
  for (const def of subjectDefs) {
    const subject = await prisma.subject.create({
      data: {
        code: def.code,
        name: def.name,
        creditUnits: def.creditUnits,
        department: def.department,
        components: { create: def.code === 'CSC' ? csComponents : defaultComponents },
      },
      include: { components: true },
    });
    subjects.push({ id: subject.id, code: def.code, name: def.name, teacherIdx: def.teacher });
    // General components for MAT for Senior 2 too — same subject, assignments below.
    for (const classId of [s1a.id, s2a.id]) {
      await prisma.teacherAssignment.create({
        data: { teacherId: teachers[def.teacher].id, subjectId: subject.id, classId },
      });
    }
  }
  console.log(` ${subjects.length} subjects with weighted components + teacher assignments`);

  // ── Students ───────────────────────────────────────────────────────────────
  const studentNames = [
    ['Aline Ingabire', Gender.FEMALE],
    ['Kevin Mugisha', Gender.MALE],
    ['Diane Umutoni', Gender.FEMALE],
    ['Eric Niyonkuru', Gender.MALE],
    ['Grace Iradukunda', Gender.FEMALE],
    ['Samuel Hakizimana', Gender.MALE],
    ['Raissa Uwimbabazi', Gender.FEMALE],
    ['David Byiringiro', Gender.MALE],
    ['Sandrine Mutesi', Gender.FEMALE],
    ['Fabrice Ndayambaje', Gender.MALE],
    ['Olive Ishimwe', Gender.FEMALE],
    ['Jean Paul Twizeyimana', Gender.MALE],
  ];
  const students = [] as { id: string; userId: string; classId: string; name: string }[];
  for (let i = 0; i < studentNames.length; i++) {
    const [name, gender] = studentNames[i];
    const first = name.split(' ')[0].toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const email = i === 0 ? 'student@school.rw' : `${first}.${i + 1}@student.school.rw`;
    const classId = i < 8 ? s1a.id : s2a.id;
    const user = await prisma.user.create({
      data: { email, name, role: Role.STUDENT, passwordHash: studentHash },
    });
    const profile = await prisma.studentProfile.create({
      data: {
        userId: user.id,
        admissionNumber: `SGS-2025-${String(i + 1).padStart(3, '0')}`,
        dateOfBirth: new Date(2011 + (i % 3), (i * 2) % 12, ((i * 7) % 27) + 1),
        gender,
        classId,
        parentId: i < 2 ? parent.id : null,
      },
    });
    students.push({ id: profile.id, userId: user.id, classId, name });
  }
  console.log(` ${students.length} students registered (2 linked to the demo parent)`);

  // ── Enrollments ────────────────────────────────────────────────────────────
  for (const term of [term2, term3]) {
    for (const classId of [s1a.id, s2a.id]) await ensureEnrollments(classId, term.id);
  }

  // ── Term-2 marks: fully entered, approved → auto-computed → published ──────
  console.log(' computing Term 2 results through the grading engine…');
  for (const student of students) {
    const aptitude = 55 + rand() * 40; // per-student ability 55–95
    for (const subject of subjects) {
      const components = await prisma.assessmentComponent.findMany({
        where: { subjectId: subject.id },
      });
      for (const component of components) {
        const noise = (rand() - 0.5) * 18;
        const score = Math.round(Math.min(100, Math.max(25, aptitude + noise)) * 10) / 10;
        await prisma.gradeEntry.create({
          data: {
            studentId: student.id,
            subjectId: subject.id,
            semesterId: term2.id,
            componentId: component.id,
            score,
            status: 'APPROVED',
            enteredById: teachers[subject.teacherIdx].id,
            approvedById: admin.id,
            submittedAt: new Date('2026-03-28'),
            approvedAt: new Date('2026-04-01'),
          },
        });
      }
    }
  }
  for (const classId of [s1a.id, s2a.id]) {
    for (const subject of subjects) await recomputeSubjectResults(classId, subject.id, term2.id);
    await recomputeGpas(classId, term2.id);
  }
  await prisma.gradeEntry.updateMany({
    where: { semesterId: term2.id },
    data: { status: 'PUBLISHED', publishedAt: new Date('2026-04-02') },
  });
  await prisma.subjectResult.updateMany({
    where: { semesterId: term2.id },
    data: { isPublished: true },
  });
  await prisma.gPARecord.updateMany({
    where: { semesterId: term2.id },
    data: { isPublished: true },
  });

  // ── Term-2 report cards (published) ────────────────────────────────────────
  const { randomBytes } = await import('crypto');
  for (const student of students) {
    const gpa = await prisma.gPARecord.findUnique({
      where: { studentId_semesterId: { studentId: student.id, semesterId: term2.id } },
    });
    if (!gpa) continue;
    await prisma.reportCard.create({
      data: {
        studentId: student.id,
        semesterId: term2.id,
        status: 'PUBLISHED',
        verificationCode: randomBytes(5).toString('hex').toUpperCase(),
        teacherRemarks:
          gpa.gpa >= 3
            ? 'A very good performance. Keep it up!'
            : 'A fair performance — more effort is needed next term.',
        publishedById: admin.id,
        principalRemarks: 'Keep striving for excellence.',
        publishedAt: new Date('2026-04-02'),
      },
    });
  }

  // ── Term-3 partial marks for one grid (live entry demo) ────────────────────
  const mat = subjects.find((s) => s.code === 'MAT')!;
  const matComponents = await prisma.assessmentComponent.findMany({ where: { subjectId: mat.id } });
  for (const student of students.filter((s) => s.classId === s1a.id).slice(0, 6)) {
    for (const component of matComponents.slice(0, 3)) {
      await prisma.gradeEntry.create({
        data: {
          studentId: student.id,
          subjectId: mat.id,
          semesterId: term3.id,
          componentId: component.id,
          score: Math.round((50 + rand() * 45) * 10) / 10,
          status: 'DRAFT',
          enteredById: teachers[0].id,
        },
      });
    }
  }

  // ── Demo digital signatures (teacher + principal) ──────────────────────────
  // A cursive-like squiggle drawn as SVG, then run through the same cleanup
  // pipeline real uploads use.
  const squiggle = (seed: number, color: string) => {
    const r = mulberry32(seed);
    let d = 'M 20 90';
    let x = 20;
    for (let i = 0; i < 9; i++) {
      const dx = 18 + r() * 16;
      const y1 = 45 + r() * 45;
      const y2 = 55 + r() * 55;
      d += ` C ${x + dx * 0.3} ${y1}, ${x + dx * 0.7} ${y2}, ${x + dx} ${75 + r() * 30}`;
      x += dx;
    }
    const underline = 'M 30 118 Q 130 132 230 114';
    return `<svg xmlns="http://www.w3.org/2000/svg" width="280" height="150" viewBox="0 0 280 150">
 <path d="${d}" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
 <path d="${underline}" fill="none" stroke="${color}" stroke-width="4" stroke-linecap="round" opacity="0.85"/>
 </svg>`;
  };
  const sigUsers: { userId: string; title: string; seed: number; color: string }[] = [
    { userId: teachers[0].userId, title: 'Class Teacher', seed: 101, color: '#1e3a8a' },
    { userId: admin.id, title: 'Principal / Head of School', seed: 707, color: '#0f172a' },
  ];
  const { processSignatureImage } = await import('../src/services/signature.service');
  for (const s of sigUsers) {
    const raw = await sharp(Buffer.from(squiggle(s.seed, s.color)), { density: 200 })
      .flatten({ background: '#ffffff' })
      .png()
      .toBuffer();
    const processed = await processSignatureImage(raw);
    await prisma.signature.upsert({
      where: { userId: s.userId },
      create: {
        userId: s.userId,
        title: s.title,
        data: processed.png,
        width: processed.width,
        height: processed.height,
      },
      update: {
        title: s.title,
        data: processed.png,
        width: processed.width,
        height: processed.height,
      },
    });
  }
  console.log(' demo signatures installed (teacher + principal)');

  // ── School settings + demo badge ──────────────────────────────────────────
  const crestSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
 <path d="M256 28 L452 118 V290 C452 396 368 468 256 492 C144 468 60 396 60 290 V118 Z" fill="#4f46e5" stroke="#312e81" stroke-width="14"/>
 <path d="M256 150 L284 238 L376 238 L302 292 L328 382 L256 326 L184 382 L210 292 L136 238 L228 238 Z" fill="#fbbf24" stroke="#b45309" stroke-width="8" stroke-linejoin="round"/>
 <rect x="116" y="392" width="280" height="34" rx="17" fill="#eef2ff"/>
 <rect x="150" y="404" width="212" height="10" rx="5" fill="#818cf8"/>
 </svg>`;
  const badgePng = await sharp(Buffer.from(crestSvg), { density: 150 }).png().toBuffer();
  await prisma.schoolSetting.upsert({
    where: { id: 'school' },
    create: {
      id: 'school',
      name: 'Kigali Secondary School',
      motto: '',
      badgeData: badgePng,
      badgeMime: 'image/png',
    },
    update: {},
  });
  console.log(' school settings + demo badge installed');

  const [cStudents, cEntries, cResults] = await Promise.all([
    prisma.studentProfile.count(),
    prisma.gradeEntry.count(),
    prisma.subjectResult.count(),
  ]);

  console.log('----------------------------------------------------------------');
  console.log(' Seed complete');
  console.log(
    ` Students: ${cStudents} · Grade entries: ${cEntries} · Computed results: ${cResults}`,
  );
  console.log('');
  console.log(' Demo accounts (password in brackets):');
  console.log(' ADMIN   : admin@school.rw [Admin@123]');
  console.log(' TEACHER : m.habimana@school.rw [Teacher@123]');
  console.log(' STUDENT : student@school.rw [Student@123]');
  console.log(' PARENT  : parent@school.rw [Parent@123]');
  console.log('----------------------------------------------------------------');
}

main()
  .catch((e) => {
    console.error('Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
