import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import {
  chromium,
  type Browser,
  type BrowserContext,
  type CDPSession,
  type ConsoleMessage,
  type Page,
} from '@playwright/test';
import { getModelConfig } from '../../src/utils/modelConfig';
import { getSiteCapability } from '../../src/utils/siteCapabilityMatrix';
import {
  classifyLiveExtensionState,
  classifyLiveSiteState,
  describeLiveSiteResponsePathAdvisory,
  describeLiveSiteNextAction,
  toCanonicalReadinessStatus,
  type LiveExtensionState,
  type LiveSiteState,
} from '../../src/utils/liveSiteDiagnostics';
import type { ModelName, ReadinessStatus } from '../../src/utils/types';
import { withExistingExtensionTarget } from './live-extension-target';
import { hasLiveRuntimeEvidenceGap } from './live-runtime-gates.mjs';
import {
  REPO_OWNED_LIVE_CLONE_PREFIX,
  ensureDirectory,
  getExternalLiveProfileCloneRoot,
  pruneExternalRepoCache,
  resolveBrowserExecutablePath,
  resolveBrowserProfile,
  sanitizePathForReport,
} from '../shared/runtime-governance.mjs';

const DEFAULT_TARGET_MODELS: ModelName[] = ['ChatGPT'];
const DEFAULT_CDP_URL = 'http://127.0.0.1:9336';
const DEFAULT_PROBE_WAIT_MS = 750;
const DEFAULT_ATTACH_CONNECT_TIMEOUT_MS = 30_000;
const CLONE_RETRY_CODES = new Set(['ENOENT', 'EBUSY', 'EPERM']);
const CLONE_RETRY_ATTEMPTS = 4;
const CLONE_RETRY_DELAY_MS = 80;
const EXTENSION_ID_CACHE_PATH = path.resolve(
  process.cwd(),
  '.runtime-cache',
  'live-extension-id.txt'
);

type AttachMode = 'browser' | 'persistent';
type AttachModeResolved = 'browser' | 'persistent';

export interface LiveProbeConfig {
  liveFlag: boolean;
  userDataDir: string;
  profileDirectory: string;
  profileName: string | null;
  profileResolutionSource: string | null;
  profileBlockers: string[];
  browserChannel: string;
  browserExecutablePath: string;
  browserExecutableResolutionSource: string | null;
  browserExecutableBlockers: string[];
  attachModeRequested: AttachMode;
  cdpUrl: string;
  extensionPath: string;
  cloneProfile: boolean;
  keepLiveClone: boolean;
  openMissingTabs: boolean;
  probeWaitMs: number;
  targetModels: ModelName[];
}

export interface LiveProbeEffectiveRun {
  attachModeRequested: AttachMode;
  attachModeResolved: AttachModeResolved;
  browserChannel: string;
  browserExecutablePath: string;
  browserExecutableResolutionSource: string | null;
  cdpUrl: string | null;
  userDataDir: string;
  profileDirectory: string;
  profileName: string | null;
  profileResolutionSource: string | null;
  extensionPath: string;
  cloneProfile: boolean;
  targetModels: ModelName[];
}

export interface LiveSiteProbeResult {
  model: ModelName;
  state: LiveSiteState;
  readinessStatus: ReadinessStatus;
  nextAction: string;
  url: string;
  title: string;
  hasPromptSurface: boolean;
  hasResponseSurface: boolean;
  hasStopControl: boolean;
  completionHeuristic: string;
  responsePathAdvisory?: string;
  loginButtons: string[];
  bodyPreview: string;
  consoleMessages: string[];
  pageErrors: string[];
  requestFailures: string[];
}

export interface LiveExtensionProbeResult {
  available: boolean;
  extensionId?: string;
  inspectionMode?: 'playwright' | 'cdp_existing_target';
  runtimeEvidence?: {
    hasServiceWorker: boolean;
    serviceWorkerUrls: string[];
    hasContentScriptContext: boolean;
    contentScriptModels: ModelName[];
    detectedRuntimeIds: string[];
  };
  state: LiveExtensionState;
  url: string;
  hasCompareCard: boolean;
  hasCompletedCard: boolean;
  hasCheckingIndicator: boolean;
  bodyPreview: string;
  errorMessage?: string;
}

export interface LiveProbeResult {
  mode: 'prompt_switchboard_live_site_probe';
  generatedAt: string;
  readyToProbe: boolean;
  blockers: string[];
  effectiveRun: LiveProbeEffectiveRun;
  models: LiveSiteProbeResult[];
  extension: LiveExtensionProbeResult | null;
}

