import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    maxWorkers: 1,
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 15000,
    // Node 25+ defines its own global localStorage, which is undefined without
    // --localstorage-file and hides jsdom's, so integration/setup.ts saw no
    // storage on Node 26 (2026-11-26). Off restores jsdom's Web Storage; Node 24
    // accepts the flag too.
    execArgv: ['--no-experimental-webstorage'],
  },
});
