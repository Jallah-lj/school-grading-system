/**
 * API integration tests.
 *
 * Tests the Express app layer — routes, middleware, auth flow, RBAC,
 * error handling — without touching a real database (Prisma is mocked).
 *
 * Run via:  npx tsx src/__tests__/run-tests.ts
 *
 * Note: Environment variables must be set before this module is loaded.
 * The run-tests.ts bootstrap handles this.
 */
import assert from 'node:assert/strict';
import http from 'node:http';
import jwt from 'jsonwebtoken';

import { createApp } from '../app';
import { prisma } from '../lib/prisma';

// ── Prisma mock helpers ──────────────────────────────────────────────────────
// We override methods on the real prisma singleton so routes that import it
// receive our stubs. Each test sets up the stubs it needs.
type AsyncFn = (...args: unknown[]) => Promise<unknown>;

function stub(model: string, method: string, fn: AsyncFn) {
  (prisma as unknown as Record<string, Record<string, AsyncFn>>)[model][method] = fn;
}

function resetStubs() {
  const defaults: Record<string, AsyncFn> = {
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
  const models = Object.keys(prisma).filter((k) => typeof (prisma as Record<string, unknown>)[k] === 'object' && (prisma as Record<string, Record<string, unknown>>)[k]?.findMany);
  for (const m of models) {
    for (const [method, fn] of Object.entries(defaults)) {
      stub(m, method, fn);
    }
  }
}

// ── HTTP test helper (zero-dep, supertest-like) ──────────────────────────────
interface TestResponse {
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: unknown;
  text: string;
}

interface TestRequest {
  set(name: string, value: string): TestRequest;
  auth(token: string): TestRequest;
  send(data: unknown): TestRequest;
  expect(status: number): Promise<TestResponse>;
}

function request(app: ReturnType<typeof createApp>) {
  function makeReq(method: string, path: string): TestRequest {
    const headers: Record<string, string> = {};
    let body: unknown;
    const chain: TestRequest = {
      set(name: string, value: string) { headers[name] = value; return chain; },
      auth(token: string) { headers['Authorization'] = `Bearer ${token}`; return chain; },
      send(data: unknown) { body = data; headers['Content-Type'] = 'application/json'; return chain; },
      async expect(status: number): Promise<TestResponse> {
        return new Promise((resolve, reject) => {
          const server = app.listen(0);
          const addr = server.address() as { port: number };
          const req = http.request({
            hostname: '127.0.0.1', port: addr.port, path, method: method.toUpperCase(), headers,
          }, (res) => {
            const chunks: Buffer[] = [];
            res.on('data', (c: Buffer) => chunks.push(c));
            res.on('end', () => {
              server.close();
              const text = Buffer.concat(chunks).toString();
              let parsed: unknown;
              try { parsed = JSON.parse(text); } catch { parsed = text; }
              const result: TestResponse = { status: res.statusCode!, headers: res.headers as Record<string, string | string[]>, body: parsed, text };
              try {
                assert.equal(res.statusCode, status, `Expected ${status} got ${res.statusCode}: ${text.slice(0, 200)}`);
              } catch (e) { reject(e); return; }
              resolve(result);
            });
          });
          req.on('error', (e) => { server.close(); reject(e); });
          if (body !== undefined) req.write(typeof body === 'string' ? body : JSON.stringify(body));
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
    put: (p: string) => makeReq('PUT', p),
    delete: (p: string) => makeReq('DELETE', p),
  };
}

// ── Token helper ─────────────────────────────────────────────────────────────
function signToken(user: { id: string; email: string; name: string; role: string }) {
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name, role: user.role },
    process.env.JWT_ACCESS_SECRET!,
    { expiresIn: '15m' },
  );
}

// ── Test users ───────────────────────────────────────────────────────────────
const users = {
  admin:   { id: 'admin-001',   email: 'admin@test.rw',   name: 'Test Admin',   role: 'ADMIN' },
  teacher: { id: 'teacher-001', email: 'teacher@test.rw', name: 'Test Teacher', role: 'TEACHER' },
  student: { id: 'student-001', email: 'student@test.rw', name: 'Test Student', role: 'STUDENT' },
  parent:  { id: 'parent-001',  email: 'parent@test.rw',  name: 'Test Parent',  role: 'PARENT' },
};

// ── Tests ────────────────────────────────────────────────────────────────────
export async function runApiTests() {
  const app = createApp();
  const api = request(app);
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];

  async function t(name: string, fn: () => Promise<void>) {
    resetStubs();
    try {
      await fn();
      passed++;
      console.log(`  ✓ ${name}`);
    } catch (e) {
      failed++;
      failures.push(name);
      console.log(`  ✗ ${name}`);
      console.log(`    ${(e as Error).message.split('\n')[0]}`);
    }
  }

  console.log('📡 API integration tests\n');

  // ── Health & metadata ────────────────────────────────────────────────────
  console.log('── Health & Info ──');

  await t('GET /api/health → 200 ok', async () => {
    const res = await api.get('/api/health').expect(200);
    const body = res.body as { status: string; service: string };
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'school-grading-api');
  });

  await t('GET /api → metadata with swagger docs links', async () => {
    const res = await api.get('/api').expect(200);
    const body = res.body as { swaggerDocs: string; openapiSpec: string };
    assert.equal(body.swaggerDocs, '/api/docs');
    assert.equal(body.openapiSpec, '/api/docs/openapi.json');
  });

  // ── OpenAPI / Swagger docs ───────────────────────────────────────────────
  console.log('\n── OpenAPI Docs ──');

  await t('GET /api/docs → Swagger UI HTML', async () => {
    const res = await api.get('/api/docs').expect(200);
    assert.ok(res.text.includes('swagger-ui'), 'Should reference swagger-ui');
    assert.ok(res.text.includes('School Grading System'), 'Should contain app name');
  });

  await t('GET /api/docs/openapi.json → valid OpenAPI 3.0.3 spec', async () => {
    const res = await api.get('/api/docs/openapi.json').expect(200);
    const spec = res.body as { openapi: string; info: { title: string }; paths: Record<string, unknown>; tags: { name: string }[] };
    assert.equal(spec.openapi, '3.0.3');
    assert.equal(spec.info.title, 'School Grading System API');
    assert.ok(Object.keys(spec.paths).length > 20, `>20 paths expected, got ${Object.keys(spec.paths).length}`);
    assert.ok(spec.tags.length >= 10, `≥10 tag groups, got ${spec.tags.length}`);
  });

  await t('OpenAPI spec covers all endpoint modules', async () => {
    const res = await api.get('/api/docs/openapi.json').expect(200);
    const paths = Object.keys((res.body as { paths: Record<string, unknown> }).paths);
    for (const mod of ['auth', 'students', 'teachers', 'grades', 'analytics', 'report-cards', 'notifications', 'admin']) {
      assert.ok(paths.some((p) => p.includes(mod)), `Missing: ${mod}`);
    }
  });

  await t('OpenAPI spec has Bearer JWT security scheme', async () => {
    const res = await api.get('/api/docs/openapi.json').expect(200);
    const schemes = (res.body as { components: { securitySchemes: Record<string, { type: string; scheme: string }> } }).components.securitySchemes;
    assert.equal(schemes.bearerAuth.type, 'http');
    assert.equal(schemes.bearerAuth.scheme, 'bearer');
  });

  await t('OpenAPI spec includes request/response examples', async () => {
    const res = await api.get('/api/docs/openapi.json').expect(200);
    const spec = res.body as { paths: Record<string, Record<string, { requestBody?: { content?: Record<string, { example?: unknown }> }; responses?: Record<string, { content?: Record<string, { example?: unknown }> }> }>> };
    assert.ok(spec.paths['/api/auth/login']?.post?.requestBody?.content?.['application/json']?.example, 'Login should have example');
  });

  // ── Auth ─────────────────────────────────────────────────────────────────
  console.log('\n── Auth ──');

  await t('GET /api/auth/me → 401 without token', async () => {
    await api.get('/api/auth/me').expect(401);
  });

  await t('GET /api/auth/me → 401 with invalid token', async () => {
    const res = await api.get('/api/auth/me').set('Authorization', 'Bearer bad-token').expect(401);
    assert.equal((res.body as { error: { code: string } }).error.code, 'INVALID_TOKEN');
  });

  await t('POST /api/auth/login → 401 for wrong credentials', async () => {
    stub('user', 'findUnique', async () => null);
    const res = await api.post('/api/auth/login').send({ email: 'wrong@x.com', password: 'wrong' }).expect(401);
    assert.equal((res.body as { error: { code: string } }).error.code, 'INVALID_CREDENTIALS');
  });

  await t('POST /api/auth/login → 422 for invalid email', async () => {
    await api.post('/api/auth/login').send({ email: 'bad', password: 'test' }).expect(422);
  });

  await t('POST /api/auth/login → 422 for missing fields', async () => {
    await api.post('/api/auth/login').send({}).expect(422);
  });

  await t('POST /api/auth/refresh → 422 for empty body', async () => {
    await api.post('/api/auth/refresh').send({}).expect(422);
  });

  await t('POST /api/auth/logout → 200 even with unknown token', async () => {
    stub('refreshToken', 'updateMany', async () => ({ count: 0 }));
    const res = await api.post('/api/auth/logout').send({ refreshToken: 'some-token' }).expect(200);
    assert.equal((res.body as { success: boolean }).success, true);
  });

  await t('GET /api/auth/me → 200 with valid admin token', async () => {
    stub('user', 'findUnique', async () => ({
      id: users.admin.id, email: users.admin.email, name: users.admin.name,
      role: 'ADMIN', phone: null, isActive: true, lastLoginAt: null, createdAt: new Date().toISOString(),
      studentProfile: null, teacherProfile: null, parentProfile: null,
    }));
    const token = signToken(users.admin);
    const res = await api.get('/api/auth/me').auth(token).expect(200);
    assert.equal((res.body as { user: { role: string } }).user.role, 'ADMIN');
  });

  // ── RBAC ─────────────────────────────────────────────────────────────────
  console.log('\n── RBAC / Permissions ──');

  const adminToken = signToken(users.admin);
  const teacherToken = signToken(users.teacher);
  const studentToken = signToken(users.student);
  const parentToken = signToken(users.parent);

  // Users: ADMIN only
  await t('GET /api/users → 403 for STUDENT', async () => { await api.get('/api/users').auth(studentToken).expect(403); });
  await t('GET /api/users → 403 for TEACHER', async () => { await api.get('/api/users').auth(teacherToken).expect(403); });
  await t('GET /api/users → 403 for PARENT', async () => { await api.get('/api/users').auth(parentToken).expect(403); });
  await t('GET /api/users → 200 for ADMIN', async () => {
    const res = await api.get('/api/users').auth(adminToken).expect(200);
    assert.ok(Array.isArray((res.body as { data: unknown[] }).data));
  });

  // Grades: TEACHER + ADMIN
  await t('GET /api/grades/grid → 403 for STUDENT', async () => {
    await api.get('/api/grades/grid?classId=c&subjectId=s&semesterId=sem').auth(studentToken).expect(403);
  });
  await t('GET /api/grades/grid → 403 for PARENT', async () => {
    await api.get('/api/grades/grid?classId=c&subjectId=s&semesterId=sem').auth(parentToken).expect(403);
  });
  await t('POST /api/grades/approve → 403 for TEACHER (admin-only)', async () => {
    await api.post('/api/grades/approve').auth(teacherToken).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(403);
  });

  // Students: ADMIN + TEACHER
  await t('GET /api/students → 403 for PARENT', async () => { await api.get('/api/students').auth(parentToken).expect(403); });
  await t('GET /api/students → 200 for TEACHER', async () => { await api.get('/api/students').auth(teacherToken).expect(200); });

  // Admin: ADMIN only
  await t('GET /api/admin/audit-logs → 403 for TEACHER', async () => { await api.get('/api/admin/audit-logs').auth(teacherToken).expect(403); });
  await t('GET /api/admin/audit-logs → 200 for ADMIN', async () => { await api.get('/api/admin/audit-logs').auth(adminToken).expect(200); });

  // School: public endpoint works without auth
  await t('GET /api/school/public → 200 without auth', async () => {
    stub('schoolSetting', 'findUnique', async () => ({
      id: 'school', name: 'Test School', motto: 'Test', studentIdPrefix: 'SGS',
      badgeData: null, badgeMime: null, updatedAt: new Date().toISOString(),
    }));
    stub('academicYear', 'findFirst', async () => ({ name: '2024-2025' }));
    const res = await api.get('/api/school/public').expect(200);
    assert.equal((res.body as { name: string }).name, 'Test School');
  });

  await t('PATCH /api/school/settings → 403 for TEACHER', async () => {
    await api.patch('/api/school/settings').auth(teacherToken).send({ name: 'X' }).expect(403);
  });

  // Report cards generate: ADMIN only
  await t('POST /api/report-cards/generate → 403 for TEACHER', async () => {
    await api.post('/api/report-cards/generate').auth(teacherToken).send({ classId: 'c', semesterId: 'sem' }).expect(403);
  });

  // Analytics: ADMIN + TEACHER
  await t('GET /api/analytics/dashboard → 403 for STUDENT', async () => { await api.get('/api/analytics/dashboard').auth(studentToken).expect(403); });
  await t('GET /api/analytics/dashboard → 403 for PARENT', async () => { await api.get('/api/analytics/dashboard').auth(parentToken).expect(403); });

  // Grade scales: any auth can GET, only ADMIN can POST
  await t('GET /api/grade-scales → 200 for STUDENT', async () => { await api.get('/api/grade-scales').auth(studentToken).expect(200); });
  await t('POST /api/grade-scales → 403 for TEACHER', async () => { await api.post('/api/grade-scales').auth(teacherToken).send({ name: 'x', bands: [] }).expect(403); });

  // ── Grade workflow ───────────────────────────────────────────────────────
  console.log('\n── Grade Workflow Validation ──');

  await t('POST /api/grades/entry → 422 missing semesterId', async () => {
    await api.post('/api/grades/entry').auth(teacherToken).send({ classId: 'c', subjectId: 's' }).expect(422);
  });
  await t('POST /api/grades/submit → 422 missing fields', async () => {
    await api.post('/api/grades/submit').auth(teacherToken).send({ classId: 'c' }).expect(422);
  });
  await t('POST /api/grades/publish → 422 empty body', async () => {
    await api.post('/api/grades/publish').auth(adminToken).send({}).expect(422);
  });
  await t('POST /api/grades/unlock → 200 when "to" omitted (defaults to SUBMITTED)', async () => {
    // The "to" field has .default('SUBMITTED'), so omitting it is valid.
    stub('enrollment', 'findMany', async () => []);
    stub('gradeEntry', 'updateMany', async () => ({ count: 0 }));
    stub('subjectResult', 'updateMany', async () => ({ count: 0 }));
    stub('subject', 'findUnique', async () => ({ name: 'Math', code: 'MATH' }));
    stub('classRoom', 'findUnique', async () => ({ name: 'S5', stream: 'A' }));
    stub('user', 'findMany', async () => []);
    stub('notification', 'createMany', async () => ({ count: 0 }));
    await api.post('/api/grades/unlock').auth(adminToken).send({ classId: 'c', subjectId: 's', semesterId: 'sem' }).expect(200);
  });
  await t('POST /api/grades/unlock → 422 invalid "to"', async () => {
    await api.post('/api/grades/unlock').auth(adminToken).send({ classId: 'c', subjectId: 's', semesterId: 'sem', to: 'INVALID' }).expect(422);
  });
  await t('GET /api/grades/grid → 422 missing query params', async () => {
    await api.get('/api/grades/grid?classId=c').auth(teacherToken).expect(422);
  });
  await t('POST /api/grades/entry → 422 empty entries array', async () => {
    await api.post('/api/grades/entry').auth(teacherToken).send({ classId: 'c', subjectId: 's', semesterId: 'sem', entries: [] }).expect(422);
  });

  // ── Notifications ────────────────────────────────────────────────────────
  console.log('\n── Notifications ──');

  await t('GET /api/notifications → 401 without token', async () => { await api.get('/api/notifications').expect(401); });
  await t('GET /api/notifications → 200 for STUDENT', async () => {
    const res = await api.get('/api/notifications').auth(studentToken).expect(200);
    assert.ok(Array.isArray((res.body as { data: unknown[] }).data));
  });
  await t('DELETE /api/notifications → 200', async () => {
    stub('notification', 'deleteMany', async () => ({ count: 5 }));
    const res = await api.delete('/api/notifications').auth(studentToken).expect(200);
    assert.equal((res.body as { success: boolean }).success, true);
  });

  // ── Error handling ───────────────────────────────────────────────────────
  console.log('\n── Error Handling ──');

  await t('Unknown route → 404 with envelope', async () => {
    const res = await api.get('/api/nonexistent').expect(404);
    assert.equal((res.body as { error: { code: string } }).error.code, 'NOT_FOUND');
  });

  await t('Validation error → 422 with VALIDATION_ERROR', async () => {
    const res = await api.post('/api/auth/login').send({ email: 'bad', password: '' }).expect(422);
    assert.equal((res.body as { error: { code: string } }).error.code, 'VALIDATION_ERROR');
  });

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(50)}`);
  console.log(`  API tests: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  if (failed > 0) {
    for (const f of failures) console.log(`    ✗ ${f}`);
    throw new Error(`${failed} API test(s) failed`);
  }
  console.log('  ✅ All API tests passed');
}