export interface LiveDiagnosisResult {
  mode: 'prompt_switchboard_live_diagnose';
  generatedAt: string;
  status: 'ready_for_compare' | 'blocked';
  blockers: Array<{
    surface: 'site' | 'extension' | 'probe';
    kind: LiveSiteState | LiveExtensionState | 'probe_blocker';
    model?: ModelName;
    readinessStatus?: ReadinessStatus;
    message: string;
  }>;
  nextActions: string[];
  effectiveRun: LiveProbeEffectiveRun;
}

interface LiveSiteCandidateSnapshot {
  loginButtons: string[];
  hasPromptSurface: boolean;
  hasResponseSurface: boolean;
  hasStopControl: boolean;
}

const probeCdpReady = (targetUrl: string) =>
  new Promise<boolean>((resolve) => {
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

const resolveExtensionPath = () => {
  if (process.env.PROMPT_SWITCHBOARD_EXTENSION_PATH) {
    return path.resolve(process.env.PROMPT_SWITCHBOARD_EXTENSION_PATH);
  }
  return path.resolve(process.cwd(), 'dist');
};

const parseTargetModels = (): ModelName[] => {
  const raw = process.env.PROMPT_SWITCHBOARD_LIVE_MODELS;
  if (!raw) {
    return [...DEFAULT_TARGET_MODELS];
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean) as ModelName[];
};

export const scoreLiveSiteCandidateSnapshot = (snapshot: LiveSiteCandidateSnapshot) => {
  let score = 0;
  if (snapshot.hasPromptSurface) score += 4;
  if (snapshot.hasResponseSurface) score += 1;
  if (snapshot.hasStopControl) score += 1;
  score += snapshot.loginButtons.length === 0 ? 5 : -5;
  return score;
};

export const resolveLiveProbeConfig = (): LiveProbeConfig => ({
  ...(() => {
    const browserProfile = resolveBrowserProfile();
    const browserChannel = process.env.PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL || 'chromium';
    const browserExecutable = resolveBrowserExecutablePath({
      ...process.env,
      PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL: browserChannel,
    });
    return {
      liveFlag: process.env.PROMPT_SWITCHBOARD_LIVE === '1',
      userDataDir: browserProfile.userDataDir,
      profileDirectory: browserProfile.profileDirectory || '',
      profileName: browserProfile.profileName,
      profileResolutionSource: browserProfile.resolutionSource,
      profileBlockers: browserProfile.blockers,
      browserChannel,
      browserExecutablePath: browserExecutable.executablePath,
      browserExecutableResolutionSource: browserExecutable.resolutionSource,
      browserExecutableBlockers: browserExecutable.blockers,
      attachModeRequested:
        (process.env.PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE as AttachMode | undefined) || 'browser',
      cdpUrl: process.env.PROMPT_SWITCHBOARD_LIVE_CDP_URL || DEFAULT_CDP_URL,
      extensionPath: resolveExtensionPath(),
      cloneProfile: process.env.PROMPT_SWITCHBOARD_CLONE_PROFILE === '1',
      keepLiveClone: process.env.PROMPT_SWITCHBOARD_KEEP_LIVE_CLONE === '1',
      openMissingTabs: process.env.PROMPT_SWITCHBOARD_LIVE_OPEN_MISSING_TABS === '1',
      probeWaitMs: Number(process.env.PROMPT_SWITCHBOARD_LIVE_PROBE_WAIT_MS || DEFAULT_PROBE_WAIT_MS),
      targetModels: parseTargetModels(),
    };
  })(),
});

export const resolveLiveProbeBlockers = async (config: LiveProbeConfig) => {
  const blockers: string[] = [];
  const extensionPathExists = fs.existsSync(config.extensionPath);
  const cdpReachable =
    config.attachModeRequested === 'persistent' ? false : await probeCdpReady(config.cdpUrl);

  const attachModeResolved: AttachModeResolved =
    config.attachModeRequested === 'browser'
      ? 'browser'
      : 'persistent';

  if (!config.liveFlag) {
    blockers.push('PROMPT_SWITCHBOARD_LIVE=1 is required.');
  }
  blockers.push(...config.profileBlockers);
  blockers.push(...config.browserExecutableBlockers);
  if (!extensionPathExists) {
    blockers.push(`Extension build path is missing: ${sanitizePathForReport(config.extensionPath)}`);
  }
  if (attachModeResolved === 'persistent' && config.browserChannel === 'chrome') {
    blockers.push(
      'PROMPT_SWITCHBOARD_LIVE_BROWSER_CHANNEL=chrome is not supported for extension side-loading in Playwright persistent contexts. Use chromium or the attachable browser helper.'
    );
  }
  if (config.attachModeRequested === 'browser' && !cdpReachable) {
    blockers.push(`CDP endpoint is not attachable right now: ${config.cdpUrl}`);
  }

  return {
    blockers,
    effectiveRun: {
      attachModeRequested: config.attachModeRequested,
      attachModeResolved,
      browserChannel: config.browserChannel,
      browserExecutablePath: config.browserExecutablePath,
      browserExecutableResolutionSource: config.browserExecutableResolutionSource,
      cdpUrl: attachModeResolved === 'browser' ? config.cdpUrl : null,
      userDataDir: config.userDataDir,
      profileDirectory: config.profileDirectory,
      profileName: config.profileName,
      profileResolutionSource: config.profileResolutionSource,
      extensionPath: config.extensionPath,
      cloneProfile: config.cloneProfile,
      targetModels: config.targetModels,
    } satisfies LiveProbeEffectiveRun,
  };
};

const readCachedExtensionId = () => {
  if (!fs.existsSync(EXTENSION_ID_CACHE_PATH)) {
    return null;
  }
  const value = fs.readFileSync(EXTENSION_ID_CACHE_PATH, 'utf8').trim();
  return value.length > 0 ? value : null;
};

export const classifyExtensionSurfaceProbeFailure = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);

  if (/ERR_BLOCKED_BY_CLIENT/i.test(message)) {
    return 'Chrome blocked direct navigation to the extension page in attach mode (ERR_BLOCKED_BY_CLIENT).';
  }

  if (/Target page, context or browser has been closed/i.test(message)) {
    return 'The extension page closed before Prompt Switchboard could finish the live probe. Reopen the Prompt Switchboard side panel or extension page in the current browser, then rerun the probe.';
  }

  return `Prompt Switchboard could not inspect the extension page during live probing: ${message}`;
};

