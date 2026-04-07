import { spawnSync } from 'node:child_process';
import { rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = process.cwd();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const c8Bin = path.resolve(__dirname, '..', '..', 'node_modules', 'c8', 'bin', 'c8.js');
const vitestBin = path.resolve(__dirname, '..', '..', 'node_modules', 'vitest', 'vitest.mjs');

const transientCoverageRoots = [
  'coverage',
  '.runtime-cache/coverage-tmp',
  '.runtime-cache/coverage-split',
];

const removeTree = (targetPath) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      rmSync(targetPath, {
        recursive: true,
        force: true,
        maxRetries: 10,
        retryDelay: 50,
      });
      return;
    } catch (error) {
      const isRetriable =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error.code === 'ENOTEMPTY' || error.code === 'EBUSY' || error.code === 'EPERM');
      if (!isRetriable || attempt === 2) {
        throw error;
      }
    }
  }
};

for (const target of transientCoverageRoots) {
  removeTree(path.join(repoRoot, target));
}

console.log('[run-vitest-coverage] running c8-wrapped vitest coverage');

const result = spawnSync(
  process.execPath,
  [
    c8Bin,
    '--reporter=text',
    '--reporter=json-summary',
    '--clean',
    '--temp-directory',
    '.runtime-cache/coverage-tmp',
    '--check-coverage',
    '--lines',
    '80',
    '--statements',
    '80',
    '--functions',
    '80',
    '--branches',
    '70',
    process.execPath,
    vitestBin,
    'run',
    '--maxWorkers=1',
  ],
  {
    cwd: repoRoot,
    stdio: 'inherit',
    env: process.env,
  }
);

if (result.status !== 0) {
  throw new Error(`vitest coverage failed with exit code ${result.status ?? 1}`);
}

console.log('[run-vitest-coverage] vitest coverage completed successfully');
