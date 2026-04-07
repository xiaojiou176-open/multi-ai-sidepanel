import { mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const distDir = path.join(repoRoot, 'dist', 'public-bundles');
const matrixPath = path.join(repoRoot, 'mcp', 'integration-kits', 'public-distribution-matrix.json');
const rootPackage = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));

const packets = [
  {
    id: 'codex_bundle',
    dir: path.join(repoRoot, 'mcp', 'integration-kits', 'public-bundles', 'codex-bundle'),
    packageName: 'prompt-switchboard-codex-bundle',
  },
  {
    id: 'claude_code_bundle',
    dir: path.join(repoRoot, 'mcp', 'integration-kits', 'public-bundles', 'claude-code-bundle'),
    packageName: 'prompt-switchboard-claude-code-bundle',
  },
  {
    id: 'opencode_plugin',
    dir: path.join(repoRoot, 'mcp', 'integration-kits', 'public-bundles', 'opencode-plugin'),
    packageName: 'prompt-switchboard-opencode-plugin',
  },
  {
    id: 'openclaw_bundle',
    dir: path.join(repoRoot, 'mcp', 'integration-kits', 'public-bundles', 'openclaw-bundle'),
    packageName: 'prompt-switchboard-openclaw-bundle',
  },
];

rmSync(distDir, { recursive: true, force: true });
mkdirSync(distDir, { recursive: true });

const manifest = {
  surface: 'prompt_switchboard_public_bundle_artifacts',
  version: rootPackage.version,
  generated_at: new Date().toISOString(),
  source_matrix: path.relative(repoRoot, matrixPath),
  artifacts: [],
};

const rootArtifactPattern =
  /^prompt-switchboard-(codex-bundle|claude-code-bundle|opencode-plugin|openclaw-bundle)-.+\.tgz$/;
for (const entry of readdirSync(repoRoot)) {
  if (!rootArtifactPattern.test(entry)) {
    continue;
  }
  rmSync(path.join(repoRoot, entry), { force: true });
}

for (const packet of packets) {
  const pack = spawnSync('npm', ['pack', packet.dir, '--pack-destination', distDir], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (pack.status !== 0) {
    throw new Error(
      `Failed to pack ${packet.packageName}: ${pack.stderr || pack.stdout || 'unknown error'}`
    );
  }

  const filename = pack.stdout
    .trim()
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .at(-1);

  manifest.artifacts.push({
    id: packet.id,
    package_name: packet.packageName,
    filename,
  });
}

writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');

console.log(`[host-kits] wrote ${manifest.artifacts.length} public bundle artifact(s) to ${distDir}`);
