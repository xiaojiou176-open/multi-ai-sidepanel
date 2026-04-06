import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const repoRoot = process.cwd();
const normalize = (value) => value.replace(/\s+/g, ' ').trim();

const requiredFiles = [
  'LICENSE',
  'PRIVACY.md',
  'SECURITY.md',
  'README.md',
  'CONTRIBUTING.md',
  'manifest.json',
  'public/prompt-switchboard-icon.svg',
  'public/prompt-switchboard-icon-16.png',
  'public/prompt-switchboard-icon-48.png',
  'public/prompt-switchboard-icon-128.png',
  'docs/install.html',
  'docs/faq.html',
  'docs/mcp-coding-agents.html',
  'docs/assets/prompt-switchboard-hero.png',
  'docs/assets/prompt-switchboard-demo.gif',
  'docs/assets/prompt-switchboard-compare-detail.png',
  'docs/assets/prompt-switchboard-settings.png',
  'docs/assets/prompt-switchboard-social-preview.png',
  'docs/assets/prompt-switchboard-nav-icon.svg',
  'docs/assets/prompt-switchboard-before-after.svg',
  'docs/assets/prompt-switchboard-workflow.svg',
];

const requiredWorkflowMarkers = [
  'Build release bundle',
  'Generate release SBOM',
  'Attest release provenance',
  'Attest release SBOM',
  'Publish GitHub release assets',
];

export const getTopPublishedChangelogRelease = (changelogText) => {
  const releaseMatches = changelogText.matchAll(/^## \[([^\]]+)\](?:\s+-\s+.+)?$/gm);

  for (const match of releaseMatches) {
    const version = match[1]?.trim();
    if (version && version !== 'Unreleased') {
      return version;
    }
  }

  return null;
};

export const collectStoreReadinessFindings = ({
  metadataText,
  manifestText,
  releaseWorkflowText,
  packageJsonText,
  changelogText,
  readmeText,
  installGuideText,
  faqText,
  hasFile = (relPath) => existsSync(path.join(repoRoot, relPath)),
}) => {
  const metadata = JSON.parse(metadataText);
  const manifest = JSON.parse(manifestText);
  const packageJson = JSON.parse(packageJsonText);
  const topPublishedChangelogRelease = getTopPublishedChangelogRelease(changelogText);
  const findings = [];

  if (!topPublishedChangelogRelease) {
    findings.push(
      'CHANGELOG.md must include at least one published release section below [Unreleased]'
    );
  } else if (packageJson.version !== topPublishedChangelogRelease) {
    findings.push(
      `package.json version ${packageJson.version} must match the top published CHANGELOG release ${topPublishedChangelogRelease}`
    );
  }

  for (const relPath of requiredFiles) {
    if (!hasFile(relPath)) {
      findings.push(`missing repo-side store material: ${relPath}`);
    }
  }

  if (manifest.name !== metadata.product_name) {
    findings.push(
      `manifest.name must match frontdoor product_name (${metadata.product_name}), received ${manifest.name}`
    );
  }

  if (manifest.description !== metadata.manifest_description) {
    findings.push('manifest description drifted away from frontdoor metadata');
  }

  if (
    !manifest.icons ||
    manifest.icons['16'] !== 'public/prompt-switchboard-icon-16.png' ||
    manifest.icons['48'] !== 'public/prompt-switchboard-icon-48.png' ||
    manifest.icons['128'] !== 'public/prompt-switchboard-icon-128.png'
  ) {
    findings.push('manifest icon contract must point to Prompt Switchboard PNG extension icons');
  }

  for (const [label, doc] of [
    ['README', normalize(readmeText)],
    ['install guide', normalize(installGuideText)],
    ['FAQ', normalize(faqText)],
  ]) {
    if (!doc.includes(normalize(metadata.current_install_surface))) {
      findings.push(`${label} is missing current_install_surface wording`);
    }
    if (!doc.includes(normalize(metadata.store_ready_note))) {
      findings.push(`${label} is missing store_ready_note wording`);
    }
  }

  for (const marker of requiredWorkflowMarkers) {
    if (!releaseWorkflowText.includes(marker)) {
      findings.push(`release workflow is missing step: ${marker}`);
    }
  }

  return {
    findings,
    metadata,
    packageJson,
    topPublishedChangelogRelease,
  };
};

export const runStoreReadinessVerification = ({
  cwd = repoRoot,
  hasFile = (relPath) => existsSync(path.join(cwd, relPath)),
} = {}) => {
  const result = collectStoreReadinessFindings({
    metadataText: readFileSync(path.join(cwd, 'docs/frontdoor-metadata.json'), 'utf8'),
    manifestText: readFileSync(path.join(cwd, 'manifest.json'), 'utf8'),
    releaseWorkflowText: readFileSync(path.join(cwd, '.github/workflows/release-package.yml'), 'utf8'),
    packageJsonText: readFileSync(path.join(cwd, 'package.json'), 'utf8'),
    changelogText: readFileSync(path.join(cwd, 'CHANGELOG.md'), 'utf8'),
    readmeText: readFileSync(path.join(cwd, 'README.md'), 'utf8'),
    installGuideText: readFileSync(path.join(cwd, 'docs/install.html'), 'utf8'),
    faqText: readFileSync(path.join(cwd, 'docs/faq.html'), 'utf8'),
    hasFile,
  });

  if (result.findings.length > 0) {
    console.error('[verify-store-readiness] failed:');
    for (const finding of result.findings) {
      console.error(`- ${finding}`);
    }
    return 1;
  }

  console.log(
    '[verify-store-readiness] passed: repo-side install and store submission materials are ready'
  );
  console.log(
    `[verify-store-readiness] summary: ${result.metadata.product_name} still ships GitHub Release zip as the supported install surface while keeping browser-store submission materials ready inside the repository and the top published changelog release aligned with package.json version ${result.packageJson.version}`
  );

  return 0;
};

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
  : false;

if (isMain) {
  process.exit(runStoreReadinessVerification());
}
