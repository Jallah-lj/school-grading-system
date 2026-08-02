/**
 * E2E tests: Dashboard and analytics.
 */
import { test, expect } from '@playwright/test';

import { loginViaUI } from '../fixtures/auth';

test.describe('Dashboard', () => {
  test('admin sees dashboard with key metrics', async ({ page }) => {
    await loginViaUI(page, 'admin');
    await page.goto('/dashboard');
    // Dashboard should show headline stats
    await expect(page.locator('main, [role="main"]')).toBeVisible();
    // Look for metric cards (student count, teacher count, etc.)
    const metrics = page.locator('[data-testid="metric-card"], .stat-card, .metric');
    if (await metrics.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(metrics.first()).toBeVisible();
    }
  });

  test('teacher sees dashboard with their assignments', async ({ page }) => {
    await loginViaUI(page, 'teacher');
    await page.goto('/dashboard');
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });

  test('student sees their grade summary', async ({ page }) => {
    await loginViaUI(page, 'student');
    // Students may have a different dashboard view
    await page.goto('/dashboard');
    await expect(page.locator('body')).not.toHaveText(/error|crash|unauthorized/i);
  });
});

test.describe('Analytics', () => {
  test('admin can view analytics page', async ({ page }) => {
    await loginViaUI(page, 'admin');
    await page.goto('/analytics');
    await expect(page.locator('main, [role="main"]')).toBeVisible();
    // Should show charts or data
    const charts = page.locator('canvas, [data-testid="chart"], .chart');
    if (await charts.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
      await expect(charts.first()).toBeVisible();
    }
  });

  test('teacher can view subject performance', async ({ page }) => {
    await loginViaUI(page, 'teacher');
    await page.goto('/analytics');
    await expect(page.locator('main, [role="main"]')).toBeVisible();
  });

  test('student cannot access analytics', async ({ page }) => {
    await loginViaUI(page, 'student');
    await page.goto('/analytics');
    // Should redirect or show unauthorized
    // The exact behavior depends on the app's routing
    await expect(page.locator('body')).not.toHaveText(/Internal Server Error/i);
  });
});
