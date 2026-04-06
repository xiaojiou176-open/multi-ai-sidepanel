import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const ignoredDirs = new Set([
  '.git',
  '.agents',
  '.codex',
  'node_modules',
  '.runtime-cache',
  'coverage',
]);
const allowedExtensions = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.mjs',
  '.json',
  '.md',
  '.html',
  '.yml',
  '.yaml',
  '.svg',
]);

const rules = [
  { label: 'legacy ghostchat brand', pattern: /ghostchat/gi },
  { label: 'legacy sidecar brand', pattern: /Sidecar Chat/g },
  { label: 'legacy repo slug', pattern: /browser-sidepanel-chat/g },
  { label: 'placeholder icon reference', pattern: /vite\.svg/g },
];

const walk = (dir) => {
  const results = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walk(fullPath));
      continue;
    }

    if (allowedExtensions.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
};

const findings = [];

for (const file of walk(repoRoot)) {
  const relativePath = path.relative(repoRoot, file);
  if (relativePath === path.join('scripts', 'quality', 'check-branding.mjs')) {
    continue;
  }
  if (!statSync(file).isFile()) continue;

  const content = readFileSync(file, 'utf8');
  for (const rule of rules) {
    const matches = [...content.matchAll(rule.pattern)];
    for (const match of matches) {
      findings.push({
        file: relativePath,
        label: rule.label,
        snippet: match[0],
      });
    }
  }
}

if (findings.length > 0) {
  console.error('[brand-guard] found disallowed branding residue:');
  findings.forEach((finding) => {
    console.error(`- ${finding.file}: ${finding.label} -> ${finding.snippet}`);
  });
  process.exit(1);
}

console.log('[brand-guard] passed: no legacy branding or placeholder icon references found');
