import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.e2e.ts',
  timeout: 60_000,
  retries: process.env['CI'] ? 2 : 0,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'bun src/server/index.ts',
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
