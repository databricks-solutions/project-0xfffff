import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3000';
const useWebServer = !process.env.PW_NO_WEBSERVER;

// JSON reporter for LLM agents (token-efficient test results)
const useJsonReporter = process.env.PW_JSON_REPORT === '1';

// Verbose console error logging - set PW_VERBOSE_CONSOLE=1 to see all console output
const verboseConsole = process.env.PW_VERBOSE_CONSOLE === '1';

// Timeout configuration: can be overridden via environment variables
const testTimeout = process.env.PW_TEST_TIMEOUT
  ? parseInt(process.env.PW_TEST_TIMEOUT, 10)
  : 30_000;
const expectTimeout = process.env.PW_EXPECT_TIMEOUT
  ? parseInt(process.env.PW_EXPECT_TIMEOUT, 10)
  : 5_000;

export default defineConfig({
  testDir: './tests',
  timeout: testTimeout,
  expect: {
    timeout: expectTimeout,
  },
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Reporter configuration: JSON for agents, line for humans
  reporter: useJsonReporter
    ? [['json', { outputFile: '../.test-results/playwright.json' }]]
    : [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: useWebServer
    ? {
        // Keep `just e2e` as the primary entrypoint; this is for `npm -C client test`.
        command: 'just e2e-servers',
        cwd: '..',
        url: `${baseURL}/`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      }
    : undefined,
});