const resolveExtensionId = async (
  context: BrowserContext,
  attachModeResolved: AttachModeResolved
) => {
  const currentWorker = context
    .serviceWorkers()
    .find((worker) => worker.url().startsWith('chrome-extension://'));
  if (currentWorker) {
    return new URL(currentWorker.url()).host;
  }

  const existingExtensionPage = context
    .pages()
    .find((page) => page.url().startsWith('chrome-extension://'));
  if (existingExtensionPage) {
    return new URL(existingExtensionPage.url()).host;
  }

  if (attachModeResolved === 'browser') {
    return readCachedExtensionId();
  }

  return null;
};

const classifyProbeLaunchFailure = (error: unknown, effectiveRun: LiveProbeEffectiveRun) => {
  const message = error instanceof Error ? error.message : String(error);

  if (/ProcessSingleton|SingletonLock/i.test(message)) {
    return `The requested browser profile is already in use and cannot be launched safely: ${sanitizePathForReport(effectiveRun.userDataDir)} / ${effectiveRun.profileDirectory}. Close the other Chromium-compatible browser instance or switch to an attachable browser lane.`;
  }

  if (/Failed to decrypt token/i.test(message)) {
    return `The requested browser profile could not decrypt the existing signed-in token material under ${sanitizePathForReport(effectiveRun.userDataDir)} / ${effectiveRun.profileDirectory}. Prefer an attach-to-existing-browser lane or reseed the profile in a Chromium-compatible browser.`;
  }

  if (/Target page, context or browser has been closed|SIGTRAP/i.test(message)) {
    return `The browser process closed before Prompt Switchboard could inspect the requested live profile (${sanitizePathForReport(effectiveRun.userDataDir)} / ${effectiveRun.profileDirectory}). Prefer the attach helper or a cleaner Chromium-compatible profile source.`;
  }

  return `Prompt Switchboard could not open the requested live profile (${sanitizePathForReport(effectiveRun.userDataDir)} / ${effectiveRun.profileDirectory}): ${message}`;
};

const isRepoOwnedTempClone = (targetPath: string) => {
  const absPath = path.resolve(targetPath);
  return (
    path.basename(absPath).startsWith(REPO_OWNED_LIVE_CLONE_PREFIX) &&
    path.dirname(absPath) === path.resolve(getExternalLiveProfileCloneRoot())
  );
};

