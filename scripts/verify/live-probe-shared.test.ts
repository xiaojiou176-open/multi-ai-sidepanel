import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  buildLiveDiagnosis,
  classifyExtensionSurfaceProbeFailure,
  resolveLiveProbeConfig,
  type LiveProbeResult,
} from './live-probe-shared';

const tempRoots = new Set<string>();

const makeTempRoot = () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-switchboard-live-probe-test-'));
  tempRoots.add(tempRoot);
  return tempRoot;
};

afterEach(() => {
  for (const tempRoot of tempRoots) {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
  tempRoots.clear();
  delete process.env.PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR;
  delete process.env.PROMPT_SWITCHBOARD_BROWSER_PROFILE_NAME;
  delete process.env.PROMPT_SWITCHBOARD_BROWSER_PROFILE_DIRECTORY;
});

describe('live-probe-shared', () => {
  it('classifies ERR_BLOCKED_BY_CLIENT as an extension probe blocker', () => {
    expect(
      classifyExtensionSurfaceProbeFailure(
        new Error('page.goto: net::ERR_BLOCKED_BY_CLIENT at chrome-extension://abc/index.html')
      )
    ).toContain('ERR_BLOCKED_BY_CLIENT');
  });

  it('classifies closed extension targets as a recoverable probe blocker', () => {
    expect(
      classifyExtensionSurfaceProbeFailure(
        new Error('page.evaluate: Target page, context or browser has been closed')
      )
    ).toContain('closed before Prompt Switchboard could finish the live probe');
  });

  it('surfaces unavailable extension inspection as a probe blocker without hiding site readiness', () => {
    const probe: LiveProbeResult = {
      mode: 'prompt_switchboard_live_site_probe',
      generatedAt: new Date().toISOString(),
      readyToProbe: true,
      blockers: [],
      effectiveRun: {
        attachModeRequested: 'browser',
        attachModeResolved: 'browser',
        browserChannel: 'chromium',
        cdpUrl: 'http://127.0.0.1:9336',
        userDataDir: '/tmp/profile',
        profileDirectory: 'Profile 23',
        profileName: 'multi-ai-sidepanel',
        profileResolutionSource: 'browser_profile_directory',
        extensionPath: '/tmp/dist',
        targetModels: ['ChatGPT'],
      },
      models: [
        {
          model: 'ChatGPT',
          state: 'site_ready_for_compare',
          readinessStatus: 'ready',
          nextAction: 'ChatGPT looks ready for compare.',
          url: 'https://chatgpt.com/',
          title: 'ChatGPT',
          hasPromptSurface: true,
          hasResponseSurface: false,
          hasStopControl: false,
          completionHeuristic: 'stop_button_absent_or_hidden',
          loginButtons: [],
          bodyPreview: 'Chat workspace ready',
          responsePathAdvisory:
            'ChatGPT exposes a prompt surface, but no response container is visible yet. Treat this as response-path evidence only until compare starts.',
          consoleMessages: [],
          pageErrors: [],
          requestFailures: [],
        },
      ],
      extension: {
        available: false,
        state: 'idle_or_unknown',
        url: 'chrome-extension://abc/index.html',
        hasCompareCard: false,
        hasCompletedCard: false,
        hasCheckingIndicator: false,
        bodyPreview: '',
        errorMessage:
          'Chrome blocked direct navigation to the extension page in attach mode (ERR_BLOCKED_BY_CLIENT).',
      },
    };

    const diagnosis = buildLiveDiagnosis(probe);

    expect(diagnosis.status).toBe('blocked');
    expect(diagnosis.blockers).toContainEqual({
      surface: 'probe',
      kind: 'probe_blocker',
      message:
        'Chrome blocked direct navigation to the extension page in attach mode (ERR_BLOCKED_BY_CLIENT).',
    });
    expect(diagnosis.nextActions).toContain(
      'Keep the current attach browser open, reopen the Prompt Switchboard side panel or extension page manually if needed, then rerun the live probe.'
    );
  });

  it('stops recommending menu-click retries when the lane only exposes blocked extension shells', () => {
    const probe: LiveProbeResult = {
      mode: 'prompt_switchboard_live_site_probe',
      generatedAt: new Date().toISOString(),
      readyToProbe: true,
      blockers: [],
      effectiveRun: {
        attachModeRequested: 'browser',
        attachModeResolved: 'browser',
        browserChannel: 'chromium',
        cdpUrl: 'http://127.0.0.1:9444',
        userDataDir: '/tmp/fresh-lane',
        profileDirectory: 'Default',
        profileName: 'Default',
        profileResolutionSource: 'browser_profile_directory',
        extensionPath: '/tmp/dist',
        targetModels: ['ChatGPT'],
      },
      models: [
        {
          model: 'ChatGPT',
          state: 'site_ready_for_compare',
          readinessStatus: 'ready',
          nextAction: 'ChatGPT looks ready for compare.',
          url: 'https://chatgpt.com/',
          title: 'ChatGPT',
          hasPromptSurface: true,
          hasResponseSurface: false,
          hasStopControl: false,
          completionHeuristic: 'stop_button_absent_or_hidden',
          loginButtons: [],
          bodyPreview: 'Chat workspace ready',
          responsePathAdvisory:
            'ChatGPT exposes a prompt surface, but no response container is visible yet. Treat this as response-path evidence only until compare starts.',
          consoleMessages: [],
          pageErrors: [],
          requestFailures: [],
        },
      ],
      extension: {
        available: false,
        state: 'idle_or_unknown',
        url: 'chrome-extension://abc/settings.html',
        hasCompareCard: false,
        hasCompletedCard: false,
        hasCheckingIndicator: false,
        bodyPreview: '',
        errorMessage:
          'Prompt Switchboard found extension page targets on http://127.0.0.1:9444, but none exposed a real extension runtime context. This usually means Chrome replaced direct extension-tab navigation with a blocked chrome-error page instead of a live side-panel/options surface.',
      },
    };

    const diagnosis = buildLiveDiagnosis(probe);

    expect(diagnosis.nextActions).toContain(
      'Treat the current browser lane as extension-runtime-blocked. Rebuilding or replacing the repo-owned browser lane is more truthful than repeatedly reopening Chrome menus in the same lane.'
    );
    expect(diagnosis.nextActions).not.toContain(
      'Keep the current attach browser open, reopen the Prompt Switchboard side panel or extension page manually if needed, then rerun the live probe.'
    );
  });

  it('treats missing worker and missing content-script runtime as a lane blocker before page-shell retries', () => {
    const probe: LiveProbeResult = {
      mode: 'prompt_switchboard_live_site_probe',
      generatedAt: new Date().toISOString(),
      readyToProbe: true,
      blockers: [],
      effectiveRun: {
        attachModeRequested: 'browser',
        attachModeResolved: 'browser',
        browserChannel: 'chromium',
        cdpUrl: 'http://127.0.0.1:9336',
        userDataDir: '/tmp/profile',
        profileDirectory: 'Profile 1',
        profileName: 'multi-ai-sidepanel',
        profileResolutionSource: 'browser_profile_directory',
        extensionPath: '/tmp/dist',
        targetModels: ['ChatGPT'],
      },
      models: [
        {
          model: 'ChatGPT',
          state: 'site_ready_for_compare',
          readinessStatus: 'ready',
          nextAction: 'ChatGPT looks ready for compare.',
          url: 'https://chatgpt.com/',
          title: 'ChatGPT',
          hasPromptSurface: true,
          hasResponseSurface: false,
          hasStopControl: false,
          completionHeuristic: 'stop_button_absent_or_hidden',
          loginButtons: [],
          bodyPreview: 'Chat workspace ready',
          responsePathAdvisory:
            'ChatGPT exposes a prompt surface, but no response container is visible yet. Treat this as response-path evidence only until compare starts.',
          consoleMessages: [],
          pageErrors: [],
          requestFailures: [],
        },
      ],
      extension: {
        available: false,
        extensionId: 'abc',
        runtimeEvidence: {
          hasServiceWorker: false,
          serviceWorkerUrls: [],
          hasContentScriptContext: false,
          contentScriptModels: [],
          detectedRuntimeIds: [],
        },
        state: 'idle_or_unknown',
        url: 'chrome-extension://abc/settings.html',
        hasCompareCard: false,
        hasCompletedCard: false,
        hasCheckingIndicator: false,
        bodyPreview: '',
        errorMessage:
          'Prompt Switchboard did not expose a live extension runtime in the current browser lane. No extension service worker was detected and none of the probed model tabs exposed a Prompt Switchboard content-script context.',
      },
    };

    const diagnosis = buildLiveDiagnosis(probe);

    expect(diagnosis.status).toBe('blocked');
    expect(diagnosis.nextActions).toContain(
      'Treat the current browser lane as extension-runtime-blocked. Rebuilding or replacing the repo-owned browser lane is more truthful than repeatedly reopening Chrome menus in the same lane.'
    );
  });

  it('does not mark the lane as runtime-blocked once a content-script context is present', () => {
    const probe: LiveProbeResult = {
      mode: 'prompt_switchboard_live_site_probe',
      generatedAt: new Date().toISOString(),
      readyToProbe: true,
      blockers: [],
      effectiveRun: {
        attachModeRequested: 'browser',
        attachModeResolved: 'browser',
        browserChannel: 'chromium',
        cdpUrl: 'http://127.0.0.1:9777',
        userDataDir: '/tmp/cft-auto',
        profileDirectory: 'Default',
        profileName: 'Default',
        profileResolutionSource: 'browser_profile_directory',
        extensionPath: '/tmp/dist',
        targetModels: ['ChatGPT'],
      },
      models: [
        {
          model: 'ChatGPT',
          state: 'site_login_gated',
          readinessStatus: 'selector_drift_suspect',
          nextAction: 'Log in to ChatGPT inside the active browser/profile, then rerun the live probe.',
          url: 'https://chatgpt.com/',
          title: 'ChatGPT',
          hasPromptSurface: true,
          hasResponseSurface: false,
          hasStopControl: false,
          completionHeuristic: 'stop_button_absent_or_hidden',
          responsePathAdvisory:
            'ChatGPT exposes a prompt surface, but no response container is visible yet. Treat this as response-path evidence only until compare starts.',
          loginButtons: ['登录'],
          bodyPreview: 'ChatGPT login page',
          consoleMessages: [],
          pageErrors: [],
          requestFailures: [],
        },
      ],
      extension: {
        available: false,
        extensionId: 'abc',
        inspectionMode: 'cdp_existing_target',
        runtimeEvidence: {
          hasServiceWorker: false,
          serviceWorkerUrls: [],
          hasContentScriptContext: true,
          contentScriptModels: ['ChatGPT'],
          detectedRuntimeIds: ['abc'],
        },
        state: 'idle_or_unknown',
        url: 'chrome-extension://abc/settings.html',
        hasCompareCard: false,
        hasCompletedCard: false,
        hasCheckingIndicator: false,
        bodyPreview: '',
        errorMessage:
          'Prompt Switchboard found extension page targets on http://127.0.0.1:9777, but none exposed a real extension runtime context.',
      },
    };

    const diagnosis = buildLiveDiagnosis(probe);

    expect(diagnosis.nextActions).not.toContain(
      'Treat the current browser lane as extension-runtime-blocked. Rebuilding or replacing the repo-owned browser lane is more truthful than repeatedly reopening Chrome menus in the same lane.'
    );
    expect(diagnosis.nextActions).toContain(
      'Log in to ChatGPT inside the active browser/profile, then rerun the live probe.'
    );
  });

  it('does not default live probe config to a shared Chromium Default profile when browser profile env is missing', () => {
    process.env.PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR = makeTempRoot();

    const config = resolveLiveProbeConfig();

    expect(config.profileDirectory).toBe('');
    expect(config.profileBlockers).toContain(
      `Persistent browser Local State is missing at: ${path.join(
        process.env.PROMPT_SWITCHBOARD_BROWSER_USER_DATA_DIR!,
        'Local State'
      )}. Run npm run test:live:bootstrap-profile first.`
    );
  });

  it('defaults the live probe target models to the canonical ChatGPT lane', () => {
    const config = resolveLiveProbeConfig();

    expect(config.targetModels).toEqual(['ChatGPT']);
  });

  it('keeps canonical readiness alongside raw live site state', () => {
    const probe: LiveProbeResult = {
      mode: 'prompt_switchboard_live_site_probe',
      generatedAt: new Date().toISOString(),
      readyToProbe: true,
      blockers: [],
      effectiveRun: {
        attachModeRequested: 'browser',
        attachModeResolved: 'browser',
        browserChannel: 'chromium',
        cdpUrl: 'http://127.0.0.1:9336',
        userDataDir: '/tmp/profile',
        profileDirectory: 'Profile 23',
        profileName: 'multi-ai-sidepanel',
        profileResolutionSource: 'browser_profile_directory',
        extensionPath: '/tmp/dist',
        targetModels: ['ChatGPT'],
      },
      models: [
        {
          model: 'ChatGPT',
          state: 'site_login_gated',
          readinessStatus: 'selector_drift_suspect',
          nextAction: 'Log in to ChatGPT inside the active browser/profile, then rerun the live probe.',
          url: 'https://chatgpt.com/',
          title: 'ChatGPT',
          hasPromptSurface: false,
          hasResponseSurface: false,
          hasStopControl: false,
          completionHeuristic: 'stop_button_absent_or_hidden',
          responsePathAdvisory: undefined,
          loginButtons: ['Log in'],
          bodyPreview: 'Log in to continue',
          consoleMessages: [],
          pageErrors: [],
          requestFailures: [],
        },
      ],
      extension: null,
    };

    const diagnosis = buildLiveDiagnosis(probe);

    expect(diagnosis.blockers).toContainEqual({
      surface: 'site',
      kind: 'site_login_gated',
      model: 'ChatGPT',
      readinessStatus: 'selector_drift_suspect',
      message:
        'ChatGPT is site_login_gated. Log in to ChatGPT inside the active browser/profile, then rerun the live probe.',
    });
  });
});
