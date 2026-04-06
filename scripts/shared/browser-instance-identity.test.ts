import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  BROWSER_IDENTITY_RUNTIME_DIRNAME,
  buildBrowserIdentityPageHtml,
  writeBrowserIdentityPage,
} from './browser-instance-identity.mjs';

const tempRoots = new Set<string>();

const makeTempRoot = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-switchboard-browser-identity-'));
  tempRoots.add(tempRoot);
  return tempRoot;
};

afterEach(() => {
  for (const tempRoot of tempRoots) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  tempRoots.clear();
});

describe('browser-instance-identity', () => {
  it('renders the core repo identity fields into the html payload', () => {
    const html = buildBrowserIdentityPageHtml({
      repoLabel: 'multi-ai-sidepanel',
      repoRoot: '/tmp/multi-ai-sidepanel',
      cdpUrl: 'http://127.0.0.1:9336',
      cdpPort: 9336,
      userDataDir: '/tmp/browser-root',
      profileName: 'multi-ai-sidepanel',
      profileDirectory: 'Profile 1',
      accent: '#0f766e',
      monogram: 'MS',
      startUrl: 'https://chatgpt.com/',
      extensionUrl: 'chrome-extension://abc/index.html',
    });

    expect(html).toContain('multi-ai-sidepanel');
    expect(html).toContain('http://127.0.0.1:9336');
    expect(html).toContain('/tmp/browser-root');
    expect(html).toContain('Profile 1');
    expect(html).toContain('Keep it as the left-most anchor');
    expect(html).toContain('Primary site');
    expect(html).toContain('Extension page');
  });

  it('writes the identity page under .runtime-cache/browser-identity', () => {
    const repoRoot = makeTempRoot();
    const result = writeBrowserIdentityPage({
      repoRoot,
      env: {},
      cdpPort: 9336,
      cdpUrl: 'http://127.0.0.1:9336',
      browserProfile: {
        userDataDir: '/tmp/browser-root',
        profileName: 'multi-ai-sidepanel',
        profileDirectory: 'Profile 1',
      },
      startUrl: 'https://chatgpt.com/',
      extensionUrl: null,
    });

    expect(result.identityPath).toBe(
      path.join(repoRoot, '.runtime-cache', BROWSER_IDENTITY_RUNTIME_DIRNAME, 'index.html')
    );
    expect(fs.existsSync(result.identityPath)).toBe(true);
    expect(fileURLToPath(result.identityUrl)).toBe(result.identityPath);

    const html = fs.readFileSync(result.identityPath, 'utf8');
    expect(html).toContain(path.basename(repoRoot));
    expect(html).toContain('/tmp/browser-root');
    expect(html).toContain('http://127.0.0.1:9336');
  });
});
