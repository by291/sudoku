import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  timeout: 60000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'], viewport: { width: 360, height: 800 }, deviceScaleFactor: 1 },
    },
  ],
  webServer: [
    {
      command: 'pnpm preview --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      reuseExistingServer: !process.env.CI,
    },
    {
      command:
        'pnpm build:subpath && pnpm exec vite preview --outDir dist-subpath --base /sudoku/ --host 127.0.0.1 --port 4174 --strictPort',
      url: 'http://127.0.0.1:4174/sudoku/',
      reuseExistingServer: !process.env.CI,
    },
  ],
})
