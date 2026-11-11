import { defineConfig } from '@playwright/test';
import path from 'node:path';

export default defineConfig({
  testDir:'.',testMatch:'**/*.spec.ts',outputDir:'../test-results/settings-reader',timeout:30000,
  use:{baseURL:'http://127.0.0.1:5195',viewport:{width:1440,height:960},launchOptions:{executablePath:process.env.CHROMIUM_PATH||undefined,args:['--no-sandbox']}},
  webServer:{command:'npx vite --host 127.0.0.1 --port 5195 --strictPort',url:'http://127.0.0.1:5195',cwd:path.resolve(__dirname,'..'),reuseExistingServer:false},
  reporter:[['list']],workers:1,
});
