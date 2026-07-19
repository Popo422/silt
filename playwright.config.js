import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5178',
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npx --yes http-server . -p 5178 -c-1 --silent',
    url: 'http://127.0.0.1:5178/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
