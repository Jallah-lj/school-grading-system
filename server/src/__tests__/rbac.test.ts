/**
 * RBAC (Role-Based Access Control) integration tests.
 *
 * Verifies that every protected endpoint enforces the correct role matrix:
 *
 *   Endpoint                  | ADMIN | TEACHER | STUDENT | PARENT
 *   ────────────────────────────────────────────────────────────────
 *   /api/users                |  ✓    |    ✗    |    ✗    |   ✗
 *   /api/students (list)      |  ✓    |    ✓    |    ✗    |   ✗
 *   /api/teachers             |  ✓    |    ✓    |    ✗    |   ✗
 *   /api/parents              |  ✓    |    ✗    |    ✗    |   ✗
 *   /api/grades/grid          |  ✓    |    ✓    |    ✗    |   ✗
 *   /api/grades/approve       |  ✓    |    ✗    |    ✗    |   ✗
 *   /api/grades/publish       |  ✓    |    ✗    |    ✗    |   ✗
 *   /api/report-cards/gen     |  ✓    |    ✗    |    ✗    |   ✗
 *   /api/analytics/dashboard  |  ✓    |    ✓    |    ✗    |   ✗
 *   /api/admin/*              |  ✓    |    ✗    |    ✗    |   ✗
 *   /api/grade-scales (GET)   |  ✓    |    ✓    |    ✓    |   ✓
 *   /api/notifications        |  ✓    |    ✓    |    ✓    |   ✓
 *   /api/school/public        |  ✓    |    ✓    |    ✓    |   ✓  (no auth)
 *
 * Run via:  npx tsx src/__tests__/run-tests.ts
 */
import assert from 'node:assert/strict';
import http from 'node:http';

import jwt from 'jsonwebtoken';

import { createApp } from '../app';
import { prisma } from '../lib/prisma';

type PrismaArgs = Record<string, unknown>;
type AsyncFn = (...args: PrismaArgs[]) => Promise<unknown>;

function stub(model: string, method: string, fn: AsyncFn) {
  (prisma as unknown as Record<string, Record<string, AsyncFn>>)[model][method] = fn;
}

function resetStubs() {
  const defaults: Record<string, AsyncFn> = {
    findUnique: async () => null, findFirst: async () => null, findMany: async () => [],
    create: async (args: PrismaArgs) => ({ id: 'x', ...(args.data as object) }),
    update: async () => ({}), updateMany: async () => ({ count: 0 }),
    delete: async () => ({}), deleteMany: async () => ({ count: 0 }),
    count: async () => 0, aggregate: async () => ({ _avg: {} }), groupBy: async () => [],
    upsert: async () => ({}),
  };
  const models = Object.keys(prisma).filter((k) => typeof (prisma as Record<string, unknown>)[k] === 'object' && (prisma as Record<string, Record<string, unknown>>)[k]?.findMany);
  for (const m of models) for (const [method, fn] of Object.entries(defaults)) stub(m, method, fn);
}

interface TestResponse { status: number; body: unknown; text: string; }
interface TestRequest {
  auth(token: string): TestRequest;
  send(data: unknown): TestRequest;
  expect(status: number): Promise<TestResponse>;
}

function request(app: ReturnType<typeof createApp>) {
  function makeReq(method: string, path: string): TestRequest {
    const headers: Record<string, string> = {};
    let body: unknown;
    const chain: TestRequest = {
      auth(token: string) { headers['Authorization'] = `Bearer ${token}`; return chain; },
      send(data: unknown) { body = data; headers['Content-Type'] = 'application/json'; return chain; },
      async expect(status: number): Promise<TestResponse> {
        return new Promise((resolve, reject) => {
          const server = app.listen(0);
          const addr = server.address() as { port: number };
          const req = http.request({ hostname: '127.0.0.1', port: addr.port, path, method, headers }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              server.close();
              const text = Buffer.concat(chunks).toString();
              let parsed: unknown; try { parsed = JSON.parse(text); } catch { parsed = text; }
              const result = { status: res.statusCode!, body: parsed, text };
              try { assert.equal(res.statusCode, status, `Expected ${status} got ${res.statusCode}: ${text.slice(0, 200)}`); }
              catch (e) { reject(e); return; }
              resolve(result);
            });
          });
          req.on('error', (e) => { server.close(); reject(e); });
          if (body !== undefined) req.write(JSON.stringify(body));
          req.end();
        });
      },
    };
    return chain;
  }
  return {
    get: (p: string) => makeReq('GET', p),
    post: (p: string) => makeReq('POST', p),
    patch: (p: string) => makeReq('PATCH', p),
    delete: (p: string) => makeReq('DELETE', p),
  };
}

