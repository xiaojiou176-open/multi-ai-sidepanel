import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  fullyParallel: true,
  workers: process.env.CI ? 2 : undefined,
  expect: {
    timeout: 10_000,
  },
  retries: 0,
  reporter: [['list']],
  outputDir: '.runtime-cache/test_output/e2e',
  preserveOutput: 'failures-only',
  use: {
    headless: false,
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    trace: 'retain-on-failure',
  },
});
