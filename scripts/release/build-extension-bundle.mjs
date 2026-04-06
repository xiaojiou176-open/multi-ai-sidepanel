import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = process.cwd();
const packageJson = JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const version = packageJson.version;
const distDir = path.join(repoRoot, 'dist');
const releaseDir = path.join(repoRoot, '.runtime-cache', 'release');
const bundleName = `prompt-switchboard-v${version}-chrome-extension.zip`;
const bundlePath = path.join(releaseDir, bundleName);
const checksumPath = path.join(releaseDir, `${bundleName}.sha256.txt`);
const manifestPath = path.join(distDir, 'manifest.json');

if (!existsSync(distDir) || !existsSync(manifestPath)) {
  console.error('[release-bundle] missing dist output. Run `npm run build` first.');
  process.exit(1);
}

const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.version !== version) {
  console.error(
    `[release-bundle] version drift: package.json=${version}, dist/manifest.json=${manifest.version}`
  );
  process.exit(1);
}

mkdirSync(releaseDir, { recursive: true });

const zipResult = spawnSync('zip', ['-rq', bundlePath, '.'], {
  cwd: distDir,
  stdio: 'inherit',
});

if (zipResult.status !== 0) {
  console.error('[release-bundle] failed to create zip bundle. Ensure `zip` is installed.');
  process.exit(zipResult.status ?? 1);
}

const bundle = readFileSync(bundlePath);
const hash = createHash('sha256').update(bundle).digest('hex');
writeFileSync(checksumPath, `${hash}  ${bundleName}\n`, 'utf8');

const distEntries = readdirSync(distDir).sort();
const manifestStats = statSync(manifestPath);

console.log(`[release-bundle] created ${path.relative(repoRoot, bundlePath)}`);
console.log(`[release-bundle] checksum written to ${path.relative(repoRoot, checksumPath)}`);
console.log(
  `[release-bundle] manifest version ${manifest.version}; manifest bytes ${manifestStats.size}; dist entries ${distEntries.join(', ')}`
);
