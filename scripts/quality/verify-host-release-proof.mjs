import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repo = 'xiaojiou176-open/multi-ai-sidepanel';
const packageJson = JSON.parse(readFileSync(path.join(process.cwd(), 'package.json'), 'utf8'));
const version = packageJson.version;
const releaseTag = `v${version}`;

function runGh(args) {
  try {
    return execFileSync('gh', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.error('[verify-host-release-proof] missing tool: install GitHub CLI (`gh`) first.');
      process.exit(1);
    }

    const stderr =
      error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim()
        : '';
    const stdout =
      error && typeof error === 'object' && 'stdout' in error && typeof error.stdout === 'string'
        ? error.stdout.trim()
        : '';
    const detail = stderr || stdout || (error instanceof Error ? error.message : String(error));
    console.error(`[verify-host-release-proof] gh ${args.join(' ')} failed: ${detail}`);
    process.exit(1);
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error(
      `[verify-host-release-proof] failed to parse ${label}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

const release = parseJson(
  runGh([
    'release',
    'view',
    releaseTag,
    '--repo',
    repo,
    '--json',
    'tagName,isDraft,isPrerelease,publishedAt,assets,url',
  ]),
  'release view',
);

const expectedAssets = new Set([
  `prompt-switchboard-v${version}-chrome-extension.zip`,
  `prompt-switchboard-v${version}-chrome-extension.zip.sha256.txt`,
  `prompt-switchboard-v${version}-chrome-extension.sbom.spdx.json`,
]);

const actualAssets = new Set((release.assets ?? []).map((asset) => asset.name));
const findings = [];

if (release.isDraft) {
  findings.push(`${releaseTag} is still a draft release`);
}

if (release.isPrerelease) {
  findings.push(`${releaseTag} is still marked as a prerelease`);
}

if (!release.publishedAt) {
  findings.push(`${releaseTag} does not have a publishedAt timestamp`);
}

for (const assetName of expectedAssets) {
  if (!actualAssets.has(assetName)) {
    findings.push(`missing expected public release asset: ${assetName}`);
  }
}

if (findings.length > 0) {
  console.error('[verify-host-release-proof] failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('[verify-host-release-proof] passed: latest public release exposes the expected proof assets');
console.log(
  `[verify-host-release-proof] summary: ${releaseTag} is published and exposes zip, checksum, and SPDX SBOM assets for ${repo}`,
);
