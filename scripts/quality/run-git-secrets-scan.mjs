import { spawnSync } from 'node:child_process';
import process from 'node:process';

const mode = process.argv[2] ?? 'current';

if (!['current', 'staged', 'history'].includes(mode)) {
  console.error(
    `[git-secrets] unknown mode "${mode}". Use "current", "staged", or "history".`,
  );
  process.exit(1);
}

const listResult = spawnSync('git-secrets', ['--list'], {
  cwd: process.cwd(),
  encoding: 'utf-8',
});

if (listResult.error && listResult.error.code === 'ENOENT') {
  console.error(
    '[git-secrets] missing tool: install git-secrets before running this guard.',
  );
  process.exit(1);
}

if (listResult.status !== 0) {
  if (listResult.stdout) {
    process.stdout.write(listResult.stdout);
  }
  if (listResult.stderr) {
    process.stderr.write(listResult.stderr);
  }
  process.exit(listResult.status ?? 1);
}

if (!listResult.stdout.includes('secrets.patterns')) {
  console.error(
    '[git-secrets] no prohibited patterns configured. Run "npm run secrets:setup" first.',
  );
  process.exit(1);
}

if (mode === 'history') {
  const historyResult = spawnSync('git-secrets', ['--scan-history'], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });

  if (typeof historyResult.status === 'number') {
    process.exit(historyResult.status);
  }

  process.exit(1);
}

const fileListArgs =
  mode === 'staged'
    ? ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']
    : ['ls-files', '-z', '--cached', '--others', '--exclude-standard'];

const fileListResult = spawnSync('git', fileListArgs, {
  cwd: process.cwd(),
  encoding: 'utf-8',
});

if (fileListResult.status !== 0) {
  if (fileListResult.stdout) {
    process.stdout.write(fileListResult.stdout);
  }
  if (fileListResult.stderr) {
    process.stderr.write(fileListResult.stderr);
  }
  process.exit(fileListResult.status ?? 1);
}

const files = fileListResult.stdout
  .split('\0')
  .map((value) => value.trim())
  .filter(Boolean);

if (files.length === 0) {
  console.log(
    mode === 'staged'
      ? '[git-secrets] staged scan skipped: no staged files found'
      : '[git-secrets] current-tree scan skipped: no tracked or untracked files found',
  );
  process.exit(0);
}

const chunkSize = 200;

for (let index = 0; index < files.length; index += chunkSize) {
  const fileChunk = files.slice(index, index + chunkSize);
  const chunkResult = spawnSync(
    'git-secrets',
    ['--scan', '--no-index', ...fileChunk],
    {
      cwd: process.cwd(),
      stdio: 'inherit',
    },
  );

  if (typeof chunkResult.status === 'number' && chunkResult.status !== 0) {
    process.exit(chunkResult.status);
  }
}

console.log(
  mode === 'staged'
    ? `[git-secrets] passed: scanned ${files.length} staged file(s)`
    : `[git-secrets] passed: scanned ${files.length} tracked/untracked non-ignored file(s)`,
);
