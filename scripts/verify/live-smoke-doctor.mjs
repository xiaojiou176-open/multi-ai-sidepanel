import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { inspectBrowserResourceState } from './browser-resource-hygiene.mjs';
import { buildRuntimeInspectionReport, runLiveDiagnoseEnvelope } from './live-runtime-gates.mjs';
import {
  formatBytes,
  getExternalCachePolicy,
  inspectPersistentBrowserState,
  inspectExternalRepoCache,
  resolveBrowserExecutablePath,
  resolveBrowserProfile,
  sanitizePathForReport,
  sanitizeReportPayload,
} from '../shared/runtime-governance.mjs';

const LIVE_FLAG = process.env.PROMPT_SWITCHBOARD_LIVE === '1';
const ATTACH_MODE = process.env.PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE || 'browser';
const BROWSER_CHANNEL =
  process.env.PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL ||
  (ATTACH_MODE === 'browser' ? 'chrome' : 'chromium');
const CDP_URL = process.env.PROMPT_SWITCHBOARD_LIVE_CDP_URL || 'http://127.0.0.1:9336';
const EXTENSION_PATH_FROM_ENV = process.env.PROMPT_SWITCHBOARD_EXTENSION_PATH || '';
const CLONE_PROFILE = process.env.PROMPT_SWITCHBOARD_CLONE_PROFILE === '1';
const KEEP_LIVE_CLONE = process.env.PROMPT_SWITCHBOARD_KEEP_LIVE_CLONE === '1';
const TARGET_MODELS = (process.env.PROMPT_SWITCHBOARD_LIVE_MODELS || 'ChatGPT')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const PROMPT =
  process.env.PROMPT_SWITCHBOARD_LIVE_PROMPT ||
  'Summarize the value of deterministic testing in one sentence.';
const TIMEOUT_MS = Number(process.env.PROMPT_SWITCHBOARD_LIVE_TIMEOUT_MS || '90000');
const browserProfile = resolveBrowserProfile();
const browserExecutable = resolveBrowserExecutablePath({
  ...process.env,
  PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL: BROWSER_CHANNEL,
});
const externalCachePolicy = getExternalCachePolicy();
const externalCacheState = inspectExternalRepoCache();
const persistentBrowserState = inspectPersistentBrowserState();

const resolveExtensionPath = () => {
  if (EXTENSION_PATH_FROM_ENV) {
    return path.resolve(EXTENSION_PATH_FROM_ENV);
  }

  return path.resolve(process.cwd(), 'dist');
};

const extensionPath = resolveExtensionPath();
const extensionPathExists = fs.existsSync(extensionPath);
const testEntrypoint = path.join(process.cwd(), 'tests', 'e2e', 'live.smoke.spec.ts');
const testEntrypointExists = fs.existsSync(testEntrypoint);
const browserResources = inspectBrowserResourceState();

const probeCdpReady = (targetUrl) =>
  new Promise((resolve) => {
    try {
      const request = http.get(new URL('/json/version', targetUrl), (response) => {
        const ok = response.statusCode === 200;
        response.resume();
        resolve(ok);
      });
      request.on('error', () => resolve(false));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(false);
      });
    } catch {
      resolve(false);
    }
  });

const fetchJson = (targetUrl) =>
  new Promise((resolve) => {
    try {
      const request = http.get(targetUrl, (response) => {
        let body = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          body += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(body || 'null'));
          } catch {
            resolve(null);
          }
        });
      });
      request.on('error', () => resolve(null));
      request.setTimeout(1000, () => {
        request.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });

