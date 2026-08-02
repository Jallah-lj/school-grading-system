import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright E2E configuration for the School Grading System.
 *
 * Before running:
 *   1. Start the backend:  cd server && npm run dev
 *   2. Start the frontend: cd client && npm run dev
 *   3. Run tests:          npx playwright test
 *
 * Or with both servers managed by Playwright:
 *   npx playwright test --config=e2e/playwright.config.ts
 */
export default defineConfig({
  testDir: './specs',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],
  timeout: 30_000,

  use: {
    baseURL: process.env.E2E_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    // API base URL for direct API calls in tests
    extraHTTPHeaders: {
      'Accept': 'application/json',
    },
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },
    {
      name: 'mobile-chrome',
      use: { ...devices['Pixel 5'] },
    },
  ],

  /*
   * Web servers — uncomment when running E2E tests locally.
   * In CI, the servers are usually started separately.
   */
  webServer: [
    // {
    //   command: 'cd ../server && npm run dev',
    //   url: 'http://localhost:4000/api/health',
    //   reuseExistingServer: !process.env.CI,
    //   timeout: 30_000,
    // },
    // {
    //   command: 'cd ../client && npm run dev',
    //   url: 'http://localhost:5173',
    //   reuseExistingServer: !process.env.CI,
    //   timeout: 30_000,
    // },
  ],
});
