import { spawnSync } from 'node:child_process';

const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';

const run = (command, args) =>
  spawnSync(command, args, {
    cwd: process.cwd(),
    stdio: 'inherit',
    env: process.env,
  });

const runNpm = (scriptName) => run(npmCmd, ['run', scriptName]);

const runShellE2E = () => {
  const needsVirtualDisplay =
    process.platform === 'linux' &&
    process.env.CI === 'true' &&
    !process.env.DISPLAY &&
    !process.env.WAYLAND_DISPLAY;

  if (needsVirtualDisplay) {
    return run('xvfb-run', ['-a', npmCmd, 'run', 'test:e2e:shell']);
  }

  return runNpm('test:e2e:shell');
};

const steps = [
  () => runNpm('clean:runtime'),
  () => runNpm('secrets:scan:history'),
  () => runNpm('test:hosted'),
  () => runNpm('verify:store-readiness'),
  () => runShellE2E(),
];

let exitCode = 0;

try {
  for (const step of steps) {
    const result = step();
    if (result.status !== 0) {
      exitCode = result.status ?? 1;
      break;
    }
  }
} finally {
  const cleanupResult = runNpm('clean:runtime');
  if (exitCode === 0 && cleanupResult.status !== 0) {
    exitCode = cleanupResult.status ?? 1;
  }
}

process.exit(exitCode);
