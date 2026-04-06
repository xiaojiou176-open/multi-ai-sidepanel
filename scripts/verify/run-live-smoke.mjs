import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { pruneExternalRepoCache, resolveBrowserProfile } from '../shared/runtime-governance.mjs';
import {
  collectLivePreflightBlockers,
  hasLiveRuntimeEvidenceGap,
  runLiveDiagnoseEnvelope,
} from './live-runtime-gates.mjs';

const shouldRun = process.env.PROMPT_SWITCHBOARD_LIVE === '1';
const browserProfile = resolveBrowserProfile();
const browserChannel = process.env.PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL || 'chromium';
const attachMode = process.env.PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE || 'browser';
const cdpUrl = process.env.PROMPT_SWITCHBOARD_LIVE_CDP_URL || 'http://127.0.0.1:9336';
const strictMode = process.env.PROMPT_SWITCHBOARD_LIVE_STRICT === '1';
const testPath = path.join('tests', 'e2e', 'live.smoke.spec.ts');
const targetModels = process.env.PROMPT_SWITCHBOARD_LIVE_MODELS || 'ChatGPT';
const preflightBlockerKinds = new Set([
  'site_login_gated',
  'site_not_open',
  'site_public_or_ambiguous',
]);

const exitSkippedOrFailed = (message) => {
  console.log(message);
  process.exit(strictMode ? 1 : 0);
};

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

if (!shouldRun) {
  exitSkippedOrFailed(
    '[test:live] skipped: this is a manual Tier C live-proof path; run npm run test:live:doctor, then set PROMPT_SWITCHBOARD_LIVE=1 before retrying'
  );
}

if (attachMode !== 'browser' && attachMode !== 'persistent') {
  console.error(
    '[test:live] failed: PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE must be browser or persistent.'
  );
  process.exit(1);
}

if (browserProfile.blockers.length > 0) {
  for (const blocker of browserProfile.blockers) {
    console.error(`[test:live] failed: ${blocker}`);
  }
  process.exit(1);
}

pruneExternalRepoCache({
  log: (message) => console.log(`[test:live] ${message}`),
});

const cdpReachable = attachMode === 'browser' ? await probeCdpReady(cdpUrl) : false;
if (attachMode === 'browser' && !cdpReachable) {
  console.error(
    `[test:live] failed: PROMPT_SWITCHBOARD_LIVE_CDP_URL is not attachable right now (${cdpUrl}). Launch the repo-owned browser first with npm run test:live:open-browser.`
  );
  process.exit(1);
}

if (!existsSync(testPath)) {
  console.error(`[test:live] failed: expected Playwright entrypoint at ${testPath}`);
  process.exit(1);
}

const nextEnv = {
  ...process.env,
  PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR: browserProfile.userDataDir,
  PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME: browserProfile.profileName || '',
  PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY: browserProfile.profileDirectory || '',
  PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL: browserChannel,
  PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE: attachMode,
  PROMPT_SWITCHBOARD_LIVE_MODELS: targetModels,
};

if (attachMode === 'browser') {
  nextEnv.PROMPT_SWITCHBOARD_LIVE_CDP_URL = cdpUrl;
} else {
  delete nextEnv.PROMPT_SWITCHBOARD_LIVE_CDP_URL;
}

delete nextEnv.PROMPT_SWITCHBOARD_USER_DATA_DIR;
delete nextEnv.PROMPT_SWITCHBOARD_PROFILE_DIRECTORY;

const diagnosisEnvelope = runLiveDiagnoseEnvelope({ env: nextEnv });
const liveDiagnosis = diagnosisEnvelope?.diagnosis;
const preflightBlockers = collectLivePreflightBlockers({
  diagnosisEnvelope,
  preflightBlockerKinds,
});
const hasRecoverableRuntimeGapOnly =
  attachMode === 'browser' &&
  hasLiveRuntimeEvidenceGap(diagnosisEnvelope?.probe?.extension) &&
  preflightBlockers.length > 0 &&
  preflightBlockers.every(
    (blocker) => blocker.surface === 'probe' && blocker.kind === 'probe_blocker'
  );

if (preflightBlockers.length > 0 && !hasRecoverableRuntimeGapOnly) {
  console.error('[test:live] blocked before compare execution:');
  for (const blocker of preflightBlockers) {
    console.error(`- ${blocker.message}`);
  }
  if (Array.isArray(liveDiagnosis?.nextActions) && liveDiagnosis.nextActions.length > 0) {
    console.error('[test:live] next actions:');
    for (const action of liveDiagnosis.nextActions) {
      console.error(`- ${action}`);
    }
  }
  process.exit(1);
}

if (hasRecoverableRuntimeGapOnly) {
  console.warn(
    '[test:live] continuing past an idle extension-runtime gap because the attach harness will attempt to seed a fresh runtime-backed model tab before compare.'
  );
}

const result = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['playwright', 'test', testPath, '--config', 'playwright.config.ts', '--workers=1'],
  {
    stdio: 'inherit',
    env: nextEnv,
  }
);

process.exit(result.status ?? 1);