const cleanupPersistentClone = (tempRoot: string | null, keepLiveClone: boolean) => {
  if (!tempRoot) {
    return;
  }
  if (keepLiveClone) {
    console.log(
      `[test:live:probe] preserved repo-owned temp clone at ${sanitizePathForReport(tempRoot)} because PROMPT_SWITCHBOARD_KEEP_LIVE_CLONE=1`
    );
    return;
  }
  if (!isRepoOwnedTempClone(tempRoot)) {
    throw new Error(
      `refused to clean unexpected temp clone path: ${sanitizePathForReport(tempRoot)}`
    );
  }
  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log(
    `[test:live:probe] removed repo-owned temp clone: ${sanitizePathForReport(tempRoot)}`
  );
};

const sleepSync = (ms: number) => {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
};

const shouldRetryClone = (error: unknown) => {
  const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
  return typeof code === 'string' && CLONE_RETRY_CODES.has(code);
};

const preparePersistentClone = (config: LiveProbeConfig) => {
  const localStatePath = path.join(config.userDataDir, 'Local State');
  const sourceProfilePath = path.join(config.userDataDir, config.profileDirectory);
  const cloneRoot = ensureDirectory(getExternalLiveProfileCloneRoot());

  for (let attempt = 0; attempt < CLONE_RETRY_ATTEMPTS; attempt += 1) {
    const tempRoot = fs.mkdtempSync(path.join(cloneRoot, REPO_OWNED_LIVE_CLONE_PREFIX));
    try {
      fs.cpSync(localStatePath, path.join(tempRoot, 'Local State'));
      fs.cpSync(sourceProfilePath, path.join(tempRoot, config.profileDirectory), {
        recursive: true,
        force: true,
      });
      return tempRoot;
    } catch (error) {
      cleanupPersistentClone(tempRoot, false);
      if (!shouldRetryClone(error) || attempt === CLONE_RETRY_ATTEMPTS - 1) {
        throw error;
      }
      sleepSync(CLONE_RETRY_DELAY_MS * (attempt + 1));
    }
  }

  throw new Error('failed to prepare persistent live clone');
};

const collectTransientSignals = async (page: Page, waitMs: number) => {
  const consoleMessages: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];

  const onConsole = (message: ConsoleMessage) => {
    if (message.type() === 'error' || message.type() === 'warning') {
      consoleMessages.push(`${message.type()}: ${message.text()}`);
    }
  };
  const onPageError = (error: Error) => {
    pageErrors.push(error.message);
  };
  const onRequestFailed = (request: { url: () => string; failure: () => { errorText?: string } | null }) => {
    requestFailures.push(`${request.url()} :: ${request.failure()?.errorText || 'requestfailed'}`);
  };

  page.on('console', onConsole);
  page.on('pageerror', onPageError);
  page.on('requestfailed', onRequestFailed);
  await page.waitForTimeout(waitMs);
  page.off('console', onConsole);
  page.off('pageerror', onPageError);
  page.off('requestfailed', onRequestFailed);

  return {
    consoleMessages,
    pageErrors,
    requestFailures,
  };
};

const inspectSitePage = async (
  page: Page,
  model: ModelName,
  waitMs: number
): Promise<LiveSiteProbeResult> => {
  const capability = getSiteCapability(model);

  try {
    await page.waitForLoadState('domcontentloaded', { timeout: 10_000 });
  } catch {
    // Best-effort probe for already-open pages.
  }

  const transientSignals = await collectTransientSignals(page, waitMs);
  const snapshot = await page.evaluate(({
    selectorHints,
    responseSelectorHints,
    stopSelectorHints,
    loginSignalSource,
  }) => {
    const loginSignalPattern = new RegExp(loginSignalSource, 'i');
    const loginButtons = Array.from(document.querySelectorAll('a,button'))
      .map((element) => (element.textContent || '').trim())
      .filter((text) => loginSignalPattern.test(text))
      .slice(0, 8);

    return {
      url: location.href,
      title: document.title,
      loginButtons,
      hasPromptSurface: selectorHints.some((selector) => Boolean(document.querySelector(selector))),
      hasResponseSurface: responseSelectorHints.some((selector) => Boolean(document.querySelector(selector))),
      hasStopControl: stopSelectorHints.some((selector) => Boolean(document.querySelector(selector))),
      bodyPreview: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1000),
    };
  }, {
    selectorHints: capability.promptSurfaceSelectors,
    responseSelectorHints: capability.responseSelectors,
    stopSelectorHints: capability.stopSelectors,
    loginSignalSource: capability.loginSignalPatternSource,
  });

  const state = classifyLiveSiteState(snapshot);
  const readinessStatus = toCanonicalReadinessStatus(state);
  const responsePathAdvisory = describeLiveSiteResponsePathAdvisory(model, snapshot);

  return {
    model,
    state,
    readinessStatus,
    nextAction: describeLiveSiteNextAction(model, state),
    completionHeuristic: capability.compareExecution.completionHeuristic,
    responsePathAdvisory: responsePathAdvisory ?? undefined,
    ...snapshot,
    ...transientSignals,
  };
};

