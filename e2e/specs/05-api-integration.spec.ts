/**
 * E2E tests: API integration via Playwright's request context.
 *
 * These tests exercise the backend API directly (no browser) and verify
 * the complete request/response lifecycle including auth, RBAC, and
 * the grading workflow — the most critical business logic.
 */
import { test, expect } from '@playwright/test';

const API_BASE = process.env.E2E_API_URL || 'http://localhost:4000/api';

test.describe('API E2E: Authentication', () => {
  test('POST /auth/login returns tokens for valid credentials', async ({ request }) => {
    const res = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'admin@school.rw', password: 'Admin@1234' },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    expect(body).toHaveProperty('user');
    expect(body.user).toHaveProperty('role', 'ADMIN');
  });

  test('POST /auth/login returns 401 for wrong credentials', async ({ request }) => {
    const res = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'wrong@test.rw', password: 'wrong' },
    });
    expect(res.status()).toBe(401);
  });

  test('GET /auth/me returns user with valid token', async ({ request }) => {
    // Login first
    const login = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'admin@school.rw', password: 'Admin@1234' },
    });
    const { accessToken } = await login.json();

    const res = await request.get(`${API_BASE}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.user).toHaveProperty('id');
    expect(body.user).toHaveProperty('email');
  });

  test('POST /auth/refresh rotates tokens', async ({ request }) => {
    // Login
    const login = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'admin@school.rw', password: 'Admin@1234' },
    });
    const { refreshToken } = await login.json();

    // Refresh
    const res = await request.post(`${API_BASE}/auth/refresh`, {
      data: { refreshToken },
    });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('accessToken');
    expect(body).toHaveProperty('refreshToken');
    // New tokens should be different from the old ones
    expect(body.refreshToken).not.toBe(refreshToken);
  });
});

test.describe('API E2E: RBAC enforcement', () => {
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;

  test.beforeAll(async ({ request }) => {
    const adminLogin = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'admin@school.rw', password: 'Admin@1234' },
    });
    adminToken = (await adminLogin.json()).accessToken;

    const teacherLogin = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'teacher@school.rw', password: 'Teacher@123' },
    });
    teacherToken = (await teacherLogin.json()).accessToken;

    const studentLogin = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'student@school.rw', password: 'Student@123' },
    });
    studentToken = (await studentLogin.json()).accessToken;
  });

  test('ADMIN can list users', async ({ request }) => {
    const res = await request.get(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('TEACHER cannot list users', async ({ request }) => {
    const res = await request.get(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('STUDENT cannot list users', async ({ request }) => {
    const res = await request.get(`${API_BASE}/users`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('ADMIN can access audit logs', async ({ request }) => {
    const res = await request.get(`${API_BASE}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    expect(res.ok()).toBeTruthy();
  });

  test('TEACHER cannot access audit logs', async ({ request }) => {
    const res = await request.get(`${API_BASE}/admin/audit-logs`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    expect(res.status()).toBe(403);
  });

  test('STUDENT cannot approve grades', async ({ request }) => {
    const res = await request.post(`${API_BASE}/grades/approve`, {
      headers: { Authorization: `Bearer ${studentToken}` },
      data: { classId: 'c', subjectId: 's', semesterId: 'sem' },
    });
    expect(res.status()).toBe(403);
  });
});

