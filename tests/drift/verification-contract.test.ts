import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoPath = (...parts: string[]) => path.resolve(process.cwd(), ...parts);

const readText = (...parts: string[]) => readFileSync(repoPath(...parts), 'utf8');

describe('verification contract', () => {
  it('keeps extension worker and content entrypoints on distinct source basenames', () => {
    const manifest = JSON.parse(readText('manifest.json')) as {
      background?: { service_worker?: string };
      content_scripts?: Array<{ js?: string[] }>;
    };
    const serviceWorkerEntry = manifest.background?.service_worker ?? '';
    const contentEntries = manifest.content_scripts?.flatMap((entry) => entry.js ?? []) ?? [];
    const serviceWorkerBasename = path.basename(serviceWorkerEntry);
    const contentBasenames = contentEntries.map((entry) => path.basename(entry));

    expect(serviceWorkerEntry).toBe('src/background/service-worker.ts');
    expect(contentEntries).toContain('src/content/content-script.ts');
    expect(contentBasenames).not.toContain(serviceWorkerBasename);
  });

  it('keeps host verification pack aligned across package scripts, workflow, and maintainer docs', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      scripts: Record<string, string>;
    };
    const hostVerifyWorkflow = readText('.github', 'workflows', 'host-verify.yml');
    const contributing = readText('CONTRIBUTING.md');
    const hostDoctor = readText('scripts', 'quality', 'verify-host-doctor.mjs');

    expect(packageJson.scripts['verify:host:pack']).toContain('npm run verify:host-actions-policy');
    expect(packageJson.scripts['verify:host:pack']).toContain('npm run verify:host-security');
    expect(packageJson.scripts['verify:host:pack']).toContain('npm run verify:host-frontdoor');
    expect(packageJson.scripts['verify:host:pack']).toContain('npm run verify:host-sensitive-surface');
    expect(packageJson.scripts['verify:release-closure']).toBe(
      'npm run verify:host:pack && npm run verify:host-release-proof'
    );
    expect(hostVerifyWorkflow).toContain('run: npm run verify:host:pack');
    expect(hostVerifyWorkflow).toContain('run: npm run verify:host-release-proof');
    expect(contributing).toContain('npm run verify:host:pack');
    expect(contributing).toContain('npm run verify:release-closure');
    expect(contributing).toContain('npm run verify:host-sensitive-surface');
    expect(hostDoctor).toContain('Run verify:host:pack for the default host surface');
  });

  it('keeps the sensitive-surface gate wired into repo-side and hook-level verification', () => {
    const packageJson = JSON.parse(readText('package.json')) as {
      scripts: Record<string, string>;
    };
    const preCommitConfig = readText('.pre-commit-config.yaml');
    const contributing = readText('CONTRIBUTING.md');

    expect(packageJson.scripts['verify:sensitive-surface']).toBe(
      'node scripts/quality/verify-sensitive-surface.mjs'
    );
    expect(packageJson.scripts['verify:host-sensitive-surface']).toBe(
      'node scripts/quality/verify-host-sensitive-surface.mjs'
    );
    expect(packageJson.scripts['test:security']).toContain('npm run verify:sensitive-surface');
    expect(preCommitConfig).toContain('id: sensitive-surface-guard');
    expect(preCommitConfig).toContain('entry: node scripts/quality/verify-sensitive-surface.mjs');
    expect(contributing).toContain('npm run verify:sensitive-surface');
  });

  it('keeps coverage boundary wording aligned with the current vitest baseline and dedicated non-src gates', async () => {
    const { default: vitestConfig } = await import('../../vitest.config');
    const contributing = readText('CONTRIBUTING.md');

    expect(vitestConfig.test?.coverage?.include).toEqual(['src/**/*.{ts,tsx}']);
    expect(vitestConfig.test?.coverage?.exclude).toEqual([
      'src/**/*.test.*',
      'src/test/**',
      'src/i18n/**',
      'src/assets/**',
    ]);
    expect(contributing).toContain(
      'The default coverage threshold currently applies to the product TypeScript'
    );
    expect(contributing).toContain('surface under `src/`.');
    expect(contributing).toContain('- `npm run test:mcp:unit`');
    expect(contributing).toContain('- `npm run test:mcp:smoke`');
    expect(contributing).toContain('- `npm run check:verify-scripts`');
  });

  it('keeps detached browser launch as an explicit host-safety-reviewed exception only', () => {
    const hostSafety = readText('scripts', 'quality', 'verify-host-safety.mjs');
    const liveOpenBrowser = readText('scripts', 'verify', 'open-live-browser.mjs');
    const detachedSpawnMarker = ['detached', 'true'].join(': ');

    expect(hostSafety).toContain("{ label: 'detached spawn'");
    expect(hostSafety).toContain(`{ label: 'child.${'unref()'}'`);
    expect(liveOpenBrowser).toContain('PROMPT_SWITCHBOARD_LIVE_ALLOW_DETACHED_BROWSER=1');
    expect(liveOpenBrowser).toContain('Detached repo-owned browser launch now requires');
    expect(liveOpenBrowser).toContain(detachedSpawnMarker);
    expect(liveOpenBrowser).toContain(`child.${'unref()'};`);
  });
});
