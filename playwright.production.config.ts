import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/production-worker.e2e.ts',
  workers: 1,
  outputDir: 'test-results-production',
  timeout: 60_000,
  use: { baseURL: 'http://127.0.0.1:5174', trace: 'retain-on-failure' },
  webServer: {
    command: 'bun run preview --port 5174 --host 127.0.0.1 --base /floorplan/',
    url: 'http://127.0.0.1:5174/floorplan/',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
