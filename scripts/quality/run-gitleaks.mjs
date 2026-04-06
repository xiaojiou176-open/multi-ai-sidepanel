import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const mode = process.argv[2] ?? 'current';

const argsByMode = {
  staged: ['git', '.', '--pre-commit', '--staged', '--no-banner', '--redact=100'],
  history: ['git', '.', '--no-banner', '--redact=100'],
};

if (mode !== 'current' && !argsByMode[mode]) {
  console.error(
    `[gitleaks-runner] unsupported mode "${mode}". Use one of: ${Object.keys(argsByMode).join(', ')}`,
  );
  process.exit(1);
}

const runGitleaks = (args, cwd = process.cwd()) =>
  spawnSync('gitleaks', args, {
    cwd,
    stdio: 'inherit',
  });

const ensureParentDirectory = (targetPath) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
};

const buildRepoSurfaceMirror = () => {
  const gitLsFiles = spawnSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
    },
  );

  if (gitLsFiles.error) {
    throw gitLsFiles.error;
  }

  if (gitLsFiles.status !== 0) {
    throw new Error(
      `[gitleaks-runner] git ls-files failed with exit ${gitLsFiles.status}: ${gitLsFiles.stderr || ''}`.trim(),
    );
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-switchboard-gitleaks-'));
  const files = gitLsFiles.stdout.split('\0').filter(Boolean);

  for (const relPath of files) {
    const sourcePath = path.resolve(process.cwd(), relPath);
    const destinationPath = path.join(tempRoot, relPath);
    const sourceStat = fs.statSync(sourcePath, { throwIfNoEntry: false });

    if (!sourceStat || !sourceStat.isFile()) {
      continue;
    }

    ensureParentDirectory(destinationPath);
    fs.copyFileSync(sourcePath, destinationPath);
  }

  return tempRoot;
};

let result;

if (mode === 'current') {
  let tempRoot = null;
  try {
    tempRoot = buildRepoSurfaceMirror();
    result = runGitleaks(['dir', '.', '--no-banner', '--redact=100'], tempRoot);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  } finally {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  }
} else {
  result = runGitleaks(argsByMode[mode]);
}

if (result.error) {
  if (result.error.code === 'ENOENT') {
    console.error(
      '[gitleaks-runner] gitleaks is required but was not found on PATH. Install it before running secret gates.',
    );
  } else {
    console.error(`[gitleaks-runner] failed: ${result.error.message}`);
  }
  process.exit(1);
}

process.exit(result.status ?? 1);
