import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import WebSocket from 'ws';
import { inspectBrowserResourceState } from './browser-resource-hygiene.mjs';
import { buildRuntimeInspectionReport, runLiveDiagnoseEnvelope } from './live-runtime-gates.mjs';
import { buildAttachTargetUrls, buildOpenLiveBrowserArgs } from './open-live-browser-helpers.mjs';
import { writeBrowserIdentityPage } from '../shared/browser-instance-identity.mjs';
import {
  pruneExternalRepoCache,
  resolveBrowserExecutablePath,
  resolveBrowserProfile,
} from '../shared/runtime-governance.mjs';

const DEFAULT_URL = 'https://chatgpt.com/';
const DEFAULT_CDP_PORT = 9336;
const PROMPT_SWITCHBOARD_EXTENSION_NAME = 'Prompt Switchboard';
const PROMPT_SWITCHBOARD_OPTIONS_PAGE = 'settings.html';
const PROMPT_SWITCHBOARD_SIDE_PANEL_PATH = 'index.html';
const EXTENSION_ID_CACHE_PATH = path.resolve(
  process.cwd(),
  '.runtime-cache',
  'live-extension-id.txt'
);

const LIVE_FLAG = process.env.PROMPT_SWITCHBOARD_LIVE === '1';
const DETACHED_BROWSER_LAUNCH_ALLOWED =
  process.env.PROMPT_SWITCHBOARD_LIVE_ALLOW_DETACHED_BROWSER === '1';
const CDP_PORT = Number(process.env.PROMPT_SWITCHBOARD_LIVE_CDP_PORT || DEFAULT_CDP_PORT);
const BROWSER_CHANNEL = process.env.PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL || 'chrome';
const START_URL = process.env.PROMPT_SWITCHBOARD_LIVE_START_URL || DEFAULT_URL;
const EXTENSION_PATH = process.env.PROMPT_SWITCHBOARD_EXTENSION_PATH
  ? path.resolve(process.env.PROMPT_SWITCHBOARD_EXTENSION_PATH)
  : path.resolve(process.cwd(), 'dist');
const browserProfile = resolveBrowserProfile();
const browserExecutable = resolveBrowserExecutablePath({
  ...process.env,
  PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL: BROWSER_CHANNEL,
});

const readCachedExtensionId = () => {
  if (!fs.existsSync(EXTENSION_ID_CACHE_PATH)) {
    return null;
  }

  const value = fs.readFileSync(EXTENSION_ID_CACHE_PATH, 'utf8').trim();
  return /^[a-p]{32}$/.test(value) ? value : null;
};

const writeCachedExtensionId = (value) => {
  if (!/^[a-p]{32}$/.test(String(value || ''))) {
    return;
  }
  fs.mkdirSync(path.dirname(EXTENSION_ID_CACHE_PATH), { recursive: true });
  fs.writeFileSync(EXTENSION_ID_CACHE_PATH, `${value}\n`, 'utf8');
};

const readProfileRepoOwnedExtensionIds = ({ userDataDir, profileDirectory, extensionPath }) => {
  const profileRoot = path.resolve(userDataDir, profileDirectory);
  const extensionRoot = path.resolve(extensionPath);
  const preferenceFiles = [
    path.join(profileRoot, 'Preferences'),
    path.join(profileRoot, 'Secure Preferences'),
  ];
  const extensionIds = new Set();

  for (const filePath of preferenceFiles) {
    if (!fs.existsSync(filePath)) {
      continue;
    }

    try {
      const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const settings = payload?.extensions?.settings;
      if (!settings || typeof settings !== 'object') {
        continue;
      }

      for (const [extensionId, entry] of Object.entries(settings)) {
        const manifest = entry?.manifest;
        const resolvedPath =
          typeof entry?.path === 'string' && entry.path.length > 0 ? path.resolve(entry.path) : null;
        const manifestMatches =
          manifest?.name === PROMPT_SWITCHBOARD_EXTENSION_NAME &&
          manifest?.options_page === PROMPT_SWITCHBOARD_OPTIONS_PAGE &&
          manifest?.side_panel?.default_path === PROMPT_SWITCHBOARD_SIDE_PANEL_PATH;
        if (manifestMatches || resolvedPath === extensionRoot) {
          extensionIds.add(extensionId);
        }
      }
    } catch {
      // Ignore unreadable profile preference files; runtime detection remains authoritative.
    }
  }

  return [...extensionIds];
};

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      request.setTimeout(1500, () => {
        request.destroy();
        resolve(null);
      });
    } catch {
      resolve(null);
    }
  });

