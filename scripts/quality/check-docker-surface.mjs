import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (relPath) => readFileSync(path.join(repoRoot, relPath), 'utf8');

const requiredFiles = [
  'Dockerfile',
  '.dockerignore',
  'docker/README.md',
  'docker/entrypoint.mjs',
  'docker/healthcheck.mjs',
  'docs/mcp-docker-sidecar.html',
];

const findings = [];

for (const relPath of requiredFiles) {
  if (!existsSync(path.join(repoRoot, relPath))) {
    findings.push(`${relPath} must exist.`);
  }
}

const dockerfile = read('Dockerfile');
if (!dockerfile.includes('PROMPT_SWITCHBOARD_BRIDGE_HOST=0.0.0.0')) {
  findings.push('Dockerfile must expose PROMPT_SWITCHBOARD_BRIDGE_HOST=0.0.0.0 for the container bridge.');
}
if (!dockerfile.includes('EXPOSE 48123')) {
  findings.push('Dockerfile must expose bridge port 48123.');
}

const dockerReadme = read('docker/README.md');
for (const needle of [
  'not a hosted compare service',
  'not a public HTTP API',
  'docker run --rm -i -p 48123:48123 prompt-switchboard-mcp server',
  'docker run --rm prompt-switchboard-mcp doctor',
  'Glama or other registry/listing submission remains an owner-run external step.',
]) {
  if (!dockerReadme.includes(needle)) {
    findings.push(`docker/README.md must mention ${needle}.`);
  }
}

const dockerDoc = read('docs/mcp-docker-sidecar.html');
for (const needle of [
  'Containerize the local MCP sidecar, not the whole compare-first product.',
  'not a hosted compare service',
  'docker run --rm -i -p 48123:48123 prompt-switchboard-mcp server',
  'docker run --rm prompt-switchboard-mcp doctor',
  'Prompt Switchboard listing there yet',
]) {
  if (!dockerDoc.includes(needle)) {
    findings.push(`docs/mcp-docker-sidecar.html must mention ${needle}.`);
  }
}

if (findings.length > 0) {
  console.error('[docker-surface] failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('[docker-surface] passed: docker sidecar surface stays truthful and complete');
