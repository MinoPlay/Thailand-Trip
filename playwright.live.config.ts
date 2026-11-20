import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests',
  testMatch: '**/live.spec.ts',
  timeout: 60_000,
  workers: 1,
  use: {
    ...devices['Desktop Chrome'],
    baseURL: process.env.TRIP_LIVE_URL ?? 'http://127.0.0.1:4183',
    trace: 'off',
    screenshot: 'off',
  },
  webServer: process.env.TRIP_LIVE_URL ? undefined : {
    command: 'npm run dev -- --port 4183 --strictPort',
    url: 'http://127.0.0.1:4183',
    reuseExistingServer: false,
  },
})
