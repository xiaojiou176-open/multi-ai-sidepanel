import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const allowMarker = 'host-safety: allow';
const selfPath = path.join('scripts', 'quality', 'verify-host-safety.mjs');
const ignoredDirs = new Set([
  '.git',
  '.agent',
  '.agents',
  '.codex',
  '.claude',
  '.serena',
  '.cache',
  'cache',
  'log',
  'logs',
  '.runtime-cache',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'public',
]);
const allowedExtensions = new Set([
  '.cjs',
  '.command',
  '.js',
  '.json',
  '.mjs',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.yaml',
  '.yml',
]);

const rules = [
  { label: 'killall', pattern: /\bkillall\b/ },
  { label: 'pkill', pattern: /\bpkill\b/ },
  { label: 'kill -9', pattern: /(^|[^\w-])kill\s+-9\b/ },
  { label: 'raw process.kill', pattern: /process\.kill\s*\(/ },
  { label: 'detached spawn', pattern: /\bdetached\s*:\s*true\b/ },
  { label: 'child.unref()', pattern: /\.unref\s*\(/ },
  { label: 'osascript', pattern: /\bosascript\b/ },
  { label: 'System Events', pattern: /System Events/ },
  { label: 'loginwindow', pattern: /\bloginwindow\b/ },
  { label: 'showForceQuitPanel', pattern: /\bshowForceQuitPanel\b/ },
  { label: 'AppleEvent', pattern: /\bAppleEvent\b/ },
];

const walk = (dir) => {
  const results = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) {
      continue;
    }

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
  if (relativePath === selfPath) {
    continue;
  }

  const content = readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.includes(allowMarker)) {
      continue;
    }

    for (const rule of rules) {
      if (!rule.pattern.test(line)) {
        continue;
      }

      findings.push({
        file: relativePath,
        line: index + 1,
        label: rule.label,
        snippet: line.trim(),
      });
    }
  }
}

if (findings.length > 0) {
  console.error('[host-safety] found disallowed host-control primitives:');
  findings.forEach((finding) => {
    console.error(
      `- ${finding.file}:${finding.line} | ${finding.label} -> ${finding.snippet}`,
    );
  });
  process.exit(1);
}

console.log(
  '[host-safety] passed: no disallowed host-control primitives found in repo code or automation entrypoints',
);
