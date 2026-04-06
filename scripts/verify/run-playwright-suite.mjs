import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const npxCmd = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const playwrightArgs = process.argv.slice(2);

const run = (command, args) =>
  spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

const cleanupRuntime = () => run(npmCmd, ['run', 'clean:runtime']);
const ensurePlaywrightScratchRoots = () => {
  mkdirSync('.runtime-cache/test_output/e2e', { recursive: true });
  mkdirSync('.runtime-cache/test-results', { recursive: true });
};

let exitCode = 0;

try {
  const preCleanupResult = cleanupRuntime();
  if (preCleanupResult.status !== 0) {
    exitCode = preCleanupResult.status ?? 1;
  } else {
    ensurePlaywrightScratchRoots();
    const buildResult = run(npmCmd, ['run', 'build']);
    if (buildResult.status !== 0) {
      exitCode = buildResult.status ?? 1;
    } else {
      const testResult = run(npxCmd, ['playwright', 'test', ...playwrightArgs]);
      exitCode = testResult.status ?? 1;
    }
  }
} finally {
  if (exitCode === 0) {
    const cleanupResult = cleanupRuntime();
    if (cleanupResult.status !== 0) {
      exitCode = cleanupResult.status ?? 1;
    }
  } else {
    console.error(
      '[run-playwright-suite] preserving .runtime-cache for failure analysis'
    );
  }
}

process.exit(exitCode);
