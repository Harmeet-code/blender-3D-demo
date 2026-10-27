import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  testIgnore: '**/production-worker.e2e.ts',
  timeout: 60_000,
  retries: process.env['CI'] ? 2 : 0,
  // Each test owns a WebGL canvas; concurrent GPU workloads invalidate timing evidence.
  workers: 1,
  use: {
    launchOptions: {
      args: process.env['R3F_TEST_ANGLE']
        ? ['--enable-gpu', '--use-gl=angle', `--use-angle=${process.env['R3F_TEST_ANGLE']}`]
        : [],
    },
    baseURL: 'http://127.0.0.1:5175',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'bun start',
      url: 'http://127.0.0.1:5175/',
      reuseExistingServer: true,
      timeout: 120_000,
      env: { BROWSER: 'none' },
    },
  ],
});