const probeCdpReady = (port) =>
  new Promise((resolve) => {
    const request = http.get(`http://127.0.0.1:${port}/json/version`, (response) => {
      const ok = response.statusCode === 200;
      response.resume();
      resolve(ok);
    });
    request.on('error', () => resolve(false));
    request.setTimeout(1000, () => {
      request.destroy();
      resolve(false);
    });
  });

const listCdpTargets = async (port) => {
  const payload = await fetchJson(`http://127.0.0.1:${port}/json/list`);
  return Array.isArray(payload) ? payload : [];
};

const hasAttachTarget = (targets, targetUrl) =>
  targets.some((target) => target.type === 'page' && target.url === targetUrl);

const createBrowserTarget = (browserWsUrl, url) =>
  new Promise((resolve, reject) => {
    const socket = new WebSocket(browserWsUrl);
    socket.once('error', reject);
    socket.once('open', () => {
      socket.send(
        JSON.stringify({
          id: 1,
          method: 'Target.createTarget',
          params: { url },
        })
      );
    });
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(String(raw));
        if (message.id !== 1) {
          return;
        }
        if (message.error) {
          reject(new Error(message.error.message || 'Target.createTarget failed'));
          socket.close();
          return;
        }
        resolve(message.result);
        socket.close();
      } catch (error) {
        reject(error);
        socket.close();
      }
    });
  });

const ensureAttachTargets = async () => {
  const targetUrls = buildAttachTargetUrls({
    identityPageUrl: identityPage.identityUrl,
    startUrl: START_URL,
    extensionWarmupUrl,
  });
  let targets = await listCdpTargets(CDP_PORT);
  const missingTargetUrls = targetUrls.filter((targetUrl) => !hasAttachTarget(targets, targetUrl));

  if (missingTargetUrls.length === 0 || targetUrls.length === 0) {
    return targets;
  }

  const versionPayload = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
  const browserWsUrl = versionPayload?.webSocketDebuggerUrl;
  if (!browserWsUrl) {
    return targets;
  }

  for (const url of missingTargetUrls) {
    try {
      await createBrowserTarget(browserWsUrl, url);
    } catch {
      // Best effort target creation. The follow-up list check decides success.
    }
  }

  for (let attempt = 0; attempt < 20; attempt += 1) {
    targets = await listCdpTargets(CDP_PORT);
    const stillMissing = targetUrls.filter((targetUrl) => !hasAttachTarget(targets, targetUrl));
    if (stillMissing.length === 0) {
      return targets;
    }
    await wait(250);
  }

  return targets;
};