const inspectAttachBrowserOwnership = () => {
  const result = spawnSync('ps', ['-axo', 'pid=,args='], { encoding: 'utf8' });

  if ((result.status ?? 1) !== 0) {
    return {
      available: false,
      repoOwned: [],
    };
  }

  const lines = (result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const cdpFlag = `--remote-debugging-port=${new URL(CDP_URL).port || '9336'}`;
  const repoOwned = lines.filter(
    (line) =>
      line.includes(cdpFlag) &&
      line.includes(`--user-data-dir=${browserProfile.userDataDir}`) &&
      line.includes(`--profile-directory=${browserProfile.profileDirectory}`) &&
      line.includes(`--disable-extensions-except=${extensionPath}`)
  );

  return {
    available: true,
    repoOwned,
  };
};

const cdpReachable = ATTACH_MODE === 'persistent' ? false : await probeCdpReady(CDP_URL);
const versionPayload =
  ATTACH_MODE === 'persistent' || !cdpReachable
    ? null
    : await fetchJson(new URL('/json/version', CDP_URL));
const browserMajorVersion = Number(String(versionPayload?.Browser || '').match(/\/(\d+)/)?.[1] || '0');
const attachOwnership = inspectAttachBrowserOwnership();
const attachModeResolved =
  ATTACH_MODE === 'browser' ? 'browser' : ATTACH_MODE === 'persistent' ? 'persistent' : 'browser';
const canInspectRuntime =
  attachModeResolved === 'browser' && cdpReachable && attachOwnership.repoOwned.length > 0;
const runtimeInspectionEnv = canInspectRuntime
  ? {
      ...process.env,
      PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR: browserProfile.userDataDir,
      PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME: browserProfile.profileName || '',
      PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY: browserProfile.profileDirectory || '',
      PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL: BROWSER_CHANNEL,
      PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE: 'browser',
      PROMPT_SWITCHBOARD_LIVE_CDP_URL: CDP_URL,
      PROMPT_SWITCHBOARD_EXTENSION_PATH: EXTENSION_PATH_FROM_ENV,
      PROMPT_SWITCHBOARD_LIVE_MODELS: TARGET_MODELS.join(','),
    }
  : null;
if (runtimeInspectionEnv) {
  delete runtimeInspectionEnv.PROMPT_SWITCHBOARD_USER_DATA_DIR;
  delete runtimeInspectionEnv.PROMPT_SWITCHBOARD_PROFILE_DIRECTORY;
}
const runtimeDiagnosisEnvelope = runtimeInspectionEnv
  ? runLiveDiagnoseEnvelope({ env: runtimeInspectionEnv })
  : null;
const runtimeInspection = buildRuntimeInspectionReport(runtimeDiagnosisEnvelope);
const runtimeBlocker = runtimeInspection?.laneBlocked ? runtimeInspection.errorMessage : null;
const brandedChromeExtensionAutoloadBlocker =
  attachModeResolved === 'browser' &&
  BROWSER_CHANNEL === 'chrome' &&
  browserMajorVersion >= 137 &&
  runtimeInspection?.laneBlocked
    ? `Official Google Chrome branded builds removed command-line unpacked extension autoload support starting in Chrome 137, and removed --disable-extensions-except in Chrome 139. The current attach lane reports ${versionPayload?.Browser || `Chrome/${browserMajorVersion}`}, so this real Chrome profile can preserve login state but will not auto-load the unpacked Prompt Switchboard extension runtime. Manually use "Load unpacked" in the repo-owned Chrome profile, or switch automated extension-runtime proof to Chromium/Chrome for Testing.`
    : null;

const missingRequiredEnv = [!LIVE_FLAG ? 'PROMPT_SWITCHBOARD_LIVE=1' : null].filter(Boolean);

const unsupportedChannelBlocker =
  attachModeResolved === 'persistent' && BROWSER_CHANNEL === 'chrome'
    ? 'PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL=chrome is not supported for extension side-loading in Playwright persistent contexts. Use a Chromium channel or the attachable real Chrome profile lane instead.'
    : null;

const attachModeBlocker =
  ATTACH_MODE === 'browser' && cdpReachable === false
    ? `PROMPT_SWITCHBOARD_LIVE_CDP_URL is not attachable right now: ${CDP_URL}. Launch an attachable browser first with npm run test:live:open-browser.`
    : null;

const blockers = [
  ...missingRequiredEnv,
  ...browserProfile.blockers,
  ...browserExecutable.blockers,
  unsupportedChannelBlocker,
  attachModeBlocker,
  brandedChromeExtensionAutoloadBlocker,
  !extensionPathExists
    ? `Extension build path is missing: ${sanitizePathForReport(extensionPath)}`
    : null,
  !testEntrypointExists
    ? `Live smoke entrypoint is missing: ${sanitizePathForReport(testEntrypoint)}`
    : null,
  runtimeBlocker,
  browserResources.blocker && !(cdpReachable && attachOwnership.repoOwned.length > 0)
    ? browserResources.blocker
    : null,
].filter(Boolean);

const readyToRun = blockers.length === 0;

const report = sanitizeReportPayload({
  mode: 'prompt_switchboard_live_smoke_doctor',
  readyToRun,
  requiredEnv: {
    PROMPT_SWITCHBOARD_LIVE: LIVE_FLAG ? '1' : '',
  },
  optionalEnv: {
    PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR:
      process.env.PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR || '',
    PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME:
      process.env.PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME || '',
    PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY:
      process.env.PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY || '',
    PROMPT_SWITCHBOARD_BROWSER_EXECUTABLE_PATH:
      process.env.PROMPT_SWITCHBOARD_BROWSER_EXECUTABLE_PATH || '',
    PROMPT_SWITCHBOARD_BROWSER_SOURCE_USER_DATA_DIR:
      process.env.PROMPT_SWITCHBOARD_BROWSER_SOURCE_USER_DATA_DIR || '',
    PROMPT_SWITCHBOARD_BROWSER_SOURCE_PROFILE_NAME:
      process.env.PROMPT_SWITCHBOARD_BROWSER_SOURCE_PROFILE_NAME || '',
    PROMPT_SWITCHBOARD_BROWSER_SOURCE_PROFILE_DIRECTORY:
      process.env.PROMPT_SWITCHBOARD_BROWSER_SOURCE_PROFILE_DIRECTORY || '',
    PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL: BROWSER_CHANNEL,
    PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE: ATTACH_MODE,
    PROMPT_SWITCHBOARD_LIVE_CDP_URL: CDP_URL,
    PROMPT_SWITCHBOARD_EXTENSION_PATH: EXTENSION_PATH_FROM_ENV,
    PROMPT_SWITCHBOARD_CLONE_PROFILE: CLONE_PROFILE ? '1' : '0',
    PROMPT_SWITCHBOARD_KEEP_LIVE_CLONE: KEEP_LIVE_CLONE ? '1' : '0',
    PROMPT_SWITCHBOARD_LIVE_MODELS: TARGET_MODELS,
    PROMPT_SWITCHBOARD_LIVE_TIMEOUT_MS: TIMEOUT_MS,
    PROMPT_SWITCHBOARD_EXTERNAL_CACHE_ROOT:
      process.env.PROMPT_SWITCHBOARD_EXTERNAL_CACHE_ROOT || '',
    PROMPT_SWITCHBOARD_EXTERNAL_CACHE_MAX_BYTES:
      process.env.PROMPT_SWITCHBOARD_EXTERNAL_CACHE_MAX_BYTES || '',
    PROMPT_SWITCHBOARD_EXTERNAL_CACHE_TTL_HOURS:
      process.env.PROMPT_SWITCHBOARD_EXTERNAL_CACHE_TTL_HOURS || '',
  },
  filesystem: {
    extensionPath,
    extensionPathExists,
    browserExecutablePath: browserExecutable.executablePath,
    browserExecutableResolutionSource: browserExecutable.resolutionSource,
    persistentBrowserRoot: persistentBrowserState.root,
    browserUserDataDir: browserProfile.userDataDir,
    browserProfileName: browserProfile.profileName,
    browserProfileDirectory: browserProfile.profileDirectory,
    browserProfilePath: browserProfile.profilePath,
    browserProfileResolutionSource: browserProfile.resolutionSource,
    localStatePath: browserProfile.localStatePath,
    persistentBrowserBootstrapReady: persistentBrowserState.bootstrapReady,
    testEntrypoint,
    testEntrypointExists,
  },
  effectiveRun: {
    attachModeRequested: ATTACH_MODE,
    attachModeResolved,
    cdpUrl: attachModeResolved === 'browser' ? CDP_URL : null,
    browserChannel: BROWSER_CHANNEL,
    cloneProfile: CLONE_PROFILE,
    browserUserDataDir: browserProfile.userDataDir,
    browserProfileDirectory: browserProfile.profileDirectory,
    browserProfileName: browserProfile.profileName,
    targetModels: TARGET_MODELS,
    promptPreview: PROMPT,
    promptLengthChars: PROMPT.length,
    timeoutMs: TIMEOUT_MS,
  },
  externalCache: {
    root: externalCachePolicy.root,
    ttlHours: externalCachePolicy.ttlHours,
    maxBytes: externalCachePolicy.maxBytes,
    maxBytesLabel: formatBytes(externalCachePolicy.maxBytes),
    currentBytes: externalCacheState.currentBytes,
    currentBytesLabel: formatBytes(externalCacheState.currentBytes),
    managedBytes: externalCacheState.managedBytes,
    managedBytesLabel: formatBytes(externalCacheState.managedBytes),
    entryCount: externalCacheState.entryCount,
  },
  persistentBrowserState: {
    root: persistentBrowserState.root,
    userDataDir: persistentBrowserState.userDataDir,
    currentBytes: persistentBrowserState.currentBytes,
    currentBytesLabel: formatBytes(persistentBrowserState.currentBytes),
    bootstrapReady: persistentBrowserState.bootstrapReady,
    excludedFromTtlAndCap: true,
  },
  cdp: {
    reachable: cdpReachable,
  },
  runtimeInspection,
  browserResources: {
    available: browserResources.available,
    activeBrowserCount: browserResources.activeBrowserCount,
    maxBrowserInstances: browserResources.maxBrowserInstances,
    sample: browserResources.activeBrowsers.slice(0, 8).map(() => '[redacted browser args]'),
  },
  blockers,
  nextAction: readyToRun
    ? 'Live preflight passed. Run npm run test:live with the same environment.'
    : runtimeBlocker
      ? 'The attach lane is reachable but runtime-blocked. Rebuild or replace the repo-owned browser lane, or continue with repo-side runtime debugging before launching real live smoke.'
      : 'Fix the listed blockers, then rerun npm run test:live:doctor before launching the real live smoke.',
});

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
