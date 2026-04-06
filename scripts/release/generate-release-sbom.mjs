import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = packageJson.version;
const releaseDir = path.join(repoRoot, '.runtime-cache', 'release');
const sbomPath = path.join(
  releaseDir,
  `prompt-switchboard-v${version}-chrome-extension.sbom.spdx.json`
);

mkdirSync(releaseDir, { recursive: true });

const result = spawnSync(
  process.platform === 'win32' ? 'npm.cmd' : 'npm',
  [
    'sbom',
    '--package-lock-only',
    '--omit',
    'dev',
    '--sbom-format',
    'spdx',
  ],
  {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: process.env,
  }
);

if (result.status !== 0) {
  console.error('[release-sbom] failed to generate SPDX SBOM');
  process.exit(result.status ?? 1);
}

writeFileSync(sbomPath, result.stdout);
console.log(`[release-sbom] wrote ${path.relative(repoRoot, sbomPath)}`);
