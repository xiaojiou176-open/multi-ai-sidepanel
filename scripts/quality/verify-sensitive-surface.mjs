import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

import {
  findForbiddenTrackedPathFindings,
  findOutputSurfaceFindings,
  findTextSurfaceFindings,
  normalizeRepoPath,
  shouldScanTextSurface,
} from './sensitive-surface-rules.mjs';

const runGit = (args) =>
  execFileSync('git', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });

const getRepoSurfaceFiles = () =>
  runGit(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .map((entry) => entry.trim())
    .filter(Boolean);

const findings = [];

const addFinding = (scope, identifier, finding) => {
  findings.push(`${scope}: ${identifier} -> ${finding.reason}`);
};

for (const filePath of getRepoSurfaceFiles()) {
  for (const finding of findForbiddenTrackedPathFindings(filePath)) {
    addFinding('tracked-path', normalizeRepoPath(filePath), finding);
  }

  if (!shouldScanTextSurface(filePath)) {
    continue;
  }

  let text;
  try {
    text = fs.readFileSync(filePath, 'utf8');
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      continue;
    }
    addFinding('read-failure', normalizeRepoPath(filePath), {
      reason: error instanceof Error ? error.message : String(error),
    });
    continue;
  }

  for (const finding of findTextSurfaceFindings(filePath, text)) {
    addFinding('tracked-content', normalizeRepoPath(filePath), finding);
  }
}

const outputChecks = [
  {
    label: 'live-smoke-doctor',
    command: 'node',
    args: ['scripts/verify/live-smoke-doctor.mjs'],
  },
  {
    label: 'repo-disk-audit',
    command: 'node',
    args: ['scripts/quality/report-repo-disk-usage.mjs'],
  },
  {
    label: 'clean-runtime-dry-run',
    command: 'node',
    args: ['scripts/quality/clean-runtime-artifacts.mjs', '--dry-run'],
  },
];

for (const check of outputChecks) {
  try {
    const output = execFileSync(check.command, check.args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 20 * 1024 * 1024,
    });

    for (const finding of findOutputSurfaceFindings(output)) {
      addFinding('output-surface', check.label, finding);
    }
  } catch (error) {
    const detail =
      error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim()
        : error instanceof Error
          ? error.message
          : String(error);
    addFinding('output-surface', check.label, {
      reason: `failed to inspect command output (${detail})`,
    });
  }
}

if (findings.length > 0) {
  console.error('[verify-sensitive-surface] failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(
  '[verify-sensitive-surface] passed: repo surface and maintainer-facing reports are free of tracked sensitive-path and raw-preview leaks',
);
