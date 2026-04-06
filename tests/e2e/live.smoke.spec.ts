import { test, expect, type BrowserContext } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { getModelConfig } from '../../src/utils/modelConfig';
import { withExistingExtensionTarget } from '../../scripts/verify/live-extension-target';
import {
  resolvePreferredExtensionId,
  resolveLiveProbeConfig,
  scoreLiveSiteCandidateSnapshot,
  withLiveProbeContext,
} from '../../scripts/verify/live-probe-shared';
import { resolveBrowserProfile } from '../../scripts/shared/runtime-governance.mjs';
import { getSiteCapability } from '../../src/utils/siteCapabilityMatrix';

const LIVE_FLAG = process.env.PROMPT_SWITCHBOARD_LIVE === '1';
const browserProfile = resolveBrowserProfile();
const ATTACH_MODE = process.env.PROMPT_SWITCHBOARD_LIVE_ATTACH_MODE || 'browser';
const EXTENSION_ID_CACHE_PATH = path.resolve(
  process.cwd(),
  '.runtime-cache',
  'live-extension-id.txt'
);

const TARGET_MODELS = (
  process.env.PROMPT_SWITCHBOARD_LIVE_MODELS || 'ChatGPT'
)
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);
const ALLOWED_FAILURES = new Set(
  (process.env.PROMPT_SWITCHBOARD_EXPECT_FAILURES || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
);
const PROMPT =
  process.env.PROMPT_SWITCHBOARD_LIVE_PROMPT ||
  'Summarize the value of deterministic testing in one sentence.';
const TERMINAL_TIMEOUT_MS = Number(process.env.PROMPT_SWITCHBOARD_LIVE_TIMEOUT_MS || '90000');
const CHATGPT_HOSTNAMES = getModelConfig('ChatGPT').hostnames;

const inspectChatGptSessionState = async (context: BrowserContext) => {
  const chatGptPages = context.pages().filter((page) => {
    try {
      const hostname = new URL(page.url()).hostname;
      return CHATGPT_HOSTNAMES.some((host) => hostname === host || hostname.endsWith(`.${host}`));
    } catch {
      return false;
    }
  });

  let chatGptPage = chatGptPages[0];
  if (chatGptPages.length > 1) {
    const capability = getSiteCapability('ChatGPT');
    const scoredPages = await Promise.all(
      chatGptPages.map(async (page) => {
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
      })
    );

    scoredPages.sort((left, right) => right.score - left.score);
    chatGptPage = scoredPages[0]?.page ?? chatGptPage;
  }

  if (!chatGptPage) {
    return {
      url: '',
      hasPrompt: false,
      loginButtons: [] as string[],
      bodyPreview: '',
    };
  }

  return await chatGptPage.evaluate(() => ({
    url: location.href,
    hasPrompt: Boolean(document.querySelector('#prompt-textarea')),
    loginButtons: Array.from(document.querySelectorAll('a,button'))
      .map((element) => (element.textContent || '').trim())
      .filter((text) => /登录|Log in|Sign in|Sign up|注册/.test(text))
      .slice(0, 8),
    bodyPreview: (document.body?.innerText || '').replace(/\s+/g, ' ').slice(0, 600),
  }));
};

const ensureModelTabsOpen = async (context: BrowserContext, models: string[]) => {
  for (const model of models) {
    const { openUrl, hostnames } = getModelConfig(model as Parameters<typeof getModelConfig>[0]);
    const existingPage = context.pages().find((page) => {
      try {
        const hostname = new URL(page.url()).hostname;
        return hostnames.some((host) => hostname === host || hostname.endsWith(`.${host}`));
      } catch {
        return false;
      }
    });

    if (existingPage) {
      continue;
    }

    const page = await context.newPage();
    await page.goto(openUrl, { waitUntil: 'domcontentloaded' });
  }
};

const readCachedExtensionId = () => {
  if (!fs.existsSync(EXTENSION_ID_CACHE_PATH)) {
    return null;
  }

  const value = fs.readFileSync(EXTENSION_ID_CACHE_PATH, 'utf8').trim();
  return value.length > 0 ? value : null;
};

const persistExtensionId = (extensionId: string) => {
  fs.mkdirSync(path.dirname(EXTENSION_ID_CACHE_PATH), { recursive: true });
  fs.writeFileSync(EXTENSION_ID_CACHE_PATH, extensionId, 'utf8');
};

const resolveExtensionId = async (context: BrowserContext) => {
  const currentWorker = context
    .serviceWorkers()
    .find((worker) => worker.url().startsWith('chrome-extension://'));
  if (currentWorker) {
    return new URL(currentWorker.url()).host;
  }

  const existingExtensionPages = context
    .pages()
    .filter((page) => page.url().startsWith('chrome-extension://'));
  if (existingExtensionPages.length > 0) {
    const scoredPages = await Promise.all(
      existingExtensionPages.map(async (page) => {
        try {
          const snapshot = await page.evaluate(() => ({
            runtimeId: chrome?.runtime?.id ?? null,
            localType: typeof chrome?.storage?.local,
          }));
          return {
            runtimeId: snapshot.runtimeId,
            localType: snapshot.localType,
          };
        } catch {
          return {
            runtimeId: null,
            localType: 'undefined',
          };
        }
      })
    );

    const livePage = scoredPages.find(
      (entry) => typeof entry.runtimeId === 'string' && entry.localType === 'object'
    );
    if (livePage?.runtimeId) {
      return livePage.runtimeId;
    }

    const detectedRuntimeIds = existingExtensionPages
      .map((page) => {
        try {
          return new URL(page.url()).host;
        } catch {
          return '';
        }
      })
      .filter(Boolean);
    const cachedExtensionId = readCachedExtensionId();
    const preferredRuntimeId = resolvePreferredExtensionId({
      resolvedExtensionId: cachedExtensionId,
      detectedRuntimeIds,
    });
    if (preferredRuntimeId) {
      return preferredRuntimeId;
    }
  }

  const cachedExtensionId = readCachedExtensionId();
  if (cachedExtensionId) {
    return cachedExtensionId;
  }

  let extensionWorker;
  try {
    extensionWorker = await context.waitForEvent('serviceworker', {
      predicate: (worker) => worker.url().startsWith('chrome-extension://'),
      timeout: 30_000,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Prompt Switchboard could not detect its extension worker in the current live browser lane. This usually means the extension never surfaced in that browser/profile, or the browser exited before the extension finished loading. ${message}`
    );
  }
  return resolvePreferredExtensionId({
    resolvedExtensionId: new URL(extensionWorker.url()).host,
    detectedRuntimeIds: [],
  });
};

const buildExecuteSubstrateActionExpression = (action: string, args: Record<string, unknown>) =>
  `(() => chrome.runtime.sendMessage({
    type: 'EXECUTE_SUBSTRATE_ACTION',
    payload: {
      action: ${JSON.stringify(action)},
      args: ${JSON.stringify(args)}
    }
  }))()`;

const buildCheckReadinessExpression = (models: string[]) =>
  `(() => chrome.runtime.sendMessage({
    type: 'CHECK_MODELS_READY',
    payload: { models: ${JSON.stringify(models)} }
  }))()`;

const buildGetSessionExpression = (sessionId: string) =>
  buildExecuteSubstrateActionExpression('get_session', { includeMessages: true, sessionId });

const buildEnsureReadyModelTabExpression = (
  model: string,
  openUrl: string,
  hostnames: string[]
) => `(
  async () => {
    const matchesModelHost = (url) => {
      try {
        const hostname = new URL(url || '').hostname;
        return ${JSON.stringify(hostnames)}.some((host) => hostname === host || hostname.endsWith('.' + host));
      } catch {
        return false;
      }
    };

    const pingTab = async (tabId) => {
      try {
        const response = await chrome.tabs.sendMessage(tabId, {
          type: 'PING',
          payload: { expectedModel: ${JSON.stringify(model)} },
        });
        return {
          ok: response?.type === 'PONG' && response?.payload?.ready === true,
          response,
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    };

    const collectCandidates = async () => {
      const tabs = await chrome.tabs.query({});
      return tabs.filter((tab) => matchesModelHost(tab.url));
    };

    const existingTabs = await collectCandidates();
    for (const tab of existingTabs) {
      if (typeof tab.id !== 'number') continue;
      const ping = await pingTab(tab.id);
      if (ping.ok) {
        return { created: false, readyTabId: tab.id, ping };
      }
    }

    const created = await chrome.tabs.create({ url: ${JSON.stringify(openUrl)}, active: false });
    const startedAt = Date.now();
    while (Date.now() - startedAt < 15000) {
      if (typeof created.id === 'number') {
        const ping = await pingTab(created.id);
        if (ping.ok) {
          return { created: true, readyTabId: created.id, ping };
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    return {
      created: true,
      readyTabId: null,
      existingTabIds: existingTabs.map((tab) => tab.id).filter(Boolean),
    };
  }
)()`;

const unwrapSubstrateResult = <T>(payload: { ok?: boolean; result?: T } | T | null | undefined): T | null => {
  if (!payload || typeof payload !== 'object') {
    return (payload as T | null | undefined) ?? null;
  }

  if ('result' in payload) {
    return ((payload as { result?: T }).result ?? null) as T | null;
  }

  return payload as T;
};

test.describe('live smoke', () => {
  test.skip(
    !LIVE_FLAG,
    'Live smoke requires PROMPT_SWITCHBOARD_LIVE=1 and the real Google Chrome profile env vars; login-state-sensitive runs do not fall back to a shared Chromium Default profile.'
  );

  test('drives the extension against real logged-in tabs', async () => {
    test.setTimeout(TERMINAL_TIMEOUT_MS + 30_000);

    if (browserProfile.blockers.length > 0) {
      throw new Error(
        `Prompt Switchboard live smoke requires an explicit real Google Chrome profile lane before execution. ${browserProfile.blockers.join(' ')}`
      );
    }

    const config = resolveLiveProbeConfig();
    const { blockers, result } = await withLiveProbeContext(
      {
        ...config,
        attachModeRequested: ATTACH_MODE === 'persistent' ? 'persistent' : 'browser',
      },
      async (context, effectiveRun) => {
        const extensionId = await resolveExtensionId(context);
        persistExtensionId(extensionId);
        const chatGptSessionState = await inspectChatGptSessionState(context);
        if (chatGptSessionState.loginButtons.length > 0) {
          throw new Error(
            `Prompt Switchboard live smoke found ChatGPT still login-gated in the active real browser profile: ${JSON.stringify(chatGptSessionState)}`
          );
        }

        await ensureModelTabsOpen(context, TARGET_MODELS);

        if (effectiveRun.attachModeResolved === 'browser') {
          await withExistingExtensionTarget(effectiveRun.cdpUrl!, extensionId, async (client) => {
            await client.evaluate(`(async () => {
              await chrome.storage.local.clear();
              await chrome.storage.session.clear();
              return true;
            })()`);
            await client.reload();
            await client.waitForValue<boolean>(
              `Boolean(document.querySelector('[data-testid="compare-empty-state"]'))`,
              Boolean,
              15_000
            );

            for (const model of TARGET_MODELS) {
              const { openUrl, hostnames } = getModelConfig(
                model as Parameters<typeof getModelConfig>[0]
              );
              const tabSeedResult = await client.evaluate<{
                created: boolean;
                readyTabId: number | null;
              }>(buildEnsureReadyModelTabExpression(model, openUrl, hostnames));
              if (!tabSeedResult.readyTabId) {
                throw new Error(
                  `Prompt Switchboard live smoke could not seed a ready ${model} tab in the current browser lane: ${JSON.stringify(tabSeedResult)}`
                );
              }
            }

            const readinessResponse = await client.evaluate<{
              reports?: Array<{ model?: string; ready?: boolean }>;
            }>(buildCheckReadinessExpression(TARGET_MODELS));
            const readinessReports = readinessResponse.reports ?? [];
            const primaryModel = TARGET_MODELS[0];
            const primaryReport = readinessReports.find(
              (report: { model?: string }) => report.model === primaryModel
            );
            if (!primaryReport?.ready) {
              throw new Error(
                `Prompt Switchboard live smoke still sees ${primaryModel} as not ready: ${JSON.stringify(primaryReport)}`
              );
            }

            const compareEnvelope = await client.evaluate<
              | {
                  ok?: boolean;
                  result?: {
                    sessionId?: string;
                    status?: string;
                    turnId?: string | null;
                  };
                }
              | {
                  sessionId?: string;
                  status?: string;
                  turnId?: string | null;
                }
            >(buildExecuteSubstrateActionExpression('compare', { models: TARGET_MODELS, prompt: PROMPT }));
            const compareOutcome = unwrapSubstrateResult(compareEnvelope);

            if (!compareOutcome?.turnId || !compareOutcome.sessionId) {
              throw new Error(
                `Prompt Switchboard live smoke could not start a compare turn: ${JSON.stringify(compareEnvelope)}`
              );
            }

            const sessionEnvelope = await client.waitForValue<
              | {
                  ok?: boolean;
                  result?: {
                    turns?: Array<{
                      id: string;
                      statuses: Record<string, string>;
                    }>;
                  };
                }
              | {
                  turns?: Array<{
                    id: string;
                    statuses: Record<string, string>;
                  }>;
                }
            >(
              buildGetSessionExpression(compareOutcome.sessionId),
              (sessionPayload) => {
                const session = unwrapSubstrateResult(sessionPayload);
                const activeTurn = session?.turns?.find((entry) => entry.id === compareOutcome.turnId);
                if (!activeTurn) {
                  return false;
                }

                return TARGET_MODELS.every((model) => {
                  const status = activeTurn.statuses[model];
                  return status === 'complete' || status === 'error';
                });
              },
              TERMINAL_TIMEOUT_MS,
              500
            );

            const sessionState = unwrapSubstrateResult(sessionEnvelope);
            const activeTurn = sessionState?.turns?.find((entry) => entry.id === compareOutcome.turnId);
            if (!activeTurn) {
              throw new Error(
                `Prompt Switchboard live smoke lost the active compare turn: ${JSON.stringify(sessionEnvelope)}`
              );
            }

            for (const model of TARGET_MODELS) {
              const finalStatus = activeTurn.statuses[model] ?? 'pending';
              if (ALLOWED_FAILURES.has(model)) {
                expect(['complete', 'error']).toContain(finalStatus);
              } else {
                expect(finalStatus).toBe('complete');
              }
            }
          });
          return true;
        }

        const extensionPage = context.pages().find((page) =>
          page.url().startsWith(`chrome-extension://${extensionId}/index.html`)
        );

        if (!extensionPage) {
          throw new Error(
            `Prompt Switchboard live smoke could not find a live extension page for ${extensionId} in persistent mode.`
          );
        }

        await extensionPage.evaluate(`(async () => {
          await chrome.storage.local.clear();
          await chrome.storage.session.clear();
          return true;
        })()`);
        await extensionPage.reload();
        await extensionPage.waitForLoadState('domcontentloaded');
        await expect(
          extensionPage.locator('[data-testid="compare-empty-state"]')
        ).toBeVisible({ timeout: 15_000 });

        const readinessResponse = (await extensionPage.evaluate(
          new Function(`return ${buildCheckReadinessExpression(TARGET_MODELS)}`) as () => Promise<{
            reports?: Array<{ model?: string; ready?: boolean }>;
          }>
        )) as { reports?: Array<{ model?: string; ready?: boolean }> };
        const readinessReports = readinessResponse.reports ?? [];
        const primaryModel = TARGET_MODELS[0];
        const primaryReport = readinessReports.find(
          (report: { model?: string }) => report.model === primaryModel
        );
        if (!primaryReport?.ready) {
          throw new Error(
            `Prompt Switchboard live smoke still sees ${primaryModel} as not ready: ${JSON.stringify(primaryReport)}`
          );
        }

        const compareEnvelope = (await extensionPage.evaluate(
          new Function(
            `return ${buildExecuteSubstrateActionExpression('compare', {
              models: TARGET_MODELS,
              prompt: PROMPT,
            })}`
          ) as () => Promise<{
            ok?: boolean;
            result?: {
              sessionId?: string;
              status?: string;
              turnId?: string | null;
            };
          }>
        )) as {
          ok?: boolean;
          result?: {
            sessionId?: string;
            status?: string;
            turnId?: string | null;
          };
        };
        const compareOutcome = unwrapSubstrateResult(compareEnvelope);

        if (!compareOutcome?.turnId || !compareOutcome.sessionId) {
          throw new Error(
            `Prompt Switchboard live smoke could not start a compare turn: ${JSON.stringify(compareEnvelope)}`
          );
        }

        await expect
          .poll(
            async () => {
              const sessionEnvelope = (await extensionPage.evaluate(
                new Function(
                  `return ${buildGetSessionExpression(compareOutcome.sessionId)}`
                ) as () => Promise<{
                  ok?: boolean;
                  result?: {
                    turns?: Array<{ id: string; statuses: Record<string, string> }>;
                  };
                }>
              )) as {
                ok?: boolean;
                result?: {
                  turns?: Array<{ id: string; statuses: Record<string, string> }>;
                };
              };
              const sessionState = unwrapSubstrateResult(sessionEnvelope);
              const activeTurn = sessionState?.turns?.find((entry) => entry.id === compareOutcome.turnId);
              if (!activeTurn) {
                return false;
              }
              return TARGET_MODELS.every((model) => {
                const status = activeTurn.statuses[model];
                return status === 'complete' || status === 'error';
              });
            },
            {
              timeout: TERMINAL_TIMEOUT_MS,
              intervals: [500],
            }
          )
          .toBe(true);

        return true;
      }
    );

    if (blockers.length > 0 || !result) {
      throw new Error(
        `Prompt Switchboard live smoke could not establish a live browser context: ${blockers.join(' ')}`
      );
    }
  });
});
