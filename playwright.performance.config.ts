import { defineConfig, devices } from '@playwright/test'
import browserConfiguration from './playwright.config'

export default defineConfig({
  ...browserConfiguration,
  testDir: './tests/performance',
  fullyParallel: false,
  workers: 1,
  projects: [
    {
      name: 'performance',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } },
    },
  ],
})
