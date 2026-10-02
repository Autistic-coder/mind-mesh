import { defineConfig, devices } from '@playwright/test'

const python =
  process.env.MINDMESH_PYTHON ??
  (process.platform === 'win32' ? '.\\.venv\\Scripts\\python.exe' : './.venv/bin/python')

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 1000 } },
    },
  ],
  webServer: [
    {
      command: `"${python}" backend/tests/run_server.py`,
      url: 'http://127.0.0.1:8001/api/health',
      reuseExistingServer: false,
    },
    {
      command: 'npm run preview -- --port 4173 --strictPort',
      url: 'http://127.0.0.1:4173',
      env: { MINDMESH_API_TARGET: 'http://127.0.0.1:8001' },
      reuseExistingServer: false,
    },
  ],
})