const isPlaywrightUtilityWorld = (name: string | undefined) =>
  typeof name === 'string' && name.startsWith('__playwright_utility_world_');

const inspectContentScriptContexts = async (
  context: BrowserContext,
  modelPages: Array<{ model: ModelName; page: Page }>
) => {
  const matches: Array<{ model: ModelName; runtimeId: string; pageUrl: string }> = [];

  for (const { model, page } of modelPages) {
    let session: CDPSession | null = null;
    const contexts: Array<{ id: number; name?: string; auxData?: { type?: string } }> = [];

    try {
      session = await context.newCDPSession(page);
      session.on('Runtime.executionContextCreated', (event: unknown) => {
        const contextPayload =
          event && typeof event === 'object' && 'context' in event
            ? (event as { context: { id: number; name?: string; auxData?: { type?: string } } }).context
            : null;
        if (!contextPayload) {
          return;
        }
        contexts.push(contextPayload);
      });
      await session.send('Runtime.enable');
      await page.waitForTimeout(150);

      const candidateContexts = contexts.filter(
        (entry) => entry.auxData?.type === 'isolated' && !isPlaywrightUtilityWorld(entry.name)
      );

      for (const entry of candidateContexts) {
        try {
          const result = await session.send('Runtime.evaluate', {
            contextId: entry.id,
            expression: `(() => ({
              runtimeId: globalThis.chrome?.runtime?.id ?? null,
              localType: typeof globalThis.chrome?.storage?.local
            }))()`,
            returnByValue: true,
            awaitPromise: true,
          });
          const value =
            result && typeof result === 'object' && 'result' in result
              ? (result as { result?: { value?: { runtimeId?: string | null; localType?: string } } })
                  .result?.value ?? null
              : null;

          if (value && value.runtimeId && value.localType === 'object') {
            matches.push({
              model,
              runtimeId: value.runtimeId,
              pageUrl: page.url(),
            });
          }
        } catch {
          // Ignore evaluation failures for non-extension isolated worlds.
        }
      }
    } catch {
      // Keep the diagnosis path best-effort; missing CDP session evidence should not mask other signals.
    } finally {
      await session?.detach().catch(() => undefined);
    }
  }

  return matches;
};

const inspectExtensionRuntimeEvidence = async (
  context: BrowserContext,
  modelPages: Array<{ model: ModelName; page: Page }>
) => {
  const serviceWorkerUrls = context
    .serviceWorkers()
    .map((worker) => worker.url())
    .filter((url) => url.startsWith('chrome-extension://'));
  const contentScriptContexts = await inspectContentScriptContexts(context, modelPages);
  const detectedRuntimeIds = Array.from(
    new Set(
      [
        ...serviceWorkerUrls.map((url) => {
          try {
            return new URL(url).host;
          } catch {
            return '';
          }
        }),
        ...contentScriptContexts.map((entry) => entry.runtimeId),
      ].filter(Boolean)
    )
  );

  return {
    hasServiceWorker: serviceWorkerUrls.length > 0,
    serviceWorkerUrls,
    hasContentScriptContext: contentScriptContexts.length > 0,
    contentScriptModels: Array.from(new Set(contentScriptContexts.map((entry) => entry.model))),
    detectedRuntimeIds,
  };
};

