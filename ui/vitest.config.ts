import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The Angular-heavy suite is memory-bandwidth bound on high-core-count
    // machines. A measured sweep on 20 logical cores found 4 workers faster
    // than 2, 8, or Vitest's 20-worker default. VITEST_MAX_WORKERS still
    // overrides this when benchmarking different hardware.
    maxWorkers: 4,
    coverage: {
      // Fresh full-suite baseline from 2026-08-02. These are floors, not goals:
      // performance work may raise them but must not silently reduce coverage.
      thresholds: {
        lines: 71.26,
        statements: 67.29,
        functions: 61.46,
        branches: 68.26,
      },
    },
  },
});
