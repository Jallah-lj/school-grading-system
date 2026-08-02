/**
 * Test runner — sets environment variables and mocks Prisma before importing
 * any test modules. This avoids both the env validation error and the
 * "Prisma client did not initialize" error in CI / sandboxed environments.
 *
 * Run:  npx tsx src/__tests__/run-tests.ts
 */

// ── 1. Set test environment variables ────────────────────────────────────────
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test?schema=public';
process.env.JWT_ACCESS_SECRET = 'test-access-secret-key-32chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key-32chars!';
process.env.ACCESS_TOKEN_TTL = '15m';
process.env.REFRESH_TOKEN_TTL_DAYS = '7';
process.env.CLIENT_URL = 'http://localhost:3000';
process.env.PORT = '4000';

// ── 2. Mock @prisma/client and lib/prisma BEFORE any app code is loaded ──────
// We intercept Node's require to return mock objects for prisma imports.
import { Module } from 'node:module';

const PrismaMock = {
  PrismaClient: class MockPrismaClient {
    $connect = async () => {};
    $disconnect = async () => {};
    $transaction = async (ops: unknown) => (Array.isArray(ops) ? ops.map(() => ({})) : {});
  },
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      meta?: unknown;
      constructor(message: string, { code, meta }: { code: string; meta?: unknown }) {
        super(message);
        this.code = code;
        this.meta = meta;
      }
    },
  },
  Role: { ADMIN: 'ADMIN', TEACHER: 'TEACHER', STUDENT: 'STUDENT', PARENT: 'PARENT' },
  Gender: { MALE: 'MALE', FEMALE: 'FEMALE', OTHER: 'OTHER' },
  GradeStatus: { DRAFT: 'DRAFT', SUBMITTED: 'SUBMITTED', APPROVED: 'APPROVED', PUBLISHED: 'PUBLISHED' },
  ReportCardStatus: { GENERATED: 'GENERATED', PUBLISHED: 'PUBLISHED' },
  ComponentType: { ASSIGNMENT: 'ASSIGNMENT', QUIZ: 'QUIZ', CAT: 'CAT', PRACTICAL: 'PRACTICAL', MIDTERM: 'MIDTERM', FINAL: 'FINAL', PROJECT: 'PROJECT' },
  NotificationType: { GRADES_PUBLISHED: 'GRADES_PUBLISHED', REPORT_CARD_AVAILABLE: 'REPORT_CARD_AVAILABLE', GRADE_CORRECTION: 'GRADE_CORRECTION', ANNOUNCEMENT: 'ANNOUNCEMENT' },
};

function createModelMock() {
  return {
    findUnique: async () => null,
    findFirst: async () => null,
    findMany: async () => [],
    create: async ({ data }: { data: unknown }) => ({ id: 'mock-id', ...(data as Record<string, unknown>) }),
    update: async ({ data }: { data: unknown }) => ({ id: 'mock-id', ...(data as Record<string, unknown>) }),
    updateMany: async () => ({ count: 0 }),
    delete: async () => ({ id: 'mock-id' }),
    deleteMany: async () => ({ count: 0 }),
    count: async () => 0,
    aggregate: async () => ({ _avg: {} }),
    groupBy: async () => [],
    upsert: async ({ create: c }: { create: unknown }) => ({ id: 'mock-id', ...(c as Record<string, unknown>) }),
  };
}

const prismaInstance = {
  $connect: async () => {},
  $disconnect: async () => {},
  $transaction: async (ops: unknown) => (Array.isArray(ops) ? ops.map(() => ({})) : {}),
  // All Prisma models
  user: createModelMock(),
  refreshToken: createModelMock(),
  studentProfile: createModelMock(),
  teacherProfile: createModelMock(),
  parentProfile: createModelMock(),
  academicYear: createModelMock(),
  semester: createModelMock(),
  classRoom: createModelMock(),
  subject: createModelMock(),
  assessmentComponent: createModelMock(),
  teacherAssignment: createModelMock(),
  enrollment: createModelMock(),
  gradeEntry: createModelMock(),
  subjectResult: createModelMock(),
  gPARecord: createModelMock(),
  gradeScale: createModelMock(),
  gradeScaleBand: createModelMock(),
  reportCard: createModelMock(),
  signature: createModelMock(),
  idSequence: createModelMock(),
  schoolSetting: createModelMock(),
  notification: createModelMock(),
  auditLog: createModelMock(),
};

// Set the global prisma instance BEFORE any module imports prisma.ts
// (prisma.ts checks globalForPrisma.prisma first, and uses it if present)
(globalThis as unknown as Record<string, unknown>).prisma = prismaInstance;

type RequireFn = (this: unknown, id: string) => unknown;
const origRequire = (Module.prototype as unknown as Record<string, RequireFn>).require;
(Module.prototype as unknown as Record<string, RequireFn>).require = function (this: unknown, id: string) {
  // Mock @prisma/client
  if (id === '@prisma/client') return PrismaMock;
  return origRequire.call(this, id);
};

// ── 3. Run test suites ──────────────────────────────────────────────────────
async function main() {
  const results: { name: string; passed: boolean; error?: string }[] = [];

  async function runSuite(name: string, fn: () => Promise<void>) {
    try {
      await fn();
      results.push({ name, passed: true });
    } catch (e) {
      results.push({ name, passed: false, error: (e as Error).message });
    }
  }

  // 1. Pure logic tests (these don't need prisma)
  console.log('🔢 Running grading engine tests…');
  await runSuite('Grading engine', async () => { await import('../lib/grading.test'); });

  console.log('\n⚙️  Running config tests…');
  await runSuite('Database URL validation', async () => { await import('../config/databaseUrl.test'); });
  await runSuite('Token TTL validation', async () => { await import('../config/tokenTtl.test'); });

  console.log('\n📄 Running PDF layout tests…');
  await runSuite('PDF layout', async () => { await import('../services/pdf-layout.test'); });

  // 2. Auth middleware unit tests
  console.log('\n🔐 Running auth middleware tests…');
  const { runAuthTests } = await import('./auth.test');
  await runSuite('Auth middleware', runAuthTests);

  // 3. API integration tests
  console.log('\n📡 Running API integration tests…');
  const { runApiTests } = await import('./api.test');
  await runSuite('API integration', runApiTests);

  // 4. RBAC tests
  console.log('\n🛡️  Running RBAC tests…');
  const { runRbacTests } = await import('./rbac.test');
  await runSuite('RBAC', runRbacTests);

  // 5. Grade workflow tests
  console.log('\n📝 Running grade workflow tests…');
  const { runGradeWorkflowTests } = await import('./grade-workflow.test');
  await runSuite('Grade workflow', runGradeWorkflowTests);

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(60)}`);
  console.log('  TEST SUITE SUMMARY');
  console.log(`${'═'.repeat(60)}`);
  const totalPassed = results.filter((r) => r.passed).length;
  const totalFailed = results.filter((r) => !r.passed).length;
  for (const r of results) {
    const icon = r.passed ? '✅' : '❌';
    console.log(`  ${icon} ${r.name}`);
    if (!r.passed) console.log(`     ${r.error?.split('\n')[0]}`);
  }
  console.log(`${'─'.repeat(60)}`);
  console.log(`  Total: ${totalPassed} passed, ${totalFailed} failed, ${results.length} suites`);
  if (totalFailed > 0) {
    console.log('\n  ❌ Some test suites failed');
    process.exit(1);
  } else {
    console.log('\n  ✅ All test suites passed');
  }
}

main().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
