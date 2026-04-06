import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  checkModelsReady,
  forwardResponseUpdate,
  runCompareAnalysis,
} from './runtimeActions';
import { FAILURE_CLASSES, MSG_TYPES, READINESS_STATUSES, SEND_ERROR_CODES } from '../utils/types';

const mocks = vi.hoisted(() => ({
  getSessions: vi.fn(),
  getCurrentSessionId: vi.fn(),
  saveSessions: vi.fn(),
  saveBufferedStreamUpdate: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn(),
  loggerWarn: vi.fn(),
  getExistingTabId: vi.fn(),
  getCandidateTabIds: vi.fn(),
  getTabId: vi.fn(),
  rememberTabId: vi.fn(),
  ensureTabReady: vi.fn(),
  isRemoteConfigConfigured: vi.fn(),
}));

vi.mock('../services/storage', () => ({
  StorageService: {
    getSessions: mocks.getSessions,
    getCurrentSessionId: mocks.getCurrentSessionId,
    saveSessions: mocks.saveSessions,
    saveBufferedStreamUpdate: mocks.saveBufferedStreamUpdate,
  },
}));

vi.mock('./tabManager', () => ({
  tabManager: {
    getExistingTabId: mocks.getExistingTabId,
    getCandidateTabIds: mocks.getCandidateTabIds,
    getTabId: mocks.getTabId,
    rememberTabId: mocks.rememberTabId,
    ensureTabReady: mocks.ensureTabReady,
  },
}));

vi.mock('../services/selectorService', () => ({
  SelectorService: {
    isRemoteConfigConfigured: mocks.isRemoteConfigConfigured,
  },
}));

vi.mock('../utils/logger', () => ({
  Logger: {
    info: mocks.loggerInfo,
    error: mocks.loggerError,
    warn: mocks.loggerWarn,
  },
  toErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown',
}));

vi.mock('../i18n', () => ({
  default: {
    t: (_key: string, fallbackOrOptions?: string | { defaultValue?: string; model?: string }) => {
      if (typeof fallbackOrOptions === 'string') {
        return fallbackOrOptions;
      }
      if (fallbackOrOptions?.defaultValue) {
        return fallbackOrOptions.defaultValue.replace('{{model}}', fallbackOrOptions.model ?? '');
      }
      return '';
    },
  },
}));

const testGlobal = globalThis as Record<string, unknown>;

