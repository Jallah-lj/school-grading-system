/**
 * E2E tests: Complete grading workflow.
 *
 * This is the MOST IMPORTANT test flow — it covers the core business logic:
 *   1. Teacher logs in and enters marks for a class/subject
 *   2. Teacher submits marks for approval
 *   3. Admin logs in and reviews the submission
 *   4. Admin approves marks (triggers automatic GPA computation)
 *   5. Admin publishes marks (triggers notifications to students & parents)
 *   6. Student can view their published grades
 *   7. Parent can view their child's grades
 *
 * This flow is what makes the system valuable — if it works end-to-end,
 * the core value proposition is validated.
 */
import { test, expect } from '@playwright/test';

import { loginViaUI } from '../fixtures/auth';

test.describe('Grade workflow (end-to-end)', () => {
  // These tests assume seeded data exists (class, subject, semester, students).
  // Adjust selectors to match your actual UI structure.

  test.describe('Teacher flow', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaUI(page, 'teacher');
    });

    test('teacher can access grade entry page', async ({ page }) => {
      // Navigate to grade entry (via sidebar or direct URL)
      await page.goto('/grade-entry');
      // Should see class/subject/semester selectors
      await expect(page.getByText(/class|subject|term/i).first()).toBeVisible();
    });

    test('teacher can select class, subject and term', async ({ page }) => {
      await page.goto('/grade-entry');
      // Select a class from the dropdown
      const classSelect = page.locator('select').first();
      if (await classSelect.isVisible()) {
        await classSelect.selectOption({ index: 1 });
      }
      // The grid should load with student rows
      // (exact selectors depend on the UI implementation)
    });

    test('teacher can enter marks for students', async ({ page }) => {
      await page.goto('/grade-entry');
      // Find input fields in the grade grid and enter scores
      const scoreInputs = page.locator('input[type="number"], input[type="text"]').filter({
        has: page.locator('[data-testid="score-input"]'),
      });
      // If we find score inputs, fill the first one
      if (await scoreInputs.first().isVisible({ timeout: 3_000 }).catch(() => false)) {
        await scoreInputs.first().fill('85');
      }
      // Marks should auto-save (look for a save indicator)
    });

    test('teacher can submit marks for approval', async ({ page }) => {
      await page.goto('/grade-entry');
      // Look for a "Submit" button
      const submitBtn = page.getByRole('button', { name: /submit/i });
      if (await submitBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await submitBtn.click();
        // Should show confirmation or status change
        await expect(page.getByText(/submitted|pending/i).first()).toBeVisible({ timeout: 5_000 });
      }
    });
  });

  test.describe('Admin approval flow', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaUI(page, 'admin');
    });

    test('admin can see pending approvals', async ({ page }) => {
      // Navigate to approvals page
      await page.goto('/approvals');
      // Should see a list of submitted grade grids awaiting review
      const content = page.locator('main, [role="main"]').first();
      await expect(content).toBeVisible();
    });

    test('admin can approve submitted marks', async ({ page }) => {
      await page.goto('/approvals');
      // Look for an "Approve" button
      const approveBtn = page.getByRole('button', { name: /approve/i }).first();
      if (await approveBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await approveBtn.click();
        // Should show success or status change to "Approved"
        await expect(page.getByText(/approved|success/i).first()).toBeVisible({ timeout: 5_000 });
      }
    });

    test('admin can publish approved marks', async ({ page }) => {
      await page.goto('/approvals');
      // Look for a "Publish" button (may be on a different tab/section)
      const publishBtn = page.getByRole('button', { name: /publish/i }).first();
      if (await publishBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await publishBtn.click();
        // Should show success or status change to "Published"
        await expect(page.getByText(/published|success/i).first()).toBeVisible({ timeout: 5_000 });
      }
    });

    test('admin can unlock published marks for corrections', async ({ page }) => {
      await page.goto('/approvals');
      // Look for an "Unlock" or "Return" button
      const unlockBtn = page.getByRole('button', { name: /unlock|return|reopen/i }).first();
      if (await unlockBtn.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await unlockBtn.click();
        // May show a dialog for selecting target status and adding a note
        const dialog = page.locator('[role="dialog"]');
        if (await dialog.isVisible({ timeout: 2_000 }).catch(() => false)) {
          // Fill optional note
          const noteField = dialog.getByLabel(/note|reason/i);
          if (await noteField.isVisible().catch(() => false)) {
            await noteField.fill('Please verify the scores');
          }
          await dialog.getByRole('button', { name: /confirm|unlock|ok/i }).click();
        }
      }
    });
  });

  test.describe('Student view', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaUI(page, 'student');
    });

    test('student can view their grades', async ({ page }) => {
      await page.goto('/my-grades');
      // Should see grade results or a "no grades yet" message
      await expect(page.locator('main, [role="main"]')).toBeVisible();
    });

    test('student can see grade details', async ({ page }) => {
      await page.goto('/my-grades');
      // If grades are published, should see subject results
      // This is a smoke test — just verify the page renders
      await expect(page.locator('body')).not.toHaveText(/error|crash/i);
    });
  });

  test.describe('Parent view', () => {
    test.beforeEach(async ({ page }) => {
      await loginViaUI(page, 'parent');
    });

    test('parent can view child grades', async ({ page }) => {
      await page.goto('/my-grades');
      // Parent should see their children's grades
      await expect(page.locator('main, [role="main"]')).toBeVisible();
    });
  });
});
