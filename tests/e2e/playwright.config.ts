import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: __dirname,
  timeout: 120000,
  workers: 1,
  retries: 0,
  reporter: 'list',
  use: { trace: 'retain-on-failure' },
});
