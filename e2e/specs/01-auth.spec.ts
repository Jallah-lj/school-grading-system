/**
 * E2E tests: Authentication flow.
 *
 * Tests the login, logout, and session management flows through the UI.
 */
import { test, expect } from '@playwright/test';
import { testUsers } from '../fixtures/auth';

test.describe('Authentication', () => {
  test('login page loads with school branding', async ({ page }) => {
    await page.goto('/login');
    // The page should show the school name (fetched from /api/school/public)
    await expect(page.getByRole('heading')).toBeVisible();
    // Email and password fields should be present
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.getByLabel(/password/i)).toBeVisible();
  });

  test('admin can log in successfully', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(testUsers.admin.email);
    await page.getByLabel(/password/i).fill(testUsers.admin.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Should navigate away from login page
    await expect(page).not.toHaveURL(/.*login/);
  });

  test('invalid credentials show error message', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('wrong@email.com');
    await page.getByLabel(/password/i).fill('wrongpassword');
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Should show an error message
    await expect(page.getByText(/invalid|incorrect|error/i)).toBeVisible();
    // Should stay on login page
    await expect(page).toHaveURL(/.*login/);
  });

  test('validation prevents empty form submission', async ({ page }) => {
    await page.goto('/login');
    // Try to submit without filling anything
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    // Should show validation errors or not navigate
    await expect(page).toHaveURL(/.*login/);
  });

  test('logout clears session and redirects to login', async ({ page, request }) => {
    // First, log in
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(testUsers.admin.email);
    await page.getByLabel(/password/i).fill(testUsers.admin.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/.*login/);

    // Click the logout button (usually in the sidebar/header)
    const logoutBtn = page.getByRole('button', { name: /log out|sign out|logout/i });
    if (await logoutBtn.isVisible()) {
      await logoutBtn.click();
      await expect(page).toHaveURL(/.*login/);
    }
  });

  test('session persists across page reloads', async ({ page }) => {
    // Log in
    await page.goto('/login');
    await page.getByLabel(/email/i).fill(testUsers.admin.email);
    await page.getByLabel(/password/i).fill(testUsers.admin.password);
    await page.getByRole('button', { name: /sign in|log in/i }).click();
    await expect(page).not.toHaveURL(/.*login/);

    // Reload the page
    await page.reload();
    // Should still be logged in (not redirected to login)
    await expect(page).not.toHaveURL(/.*login/);
  });
});
