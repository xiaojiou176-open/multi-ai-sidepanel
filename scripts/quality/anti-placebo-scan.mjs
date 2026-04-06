import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const allowMarker = 'anti-placebo: allow';
const candidateDirs = ['src', 'tests'];
const testFilePattern = /\.(test|spec)\.(ts|tsx|js|jsx)$/;
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = resolveProjectRoot(scriptDir);

const rules = [
  {
    name: 'expect_true_to_be_true',
    pattern: /expect\s*\(\s*true\s*\)\s*\.toBe\s*\(\s*true\s*\)/,
  },
  {
    name: 'expect_1_plus_1_to_be_2',
    pattern: /expect\s*\(\s*1\s*\+\s*1\s*\)\s*\.toBe\s*\(\s*2\s*\)/,
  },
];

function hasRepoRootMarker(dirPath) {
  try {
    return statSync(path.join(dirPath, 'package.json')).isFile();
  } catch {
    return false;
  }
}

function resolveProjectRoot(startDir) {
  const fallbackRoot = path.resolve(scriptDir, '..', '..');
  let currentDir = startDir;

  while (true) {
    if (hasRepoRootMarker(currentDir)) {
      return currentDir;
    }

    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) {
      return fallbackRoot;
    }
    currentDir = parentDir;
  }
}

function walk(dirPath, collector) {
  for (const entry of readdirSync(dirPath)) {
    const fullPath = path.join(dirPath, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, collector);
      continue;
    }
    if (testFilePattern.test(fullPath)) {
      collector.push(fullPath);
    }
  }
}

function collectTestFiles() {
  const files = [];
  for (const relDir of candidateDirs) {
    const absDir = path.join(projectRoot, relDir);
    try {
      if (statSync(absDir).isDirectory()) {
        walk(absDir, files);
      }
    } catch {
      // missing directory is acceptable
    }
  }
  return files;
}

function scanFile(filePath) {
  const content = readFileSync(filePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  const hits = [];

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes(allowMarker)) {
      continue;
    }
    for (const rule of rules) {
      if (rule.pattern.test(line)) {
        hits.push({
          line: index + 1,
          rule: rule.name,
          snippet: line.trim(),
        });
      }
    }
  }

  return hits;
}

function main() {
  const files = collectTestFiles();
  if (files.length === 0) {
    console.log('[anti-placebo] no test files detected');
    return 0;
  }

  let violations = 0;
  for (const filePath of files) {
    const hits = scanFile(filePath);
    for (const hit of hits) {
      violations += 1;
      const relPath = path.relative(projectRoot, filePath);
      console.error(
        `[anti-placebo] ${relPath}:${hit.line} | ${hit.rule} | ${hit.snippet}`,
      );
    }
  }

  if (violations > 0) {
    console.error(
      `[anti-placebo] failed: detected ${violations} suspicious assertion(s)`,
    );
    return 1;
  }

  console.log('[anti-placebo] passed: no suspicious assertions found');
  return 0;
}

process.exit(main());
