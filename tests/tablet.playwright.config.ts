import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: ['tablet-compat.spec.ts','document-perf.spec.ts'], timeout: 45000,
  outputDir: '../test-results/tablet1179', workers: 1,
  use: { baseURL: 'http://127.0.0.1:5179', viewport: { width: 1280, height: 800 }, hasTouch: true, reducedMotion: 'reduce',
    launchOptions: { executablePath: process.env.OMI_TABLET_BROWSER || undefined, args:['--no-sandbox'] } },
  webServer: { command: 'npx vite preview --outDir .cache/tablet1179/web --host 127.0.0.1 --port 5179', url:'http://127.0.0.1:5179/tests/tablet-harness.html', reuseExistingServer:true, cwd:process.cwd() },
  reporter: [['list']],
});
