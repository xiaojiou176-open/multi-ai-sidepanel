import { existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const allowedTopLevelEntries = new Set([
  '.agents',
  '.env.example',
  '.eslintrc.json',
  '.git',
  '.gitignore',
  '.github',
  '.husky',
  '.pre-commit-config.yaml',
  '.prettierrc',
  '.runtime-cache',
  '.vscode',
  'AGENTS.md',
  'CLAUDE.md',
  'CHANGELOG.md',
  'CODE_OF_CONDUCT.md',
  'CODEOWNERS',
  'CONTRIBUTING.md',
  'docs',
  'LICENSE',
  'PRIVACY.md',
  'README.md',
  'SECURITY.md',
  'coverage',
  'dist',
  'eslint.config.js',
  'index.html',
  'manifest.json',
  'mcp',
  'mcp-dist',
  'node_modules',
  'package-lock.json',
  'package.json',
  'playwright.config.ts',
  'postcss.config.js',
  'public',
  'settings.html',
  'scripts',
  'src',
  'tests',
  'tsconfig.app.json',
  'tsconfig.json',
  'tsconfig.mcp.json',
  'tsconfig.node.json',
  'tsconfig.verify.json',
  'vite.config.ts',
  'vitest.config.ts',
]);

const ignoredLocalCacheEntries = new Set([
  '.serena',
]);

const disallowedEntries = new Set([
  '.DS_Store',
  'DOM Testing',
  'test-results',
  'coverage-tmp',
  'coverage-split',
]);

const findings = [];
const autoCleanupEntries = [
  { entry: '.DS_Store', reason: 'top-level macOS noise' },
  { entry: 'test-results', reason: 'repo-owned root test output' },
  { entry: 'coverage-tmp', reason: 'repo-owned root coverage scratch' },
  { entry: 'coverage-split', reason: 'repo-owned root coverage scratch' },
];

for (const { entry, reason } of autoCleanupEntries) {
  const fullPath = path.join(repoRoot, entry);
  if (!existsSync(fullPath)) {
    continue;
  }
  rmSync(fullPath, { recursive: true, force: true });
  console.log(`[root-allowlist] removed ${reason}: ${entry}`);
}

for (const entry of readdirSync(repoRoot)) {
  const fullPath = path.join(repoRoot, entry);
  const isDir = statSync(fullPath).isDirectory();

  if (ignoredLocalCacheEntries.has(entry)) {
    console.log(`[root-allowlist] skipped local tool cache: ${entry}`);
    continue;
  }

  if (disallowedEntries.has(entry)) {
    findings.push(`disallowed top-level entry: ${entry}`);
    continue;
  }

  if (!allowedTopLevelEntries.has(entry)) {
    findings.push(`unexpected top-level ${isDir ? 'directory' : 'file'}: ${entry}`);
  }
}

if (findings.length > 0) {
  console.error('[root-allowlist] failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('[root-allowlist] passed: root inventory matches allowlist');
