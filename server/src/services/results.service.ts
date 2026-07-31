import { prisma } from '../lib/prisma';
import { AppError } from '../lib/errors';
import {
  computeSubjectResult,
  computeGpa,
  rankIds,
  round2,
  type GradeBand,
} from '../lib/grading';

/** Make sure every student assigned to a class has an enrollment row for the semester. */
export async function ensureEnrollments(classId: string, semesterId: string): Promise<void> {
  const students = await prisma.studentProfile.findMany({ where: { classId }, select: { id: true } });
  if (students.length === 0) return;
  await prisma.enrollment.createMany({
    data: students.map((s) => ({ studentId: s.id, classId, semesterId })),
    skipDuplicates: true,
  });
}

async function activeBands(): Promise<GradeBand[]> {
  const scale = await prisma.gradeScale.findFirst({ where: { isActive: true }, include: { bands: true } });
  if (!scale || scale.bands.length === 0) {
    throw new AppError(409, 'No active grading scale is configured', 'NO_GRADE_SCALE');
  }
  return scale.bands.map((b) => ({
    minScore: b.minScore,
    maxScore: b.maxScore,
    letter: b.letter,
    gradePoint: b.gradePoint,
    remark: b.remark,
  }));
}

/**
 * Recompute SubjectResults for every enrolled student of a class/subject/semester,
 * then per-subject class positions. Runs when grades are approved.
 */
export async function recomputeSubjectResults(
  classId: string,
  subjectId: string,
  semesterId: string,
): Promise<{ computed: number }> {
  await ensureEnrollments(classId, semesterId);

  const [enrollments, components, bands] = await Promise.all([
    prisma.enrollment.findMany({ where: { classId, semesterId }, select: { studentId: true } }),
    prisma.assessmentComponent.findMany({ where: { subjectId } }),
    activeBands(),
  ]);
  const studentIds = enrollments.map((e) => e.studentId);
  if (studentIds.length === 0) return { computed: 0 };

  const entries = await prisma.gradeEntry.findMany({
    where: {
      subjectId,
      semesterId,
      studentId: { in: studentIds },
      status: { in: ['APPROVED', 'PUBLISHED'] },
    },
    select: { studentId: true, componentId: true, score: true },
  });

  const scoresByStudent = new Map<string, Map<string, number>>();
  for (const e of entries) {
    if (!scoresByStudent.has(e.studentId)) scoresByStudent.set(e.studentId, new Map());
    scoresByStudent.get(e.studentId)!.set(e.componentId, e.score);
  }

  const computedRows: { studentId: string; percentage: number }[] = [];

  for (const studentId of studentIds) {
    const studentScores = scoresByStudent.get(studentId);
    if (!studentScores || studentScores.size === 0) continue; // no approved marks yet

    const weighted = components.map((c) => ({
      weight: c.weight,
      maxScore: c.maxScore,
      score: studentScores.get(c.id) ?? 0,
    }));
    const result = computeSubjectResult(weighted, bands);

    await prisma.subjectResult.upsert({
      where: { studentId_subjectId_semesterId: { studentId, subjectId, semesterId } },
      create: {
        studentId, subjectId, semesterId,
        totalScore: result.totalScore,
        percentage: result.percentage,
        letterGrade: result.letterGrade,
        gradePoint: result.gradePoint,
        remark: result.remark,
        computedAt: new Date(),
      },
      update: {
        totalScore: result.totalScore,
        percentage: result.percentage,
        letterGrade: result.letterGrade,
        gradePoint: result.gradePoint,
        remark: result.remark,
        computedAt: new Date(),
      },
    });
    computedRows.push({ studentId, percentage: result.percentage });
  }

  // Subject ranking within the class (competition ranking, ties share position)
  const positions = rankIds(computedRows.map((r) => ({ id: r.studentId, value: r.percentage })));
  for (const row of computedRows) {
    await prisma.subjectResult.update({
      where: { studentId_subjectId_semesterId: { studentId: row.studentId, subjectId, semesterId } },
      data: { position: positions.get(row.studentId) },
    });
  }

  return { computed: computedRows.length };
}

/** Recompute GPA / average / class position for every enrolled student of a class. */
export async function recomputeGpas(classId: string, semesterId: string): Promise<{ computed: number }> {
  await ensureEnrollments(classId, semesterId);
  const enrollments = await prisma.enrollment.findMany({ where: { classId, semesterId }, select: { studentId: true } });
  const studentIds = enrollments.map((e) => e.studentId);
  if (studentIds.length === 0) return { computed: 0 };

  const rows: { studentId: string; gpa: number }[] = [];

  for (const studentId of studentIds) {
    const results = await prisma.subjectResult.findMany({
      where: { studentId, semesterId },
      include: { subject: { select: { creditUnits: true } } },
    });
    if (results.length === 0) continue;

    const gpa = computeGpa(results.map((r) => ({ gradePoint: r.gradePoint, creditUnits: r.subject.creditUnits })));
    const totalCredits = round2(results.reduce((a, r) => a + r.subject.creditUnits, 0));
    const totalPoints = round2(results.reduce((a, r) => a + r.gradePoint * r.subject.creditUnits, 0));
    const average = round2(results.reduce((a, r) => a + r.percentage, 0) / results.length);

    await prisma.gPARecord.upsert({
      where: { studentId_semesterId: { studentId, semesterId } },
      create: { studentId, semesterId, gpa, totalCredits, totalPoints, average, computedAt: new Date() },
      update: { gpa, totalCredits, totalPoints, average, computedAt: new Date() },
    });
    rows.push({ studentId, gpa });
  }

  // Overall class position by GPA
  const positions = rankIds(rows.map((r) => ({ id: r.studentId, value: r.gpa })));
  for (const row of rows) {
    await prisma.gPARecord.update({
      where: { studentId_semesterId: { studentId: row.studentId, semesterId } },
      data: { position: positions.get(row.studentId), classSize: rows.length },
    });
  }

  return { computed: rows.length };
}
