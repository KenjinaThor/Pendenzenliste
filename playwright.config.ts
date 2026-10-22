import { defineConfig } from '@playwright/test';

// Das Frontend wird mit einer Fake-Supabase-URL gebaut; die API wird in den Tests gemockt.
export default defineConfig({
  testDir: 'e2e',
  timeout: 20_000,
  use: {
    baseURL: 'http://localhost:4173',
    launchOptions: process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {},
  },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173/Pendenzenliste/',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      VITE_BASE: '/Pendenzenliste/',
      VITE_SUPABASE_URL: 'https://mock.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'sb_publishable_mock',
    },
  },
});