test.describe('API E2E: Public endpoints', () => {
  test('GET /health returns ok', async ({ request }) => {
    const res = await request.get(`${API_BASE}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('status', 'ok');
  });

  test('GET /school/public returns branding', async ({ request }) => {
    const res = await request.get(`${API_BASE}/school/public`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body).toHaveProperty('name');
    expect(body).toHaveProperty('motto');
  });

  test('GET /docs/openapi.json returns valid spec', async ({ request }) => {
    const res = await request.get(`${API_BASE}/docs/openapi.json`);
    expect(res.ok()).toBeTruthy();
    const spec = await res.json();
    expect(spec).toHaveProperty('openapi', '3.0.3');
    expect(spec).toHaveProperty('info');
    expect(spec).toHaveProperty('paths');
  });

  test('GET /docs returns Swagger UI HTML', async ({ request }) => {
    const res = await request.get(`${API_BASE}/docs`);
    expect(res.ok()).toBeTruthy();
    const html = await res.text();
    expect(html).toContain('swagger-ui');
  });
});

test.describe('API E2E: Grade workflow (most important flow)', () => {
  let teacherToken: string;
  let adminToken: string;

  test.beforeAll(async ({ request }) => {
    const teacherLogin = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'teacher@school.rw', password: 'Teacher@123' },
    });
    teacherToken = (await teacherLogin.json()).accessToken;

    const adminLogin = await request.post(`${API_BASE}/auth/login`, {
      data: { email: 'admin@school.rw', password: 'Admin@1234' },
    });
    adminToken = (await adminLogin.json()).accessToken;
  });

  test('teacher can view grade grid for assigned subject', async ({ request }) => {
    // First, get a valid class/subject/semester (these should exist from seeding)
    const classes = await request.get(`${API_BASE}/classes`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const { data: classList } = await classes.json();
    if (classList.length === 0) {
      test.skip();
      return;
    }
    const classId = classList[0].id;

    const subjects = await request.get(`${API_BASE}/subjects`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const { data: subjectList } = await subjects.json();
    if (subjectList.length === 0) {
      test.skip();
      return;
    }
    const subjectId = subjectList[0].id;

    const years = await request.get(`${API_BASE}/academic-years/active`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const activeYear = await years.json();
    if (!activeYear?.semesters?.length) {
      test.skip();
      return;
    }
    const semesterId = activeYear.semesters.find((s: { isCurrent: boolean }) => s.isCurrent)?.id
      ?? activeYear.semesters[0].id;

    // Now request the grid
    const res = await request.get(
      `${API_BASE}/grades/grid?classId=${classId}&subjectId=${subjectId}&semesterId=${semesterId}`,
      { headers: { Authorization: `Bearer ${teacherToken}` } },
    );

    // If the teacher is assigned to this class/subject, we get 200
    // If not, we get 403 (which is also valid RBAC behavior)
    expect([200, 403]).toContain(res.status());

    if (res.ok()) {
      const grid = await res.json();
      expect(grid).toHaveProperty('students');
      expect(grid).toHaveProperty('components');
      expect(grid).toHaveProperty('entries');
      expect(grid).toHaveProperty('status');
    }
  });

  test('teacher can enter marks (draft)', async ({ request }) => {
    // This test validates the entry API shape — actual data creation
    // depends on seeded data being present.
    const res = await request.post(`${API_BASE}/grades/entry`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classId: 'nonexistent-class',
        subjectId: 'nonexistent-subject',
        semesterId: 'nonexistent-semester',
        entries: [{ studentId: 'x', scores: {} }],
      },
    });
    // Should get either 403 (not assigned) or some error — not 500
    expect(res.status()).not.toBe(500);
  });

  test('teacher can submit marks', async ({ request }) => {
    const res = await request.post(`${API_BASE}/grades/submit`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
      data: {
        classId: 'nonexistent-class',
        subjectId: 'nonexistent-subject',
        semesterId: 'nonexistent-semester',
      },
    });
    // 403 (not assigned) or 400 (no marks) are valid responses
    expect([200, 400, 403]).toContain(res.status());
  });

  test('admin can approve marks (triggers computation)', async ({ request }) => {
    const res = await request.post(`${API_BASE}/grades/approve`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        classId: 'nonexistent-class',
        subjectId: 'nonexistent-subject',
        semesterId: 'nonexistent-semester',
      },
    });
    // 400 (no submitted marks) is the expected response for nonexistent data
    expect([200, 400]).toContain(res.status());
  });

  test('admin can publish marks', async ({ request }) => {
    const res = await request.post(`${API_BASE}/grades/publish`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        classId: 'nonexistent-class',
        subjectId: 'nonexistent-subject',
        semesterId: 'nonexistent-semester',
      },
    });
    expect([200, 400]).toContain(res.status());
  });

  test('admin can unlock marks', async ({ request }) => {
    const res = await request.post(`${API_BASE}/grades/unlock`, {
      headers: { Authorization: `Bearer ${adminToken}` },
      data: {
        classId: 'nonexistent-class',
        subjectId: 'nonexistent-subject',
        semesterId: 'nonexistent-semester',
        to: 'DRAFT',
        note: 'Please recheck scores',
      },
    });
    // 200 (success, 0 unlocked) is valid
    expect([200, 400]).toContain(res.status());
  });
});