function signToken(user: { id: string; email: string; name: string; role: string }) {
  return jwt.sign({ sub: user.id, email: user.email, name: user.name, role: user.role }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
}

const users = {
  admin:   { id: 'a1', email: 'admin@t.rw',   name: 'Admin',   role: 'ADMIN' },
  teacher: { id: 't1', email: 'teacher@t.rw', name: 'Teacher', role: 'TEACHER' },
  student: { id: 's1', email: 'student@t.rw', name: 'Student', role: 'STUDENT' },
  parent:  { id: 'p1', email: 'parent@t.rw',  name: 'Parent',  role: 'PARENT' },
};

// RBAC matrix: [path, method, allowedRoles[], needsSetup?]
// Tests that need extra Prisma mocks to pass through business logic
// are handled separately below, not in the matrix.
const rbacMatrix: [string, string, string[]][] = [
  ['/api/users', 'GET', ['ADMIN']],
  ['/api/students', 'GET', ['ADMIN', 'TEACHER']],
  ['/api/teachers', 'GET', ['ADMIN', 'TEACHER']],
  ['/api/parents', 'GET', ['ADMIN']],
  ['/api/grade-scales', 'GET', ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']],
  ['/api/classes', 'GET', ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']],
  ['/api/subjects', 'GET', ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']],
  ['/api/academic-years', 'GET', ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']],
  ['/api/notifications', 'GET', ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT']],
  ['/api/report-cards/generate', 'POST', ['ADMIN']],
  ['/api/analytics/dashboard', 'GET', ['ADMIN', 'TEACHER']],
  ['/api/admin/audit-logs', 'GET', ['ADMIN']],
  ['/api/school/settings', 'GET', ['ADMIN']],
  ['/api/school/settings', 'PATCH', ['ADMIN']],
];

export async function runRbacTests() {
  const app = createApp();
  const api = request(app);
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  async function t(name: string, fn: () => Promise<void>) {
    resetStubs();
    try { await fn(); passed++; console.log(`  ✓ ${name}`); }
    catch (e) { failed++; failures.push(name); console.log(`  ✗ ${name}`); console.log(`    ${(e as Error).message.split('\n')[0]}`); }
  }

  console.log('🛡️  RBAC tests\n');

  const tokens: Record<string, string> = {
    ADMIN: signToken(users.admin),
    TEACHER: signToken(users.teacher),
    STUDENT: signToken(users.student),
    PARENT: signToken(users.parent),
  };
  const allRoles = ['ADMIN', 'TEACHER', 'STUDENT', 'PARENT'] as const;

  for (const [path, method, allowed] of rbacMatrix) {
    const label = `${method} ${path.split('?')[0]}`;
    for (const role of allRoles) {
      const isAllowed = allowed.includes(role);
      const expectedStatus = isAllowed ? 200 : 403;
      const description = `${label} → ${expectedStatus} for ${role}${isAllowed ? '' : ' (forbidden)'}`;

      if (method === 'POST') {
        // For POST endpoints, send a valid body to avoid 422 masking the 403
        await t(description, async () => {
          const body = { classId: 'c', subjectId: 's', semesterId: 'sem' };
          if (path === '/api/report-cards/generate') {
            await api.post(path).auth(tokens[role]).send(body).expect(expectedStatus);
          } else if (path === '/api/school/settings') {
            await api.patch(path).auth(tokens[role]).send({ name: 'Test' }).expect(expectedStatus);
          } else {
            await api.post(path).auth(tokens[role]).send(body).expect(expectedStatus);
          }
        });
      } else {
        await t(description, async () => {
          await api.get(path).auth(tokens[role]).expect(expectedStatus);
        });
      }
    }
  }

  // ── Grade endpoints (need teacher-assignment mock for TEACHER role) ─────
  console.log('\n── Grade endpoints (with scope mocks) ──');

  await t('GET /api/grades/grid → 403 for STUDENT', async () => {
    await api.get('/api/grades/grid?classId=c&subjectId=s&semesterId=sem').auth(tokens.STUDENT).expect(403);
  });
  await t('GET /api/grades/grid → 403 for PARENT', async () => {
    await api.get('/api/grades/grid?classId=c&subjectId=s&semesterId=sem').auth(tokens.PARENT).expect(403);
  });
  await t('GET /api/grades/grid → 200 for TEACHER (with assignment)', async () => {
    stub('teacherAssignment', 'findFirst', async () => ({ id: 'ta1' }));
    stub('enrollment', 'findMany', async () => []);
    stub('assessmentComponent', 'findMany', async () => []);
    stub('gradeEntry', 'findMany', async () => []);
    await api.get('/api/grades/grid?classId=c&subjectId=s&semesterId=sem').auth(tokens.TEACHER).expect(200);
  });
  await t('GET /api/grades/grid → 200 for ADMIN (bypasses scope)', async () => {
    stub('enrollment', 'findMany', async () => []);
    stub('assessmentComponent', 'findMany', async () => []);
    stub('gradeEntry', 'findMany', async () => []);
    await api.get('/api/grades/grid?classId=c&subjectId=s&semesterId=sem').auth(tokens.ADMIN).expect(200);
  });

  await t('POST /api/grades/approve → 403 for TEACHER', async () => {
    await api.post('/api/grades/approve').auth(tokens.TEACHER).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(403);
  });
  await t('POST /api/grades/approve → 403 for STUDENT', async () => {
    await api.post('/api/grades/approve').auth(tokens.STUDENT).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(403);
  });
  await t('POST /api/grades/approve → 403 for PARENT', async () => {
    await api.post('/api/grades/approve').auth(tokens.PARENT).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(403);
  });

  await t('POST /api/grades/publish → 403 for TEACHER', async () => {
    await api.post('/api/grades/publish').auth(tokens.TEACHER).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(403);
  });
  await t('POST /api/grades/publish → 403 for STUDENT', async () => {
    await api.post('/api/grades/publish').auth(tokens.STUDENT).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(403);
  });
  await t('POST /api/grades/publish → 403 for PARENT', async () => {
    await api.post('/api/grades/publish').auth(tokens.PARENT).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(403);
  });

  await t('POST /api/grades/submit → 403 for STUDENT', async () => {
    await api.post('/api/grades/submit').auth(tokens.STUDENT).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(403);
  });
  await t('POST /api/grades/submit → 403 for PARENT', async () => {
    await api.post('/api/grades/submit').auth(tokens.PARENT).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(403);
  });
  await t('POST /api/grades/submit → 200 for TEACHER (with assignment)', async () => {
    stub('teacherAssignment', 'findFirst', async () => ({ id: 'ta1' }));
    stub('gradeEntry', 'updateMany', async () => ({ count: 5 }));
    stub('subject', 'findUnique', async () => ({ name: 'Math', code: 'MATH' }));
    stub('classRoom', 'findUnique', async () => ({ name: 'S5', stream: 'A' }));
    stub('user', 'findMany', async () => []);
    stub('notification', 'createMany', async () => ({ count: 0 }));
    await api.post('/api/grades/submit').auth(tokens.TEACHER).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(200);
  });
  await t('POST /api/grades/submit → 200 for ADMIN', async () => {
    stub('gradeEntry', 'updateMany', async () => ({ count: 5 }));
    stub('subject', 'findUnique', async () => ({ name: 'Math', code: 'MATH' }));
    stub('classRoom', 'findUnique', async () => ({ name: 'S5', stream: 'A' }));
    stub('user', 'findMany', async () => []);
    stub('notification', 'createMany', async () => ({ count: 0 }));
    await api.post('/api/grades/submit').auth(tokens.ADMIN).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(200);
  });

  // ── Unauthenticated access ─────────────────────────────────────────────
  console.log('\n── Unauthenticated access ──');

  await t('GET /api/users → 401 without token', async () => { await api.get('/api/users').expect(401); });
  await t('GET /api/students → 401 without token', async () => { await api.get('/api/students').expect(401); });
  await t('GET /api/grades/grid → 401 without token', async () => { await api.get('/api/grades/grid?classId=c&subjectId=s&semesterId=sem').expect(401); });
  await t('GET /api/admin/audit-logs → 401 without token', async () => { await api.get('/api/admin/audit-logs').expect(401); });
  await t('POST /api/grades/approve → 401 without token', async () => { await api.post('/api/grades/approve').send({}).expect(401); });

  // Public endpoints should work without auth
  stub('schoolSetting', 'findUnique', async () => ({
    id: 'school', name: 'Test', motto: 'T', studentIdPrefix: 'SGS',
    badgeData: null, badgeMime: null, updatedAt: new Date().toISOString(),
  }));
  stub('academicYear', 'findFirst', async () => ({ name: '2024-2025' }));
  await t('GET /api/school/public → 200 without auth (public)', async () => { await api.get('/api/school/public').expect(200); });
  await t('GET /api/health → 200 without auth (public)', async () => { await api.get('/api/health').expect(200); });
  await t('GET /api/docs → 200 without auth (public)', async () => { await api.get('/api/docs').expect(200); });
  await t('GET /api/docs/openapi.json → 200 without auth (public)', async () => { await api.get('/api/docs/openapi.json').expect(200); });

  // ── Token edge cases ───────────────────────────────────────────────────
  console.log('\n── Token edge cases ──');

  await t('Expired token → 401', async () => {
    const expired = jwt.sign({ sub: 'u1', email: 'a@b.c', name: 'X', role: 'ADMIN' }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '0s' });
    await api.get('/api/users').auth(expired).expect(401);
  });

  await t('Token with wrong secret → 401', async () => {
    const badToken = jwt.sign({ sub: 'u1', email: 'a@b.c', name: 'X', role: 'ADMIN' }, 'completely-wrong-secret-32chars!', { expiresIn: '15m' });
    await api.get('/api/users').auth(badToken).expect(401);
  });

  await t('Malformed token → 401', async () => {
    await api.get('/api/users').auth('not.a.jwt.token').expect(401);
  });

  await t('Token with invalid role value → request proceeds but middleware handles it', async () => {
    // A token with an unknown role will pass JWT validation but the authorize
    // middleware will reject it since the role won't match any allowed role.
    const weirdToken = jwt.sign({ sub: 'u1', email: 'a@b.c', name: 'X', role: 'SUPERADMIN' }, process.env.JWT_ACCESS_SECRET!, { expiresIn: '15m' });
    await api.get('/api/users').auth(weirdToken).expect(403);
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  RBAC tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    for (const f of failures) console.log(`    ✗ ${f}`);
    throw new Error(`${failed} RBAC test(s) failed`);
  }
  console.log('  ✅ All RBAC tests passed');
}
