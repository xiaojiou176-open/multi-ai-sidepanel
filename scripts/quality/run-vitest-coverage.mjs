import { spawnSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const vitestBin = path.resolve(__dirname, '..', '..', 'node_modules', 'vitest', 'vitest.mjs');

const transientCoverageRoots = [
  'coverage',
  '.runtime-cache/coverage-tmp',
  '.runtime-cache/coverage-split',
];

for (const target of transientCoverageRoots) {
  rmSync(path.join(repoRoot, target), { recursive: true, force: true });
}

// Vitest writes per-worker coverage JSON into coverage/.tmp during the run.
// Recreate that scratch directory after cleanup so parallel workers do not race
// on a missing parent directory.
mkdirSync(path.join(repoRoot, 'coverage', '.tmp'), { recursive: true });

console.log('[run-vitest-coverage] running vitest coverage in the supported single-worker mode');

const result = spawnSync(process.execPath, [vitestBin, 'run', '--coverage', '--maxWorkers=1'], {
  cwd: repoRoot,
  stdio: 'inherit',
  env: {
    ...process.env,
    VITEST_COVERAGE_CLEAN: '0',
  },
});

if (result.status !== 0) {
  throw new Error(`vitest coverage failed with exit code ${result.status ?? 1}`);
}

console.log('[run-vitest-coverage] vitest coverage completed successfully');
