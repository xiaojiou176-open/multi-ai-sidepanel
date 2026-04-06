import { spawnSync } from 'node:child_process';
import process from 'node:process';

const optional = process.argv.includes('--optional');

const prohibitedPatterns = [
  'gh[pousr]_[A-Za-z0-9_]{36,255}',
  'github_pat_[A-Za-z0-9_]{82,255}',
  'AIza[0-9A-Za-z_-]{35}',
  'AKIA[0-9A-Z]{16}',
  'sk-(live|proj|test)-[A-Za-z0-9_-]{10,255}',
  'eyJ[A-Za-z0-9_-]{5,}\\.[A-Za-z0-9._-]{5,}\\.[A-Za-z0-9._-]{5,}',
];

const deprecatedPatterns = [
  'gh[pousr]_[A-Za-z0-9_]+',
  'sk-[A-Za-z0-9]{20,}',
  '-----BEGIN (RSA|DSA|EC|OPENSSH|PGP)? ?PRIVATE KEY-----',
];

function runGitSecrets(args, { allowFailure = false } = {}) {
  const result = spawnSync('git-secrets', args, {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  if (result.error && result.error.code === 'ENOENT') {
    if (optional) {
      console.warn(
        '[git-secrets] skipped optional setup: git-secrets is not installed.',
      );
      return null;
    }

    console.error(
      '[git-secrets] missing tool: install git-secrets before running setup.',
    );
    process.exit(1);
  }

  if (!allowFailure && result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  return result;
}

function runGitConfig(args, { allowFailure = false } = {}) {
  const result = spawnSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf-8',
  });

  if (!allowFailure && result.status !== 0) {
    if (result.stdout) {
      process.stdout.write(result.stdout);
    }
    if (result.stderr) {
      process.stderr.write(result.stderr);
    }
    process.exit(result.status ?? 1);
  }

  return result;
}

runGitSecrets(['--register-aws']);

const listedPatterns =
  runGitSecrets(['--list'], { allowFailure: true })?.stdout ?? '';

for (const pattern of deprecatedPatterns) {
  if (!listedPatterns.includes(pattern)) {
    continue;
  }

  runGitConfig(
    ['config', '--fixed-value', '--unset-all', 'secrets.patterns', pattern],
    { allowFailure: true },
  );
}

for (const pattern of prohibitedPatterns) {
  if (listedPatterns.includes(pattern)) {
    continue;
  }

  runGitSecrets(['--add', '--', pattern]);
}

console.log('[git-secrets] setup complete: repo-local patterns configured');
