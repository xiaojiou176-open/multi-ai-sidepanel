import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const sources = [
  { path: 'README.md', type: 'markdown' },
  { path: 'docs/index.html', type: 'html' },
  { path: 'docs/install.html', type: 'html' },
  { path: 'docs/supported-sites.html', type: 'html' },
  { path: 'docs/trust-boundary.html', type: 'html' },
  { path: 'docs/faq.html', type: 'html' },
  { path: 'docs/mcp-host-packets.html', type: 'html' },
  { path: 'docs/codex-mcp-setup.html', type: 'html' },
  { path: 'docs/claude-code-mcp-setup.html', type: 'html' },
  { path: 'docs/opencode-mcp-setup.html', type: 'html' },
  { path: 'docs/openclaw-mcp-setup.html', type: 'html' },
  { path: 'docs/public-distribution-matrix.html', type: 'html' },
  { path: 'docs/404.html', type: 'html' },
];

const findings = [];

const resolveTarget = (sourcePath, target) => {
  if (target.startsWith('/')) {
    return path.join(repoRoot, target.slice(1));
  }

  return path.resolve(path.dirname(sourcePath), target);
};

const isIgnoredTarget = (target) => {
  return (
    target.startsWith('http://') ||
    target.startsWith('https://') ||
    target.startsWith('mailto:') ||
    target.startsWith('#') ||
    target.startsWith('data:') ||
    target === ''
  );
};

const checkMarkdownLinks = (absolutePath, content) => {
  const regex = /\[[^\]]*?\]\(([^)]+)\)/g;
  for (const match of content.matchAll(regex)) {
    const rawTarget = match[1]?.trim() ?? '';
    const target = rawTarget.replace(/^<|>$/g, '');
    if (isIgnoredTarget(target)) continue;
    const cleanTarget = target.split('#')[0];
    if (!cleanTarget) continue;
    const resolved = resolveTarget(absolutePath, cleanTarget);
    if (!existsSync(resolved)) {
      findings.push(
        `${path.relative(repoRoot, absolutePath)} -> missing markdown target: ${target}`
      );
    }
  }
};

const checkHtmlLinks = (absolutePath, content) => {
  const regex = /\b(?:href|src)="([^"]+)"/g;
  for (const match of content.matchAll(regex)) {
    const target = match[1]?.trim() ?? '';
    if (isIgnoredTarget(target)) continue;
    const cleanTarget = target.split('#')[0];
    if (!cleanTarget) continue;
    const resolved = resolveTarget(absolutePath, cleanTarget);
    if (!existsSync(resolved)) {
      findings.push(`${path.relative(repoRoot, absolutePath)} -> missing html target: ${target}`);
    }
  }
};

for (const source of sources) {
  const absolutePath = path.join(repoRoot, source.path);
  const content = readFileSync(absolutePath, 'utf8');

  if (source.type === 'markdown') {
    checkMarkdownLinks(absolutePath, content);
  } else {
    checkHtmlLinks(absolutePath, content);
  }
}

if (findings.length > 0) {
  console.error('[frontdoor-links] failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log(
  '[frontdoor-links] passed: local front-door links and asset references resolve correctly'
);
