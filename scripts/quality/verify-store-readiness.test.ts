import { describe, expect, it } from 'vitest';
import {
  collectStoreReadinessFindings,
  getTopPublishedChangelogRelease,
} from './verify-store-readiness.mjs';

const metadataText = JSON.stringify({
  product_name: 'Prompt Switchboard',
  manifest_description: 'Compare AI answers in a browser side panel.',
  current_install_surface: 'Install from GitHub Releases.',
  store_ready_note: 'Store submission materials are ready in this repository.',
});

const manifestText = JSON.stringify({
  name: 'Prompt Switchboard',
  description: 'Compare AI answers in a browser side panel.',
  icons: {
    '16': 'public/prompt-switchboard-icon-16.png',
    '48': 'public/prompt-switchboard-icon-48.png',
    '128': 'public/prompt-switchboard-icon-128.png',
  },
});

const packageJsonText = JSON.stringify({
  version: '0.2.2',
});

const releaseWorkflowText = [
  'Build release bundle',
  'Generate release SBOM',
  'Attest release provenance',
  'Attest release SBOM',
  'Publish GitHub release assets',
].join('\n');

const sharedDocText =
  'Install from GitHub Releases. Store submission materials are ready in this repository.';

const requiredFiles = new Set([
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
]);

const collectFindings = (changelogText: string) =>
  collectStoreReadinessFindings({
    metadataText,
    manifestText,
    releaseWorkflowText,
    packageJsonText,
    changelogText,
    readmeText: sharedDocText,
    installGuideText: sharedDocText,
    faqText: sharedDocText,
    hasFile: (relPath) => requiredFiles.has(relPath),
  }).findings;

describe('verify-store-readiness', () => {
  it('reads the top published release below Unreleased', () => {
    expect(
      getTopPublishedChangelogRelease(`# Changelog

## [Unreleased]

## [0.2.2] - 2026-04-05

## [0.2.1] - 2026-03-26
`)
    ).toBe('0.2.2');
  });

  it('fails when package.json version drifts from the top published changelog release', () => {
    expect(
      collectFindings(`# Changelog

## [Unreleased]

## [0.2.1] - 2026-03-26
`)
    ).toContain(
      'package.json version 0.2.2 must match the top published CHANGELOG release 0.2.1'
    );
  });

  it('fails when the changelog has no published release section yet', () => {
    expect(
      collectFindings(`# Changelog

## [Unreleased]
`)
    ).toContain(
      'CHANGELOG.md must include at least one published release section below [Unreleased]'
    );
  });
});