const inspectAttachBrowserOwnership = () => {
  const result = spawnSync('ps', ['-axo', 'pid=,args='], { encoding: 'utf8' });

  if ((result.status ?? 1) !== 0) {
    return {
      available: false,
      repoOwned: [],
      cdpPortOwners: [],
      blocker:
        result.stderr?.trim() ||
        `Could not inspect active browser ownership for CDP port ${CDP_PORT}.`,
    };
  }

  const lines = (result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const cdpFlag = `--remote-debugging-port=${CDP_PORT}`;
  const repoOwned = lines.filter(
    (line) =>
      line.includes(cdpFlag) &&
      line.includes(`--user-data-dir=${browserProfile.userDataDir}`) &&
      line.includes(`--profile-directory=${browserProfile.profileDirectory}`) &&
      line.includes(`--disable-extensions-except=${EXTENSION_PATH}`)
  );
  const cdpPortOwners = lines.filter((line) => line.includes(cdpFlag));

  return {
    available: true,
    repoOwned,
    cdpPortOwners,
    blocker: null,
  };
};

const extractPid = (processLine) => {
  const match = processLine.match(/^(\d+)\s+/);
  return match?.[1] || null;
};

const errors = [];
const browserResources = inspectBrowserResourceState();
const attachOwnership = inspectAttachBrowserOwnership();
const cdpReadyBeforeLaunch = await probeCdpReady(CDP_PORT);
const reusingExistingAttachBrowser =
  attachOwnership.available && cdpReadyBeforeLaunch && attachOwnership.repoOwned.length > 0;

if (!LIVE_FLAG) {
  errors.push('PROMPT_SWITCHBOARD_LIVE=1 is required before launching the attach browser helper.');
}

if (!fs.existsSync(EXTENSION_PATH)) {
  errors.push(`Extension build path is missing: ${EXTENSION_PATH}`);
}

if (!Number.isFinite(CDP_PORT) || CDP_PORT <= 0) {
  errors.push(`PROMPT_SWITCHBOARD_LIVE_CDP_PORT must be a positive integer. Received: ${CDP_PORT}`);
}

if (browserResources.blocker && !reusingExistingAttachBrowser) {
  errors.push(browserResources.blocker);
}

if (attachOwnership.blocker) {
  errors.push(
    `Could not verify whether CDP port ${CDP_PORT} is owned by this repo before launching a browser helper: ${attachOwnership.blocker}`
  );
}

if (
  attachOwnership.available &&
  cdpReadyBeforeLaunch &&
  attachOwnership.cdpPortOwners.length > 0 &&
  attachOwnership.repoOwned.length === 0
) {
  errors.push(
    `CDP port ${CDP_PORT} is already attached to a non-canonical browser lane. Reclaim that browser or choose a different port instead of borrowing another repo's live lane.`
  );
}

if (attachOwnership.available && !cdpReadyBeforeLaunch && attachOwnership.repoOwned.length > 0) {
  errors.push(
    `A repo-owned canonical browser instance already exists for ${browserProfile.userDataDir} / ${browserProfile.profileDirectory}, but it is not attachable on CDP port ${CDP_PORT}. Close that instance and rerun the helper instead of second-launching the same browser root.`
  );
}

errors.push(...browserProfile.blockers);
errors.push(...browserExecutable.blockers);

if (errors.length > 0) {
  errors.forEach((message) => console.error(`[test:live:open-browser] ${message}`));
  process.exit(1);
}

pruneExternalRepoCache({
  log: (message) => console.log(`[test:live:open-browser] ${message}`),
});

const executablePath = browserExecutable.executablePath;
const cachedExtensionId = readCachedExtensionId();
const profileExtensionIds = readProfileRepoOwnedExtensionIds({
  userDataDir: browserProfile.userDataDir,
  profileDirectory: browserProfile.profileDirectory,
  extensionPath: EXTENSION_PATH,
});
const trustedWarmupExtensionId = cachedExtensionId && profileExtensionIds.includes(cachedExtensionId)
  ? cachedExtensionId
  : (profileExtensionIds[0] ?? null);
const extensionWarmupUrl = trustedWarmupExtensionId
  ? `chrome-extension://${trustedWarmupExtensionId}/settings.html`
  : null;
const identityPage = writeBrowserIdentityPage({
  repoRoot: process.cwd(),
  env: process.env,
  cdpPort: CDP_PORT,
  cdpUrl: `http://127.0.0.1:${CDP_PORT}`,
  browserProfile,
  startUrl: START_URL,
  extensionUrl: extensionWarmupUrl,
});
const args = buildOpenLiveBrowserArgs({
  cdpPort: CDP_PORT,
  userDataDir: browserProfile.userDataDir,
  profileDirectory: browserProfile.profileDirectory,
  extensionPath: EXTENSION_PATH,
  identityPageUrl: identityPage.identityUrl,
  startUrl: START_URL,
  extensionWarmupUrl,
});

let child = null;
let cdpReady = cdpReadyBeforeLaunch;

if (!reusingExistingAttachBrowser) {
  if (!DETACHED_BROWSER_LAUNCH_ALLOWED) {
    const manualLaunchCommand = [executablePath, ...args]
      .map((part) => JSON.stringify(part))
      .join(' ');
    console.error(
      `[test:live:open-browser] failed: Detached repo-owned browser launch now requires PROMPT_SWITCHBOARD_LIVE_ALLOW_DETACHED_BROWSER=1. Launch Chrome manually with ${manualLaunchCommand} or rerun with that explicit operator override.`
    );
    process.exit(1);
  }

  child = spawn(executablePath, args, {
    detached: true, // host-safety: allow
    stdio: 'ignore',
  });
  child.unref(); // host-safety: allow

  cdpReady = false;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    cdpReady = await probeCdpReady(CDP_PORT);
    if (cdpReady) break;
    await wait(250);
  }

  if (!cdpReady) {
    console.error(
      `[test:live:open-browser] failed: Google Chrome did not expose a reachable DevTools endpoint on http://127.0.0.1:${CDP_PORT}.`
    );
    process.exit(1);
  }
}

const attachCommand = [
  'PROMPT_SWITCHBOARD_LIVE=1',
  'PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE=browser',
  `PROMPT_SWITCHBOARD_LIVE_CDP_URL=http://127.0.0.1:${CDP_PORT}`,
  `PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR=${JSON.stringify(browserProfile.userDataDir)}`,
  `PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME=${JSON.stringify(browserProfile.profileName || '')}`,
  `PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY=${JSON.stringify(browserProfile.profileDirectory)}`,
  'npm run test:live',
].join(' ');

const attachTargets = await ensureAttachTargets();

if (attachTargets.length === 0) {
  console.error(
    `[test:live:open-browser] failed: Chrome exposed ${CDP_PORT}, but no attachable page targets appeared under the repo-owned browser root ${browserProfile.userDataDir}.`
  );
  process.exit(1);
}

