import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    include: ['tests/dom*.test.tsx'],
    setupFiles: ['tests/dom.setup.ts'],
    testTimeout: 15000,
    pool: 'forks',
    maxWorkers: 1,
    fileParallelism: false,
  },
});
