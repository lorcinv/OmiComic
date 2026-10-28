import { defineConfig } from '@playwright/test';
import path from 'node:path';
import base from '../playwright.config';

const root = path.resolve(__dirname, '..');
export default defineConfig({
  ...base,
  testDir: path.join(root, 'tests'),
  testMatch: 'home-toggle.spec.ts',
  outputDir: path.join(root, 'test-results/home-toggle'),
  use: { ...base.use, baseURL: 'http://127.0.0.1:5186' },
  webServer: { cwd: root, command: 'npx vite --host 127.0.0.1 --port 5186 --strictPort', url: 'http://127.0.0.1:5186', reuseExistingServer: false },
});
