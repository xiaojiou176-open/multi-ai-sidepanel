import { defineConfig, configDefaults } from 'vitest/config';

const useSplitCoverageShards = process.env.VITEST_SPLIT_COVERAGE_NO_THRESHOLDS === '1';
const coverageClean = process.env.VITEST_COVERAGE_CLEAN === '0' ? false : true;
const coverageReporters =
  process.env.VITEST_SPLIT_COVERAGE_JSON_ONLY === '1' ? ['json', 'json-summary'] : ['text', 'json-summary'];
const coverageThresholds = useSplitCoverageShards
  ? {
      lines: 0,
      statements: 0,
      functions: 0,
      branches: 0,
    }
  : {
      lines: 80,
      statements: 80,
      functions: 80,
      branches: 70,
    };

export default defineConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    exclude: [...configDefaults.exclude, 'tests/e2e/**'],
    maxWorkers: '75%',
    minWorkers: 1,
    fileParallelism: true,
    coverage: {
      provider: 'v8',
      clean: coverageClean,
      reporter: coverageReporters,
      reportsDirectory: process.env.VITEST_COVERAGE_REPORTS_DIR || 'coverage',
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.*', 'src/test/**', 'src/i18n/**', 'src/assets/**'],
      thresholds: coverageThresholds,
    },
  },
});