const runtimeInspectionEnv = {
  ...process.env,
  PROMPT_SWITCHBOARD_LIVE: '1',
  PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE: 'browser',
  PROMPT_SWITCHBOARD_LIVE_CDP_URL: `http://127.0.0.1:${CDP_PORT}`,
  PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR: browserProfile.userDataDir,
  PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME: browserProfile.profileName || '',
  PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY: browserProfile.profileDirectory,
  PROMPT_SWITCHBOARD_EXTENSION_PATH: EXTENSION_PATH,
};
delete runtimeInspectionEnv.PROMPT_SWITCHBOARD_USER_DATA_DIR;
delete runtimeInspectionEnv.PROMPT_SWITCHBOARD_PROFILE_DIRECTORY;
const runtimeDiagnosisEnvelope = runLiveDiagnoseEnvelope({ env: runtimeInspectionEnv });
const runtimeInspection = buildRuntimeInspectionReport(runtimeDiagnosisEnvelope);
const runtimeBlocked = Boolean(runtimeInspection?.laneBlocked);
const versionPayload = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
const browserMajorVersion = Number(String(versionPayload?.Browser || '').match(/\/(\d+)/)?.[1] || '0');
const brandedChromeExtensionAutoloadUnsupported =
  BROWSER_CHANNEL === 'chrome' && browserMajorVersion >= 137;
const detectedRuntimeId = runtimeInspection?.runtimeEvidence?.detectedRuntimeIds?.[0] || null;
if (detectedRuntimeId && detectedRuntimeId !== cachedExtensionId) {
  writeCachedExtensionId(detectedRuntimeId);
  const detectedExtensionWarmupUrl = `chrome-extension://${detectedRuntimeId}/settings.html`;
  const detectedExtensionAppUrl = `chrome-extension://${detectedRuntimeId}/index.html`;
  const targets = await listCdpTargets(CDP_PORT);
  const missingDetectedTargets = [detectedExtensionWarmupUrl, detectedExtensionAppUrl].filter(
    (targetUrl) => !hasAttachTarget(targets, targetUrl)
  );
  if (missingDetectedTargets.length > 0) {
    const versionPayload = await fetchJson(`http://127.0.0.1:${CDP_PORT}/json/version`);
    if (versionPayload?.webSocketDebuggerUrl) {
      for (const targetUrl of missingDetectedTargets) {
        try {
          await createBrowserTarget(versionPayload.webSocketDebuggerUrl, targetUrl);
        } catch {
          // Best effort warmup for the detected runtime id.
        }
      }
    }
  }
}

console.log(
  JSON.stringify(
    {
      ok: true,
      mode: 'prompt_switchboard_live_browser_launch',
      executablePath,
      executableResolutionSource: browserExecutable.resolutionSource,
      pid: child?.pid || extractPid(attachOwnership.repoOwned[0] || ''),
      cdpUrl: `http://127.0.0.1:${CDP_PORT}`,
      userDataDir: browserProfile.userDataDir,
      profileName: browserProfile.profileName,
      profileDirectory: browserProfile.profileDirectory,
      profileResolutionSource: browserProfile.resolutionSource,
      reusingExistingAttachBrowser,
      browserResourceState: {
        available: browserResources.available,
        activeBrowserCount: browserResources.activeBrowserCount,
        maxBrowserInstances: browserResources.maxBrowserInstances,
      },
      attachTargetCount: attachTargets.length,
      startUrl: START_URL,
      identityPageUrl: identityPage.identityUrl,
      identityPagePath: identityPage.identityPath,
      identityLabel: identityPage.repoLabel,
      extensionWarmupUrl,
      runtimeInspection,
      nextAction: runtimeBlocked
        ? brandedChromeExtensionAutoloadUnsupported
          ? `The repo-owned real Chrome lane launched, but ${versionPayload?.Browser || `Chrome/${browserMajorVersion}`} did not expose a Prompt Switchboard extension runtime. Official Google Chrome branded builds removed command-line unpacked extension autoload support starting in Chrome 137, and removed --disable-extensions-except in Chrome 139. Keep this profile for login-state validation, then manually use "Load unpacked" in this repo-owned Chrome profile or move automated extension-runtime proof to Chromium/Chrome for Testing.`
          : 'The repo-owned browser lane launched, but Prompt Switchboard still did not expose a live extension runtime. Treat this lane as runtime-blocked and prefer repo-side debugging or a rebuilt browser lane over repeated Chrome menu clicks.'
        : 'Keep the identity tab open on the left, log in inside the launched browser window if needed, and use the real Prompt Switchboard side panel or toolbar entry instead of direct extension-tab navigation when you need the live UI surface. Then run the attach command in the same repo shell.',
      trustedWarmupExtensionId,
      brandedChromeExtensionAutoloadUnsupported,
      browserVersion: versionPayload?.Browser || null,
      attachCommand,
    },
    null,
    2
  )
);
