import { describe, expect, it } from 'vitest';
import {
  buildExtensionRuntimeSummaryLines,
  collectLivePreflightBlockers,
  hasLiveRuntimeEvidenceGap,
} from './live-runtime-gates.mjs';

describe('live-runtime-gates', () => {
  it('detects a lane-level runtime gap when both worker and content-script are missing', () => {
    expect(
      hasLiveRuntimeEvidenceGap({
        available: false,
        runtimeEvidence: {
          hasServiceWorker: false,
          serviceWorkerUrls: [],
          hasContentScriptContext: false,
          contentScriptModels: [],
          detectedRuntimeIds: [],
        },
      })
    ).toBe(true);
  });

  it('collects both site login blockers and runtime blockers before compare execution', () => {
    const blockers = collectLivePreflightBlockers({
      diagnosisEnvelope: {
        probe: {
          extension: {
            available: false,
            runtimeEvidence: {
              hasServiceWorker: false,
              serviceWorkerUrls: [],
              hasContentScriptContext: false,
              contentScriptModels: [],
              detectedRuntimeIds: [],
            },
          },
        },
        diagnosis: {
          blockers: [
            {
              surface: 'site',
              kind: 'site_login_gated',
              model: 'ChatGPT',
              readinessStatus: 'selector_drift_suspect',
              message: 'ChatGPT is site_login_gated. Log in first.',
            },
            {
              surface: 'probe',
              kind: 'probe_blocker',
              message:
                'Prompt Switchboard did not expose a live extension runtime in the current browser lane.',
            },
          ],
        },
      },
      preflightBlockerKinds: new Set(['site_login_gated']),
    });

    expect(blockers).toEqual([
      {
        surface: 'site',
        kind: 'site_login_gated',
        model: 'ChatGPT',
        readinessStatus: 'selector_drift_suspect',
        message: 'ChatGPT is site_login_gated. Log in first.',
      },
      {
        surface: 'probe',
        kind: 'probe_blocker',
        message:
          'Prompt Switchboard did not expose a live extension runtime in the current browser lane.',
      },
    ]);
  });

  it('renders runtime evidence lines for support bundles', () => {
    const lines = buildExtensionRuntimeSummaryLines({
      available: false,
      inspectionMode: 'cdp_existing_target',
      state: 'idle_or_unknown',
      url: 'chrome-extension://abc/settings.html',
      runtimeEvidence: {
        hasServiceWorker: false,
        serviceWorkerUrls: [],
        hasContentScriptContext: true,
        contentScriptModels: ['ChatGPT'],
        detectedRuntimeIds: ['abc'],
      },
      errorMessage: 'Synthetic runtime blocker.',
    });

    expect(lines).toContain(
      '- contentScriptContext: detected (ChatGPT)'
    );
    expect(lines).toContain('- runtimeIds: abc');
    expect(lines).toContain('- runtimeNote: Synthetic runtime blocker.');
  });
});