const findOrOpenModelPage = async (
  context: BrowserContext,
  model: ModelName,
  openMissingTabs: boolean
) => {
  const { hostnames, openUrl } = getModelConfig(model);
  const existingPages = context.pages().filter((page) => {
    try {
      const hostname = new URL(page.url()).hostname;
      return hostnames.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  });

  let existingPage = existingPages[0] ?? null;
  if (existingPages.length > 1) {
    const capability = getSiteCapability(model);
    const scoredPages = await Promise.all(
      existingPages.map(async (page) => {
        try {
          const snapshot = await page.evaluate(
            ({
              selectorHints,
              responseSelectorHints,
              stopSelectorHints,
              loginSignalSource,
            }) => {
              const loginSignalPattern = new RegExp(loginSignalSource, 'i');
              const loginButtons = Array.from(document.querySelectorAll('a,button'))
                .map((element) => (element.textContent || '').trim())
                .filter((text) => loginSignalPattern.test(text))
                .slice(0, 8);

              return {
                loginButtons,
                hasPromptSurface: selectorHints.some((selector) =>
                  Boolean(document.querySelector(selector))
                ),
                hasResponseSurface: responseSelectorHints.some((selector) =>
                  Boolean(document.querySelector(selector))
                ),
                hasStopControl: stopSelectorHints.some((selector) =>
                  Boolean(document.querySelector(selector))
                ),
              };
            },
            {
              selectorHints: capability.promptSurfaceSelectors,
              responseSelectorHints: capability.responseSelectors,
              stopSelectorHints: capability.stopSelectors,
              loginSignalSource: capability.loginSignalPatternSource,
            }
          );
          return {
            page,
            score: scoreLiveSiteCandidateSnapshot(snapshot),
          };
        } catch {
          return {
            page,
            score: Number.NEGATIVE_INFINITY,
          };
        }
      })
    );
    scoredPages.sort((left, right) => right.score - left.score);
    existingPage = scoredPages[0]?.page ?? existingPage;
  }

  if (existingPage || !openMissingTabs) {
    return existingPage ?? null;
  }

  const page = await context.newPage();
  await page.goto(openUrl, { waitUntil: 'domcontentloaded' });
  return page;
};

export const resolvePreferredExtensionId = ({
  resolvedExtensionId,
  detectedRuntimeIds,
}: {
  resolvedExtensionId: string | null;
  detectedRuntimeIds: string[];
}) => {
  if (detectedRuntimeIds.length === 0) {
    return resolvedExtensionId;
  }

  if (resolvedExtensionId && detectedRuntimeIds.includes(resolvedExtensionId)) {
    return resolvedExtensionId;
  }

  return detectedRuntimeIds[0];
};

const inspectExtensionSurface = async (
  context: BrowserContext,
  extensionId: string | null,
  effectiveRun: LiveProbeEffectiveRun,
  runtimeEvidence: NonNullable<LiveExtensionProbeResult['runtimeEvidence']>
): Promise<LiveExtensionProbeResult | null> => {
  if (!extensionId) {
    if (!runtimeEvidence.hasServiceWorker && !runtimeEvidence.hasContentScriptContext) {
      return {
        available: false,
        inspectionMode: 'cdp_existing_target',
        runtimeEvidence,
        state: 'idle_or_unknown',
        url: '',
        hasCompareCard: false,
        hasCompletedCard: false,
        hasCheckingIndicator: false,
        bodyPreview: '',
        errorMessage:
          'Prompt Switchboard did not expose a live extension runtime in the current browser lane. No extension service worker was detected and none of the probed model tabs exposed a Prompt Switchboard content-script context.',
      };
    }
    return null;
  }

  let extensionPage = context
    .pages()
    .find((page) => page.url().startsWith(`chrome-extension://${extensionId}/`));
  const extensionUrl = `chrome-extension://${extensionId}/settings.html`;
  if (!runtimeEvidence.hasServiceWorker && !runtimeEvidence.hasContentScriptContext) {
    return {
      available: false,
      extensionId,
      inspectionMode: 'cdp_existing_target',
      runtimeEvidence,
      state: 'idle_or_unknown',
      url: extensionUrl,
      hasCompareCard: false,
      hasCompletedCard: false,
      hasCheckingIndicator: false,
      bodyPreview: '',
      errorMessage:
        'Prompt Switchboard did not expose a live extension runtime in the current browser lane. No extension service worker was detected and none of the probed model tabs exposed a Prompt Switchboard content-script context. Any extension page targets in this lane should be treated as blocked shells, not proof that the extension is active.',
    };
  }

  if (!extensionPage && effectiveRun.attachModeResolved === 'browser' && effectiveRun.cdpUrl) {
    try {
      return await withExistingExtensionTarget(effectiveRun.cdpUrl, extensionId, async (client) => {
        const snapshot = await client.evaluate<{
          url: string;
          bodyPreview: string;
          hasCompareCard: boolean;
          hasCompletedCard: boolean;
          hasCheckingIndicator: boolean;
        }>(`(() => {
          const bodyText = (document.body?.innerText || '').replace(/\\s+/g, ' ').slice(0, 1200);
          return {
            url: location.href,
            bodyPreview: bodyText,
            hasCompareCard: Boolean(document.querySelector('[data-testid^="compare-card-"]')),
            hasCompletedCard: bodyText.includes('Complete'),
            hasCheckingIndicator: /CHECKING|Checking/i.test(bodyText),
          };
        })()`);

        return {
          available: true,
          extensionId,
          inspectionMode: 'cdp_existing_target',
          runtimeEvidence,
          state: classifyLiveExtensionState(snapshot),
          ...snapshot,
        };
      });
    } catch (error) {
      return {
        available: false,
        extensionId,
        inspectionMode: 'cdp_existing_target',
        runtimeEvidence,
        state: 'idle_or_unknown',
        url: extensionUrl,
        hasCompareCard: false,
        hasCompletedCard: false,
        hasCheckingIndicator: false,
        bodyPreview: '',
        errorMessage: classifyExtensionSurfaceProbeFailure(error),
      };
    }
  }

  if (!extensionPage) {
    try {
      extensionPage = await context.newPage();
      await extensionPage.goto(extensionUrl);
    } catch (error) {
      await extensionPage?.close().catch(() => undefined);
      return {
        available: false,
        extensionId,
        runtimeEvidence,
        state: 'idle_or_unknown',
        url: extensionUrl,
        hasCompareCard: false,
        hasCompletedCard: false,
        hasCheckingIndicator: false,
        bodyPreview: '',
        errorMessage: classifyExtensionSurfaceProbeFailure(error),
      };
    }
  }

  try {
    await extensionPage.waitForLoadState('domcontentloaded');
    const snapshot = await extensionPage.evaluate(() => {
      const bodyText = (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 1200);
      return {
        url: location.href,
        bodyPreview: bodyText,
        hasCompareCard: Boolean(document.querySelector('[data-testid^="compare-card-"]')),
        hasCompletedCard: bodyText.includes('Complete'),
        hasCheckingIndicator: /CHECKING|Checking/i.test(bodyText),
      };
    });

    return {
      available: true,
      extensionId,
      inspectionMode: 'playwright',
      runtimeEvidence,
      state: classifyLiveExtensionState(snapshot),
      ...snapshot,
    };
  } catch (error) {
    return {
      available: false,
      extensionId,
      inspectionMode: 'playwright',
      runtimeEvidence,
      state: 'idle_or_unknown',
      url: extensionUrl,
      hasCompareCard: false,
      hasCompletedCard: false,
      hasCheckingIndicator: false,
      bodyPreview: '',
      errorMessage: classifyExtensionSurfaceProbeFailure(error),
    };
  }
};

export const withLiveProbeContext = async <T>(
  config: LiveProbeConfig,
  fn: (
    context: BrowserContext,
    effectiveRun: LiveProbeEffectiveRun,
    browser: Browser | null
  ) => Promise<T>
) => {
  pruneExternalRepoCache();
  const { blockers, effectiveRun } = await resolveLiveProbeBlockers(config);
  const attachConnectTimeoutMs = Number(
    process.env.PROMPT_SWITCHBOARD_LIVE_ATTACH_CONNECT_TIMEOUT_MS || DEFAULT_ATTACH_CONNECT_TIMEOUT_MS
  );
  if (blockers.length > 0) {
    return {
      blockers,
      effectiveRun,
      result: null as T | null,
    };
  }

  let browser: Browser | null = null;
  let context: BrowserContext | null = null;
  let tempRoot: string | null = null;
  const launchUserDataDir =
    effectiveRun.attachModeResolved === 'persistent' && config.cloneProfile
      ? (tempRoot = preparePersistentClone(config))
      : config.userDataDir;

  try {
    browser =
      effectiveRun.attachModeResolved === 'browser'
        ? await chromium.connectOverCDP(effectiveRun.cdpUrl!, { timeout: attachConnectTimeoutMs })
        : null;

    context =
      browser?.contexts()[0] ??
      (await chromium.launchPersistentContext(launchUserDataDir, {
        headless: false,
        executablePath: config.browserExecutablePath,
        channel: effectiveRun.browserChannel,
        args: [
          `--disable-extensions-except=${config.extensionPath}`,
          `--load-extension=${config.extensionPath}`,
          ...(config.profileDirectory ? [`--profile-directory=${config.profileDirectory}`] : []),
        ],
      }));
  } catch (error) {
    return {
      blockers: [...blockers, classifyProbeLaunchFailure(error, effectiveRun)],
      effectiveRun,
      result: null as T | null,
    };
  }

  try {
    const result = await fn(context, effectiveRun, browser);
    return {
      blockers,
      effectiveRun,
      result,
    };
  } finally {
    if (effectiveRun.attachModeResolved === 'persistent') {
      await context?.close();
      cleanupPersistentClone(tempRoot, config.keepLiveClone);
    }
  }
};

export const collectLiveProbe = async (
  config = resolveLiveProbeConfig()
): Promise<LiveProbeResult> => {
  const { blockers, effectiveRun, result } = await withLiveProbeContext(
    config,
    async (context, run) => {
      const modelPages = await Promise.all(
        run.targetModels.map(async (model) => ({
          model,
          page: await findOrOpenModelPage(context, model, config.openMissingTabs),
        }))
      );
      const models = await Promise.all(
        modelPages.map(async ({ model, page }) => {
          if (!page) {
            const state = classifyLiveSiteState({});
            const capability = getSiteCapability(model);
            return {
              model,
              state,
              readinessStatus: toCanonicalReadinessStatus(state),
              nextAction: describeLiveSiteNextAction(model, state),
              url: '',
              title: '',
              hasPromptSurface: false,
              hasResponseSurface: false,
              hasStopControl: false,
              completionHeuristic: capability.compareExecution.completionHeuristic,
              loginButtons: [],
              bodyPreview: '',
              responsePathAdvisory: undefined,
              consoleMessages: [],
              pageErrors: [],
              requestFailures: [],
            } satisfies LiveSiteProbeResult;
          }

          return inspectSitePage(page, model, config.probeWaitMs);
        })
      );

      const runtimeEvidence = await inspectExtensionRuntimeEvidence(
        context,
        modelPages.filter((entry): entry is { model: ModelName; page: Page } => Boolean(entry.page))
      );
      const resolvedExtensionId = await resolveExtensionId(context, run.attachModeResolved);
      const extensionId = resolvePreferredExtensionId({
        resolvedExtensionId,
        detectedRuntimeIds: runtimeEvidence.detectedRuntimeIds,
      });
      const extension = await inspectExtensionSurface(context, extensionId, run, runtimeEvidence);
      return { models, extension };
    }
  );

  return {
    mode: 'prompt_switchboard_live_site_probe',
    generatedAt: new Date().toISOString(),
    readyToProbe: blockers.length === 0,
    blockers,
    effectiveRun,
    models: result?.models ?? [],
    extension: result?.extension ?? null,
  };
};

export const buildLiveDiagnosis = (probe: LiveProbeResult): LiveDiagnosisResult => {
  const blockers: LiveDiagnosisResult['blockers'] = [];
  const nextActions = new Set<string>();
  const extensionRuntimeBlocked = probe.extension
    ? hasLiveRuntimeEvidenceGap(probe.extension) ||
      (!probe.extension.runtimeEvidence &&
        probe.extension.available === false &&
        typeof probe.extension.errorMessage === 'string' &&
        (probe.extension.errorMessage.includes('none exposed a real extension runtime context') ||
          probe.extension.errorMessage.includes('did not expose a live extension runtime')))
    : false;

  for (const site of probe.models) {
    if (site.state === 'site_ready_for_compare') {
      continue;
    }
    blockers.push({
      surface: 'site',
      kind: site.state,
      model: site.model,
      readinessStatus: site.readinessStatus,
      message: `${site.model} is ${site.state}. ${site.nextAction}`,
    });
    nextActions.add(site.nextAction);
  }

  if (probe.extension?.state === 'compare_started_but_no_card') {
    blockers.push({
      surface: 'extension',
      kind: probe.extension.state,
      message:
        'The extension surface shows compare activity but no compare card yet. Capture a support bundle before retrying.',
    });
    nextActions.add('Run npm run test:live:support-bundle before retrying compare.');
  }

  if (probe.extension?.state === 'compare_card_created_but_no_completion') {
    blockers.push({
      surface: 'extension',
      kind: probe.extension.state,
      message:
        'The extension surface already has compare cards, but none reached Complete yet.',
    });
    nextActions.add(
      'Capture a support bundle and inspect the current compare card states before retrying.'
    );
  }

  if (probe.extension && !probe.extension.available && probe.extension.errorMessage) {
    blockers.push({
      surface: 'probe',
      kind: 'probe_blocker',
      message: probe.extension.errorMessage,
    });
    if (extensionRuntimeBlocked) {
      nextActions.add(
        'Treat the current browser lane as extension-runtime-blocked. Rebuilding or replacing the repo-owned browser lane is more truthful than repeatedly reopening Chrome menus in the same lane.'
      );
    } else {
      nextActions.add(
        'Keep the current attach browser open, reopen the Prompt Switchboard side panel or extension page manually if needed, then rerun the live probe.'
      );
    }
  }

  return {
    mode: 'prompt_switchboard_live_diagnose',
    generatedAt: new Date().toISOString(),
    status: blockers.length === 0 ? 'ready_for_compare' : 'blocked',
    blockers,
    nextActions: Array.from(nextActions),
    effectiveRun: probe.effectiveRun,
  };
};
