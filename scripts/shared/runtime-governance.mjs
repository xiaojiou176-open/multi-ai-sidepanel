import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const DEFAULT_EXTERNAL_CACHE_TTL_HOURS = 72;
export const DEFAULT_EXTERNAL_CACHE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const DEFAULT_EXTERNAL_CACHE_ROOT = path.join(
  os.homedir(),
  '.cache',
  'multi-ai-sidepanel'
);
export const PERSISTENT_BROWSER_ROOT_DIRNAME = 'browser';
export const PERSISTENT_BROWSER_USER_DATA_DIRNAME = 'chrome-user-data';
export const PERSISTENT_BROWSER_PROFILE_DIRECTORY = 'Profile 1';
export const PERSISTENT_BROWSER_PROFILE_NAME = 'multi-ai-sidepanel';
export const LIVE_PROFILE_CLONE_DIRNAME = 'live-profile-clones';
export const REPO_OWNED_LIVE_CLONE_PREFIX = 'prompt-switchboard-live-';
export const CHROME_SINGLETON_FILENAMES = [
  'SingletonLock',
  'SingletonCookie',
  'SingletonSocket',
];

const DEFAULT_MAC_GOOGLE_CHROME_USER_DATA_DIR = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'Google',
  'Chrome'
);

const DEFAULT_MAC_GOOGLE_CHROME_EXECUTABLE =
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEFAULT_PLAYWRIGHT_BROWSERS_ROOT = path.join(
  os.homedir(),
  'Library',
  'Caches',
  'ms-playwright'
);

const expandHome = (value) => {
  if (!value) {
    return value;
  }

  if (value === '~') {
    return os.homedir();
  }

  if (value.startsWith('~/')) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
};

const ABSOLUTE_PATH_ENV_KEY = /(?:^|_)(?:PATH|DIR|ROOT)$/iu;
const PATH_LIKE_REPORT_KEY = /(?:path|dir|root|entrypoint)$/iu;
const REDACTED_PREVIEW_KEYS = new Set(['promptPreview', 'bodyPreview']);

export const sanitizePathForReport = (value) => {
  const text = String(value || '').trim();
  if (!text) {
    return text;
  }

  const withoutTrailingSeparators = text.replace(/[\\/]+$/u, '');
  const segments = withoutTrailingSeparators.split(/[\\/]+/u).filter(Boolean);
  const basename = segments.at(-1) || 'path';
  return `<redacted-path:${basename}>`;
};

export const sanitizeReportPayload = (value, key = '') => {
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeReportPayload(entry, key));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeReportPayload(entryValue, entryKey),
      ])
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  if (!value) {
    return value;
  }

  if (REDACTED_PREVIEW_KEYS.has(key)) {
    return `[redacted ${key}]`;
  }

  if (
    key === 'path' ||
    PATH_LIKE_REPORT_KEY.test(key) ||
    ABSOLUTE_PATH_ENV_KEY.test(key)
  ) {
    return sanitizePathForReport(value);
  }

  return value;
};

