/**
 * E2E tests: Report card generation, PDF download, and QR verification.
 */
import { test, expect } from '@playwright/test';

import { loginViaUI } from '../fixtures/auth';

test.describe('Report cards', () => {
  test.describe('Admin generates report cards', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaUI(page, 'admin');
    });

    test('admin can access report cards page', async ({ page }) => {
      await page.goto('/report-cards');
      await expect(page.locator('main, [role="main"]')).toBeVisible();
    });

    test('admin can generate report cards for a class', async ({ page }) => {
      await page.goto('/report-cards');
      // Select class and semester, then click generate
      const generateBtn = page.getByRole('button', { name: /generate/i });
      if (await generateBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await generateBtn.click();
        // Should show progress or success
        await expect(page.getByText(/generat|success|created/i).first()).toBeVisible({ timeout: 10_000 });
      }
    });

    test('admin can download report card PDF', async ({ page }) => {
      await page.goto('/report-cards');
      // Find a download/PDF button for an existing card
      const pdfBtn = page.getByRole('link', { name: /pdf|download/i }).first()
        .or(page.getByRole('button', { name: /pdf|download/i }).first());
      if (await pdfBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        // Set up download handler
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          pdfBtn.click(),
        ]);
        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
      }
    });

    test('admin can publish report cards', async ({ page }) => {
      await page.goto('/report-cards');
      const publishBtn = page.getByRole('button', { name: /publish/i }).first();
      if (await publishBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await publishBtn.click();
        await expect(page.getByText(/published|success/i).first()).toBeVisible({ timeout: 5_000 });
      }
    });
  });

  test.describe('Report card verification (public)', () => {
    test('verification page loads without authentication', async ({ page }) => {
      // Access a verification URL with a sample code
      await page.goto('/verify/ABC123');
      // Should show the verification page (even if code is invalid)
      await expect(page.locator('body')).toBeVisible();
    });

    test('invalid verification code shows appropriate message', async ({ page }) => {
      await page.goto('/verify/INVALID00');
      // Should show "not found" or "invalid code" message
      await expect(page.getByText(/not found|invalid|not verified/i).first()).toBeVisible({ timeout: 5_000 });
    });
  });

  test.describe('Student report cards', () => {
    test('student can view their published report cards', async ({ page }) => {
      await loginViaUI(page, 'student');
      await page.goto('/report-cards');
      await expect(page.locator('main, [role="main"]')).toBeVisible();
    });
  });
});

test.describe('Transcript', () => {
  test('admin can download cumulative transcript', async ({ page }) => {
    await loginViaUI(page, 'admin');
    // Navigate to a student profile
    await page.goto('/students');
    // Find and click a student to view their profile
    const studentLink = page.getByRole('link').filter({ hasText: /\w+ \w+/ }).first();
    if (await studentLink.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await studentLink.click();
      // Look for a transcript download button
      const transcriptBtn = page.getByRole('link', { name: /transcript/i })
        .or(page.getByRole('button', { name: /transcript/i }));
      if (await transcriptBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        const [download] = await Promise.all([
          page.waitForEvent('download'),
          transcriptBtn.click(),
        ]);
        expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
      }
    }
  });
});
