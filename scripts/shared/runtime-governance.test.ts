import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  DEFAULT_EXTERNAL_CACHE_MAX_BYTES,
  DEFAULT_EXTERNAL_CACHE_TTL_HOURS,
  LIVE_PROFILE_CLONE_DIRNAME,
  PERSISTENT_BROWSER_PROFILE_DIRECTORY,
  PERSISTENT_BROWSER_PROFILE_NAME,
  PERSISTENT_BROWSER_ROOT_DIRNAME,
  PERSISTENT_BROWSER_USER_DATA_DIRNAME,
  REPO_OWNED_LIVE_CLONE_PREFIX,
  bootstrapPersistentBrowserProfile,
  buildBootstrappedLocalState,
  getExternalLiveProfileCloneRoot,
  getPersistentBrowserRoot,
  getPersistentBrowserUserDataDir,
  inspectExternalRepoCache,
  inspectPersistentBrowserState,
  isPersistentBrowserPath,
  pruneExternalRepoCache,
  resolveBrowserExecutablePath,
  resolveBrowserProfile,
  resolveSourceBrowserProfile,
  removeBrowserSingletonArtifacts,
  sanitizePathForReport,
  sanitizeReportPayload,
} from './runtime-governance.mjs';

const tempRoots = new Set<string>();

const makeTempRoot = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-switchboard-governance-test-'));
  tempRoots.add(tempRoot);
  return tempRoot;
};

const setMtime = (targetPath: string, timestampMs: number) => {
  const when = new Date(timestampMs);
  fs.utimesSync(targetPath, when, when);
};

const writeFileOfSize = (targetPath: string, bytes: number) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, Buffer.alloc(bytes, 0x61));
};

const createSourceChromeFixture = ({
  profileDirectory = 'Profile 23',
  profileName = 'multi-ai-sidepanel',
}: {
  profileDirectory?: string;
  profileName?: string;
} = {}) => {
  const userDataDir = makeTempRoot();
  fs.mkdirSync(path.join(userDataDir, profileDirectory), { recursive: true });
  fs.writeFileSync(
    path.join(userDataDir, 'Local State'),
    JSON.stringify({
      profile: {
        last_used: profileDirectory,
        last_active_profiles: [profileDirectory],
        info_cache: {
          [profileDirectory]: {
            name: profileName,
            avatar_icon: 'chrome://theme/IDR_PROFILE_AVATAR_1',
          },
        },
      },
    }),
    'utf8'
  );
  fs.writeFileSync(
    path.join(userDataDir, profileDirectory, 'Preferences'),
    JSON.stringify({ account_info: ['kept'] }),
    'utf8'
  );

  return { userDataDir, profileDirectory, profileName };
};

const createLiveClone = ({
  root,
  name,
  bytes = 8 * 1024,
  mtimeMs = Date.now(),
}: {
  root: string;
  name: string;
  bytes?: number;
  mtimeMs?: number;
}) => {
  const clonePath = path.join(root, LIVE_PROFILE_CLONE_DIRNAME, name);
  writeFileOfSize(path.join(clonePath, 'Profile 23', 'Preferences'), bytes);
  setMtime(path.join(clonePath, 'Profile 23', 'Preferences'), mtimeMs);
  setMtime(path.join(clonePath, 'Profile 23'), mtimeMs);
  setMtime(clonePath, mtimeMs);
  return clonePath;
};

afterEach(() => {
  for (const tempRoot of tempRoots) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  tempRoots.clear();
});