const parsePositiveInt = (raw, fallback) => {
  const parsed = Number.parseInt(String(raw ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const sleepSync = (ms) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const safeLstat = (targetPath) => {
  try {
    return fs.lstatSync(targetPath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
};

const sizeWithDu = (absPath, cwd = process.cwd()) => {
  const result = spawnSync('du', ['-sk', absPath], {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }

  const firstField = result.stdout.trim().split(/\s+/)[0];
  const kilobytes = Number.parseInt(firstField, 10);
  return Number.isNaN(kilobytes) ? null : kilobytes * 1024;
};

const directorySize = (absPath, cwd = process.cwd()) => {
  const stat = safeLstat(absPath);
  if (!stat) {
    return 0;
  }

  if (process.platform !== 'win32') {
    const duBytes = sizeWithDu(absPath, cwd);
    if (duBytes != null) {
      return duBytes;
    }
  }

  if (!stat.isDirectory()) {
    return stat.size;
  }

  let totalBytes = 0;
  const stack = [absPath];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) continue;
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const entryPath = path.join(current, entry.name);
      const entryStat = safeLstat(entryPath);
      if (!entryStat) continue;
      if (entryStat.isDirectory()) {
        stack.push(entryPath);
      } else {
        totalBytes += entryStat.size;
      }
    }
  }

  return totalBytes;
};

const readJsonFile = (targetPath) => {
  try {
    return JSON.parse(fs.readFileSync(targetPath, 'utf8'));
  } catch {
    return null;
  }
};

const writeJsonFile = (targetPath, payload) => {
  fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
};

const normalizeProfileName = (value) => String(value || '').trim().toLowerCase();

export const getRepoRuntimeRoot = (repoRoot = process.cwd()) =>
  path.resolve(repoRoot, '.runtime-cache');

export const getRepoRuntimePath = (repoRoot = process.cwd(), ...segments) =>
  path.join(getRepoRuntimeRoot(repoRoot), ...segments);

export const getExternalRepoCacheRoot = (env = process.env) =>
  path.resolve(expandHome(env.PROMPT_SWITCHBOARD_EXTERNAL_CACHE_ROOT || DEFAULT_EXTERNAL_CACHE_ROOT));

export const getDisposableExternalCacheRoot = (env = process.env) =>
  getExternalRepoCacheRoot(env);

export const getPersistentBrowserRoot = (env = process.env) =>
  path.join(getExternalRepoCacheRoot(env), PERSISTENT_BROWSER_ROOT_DIRNAME);

export const getPersistentBrowserUserDataDir = (env = process.env) =>
  path.join(getPersistentBrowserRoot(env), PERSISTENT_BROWSER_USER_DATA_DIRNAME);

export const getExternalLiveProfileCloneRoot = (env = process.env) =>
  path.join(getDisposableExternalCacheRoot(env), LIVE_PROFILE_CLONE_DIRNAME);

export const getExternalCachePolicy = (env = process.env) => ({
  root: getDisposableExternalCacheRoot(env),
  ttlHours: parsePositiveInt(
    env.PROMPT_SWITCHBOARD_EXTERNAL_CACHE_TTL_HOURS,
    DEFAULT_EXTERNAL_CACHE_TTL_HOURS
  ),
  maxBytes: parsePositiveInt(
    env.PROMPT_SWITCHBOARD_EXTERNAL_CACHE_MAX_BYTES,
    DEFAULT_EXTERNAL_CACHE_MAX_BYTES
  ),
});

export const ensureDirectory = (targetPath) => {
  fs.mkdirSync(targetPath, { recursive: true });
  return targetPath;
};

export const formatBytes = (bytes) => {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = -1;

  do {
    value /= 1024;
    unitIndex += 1;
  } while (value >= 1024 && unitIndex < units.length - 1);

  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${units[unitIndex]}`;
};

export const isPersistentBrowserPath = (targetPath, env = process.env) => {
  const persistentRoot = path.resolve(getPersistentBrowserRoot(env));
  const absPath = path.resolve(targetPath);
  if (absPath === persistentRoot) {
    return true;
  }
  const relative = path.relative(persistentRoot, absPath);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
};

export const inspectPersistentBrowserState = (env = process.env) => {
  const root = getPersistentBrowserRoot(env);
  const userDataDir = getPersistentBrowserUserDataDir(env);
  const localStatePath = path.join(userDataDir, 'Local State');
  const profilePath = path.join(userDataDir, PERSISTENT_BROWSER_PROFILE_DIRECTORY);

  return {
    root,
    userDataDir,
    localStatePath,
    profileDirectory: PERSISTENT_BROWSER_PROFILE_DIRECTORY,
    profileName: PERSISTENT_BROWSER_PROFILE_NAME,
    exists: fs.existsSync(userDataDir),
    currentBytes: directorySize(userDataDir),
    bootstrapReady: fs.existsSync(localStatePath) && fs.existsSync(profilePath),
  };
};

const collectManagedExternalEntries = (env = process.env) => {
  const root = getDisposableExternalCacheRoot(env);
  const cloneRoot = getExternalLiveProfileCloneRoot(env);
  const entries = [];

  if (!fs.existsSync(root)) {
    return { root, cloneRoot, entries };
  }

  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!(entry.isDirectory() || entry.isFile())) {
      continue;
    }

    if (entry.name === PERSISTENT_BROWSER_ROOT_DIRNAME) {
      continue;
    }

    if (entry.isDirectory() && entry.name === LIVE_PROFILE_CLONE_DIRNAME) {
      if (!fs.existsSync(cloneRoot)) {
        continue;
      }

      for (const cloneEntry of fs.readdirSync(cloneRoot, { withFileTypes: true })) {
        if (!cloneEntry.isDirectory() || !cloneEntry.name.startsWith(REPO_OWNED_LIVE_CLONE_PREFIX)) {
          continue;
        }

        const absPath = path.join(cloneRoot, cloneEntry.name);
        const stat = safeLstat(absPath);
        if (!stat) continue;
        entries.push({
          absPath,
          relPath: path.relative(root, absPath),
          bytes: directorySize(absPath),
          mtimeMs: stat.mtimeMs,
          cleanupClass: 'disposable_generated',
          kind: 'live_profile_clone',
        });
      }

      continue;
    }

    const absPath = path.join(root, entry.name);
    const stat = safeLstat(absPath);
    if (!stat) continue;
    entries.push({
      absPath,
      relPath: path.relative(root, absPath),
      bytes: directorySize(absPath),
      mtimeMs: stat.mtimeMs,
      cleanupClass: 'repo_owned_external_cache',
      kind: stat.isDirectory() ? 'external_cache_directory' : 'external_cache_file',
    });
  }

  entries.sort((left, right) => right.mtimeMs - left.mtimeMs);
  return { root, cloneRoot, entries };
};

const removeWithRetry = (targetPath) => {
  const retryCodes = new Set(['ENOTEMPTY', 'EBUSY', 'EPERM']);
  const attempts = 4;
  const delayMs = 80;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      fs.rmSync(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
      if (!fs.existsSync(targetPath)) {
        return;
      }
      const shouldRetry =
        typeof code === 'string' && retryCodes.has(code) && attempt < attempts - 1;
      if (!shouldRetry) {
        throw error;
      }
      sleepSync(delayMs * (attempt + 1));
    }
  }
};

export const inspectExternalRepoCache = (env = process.env) => {
  const policy = getExternalCachePolicy(env);
  const { root, cloneRoot, entries } = collectManagedExternalEntries(env);

  return {
    root,
    cloneRoot,
    ttlHours: policy.ttlHours,
    maxBytes: policy.maxBytes,
    currentBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    managedBytes: entries.reduce((sum, entry) => sum + entry.bytes, 0),
    entryCount: entries.length,
  };
};

export const pruneExternalRepoCache = ({
  env = process.env,
  dryRun = false,
  log = () => {},
  now = Date.now(),
} = {}) => {
  const policy = getExternalCachePolicy(env);
  const { root, cloneRoot, entries } = collectManagedExternalEntries(env);
  const ttlMs = policy.ttlHours * 60 * 60 * 1000;
  const removed = [];
  const retained = [];
  const currentBytesBefore = entries.reduce((sum, entry) => sum + entry.bytes, 0);

  if (!fs.existsSync(root)) {
    return {
      root,
      cloneRoot,
      ttlHours: policy.ttlHours,
      maxBytes: policy.maxBytes,
      currentBytes: 0,
      projectedBytes: 0,
      removed,
      retained,
    };
  }

  let workingEntries = [...entries];

  for (const entry of workingEntries) {
    const ageMs = now - entry.mtimeMs;
    if (ageMs <= ttlMs) {
      retained.push({ ...entry, reason: 'within-ttl' });
      continue;
    }
    if (dryRun) {
      removed.push({ ...entry, reason: 'older-than-ttl', dryRun: true });
      log(
        `would remove class=${entry.cleanupClass} path=${entry.relPath} reason='older-than-${policy.ttlHours}h'`
      );
    } else {
      removeWithRetry(entry.absPath);
      removed.push({ ...entry, reason: 'older-than-ttl', dryRun: false });
      log(
        `removed class=${entry.cleanupClass} path=${entry.relPath} reason='older-than-${policy.ttlHours}h'`
      );
    }
  }

  workingEntries = retained.map(({ reason, ...entry }) => entry);
  let projectedBytes = workingEntries.reduce((sum, entry) => sum + entry.bytes, 0);

  for (const entry of [...workingEntries].sort((left, right) => left.mtimeMs - right.mtimeMs)) {
    if (projectedBytes <= policy.maxBytes) {
      break;
    }
    if (dryRun) {
      removed.push({ ...entry, reason: 'over-cap', dryRun: true });
      log(`would remove class=${entry.cleanupClass} path=${entry.relPath} reason='over-cap'`);
    } else {
      removeWithRetry(entry.absPath);
      removed.push({ ...entry, reason: 'over-cap', dryRun: false });
      log(`removed class=${entry.cleanupClass} path=${entry.relPath} reason='over-cap'`);
    }
    projectedBytes -= entry.bytes;
  }

  let currentBytes = currentBytesBefore;
  if (!dryRun) {
    ensureDirectory(cloneRoot);
    currentBytes = inspectExternalRepoCache(env).currentBytes;
  }

  return {
    root,
    cloneRoot,
    ttlHours: policy.ttlHours,
    maxBytes: policy.maxBytes,
    currentBytes,
    projectedBytes,
    removed,
    retained,
  };
};

const resolveProfileFromLocalState = ({
  userDataDir,
  localStatePath,
  profileName,
  explicitProfileDirectory,
  missingProfileMessage,
  missingRootMessage,
  missingLocalStateMessage,
}) => {
  const blockers = [];
  let profileDirectory = explicitProfileDirectory;
  let resolutionSource = explicitProfileDirectory ? 'profile_directory' : null;

  if (!fs.existsSync(userDataDir)) {
    blockers.push(missingRootMessage(userDataDir));
    return {
      profileDirectory: null,
      resolutionSource,
      blockers,
    };
  }

  if (!profileDirectory) {
    if (!fs.existsSync(localStatePath)) {
      blockers.push(missingLocalStateMessage(localStatePath));
      return {
        profileDirectory: null,
        resolutionSource,
        blockers,
      };
    }

    const localState = readJsonFile(localStatePath);
    const infoCache = localState?.profile?.info_cache || {};
    const match = Object.entries(infoCache).find(([, value]) => {
      if (!value || typeof value !== 'object') return false;
      return normalizeProfileName(value.name) === normalizeProfileName(profileName);
    });

    if (!match) {
      blockers.push(missingProfileMessage(profileName));
      return {
        profileDirectory: null,
        resolutionSource,
        blockers,
      };
    }

    profileDirectory = match[0];
    resolutionSource = 'profile_name';
  }

  const profilePath = path.join(userDataDir, profileDirectory);
  if (!fs.existsSync(profilePath)) {
    blockers.push(`Requested profile directory is missing: ${sanitizePathForReport(profilePath)}`);
  }

  return {
    profileDirectory,
    profilePath,
    resolutionSource,
    blockers,
  };
};

export const resolveBrowserProfile = (env = process.env) => {
  const userDataDir = path.resolve(
    expandHome(env.PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR || getPersistentBrowserUserDataDir(env))
  );
  const profileName =
    env.PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME?.trim() || PERSISTENT_BROWSER_PROFILE_NAME;
  const explicitProfileDirectory = env.PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY?.trim() || '';
  const localStatePath = path.join(userDataDir, 'Local State');
  const result = resolveProfileFromLocalState({
    userDataDir,
    localStatePath,
    profileName,
    explicitProfileDirectory,
    missingRootMessage: () =>
      'Persistent browser root is missing. Run npm run test:live:bootstrap-profile first.',
    missingLocalStateMessage: (localStatePath) =>
      `Persistent browser Local State is missing at: ${localStatePath}. Run npm run test:live:bootstrap-profile first.`,
    missingProfileMessage: (value) =>
      `PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME could not be resolved from the persistent browser Local State: ${value}. Run npm run test:live:bootstrap-profile first or set PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY explicitly.`,
  });

  return {
    userDataDir,
    profileName,
    profileDirectory: result.profileDirectory || null,
    profilePath: result.profilePath || null,
    localStatePath,
    resolutionSource: result.resolutionSource
      ? `browser_${result.resolutionSource}`
      : null,
    blockers: result.blockers,
    isPersistentBrowserRoot: isPersistentBrowserPath(userDataDir, env),
  };
};

export const resolveSourceBrowserProfile = (env = process.env) => {
  const userDataDir = path.resolve(
    expandHome(
      env.PROMPT_SWITCHBOARD_BROWSER_SOURCE_USER_DATA_DIR ||
        DEFAULT_MAC_GOOGLE_CHROME_USER_DATA_DIR
    )
  );
  const profileName =
    env.PROMPT_SWITCHBOARD_BROWSER_SOURCE_PROFILE_NAME?.trim() ||
    PERSISTENT_BROWSER_PROFILE_NAME;
  const explicitProfileDirectory =
    env.PROMPT_SWITCHBOARD_BROWSER_SOURCE_PROFILE_DIRECTORY?.trim() || '';
  const localStatePath = path.join(userDataDir, 'Local State');
  const result = resolveProfileFromLocalState({
    userDataDir,
    localStatePath,
    profileName,
    explicitProfileDirectory,
    missingRootMessage: () => 'PROMPT_SWITCHBOARD_BROWSER_SOURCE_USER_DATA_DIR path does not exist.',
    missingLocalStateMessage: () => 'Chrome Local State is missing.',
    missingProfileMessage: (value) =>
      `PROMPT_SWITCHBOARD_BROWSER_SOURCE_PROFILE_NAME could not be resolved from Chrome Local State: ${value}`,
  });

  return {
    userDataDir,
    profileName,
    profileDirectory: result.profileDirectory || null,
    profilePath: result.profilePath || null,
    localStatePath,
    resolutionSource: result.resolutionSource
      ? `browser_source_${result.resolutionSource}`
      : null,
    blockers: result.blockers,
  };
};

export const buildBootstrappedLocalState = ({
  sourceLocalState,
  sourceProfileDirectory,
  targetProfileDirectory = PERSISTENT_BROWSER_PROFILE_DIRECTORY,
  targetProfileName = PERSISTENT_BROWSER_PROFILE_NAME,
}) => {
  const nextLocalState = sourceLocalState
    ? JSON.parse(JSON.stringify(sourceLocalState))
    : {};
  const currentProfile = nextLocalState.profile && typeof nextLocalState.profile === 'object'
    ? nextLocalState.profile
    : {};
  const sourceInfoCache =
    currentProfile.info_cache && typeof currentProfile.info_cache === 'object'
      ? currentProfile.info_cache
      : {};
  const sourceProfileEntry =
    sourceInfoCache[sourceProfileDirectory] &&
    typeof sourceInfoCache[sourceProfileDirectory] === 'object'
      ? sourceInfoCache[sourceProfileDirectory]
      : {};

  nextLocalState.profile = {
    ...currentProfile,
    last_used: targetProfileDirectory,
    last_active_profiles: [targetProfileDirectory],
    info_cache: {
      [targetProfileDirectory]: {
        ...sourceProfileEntry,
        name: targetProfileName,
      },
    },
  };

  return nextLocalState;
};

export const removeBrowserSingletonArtifacts = (userDataDir) => {
  const removed = [];
  for (const filename of CHROME_SINGLETON_FILENAMES) {
    const targetPath = path.join(userDataDir, filename);
    if (!fs.existsSync(targetPath)) {
      continue;
    }
    fs.rmSync(targetPath, { recursive: true, force: true });
    removed.push(filename);
  }
  return removed;
};

export const resolveBrowserExecutablePath = (env = process.env) => {
  const requestedBrowserChannel =
    env.PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL?.trim().toLowerCase() || '';
  const explicitPath = env.PROMPT_SWITCHBOARD_BROWSER_EXECUTABLE_PATH
    ? path.resolve(expandHome(env.PROMPT_SWITCHBOARD_BROWSER_EXECUTABLE_PATH))
    : null;

  if (explicitPath) {
    return {
      executablePath: explicitPath,
      resolutionSource: 'browser_executable_env',
      blockers: fs.existsSync(explicitPath)
        ? []
        : [`PROMPT_SWITCHBOARD_BROWSER_EXECUTABLE_PATH does not exist: ${explicitPath}`],
    };
  }

  const playwrightBrowsersRoot = path.resolve(
    expandHome(env.PLAYWRIGHT_BROWSERS_PATH || DEFAULT_PLAYWRIGHT_BROWSERS_ROOT)
  );
  const resolvePlaywrightChromiumExecutable = () => {
    if (!fs.existsSync(playwrightBrowsersRoot)) {
      return null;
    }

    const chromiumDirs = fs
      .readdirSync(playwrightBrowsersRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && /^chromium-\d+$/.test(entry.name))
      .map((entry) => ({
        name: entry.name,
        revision: Number.parseInt(entry.name.replace('chromium-', ''), 10),
      }))
      .filter((entry) => Number.isFinite(entry.revision))
      .sort((a, b) => b.revision - a.revision);

    for (const chromiumDir of chromiumDirs) {
      const root = path.join(playwrightBrowsersRoot, chromiumDir.name);
      const candidates =
        process.platform === 'darwin'
          ? [
              path.join(
                root,
                'chrome-mac-arm64',
                'Google Chrome for Testing.app',
                'Contents',
                'MacOS',
                'Google Chrome for Testing'
              ),
              path.join(
                root,
                'chrome-mac',
                'Chromium.app',
                'Contents',
                'MacOS',
                'Chromium'
              ),
            ]
          : process.platform === 'win32'
            ? [
                path.join(root, 'chrome-win', 'chrome.exe'),
                path.join(root, 'chrome-win64', 'chrome.exe'),
              ]
            : [
                path.join(root, 'chrome-linux', 'chrome'),
                path.join(root, 'chrome-linux64', 'chrome'),
              ];

      const match = candidates.find((candidate) => fs.existsSync(candidate));
      if (match) {
        return match;
      }
    }

    return null;
  };

  if (requestedBrowserChannel === 'chromium') {
    const playwrightChromiumExecutable = resolvePlaywrightChromiumExecutable();
    if (playwrightChromiumExecutable) {
      return {
        executablePath: playwrightChromiumExecutable,
        resolutionSource: 'playwright_chromium',
        blockers: [],
      };
    }
  }

  if (process.platform === 'darwin') {
    return {
      executablePath: DEFAULT_MAC_GOOGLE_CHROME_EXECUTABLE,
      resolutionSource: 'default_google_chrome',
      blockers: fs.existsSync(DEFAULT_MAC_GOOGLE_CHROME_EXECUTABLE)
        ? []
        : [`Google Chrome executable was not found at ${DEFAULT_MAC_GOOGLE_CHROME_EXECUTABLE}`],
    };
  }

  const candidates =
    process.platform === 'win32'
      ? [
          path.join(process.env.PROGRAMFILES || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
          path.join(
            process.env['PROGRAMFILES(X86)'] || '',
            'Google',
            'Chrome',
            'Application',
            'chrome.exe'
          ),
        ]
      : ['/usr/bin/google-chrome', '/usr/bin/google-chrome-stable'];

  const existing = candidates.find((candidate) => candidate && fs.existsSync(candidate));
  if (existing) {
    return {
      executablePath: existing,
      resolutionSource: 'default_google_chrome',
      blockers: [],
    };
  }

  return {
    executablePath: candidates[0] || 'google-chrome',
    resolutionSource: 'default_google_chrome',
    blockers: ['Google Chrome executable could not be resolved from the default platform locations.'],
  };
};

export const bootstrapPersistentBrowserProfile = ({
  env = process.env,
  log = () => {},
} = {}) => {
  const sourceProfile = resolveSourceBrowserProfile(env);
  const persistentBrowser = inspectPersistentBrowserState(env);
  const blockers = [...sourceProfile.blockers];

  if (blockers.length > 0) {
    return {
      ok: false,
      alreadyBootstrapped: false,
      sourceProfile,
      target: persistentBrowser,
      blockers,
      removedSingletonArtifacts: [],
    };
  }

  if (persistentBrowser.bootstrapReady) {
    return {
      ok: true,
      alreadyBootstrapped: true,
      sourceProfile,
      target: persistentBrowser,
      blockers: [],
      removedSingletonArtifacts: removeBrowserSingletonArtifacts(persistentBrowser.userDataDir),
    };
  }

  if (fs.existsSync(persistentBrowser.userDataDir) && fs.readdirSync(persistentBrowser.userDataDir).length > 0) {
    return {
      ok: false,
      alreadyBootstrapped: false,
      sourceProfile,
      target: persistentBrowser,
      blockers: [
        `Persistent browser root already exists but is not bootstrapped cleanly: ${persistentBrowser.userDataDir}. Clean it manually before retrying bootstrap.`,
      ],
      removedSingletonArtifacts: [],
    };
  }

  const browserRoot = ensureDirectory(persistentBrowser.root);
  const stagingRoot = fs.mkdtempSync(path.join(browserRoot, 'bootstrap-staging-'));
  const stagingUserDataDir = path.join(stagingRoot, PERSISTENT_BROWSER_USER_DATA_DIRNAME);
  ensureDirectory(stagingUserDataDir);

  try {
    const sourceLocalState = readJsonFile(sourceProfile.localStatePath);
    fs.cpSync(sourceProfile.localStatePath, path.join(stagingUserDataDir, 'Local State'));
    fs.cpSync(
      sourceProfile.profilePath,
      path.join(stagingUserDataDir, PERSISTENT_BROWSER_PROFILE_DIRECTORY),
      {
        recursive: true,
        force: true,
      }
    );

    const bootstrappedLocalState = buildBootstrappedLocalState({
      sourceLocalState,
      sourceProfileDirectory: sourceProfile.profileDirectory,
      targetProfileDirectory: PERSISTENT_BROWSER_PROFILE_DIRECTORY,
      targetProfileName: PERSISTENT_BROWSER_PROFILE_NAME,
    });
    writeJsonFile(path.join(stagingUserDataDir, 'Local State'), bootstrappedLocalState);
    const removedSingletonArtifacts = removeBrowserSingletonArtifacts(stagingUserDataDir);

    fs.renameSync(stagingUserDataDir, persistentBrowser.userDataDir);
    fs.rmSync(stagingRoot, { recursive: true, force: true });

    log(
      `bootstrapped persistent browser root from ${sourceProfile.userDataDir}/${sourceProfile.profileDirectory} to ${persistentBrowser.userDataDir}/${PERSISTENT_BROWSER_PROFILE_DIRECTORY}`
    );

    return {
      ok: true,
      alreadyBootstrapped: false,
      sourceProfile,
      target: inspectPersistentBrowserState(env),
      blockers: [],
      removedSingletonArtifacts,
    };
  } catch (error) {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
    return {
      ok: false,
      alreadyBootstrapped: false,
      sourceProfile,
      target: persistentBrowser,
      blockers: [
        `Failed to bootstrap the persistent browser root: ${
          error instanceof Error ? error.message : String(error)
        }`,
      ],
      removedSingletonArtifacts: [],
    };
  }
};
