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
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'bun src/server/app/server.ts',
      url: 'http://127.0.0.1:8000/api/health',
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: 'bun run dev --port 5173 --host 127.0.0.1',
      url: 'http://127.0.0.1:5173/',
      reuseExistingServer: true,
      timeout: 120_000,
      env: { BROWSER: 'none' },
    },
  ],
});