describe('runtime-governance', () => {
  it('resolves the persistent browser root and user data dir inside the repo-owned external cache tree', () => {
    const externalRoot = makeTempRoot();
    const env = {
      PROMPT_SWITCHBOARD_EXTERNAL_CACHE_ROOT: externalRoot,
    };

    expect(getPersistentBrowserRoot(env)).toBe(
      path.join(externalRoot, PERSISTENT_BROWSER_ROOT_DIRNAME)
    );
    expect(getPersistentBrowserUserDataDir(env)).toBe(
      path.join(
        externalRoot,
        PERSISTENT_BROWSER_ROOT_DIRNAME,
        PERSISTENT_BROWSER_USER_DATA_DIRNAME
      )
    );
  });

  it('resolves the source Chrome profile directory from Local State by profile name', () => {
    const fixture = createSourceChromeFixture();

    const resolved = resolveSourceBrowserProfile({
      PROMPT_SWITCHBOARD_BROWSER_SOURCE_USER_DATA_DIR: fixture.userDataDir,
      PROMPT_SWITCHBOARD_BROWSER_SOURCE_PROFILE_NAME: fixture.profileName,
    });

    expect(resolved.blockers).toEqual([]);
    expect(resolved.profileDirectory).toBe(fixture.profileDirectory);
    expect(resolved.profilePath).toBe(path.join(fixture.userDataDir, fixture.profileDirectory));
  });

  it('fails closed on the persistent browser root when bootstrap has not run yet', () => {
    const externalRoot = makeTempRoot();
    const env = {
      PROMPT_SWITCHBOARD_EXTERNAL_CACHE_ROOT: externalRoot,
    };

    const resolved = resolveBrowserProfile(env);

    expect(resolved.profileDirectory).toBeNull();
    expect(resolved.blockers[0]).toContain('Run npm run test:live:bootstrap-profile first');
  });

  it('redacts path-like values and preview fields in report payloads', () => {
    const tempRoot = path.join(makeTempRoot(), 'Profile 23');
    const payload = sanitizeReportPayload({
      localStatePath: path.join(tempRoot, 'Local State'),
      testEntrypoint: path.join(tempRoot, 'live.smoke.spec.ts'),
      promptPreview: 'keep this prompt private',
      nested: {
        PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR: tempRoot,
        root: tempRoot,
        bodyPreview: 'keep this body private',
      },
    });

    expect(sanitizePathForReport(tempRoot)).toBe('<redacted-path:Profile 23>');
    expect(payload.localStatePath).toBe('<redacted-path:Local State>');
    expect(payload.testEntrypoint).toBe('<redacted-path:live.smoke.spec.ts>');
    expect(payload.promptPreview).toBe('[redacted promptPreview]');
    expect(payload.nested.PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR).toBe(
      '<redacted-path:Profile 23>'
    );
    expect(payload.nested.root).toBe('<redacted-path:Profile 23>');
    expect(payload.nested.bodyPreview).toBe('[redacted bodyPreview]');
  });

  it('prefers Playwright Chromium when the live browser channel is chromium', () => {
    const browsersRoot = makeTempRoot();
    const executablePath = path.join(
      browsersRoot,
      'chromium-1217',
      'chrome-mac-arm64',
      'Google Chrome for Testing.app',
      'Contents',
      'MacOS',
      'Google Chrome for Testing'
    );
    fs.mkdirSync(path.dirname(executablePath), { recursive: true });
    fs.writeFileSync(executablePath, '');

    const resolved = resolveBrowserExecutablePath({
      PLAYWRIGHT_BROWSERS_PATH: browsersRoot,
      PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL: 'chromium',
    });

    expect(resolved.resolutionSource).toBe('playwright_chromium');
    expect(resolved.executablePath).toBe(executablePath);
    expect(resolved.blockers).toEqual([]);
  });

  it('rewrites Local State to a single canonical Profile 1 entry', () => {
    const localState = {
      profile: {
        last_used: 'Profile 23',
        last_active_profiles: ['Profile 23'],
        info_cache: {
          'Profile 23': {
            name: 'multi-ai-sidepanel',
            avatar_icon: 'chrome://theme/IDR_PROFILE_AVATAR_1',
          },
        },
      },
    };

    const rewritten = buildBootstrappedLocalState({
      sourceLocalState: localState,
      sourceProfileDirectory: 'Profile 23',
    });

    expect(rewritten.profile.last_used).toBe(PERSISTENT_BROWSER_PROFILE_DIRECTORY);
    expect(rewritten.profile.last_active_profiles).toEqual([
      PERSISTENT_BROWSER_PROFILE_DIRECTORY,
    ]);
    expect(Object.keys(rewritten.profile.info_cache)).toEqual([
      PERSISTENT_BROWSER_PROFILE_DIRECTORY,
    ]);
    expect(
      rewritten.profile.info_cache[PERSISTENT_BROWSER_PROFILE_DIRECTORY].name
    ).toBe(PERSISTENT_BROWSER_PROFILE_NAME);
  });

  it('bootstraps the persistent browser root from the source profile and strips singleton artifacts', () => {
    const sourceFixture = createSourceChromeFixture();
    const externalRoot = makeTempRoot();
    const env = {
      PROMPT_SWITCHBOARD_EXTERNAL_CACHE_ROOT: externalRoot,
      PROMPT_SWITCHBOARD_BROWSER_SOURCE_USER_DATA_DIR: sourceFixture.userDataDir,
      PROMPT_SWITCHBOARD_BROWSER_SOURCE_PROFILE_NAME: sourceFixture.profileName,
    };
    const persistentUserDataDir = getPersistentBrowserUserDataDir(env);

    const result = bootstrapPersistentBrowserProfile({ env });

    expect(result.ok).toBe(true);
    expect(result.alreadyBootstrapped).toBe(false);
    expect(result.target.bootstrapReady).toBe(true);
    expect(
      fs.existsSync(
        path.join(
          persistentUserDataDir,
          PERSISTENT_BROWSER_PROFILE_DIRECTORY,
          'Preferences'
        )
      )
    ).toBe(true);
    const rewritten = JSON.parse(
      fs.readFileSync(path.join(persistentUserDataDir, 'Local State'), 'utf8')
    );
    expect(rewritten.profile.last_used).toBe(PERSISTENT_BROWSER_PROFILE_DIRECTORY);
    expect(
      rewritten.profile.info_cache[PERSISTENT_BROWSER_PROFILE_DIRECTORY].name
    ).toBe(PERSISTENT_BROWSER_PROFILE_NAME);
    expect(result.removedSingletonArtifacts).toEqual([]);
  });

  it('keeps the persistent browser root out of disposable external cache accounting and pruning', () => {
    const externalRoot = makeTempRoot();
    const env = {
      PROMPT_SWITCHBOARD_EXTERNAL_CACHE_ROOT: externalRoot,
      PROMPT_SWITCHBOARD_EXTERNAL_CACHE_TTL_HOURS: String(DEFAULT_EXTERNAL_CACHE_TTL_HOURS),
      PROMPT_SWITCHBOARD_EXTERNAL_CACHE_MAX_BYTES: String(DEFAULT_EXTERNAL_CACHE_MAX_BYTES),
    };
    const persistentUserDataDir = getPersistentBrowserUserDataDir(env);
    writeFileOfSize(
      path.join(persistentUserDataDir, PERSISTENT_BROWSER_PROFILE_DIRECTORY, 'Preferences'),
      32 * 1024
    );
    const staleClone = createLiveClone({
      root: externalRoot,
      name: `${REPO_OWNED_LIVE_CLONE_PREFIX}stale`,
      mtimeMs:
        new Date('2026-04-04T12:00:00Z').getTime() -
        (DEFAULT_EXTERNAL_CACHE_TTL_HOURS + 24) * 60 * 60 * 1000,
    });

    const externalStateBefore = inspectExternalRepoCache(env);
    const persistentStateBefore = inspectPersistentBrowserState(env);
    const result = pruneExternalRepoCache({
      env,
      now: new Date('2026-04-04T12:00:00Z').getTime(),
    });

    expect(externalStateBefore.currentBytes).toBeGreaterThan(0);
    expect(persistentStateBefore.currentBytes).toBeGreaterThan(0);
    expect(fs.existsSync(staleClone)).toBe(false);
    expect(
      fs.existsSync(
        path.join(
          persistentUserDataDir,
          PERSISTENT_BROWSER_PROFILE_DIRECTORY,
          'Preferences'
        )
      )
    ).toBe(true);
    expect(result.currentBytes).toBe(0);
    expect(inspectPersistentBrowserState(env).currentBytes).toBe(
      persistentStateBefore.currentBytes
    );
  });

  it('recognizes persistent browser paths correctly', () => {
    const externalRoot = makeTempRoot();
    const env = {
      PROMPT_SWITCHBOARD_EXTERNAL_CACHE_ROOT: externalRoot,
    };

    expect(isPersistentBrowserPath(getPersistentBrowserRoot(env), env)).toBe(true);
    expect(isPersistentBrowserPath(getPersistentBrowserUserDataDir(env), env)).toBe(true);
    expect(isPersistentBrowserPath(getExternalLiveProfileCloneRoot(env), env)).toBe(false);
  });

  it('removes singleton artifacts from an existing browser root', () => {
    const userDataDir = makeTempRoot();
    fs.writeFileSync(path.join(userDataDir, 'SingletonLock'), 'lock', 'utf8');
    fs.writeFileSync(path.join(userDataDir, 'SingletonSocket'), 'socket', 'utf8');

    const removed = removeBrowserSingletonArtifacts(userDataDir);

    expect(removed.sort()).toEqual(['SingletonLock', 'SingletonSocket']);
    expect(fs.existsSync(path.join(userDataDir, 'SingletonLock'))).toBe(false);
    expect(fs.existsSync(path.join(userDataDir, 'SingletonSocket'))).toBe(false);
  });
});