describe('runtimeActions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);

    mocks.getExistingTabId.mockResolvedValue(101);
    mocks.getCandidateTabIds.mockResolvedValue([101]);
    mocks.getTabId.mockResolvedValue(101);
    mocks.rememberTabId.mockResolvedValue(undefined);
    mocks.ensureTabReady.mockResolvedValue(undefined);
    mocks.isRemoteConfigConfigured.mockReturnValue(false);
    mocks.getCurrentSessionId.mockResolvedValue('session-1');
    mocks.getSessions.mockResolvedValue([
      {
        id: 'session-1',
        title: 'New Chat',
        createdAt: 1,
        updatedAt: 1,
        selectedModels: ['ChatGPT'],
        messages: [
          {
            id: 'user-1',
            role: 'user',
            text: 'hello',
            timestamp: 1,
            turnId: 'turn-1',
            requestId: 'req-1',
            requestedModels: ['ChatGPT'],
            isStreaming: false,
            deliveryStatus: 'complete',
            completedAt: 1,
          },
          {
            id: 'assistant-1',
            role: 'assistant',
            text: 'Waiting for response…',
            model: 'ChatGPT',
            timestamp: 2,
            turnId: 'turn-1',
            requestId: 'req-1',
            isStreaming: true,
            deliveryStatus: 'pending',
          },
        ],
      },
    ]);
    mocks.saveSessions.mockResolvedValue(undefined);
    mocks.saveBufferedStreamUpdate.mockResolvedValue(undefined);

    testGlobal.chrome = {
      tabs: {
        get: vi.fn().mockResolvedValue({
          id: 101,
          status: 'complete',
          url: 'https://chatgpt.com',
        }),
        sendMessage: vi.fn(),
      },
      runtime: {
        sendMessage: vi.fn().mockResolvedValue(undefined),
      },
    };
  });

  it('returns tab-missing readiness when no live tab exists', async () => {
    mocks.getExistingTabId.mockResolvedValue(null);
    mocks.getCandidateTabIds.mockResolvedValue([]);

    await expect(checkModelsReady({ models: ['ChatGPT'] })).resolves.toEqual([
      expect.objectContaining({
        model: 'ChatGPT',
        ready: false,
        status: 'tab_missing',
        failureClass: 'tab_unavailable',
      }),
    ]);
  });

  it('returns selector-drift readiness when the content handshake reports blocked controls', async () => {
    (testGlobal.chrome as { tabs: { sendMessage: ReturnType<typeof vi.fn> } }).tabs.sendMessage
      .mockResolvedValue({
        type: MSG_TYPES.PONG,
        payload: {
          ready: false,
          model: 'ChatGPT',
          hostname: 'chatgpt.com',
          selectorSource: 'cached',
          remoteConfigConfigured: true,
          failureClass: FAILURE_CLASSES.SELECTOR_DRIFT_SUSPECT,
          readinessStatus: READINESS_STATUSES.SELECTOR_DRIFT_SUSPECT,
          inputReady: true,
          submitReady: false,
          lastCheckedAt: 88,
        },
      });

    await expect(checkModelsReady({ models: ['ChatGPT'] })).resolves.toEqual([
      expect.objectContaining({
        model: 'ChatGPT',
        ready: false,
        status: 'selector_drift_suspect',
        failureClass: 'selector_drift_suspect',
        inputReady: true,
        submitReady: false,
        selectorSource: 'cached',
      }),
    ]);
  });

  it('falls through stale tabs and remembers the first candidate that can handshake', async () => {
    mocks.getExistingTabId.mockResolvedValue(101);
    mocks.getCandidateTabIds.mockResolvedValue([101, 202]);

    (
      testGlobal.chrome as {
        tabs: { get: ReturnType<typeof vi.fn>; sendMessage: ReturnType<typeof vi.fn> };
      }
    ).tabs.get.mockImplementation(async (tabId: number) => ({
      id: tabId,
      status: 'complete',
      url: 'https://chatgpt.com',
    }));

    (testGlobal.chrome as { tabs: { sendMessage: ReturnType<typeof vi.fn> } }).tabs.sendMessage
      .mockRejectedValueOnce(new Error('Could not establish connection. Receiving end does not exist.'))
      .mockResolvedValueOnce({
        type: MSG_TYPES.PONG,
        payload: {
          ready: true,
          model: 'ChatGPT',
          hostname: 'chatgpt.com',
          selectorSource: 'default',
          remoteConfigConfigured: false,
          readinessStatus: READINESS_STATUSES.READY,
          inputReady: true,
          submitReady: true,
          lastCheckedAt: 123,
        },
      });

    await expect(checkModelsReady({ models: ['ChatGPT'] })).resolves.toEqual([
      expect.objectContaining({
        model: 'ChatGPT',
        ready: true,
        status: 'ready',
        tabId: 202,
      }),
    ]);
    expect(mocks.rememberTabId).toHaveBeenCalledWith('ChatGPT', 202);
  });

  it('persists buffered updates and forwards them to the side panel without crashing on send failure', async () => {
    (testGlobal.chrome as { runtime: { sendMessage: ReturnType<typeof vi.fn> } }).runtime.sendMessage
      .mockRejectedValueOnce(new Error('panel closed'));

    forwardResponseUpdate({
      model: 'ChatGPT',
      requestId: 'req-1',
      turnId: 'turn-1',
      text: 'stream chunk',
      isComplete: false,
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(mocks.saveBufferedStreamUpdate).toHaveBeenCalledWith({
      model: 'ChatGPT',
      requestId: 'req-1',
      turnId: 'turn-1',
      text: 'stream chunk',
      isComplete: false,
    });
    expect(
      (testGlobal.chrome as { runtime: { sendMessage: ReturnType<typeof vi.fn> } }).runtime
        .sendMessage
    ).toHaveBeenCalledWith({
      type: MSG_TYPES.ON_RESPONSE_UPDATE,
      payload: expect.objectContaining({
        model: 'ChatGPT',
        requestId: 'req-1',
      }),
    });
    expect(mocks.saveSessions).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'session-1',
        messages: expect.arrayContaining([
          expect.objectContaining({
            id: 'assistant-1',
            text: 'stream chunk',
            turnId: 'turn-1',
            deliveryStatus: 'streaming',
          }),
        ]),
      }),
    ]);
  });

  it('returns a timeout payload when compare analysis never responds', async () => {
    (testGlobal.chrome as { tabs: { sendMessage: ReturnType<typeof vi.fn> } }).tabs.sendMessage
      .mockResolvedValueOnce({
        type: MSG_TYPES.PONG,
        payload: {
          ready: true,
          model: 'ChatGPT',
          hostname: 'chatgpt.com',
          selectorSource: 'default',
          remoteConfigConfigured: false,
          readinessStatus: READINESS_STATUSES.READY,
          inputReady: true,
          submitReady: true,
          lastCheckedAt: 77,
        },
      })
      .mockImplementationOnce(
        () =>
          new Promise(() => {
            // keep pending so timeout path wins
          })
      );

    const promise = runCompareAnalysis({
      prompt: 'analysis prompt',
      model: 'ChatGPT',
      turnId: 'turn-1',
      analysisRequestId: 'analysis-1',
    });

    await vi.advanceTimersByTimeAsync(90_000);

    await expect(promise).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        errorCode: SEND_ERROR_CODES.TIMEOUT,
        errorMessage: 'AI analysis timed out before the target tab returned a final response.',
        data: expect.objectContaining({
          stage: 'analysis_delivery',
          hostname: 'chatgpt.com',
        }),
      })
    );
  });

  it('returns runtime and handshake failures with the correct error semantics', async () => {
    const tabsSendMessage = (
      testGlobal.chrome as { tabs: { sendMessage: ReturnType<typeof vi.fn> } }
    ).tabs.sendMessage;

    tabsSendMessage
      .mockResolvedValueOnce({
        type: MSG_TYPES.PONG,
        payload: {
          ready: true,
          model: 'ChatGPT',
          hostname: 'chatgpt.com',
          selectorSource: 'default',
          remoteConfigConfigured: false,
          readinessStatus: READINESS_STATUSES.READY,
          inputReady: true,
          submitReady: true,
          lastCheckedAt: 77,
        },
      })
      .mockResolvedValueOnce(undefined);

    await expect(
      runCompareAnalysis({
        prompt: 'analysis prompt',
        model: 'ChatGPT',
        turnId: 'turn-1',
        analysisRequestId: 'analysis-2',
      })
    ).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        errorCode: SEND_ERROR_CODES.RUNTIME,
        errorMessage: 'The target tab did not return an AI analysis response.',
      })
    );

    tabsSendMessage.mockRejectedValueOnce(
      Object.assign(new Error('blocked'), {
        code: SEND_ERROR_CODES.HANDSHAKE,
        failureClass: FAILURE_CLASSES.HANDSHAKE_MISMATCH,
        readinessStatus: READINESS_STATUSES.MODEL_MISMATCH,
        hostname: 'chatgpt.com',
        selectorSource: 'cached',
        remoteConfigConfigured: true,
        inputReady: true,
        submitReady: false,
        lastCheckedAt: 99,
      })
    );

    await expect(
      runCompareAnalysis({
        prompt: 'analysis prompt',
        model: 'ChatGPT',
        turnId: 'turn-1',
        analysisRequestId: 'analysis-3',
      })
    ).resolves.toEqual(
      expect.objectContaining({
        ok: false,
        errorCode: SEND_ERROR_CODES.HANDSHAKE,
        errorMessage: 'Prompt Switchboard could not confirm that ChatGPT was ready for AI analysis.',
        data: expect.objectContaining({
          stage: 'content_ready_handshake',
          failureClass: FAILURE_CLASSES.HANDSHAKE_MISMATCH,
          readinessStatus: READINESS_STATUSES.MODEL_MISMATCH,
          selectorSource: 'cached',
        }),
      })
    );
  });
});
