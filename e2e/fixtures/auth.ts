/**
 * E2E test fixtures — authentication helpers and test data.
 *
 * These helpers handle the login flow and token management so individual
 * test specs can focus on the feature under test.
 */
import { type APIRequestContext, type Page } from '@playwright/test';

// ── Test user credentials (must match seeded data or be created in beforeAll) ──
export const testUsers = {
  admin: { email: 'admin@school.rw', password: 'Admin@1234' },
  teacher: { email: 'teacher@school.rw', password: 'Teacher@123' },
  student: { email: 'student@school.rw', password: 'Student@123' },
  parent: { email: 'parent@school.rw', password: 'Parent@123' },
};

export type UserRole = keyof typeof testUsers;

/**
 * Log in via the API and return tokens + user payload.
 * Use this for tests that need to make authenticated API calls.
 */
export async function loginViaApi(
  request: APIRequestContext,
  role: UserRole,
  apiBase = 'http://localhost:4000/api',
): Promise<{ accessToken: string; refreshToken: string; user: Record<string, unknown> }> {
  const { email, password } = testUsers[role];
  const res = await request.post(`${apiBase}/auth/login`, {
    data: { email, password },
  });
  if (!res.ok()) {
    const body = await res.text();
    throw new Error(`Login failed for ${role} (${res.status()}): ${body}`);
  }
  return res.json();
}

/**
 * Log in via the browser UI (login page form).
 * Use this for tests that need an authenticated browser session.
 */
export async function loginViaUI(page: Page, role: UserRole): Promise<void> {
  const { email, password } = testUsers[role];
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(email);
  await page.getByLabel(/password/i).fill(password);
  await page.getByRole('button', { name: /sign in|log in/i }).click();
  // Wait for navigation to the dashboard or home page
  await page.waitForURL('**/dashboard', { timeout: 10_000 }).catch(() => {
    // Some roles may redirect to a different page
    return page.waitForURL('**/(?!login)', { timeout: 5_000 });
  });
}

/**
 * Set auth token in localStorage and reload (faster than UI login).
 */
export async function setAuthTokens(
  page: Page,
  tokens: { accessToken: string; refreshToken: string },
): Promise<void> {
  await page.evaluate(
    ({ access, refresh }) => {
      localStorage.setItem('sgs.accessToken', access);
      localStorage.setItem('sgs.refreshToken', refresh);
    },
    { access: tokens.accessToken, refresh: tokens.refreshToken },
  );
  await page.reload();
}
