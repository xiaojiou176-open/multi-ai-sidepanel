import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MSG_TYPES, SEND_ERROR_CODES } from '../utils/types';

vi.mock('./tabManager', () => ({
  tabManager: {
    getTabId: vi.fn().mockResolvedValue(123),
    getExistingTabId: vi.fn().mockResolvedValue(123),
    ensureTabReady: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../services/selectorService', () => ({
  SelectorService: {
    fetchAndCacheSelectors: vi.fn(),
    isRemoteConfigConfigured: vi.fn(() => false),
  },
}));

vi.mock('../services/storage', () => ({
  StorageService: {
    getSessions: vi.fn().mockResolvedValue([]),
    getCurrentSessionId: vi.fn().mockResolvedValue(null),
    saveSessions: vi.fn().mockResolvedValue(undefined),
    saveBufferedStreamUpdate: vi.fn().mockResolvedValue(undefined),
    consumeBufferedStreamUpdates: vi.fn().mockResolvedValue([]),
  },
}));

vi.mock('./mcpBridgeClient', () => ({
  startMcpBridgeClient: vi.fn(),
}));

describe('background index', () => {
  const listeners: Array<
    (
      message: { type: string; payload?: unknown },
      sender: unknown,
      sendResponse: (response?: unknown) => void
    ) => void
  > = [];

  beforeEach(() => {
    vi.resetModules();
    listeners.length = 0;
    chrome.runtime.onMessage.addListener = vi.fn((cb) => listeners.push(cb));
    chrome.runtime.sendMessage = vi.fn().mockResolvedValue(undefined);
    chrome.tabs.sendMessage = vi.fn((_tabId, message: { type: string; payload?: unknown }) => {
      if (message.type === MSG_TYPES.PING) {
        return Promise.resolve({
          type: MSG_TYPES.PONG,
          payload: {
            ready: true,
            model: (message.payload as { expectedModel?: string })?.expectedModel,
            hostname: 'example.com',
            selectorSource: 'default',
            remoteConfigConfigured: false,
            readinessStatus: 'ready',
            inputReady: true,
            submitReady: true,
            lastCheckedAt: 1,
          },
        });
      }

      return Promise.resolve(undefined);
    });
  });

  it(
    'handles broadcast prompt and forwards execute prompt',
    async () => {
    const runtimeActions = await import('./runtimeActions');
    const broadcastPromptSpy = vi
      .spyOn(runtimeActions, 'broadcastPrompt')
      .mockResolvedValue(undefined);
    await import('./index');

    const sendResponse = vi.fn();

    listeners[0](
      {
        type: MSG_TYPES.BROADCAST_PROMPT,
        payload: {
          prompt: 'Hi',
          models: ['ChatGPT', 'Gemini'],
          requestId: 'req-1',
          turnId: 'turn-1',
        },
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({ status: 'processing' });
    expect(broadcastPromptSpy).toHaveBeenCalledWith({
      prompt: 'Hi',
      models: ['ChatGPT', 'Gemini'],
      requestId: 'req-1',
      turnId: 'turn-1',
    });
    },
    15_000
  );

  it('forwards stream response to sidepanel', async () => {
    await import('./index');

    listeners[0](
      {
        type: MSG_TYPES.STREAM_RESPONSE,
        payload: {
          model: 'ChatGPT',
          text: 'Hello',
          isComplete: true,
          requestId: 'req-1',
          turnId: 'turn-1',
          deliveryStatus: 'complete',
        },
      },
      {},
      vi.fn()
    );

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.ON_RESPONSE_UPDATE,
      payload: {
        model: 'ChatGPT',
        text: 'Hello',
        isComplete: true,
        requestId: 'req-1',
        turnId: 'turn-1',
        deliveryStatus: 'complete',
      },
    });
  });

  it('returns readiness reports for requested models', async () => {
    const { tabManager } = await import('./tabManager');
    vi.mocked(tabManager.getExistingTabId).mockResolvedValue(123);
    chrome.tabs.get = vi.fn().mockResolvedValue({
      id: 123,
      status: 'complete',
      url: 'https://chatgpt.com',
    });

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.CHECK_MODELS_READY,
        payload: {
          models: ['ChatGPT'],
        },
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({
      reports: [
        expect.objectContaining({
          model: 'ChatGPT',
          ready: true,
          status: 'ready',
        }),
      ],
    });
  });

  it('returns tab-missing readiness when no existing tab is found', async () => {
    const { tabManager } = await import('./tabManager');
    vi.mocked(tabManager.getExistingTabId).mockResolvedValue(null);

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.CHECK_MODELS_READY,
        payload: {
          models: ['ChatGPT'],
        },
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({
      reports: [
        expect.objectContaining({
          model: 'ChatGPT',
          ready: false,
          status: 'tab_missing',
          failureClass: 'tab_unavailable',
        }),
      ],
    });
  });

  it('returns loading readiness when the tab is still loading', async () => {
    const { tabManager } = await import('./tabManager');
    vi.mocked(tabManager.getExistingTabId).mockResolvedValue(123);
    chrome.tabs.get = vi.fn().mockResolvedValue({
      id: 123,
      status: 'loading',
      url: 'https://chatgpt.com',
    });
    chrome.tabs.sendMessage = vi.fn().mockRejectedValueOnce(new Error('still loading'));

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.CHECK_MODELS_READY,
        payload: {
          models: ['ChatGPT'],
        },
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({
      reports: [
        expect.objectContaining({
          model: 'ChatGPT',
          ready: false,
          status: 'tab_loading',
        }),
      ],
    });
  });

  it('returns tab-missing readiness when the tracked tab lookup throws', async () => {
    const { tabManager } = await import('./tabManager');
    vi.mocked(tabManager.getExistingTabId).mockResolvedValue(123);
    chrome.tabs.get = vi.fn().mockRejectedValue(new Error('tab lookup failed'));

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.CHECK_MODELS_READY,
        payload: {
          models: ['ChatGPT'],
        },
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({
      reports: [
        expect.objectContaining({
          model: 'ChatGPT',
          ready: false,
          status: 'tab_missing',
          tabId: null,
        }),
      ],
    });
  });

  it('returns selector drift readiness when the content script reports blocked controls', async () => {
    const { tabManager } = await import('./tabManager');
    vi.mocked(tabManager.getExistingTabId).mockResolvedValue(123);
    chrome.tabs.get = vi.fn().mockResolvedValue({
      id: 123,
      status: 'complete',
      url: 'https://chatgpt.com',
    });
    chrome.tabs.sendMessage = vi.fn().mockResolvedValue({
      type: MSG_TYPES.PONG,
      payload: {
        ready: false,
        model: 'ChatGPT',
        hostname: 'chatgpt.com',
        selectorSource: 'cached',
        remoteConfigConfigured: true,
        readinessStatus: 'selector_drift_suspect',
        failureClass: 'selector_drift_suspect',
        inputReady: false,
        submitReady: false,
        lastCheckedAt: 10,
      },
    });

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.CHECK_MODELS_READY,
        payload: {
          models: ['ChatGPT'],
        },
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({
      reports: [
        expect.objectContaining({
          model: 'ChatGPT',
          ready: false,
          status: 'selector_drift_suspect',
          failureClass: 'selector_drift_suspect',
        }),
      ],
    });
  });

  it('returns content-unavailable readiness when the content handshake returns nothing', async () => {
    const { tabManager } = await import('./tabManager');
    vi.mocked(tabManager.getExistingTabId).mockResolvedValue(123);
    chrome.tabs.get = vi.fn().mockResolvedValue({
      id: 123,
      status: 'complete',
      url: 'https://chatgpt.com',
    });
    chrome.tabs.sendMessage = vi.fn().mockResolvedValue(undefined);

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.CHECK_MODELS_READY,
        payload: {
          models: ['ChatGPT'],
        },
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({
      reports: [
        expect.objectContaining({
          model: 'ChatGPT',
          ready: false,
          status: 'content_unavailable',
          failureClass: 'handshake_mismatch',
        }),
      ],
    });
  });

  it('returns buffered updates to the sidepanel on request', async () => {
    const { StorageService } = await import('../services/storage');
    vi.mocked(StorageService.consumeBufferedStreamUpdates).mockResolvedValue([
      {
        model: 'ChatGPT',
        requestId: 'req-buffered',
        turnId: 'turn-buffered',
        text: 'buffered',
        deliveryStatus: 'streaming',
      },
    ]);

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.GET_BUFFERED_UPDATES,
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({
      updates: [
        expect.objectContaining({
          model: 'ChatGPT',
          turnId: 'turn-buffered',
        }),
      ],
    });
  });

  it('falls back to an empty readiness list when readiness checks throw', async () => {
    const { tabManager } = await import('./tabManager');
    vi.mocked(tabManager.getExistingTabId).mockRejectedValueOnce(new Error('readiness exploded'));

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.CHECK_MODELS_READY,
        payload: {
          models: ['ChatGPT'],
        },
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({ reports: [] });
  });

  it('falls back to content_unavailable when the content handshake fails without structured readiness details', async () => {
    const { tabManager } = await import('./tabManager');
    vi.mocked(tabManager.getExistingTabId).mockResolvedValue(123);
    chrome.tabs.get = vi.fn().mockResolvedValue({
      id: 123,
      status: 'complete',
      url: 'https://chatgpt.com',
    });
    chrome.tabs.sendMessage = vi.fn().mockRejectedValueOnce(new Error('ping exploded'));

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.CHECK_MODELS_READY,
        payload: {
          models: ['ChatGPT'],
        },
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({
      reports: [
        expect.objectContaining({
          model: 'ChatGPT',
          ready: false,
          status: 'content_unavailable',
          failureClass: 'handshake_mismatch',
        }),
      ],
    });
  });

  it('falls back to empty buffered updates when replay retrieval fails', async () => {
    const { StorageService } = await import('../services/storage');
    vi.mocked(StorageService.consumeBufferedStreamUpdates).mockRejectedValueOnce(
      new Error('buffer explode')
    );

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.GET_BUFFERED_UPDATES,
      },
      {},
      sendResponse
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(sendResponse).toHaveBeenCalledWith({ updates: [] });
  });

  it('continues when prompt fan-out fails for a model', async () => {
    const { tabManager } = await import('./tabManager');
    vi.mocked(tabManager.getTabId).mockRejectedValueOnce(new Error('boom'));

    await import('./index');

    listeners[0](
      {
        type: MSG_TYPES.BROADCAST_PROMPT,
        payload: {
          prompt: 'Hi',
          models: ['ChatGPT'],
          requestId: 'req-1',
          turnId: 'turn-1',
        },
      },
      {},
      vi.fn()
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.ON_RESPONSE_UPDATE,
      payload: expect.objectContaining({
        model: 'ChatGPT',
        requestId: 'req-1',
        turnId: 'turn-1',
        deliveryStatus: 'error',
      }),
    });
  });

  it('logs non-Error prompt fan-out failures without crashing', async () => {
    const { tabManager } = await import('./tabManager');
    vi.mocked(tabManager.getTabId).mockRejectedValueOnce('string failure');

    await import('./index');

    listeners[0](
      {
        type: MSG_TYPES.BROADCAST_PROMPT,
        payload: {
          prompt: 'Hi',
          models: ['ChatGPT'],
          requestId: 'req-1',
          turnId: 'turn-1',
        },
      },
      {},
      vi.fn()
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });

  it('marks handshake failures before execute prompt dispatch', async () => {
    chrome.tabs.sendMessage = vi.fn().mockResolvedValueOnce(undefined);

    await import('./index');

    listeners[0](
      {
        type: MSG_TYPES.BROADCAST_PROMPT,
        payload: {
          prompt: 'Hi',
          models: ['ChatGPT'],
          requestId: 'req-1',
          turnId: 'turn-1',
        },
      },
      {},
      vi.fn()
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
    expect(chrome.tabs.sendMessage).toHaveBeenCalledWith(123, {
      type: MSG_TYPES.PING,
      payload: { expectedModel: 'ChatGPT' },
    });
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.ON_RESPONSE_UPDATE,
      payload: expect.objectContaining({
        model: 'ChatGPT',
        requestId: 'req-1',
        turnId: 'turn-1',
        deliveryStatus: 'error',
        errorCode: SEND_ERROR_CODES.HANDSHAKE,
        data: expect.objectContaining({
          stage: 'content_ready_handshake',
        }),
      }),
    });
  });

  it('marks handshake timeout failures when the content script never answers the ping', async () => {
    vi.useFakeTimers();
    chrome.tabs.sendMessage = vi.fn().mockImplementationOnce(
      () => new Promise(() => undefined)
    );

    await import('./index');

    listeners[0](
      {
        type: MSG_TYPES.BROADCAST_PROMPT,
        payload: {
          prompt: 'Hi',
          models: ['ChatGPT'],
          requestId: 'req-timeout',
          turnId: 'turn-timeout',
        },
      },
      {},
      vi.fn()
    );

    await vi.advanceTimersByTimeAsync(1_500);
    await Promise.resolve();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.ON_RESPONSE_UPDATE,
      payload: expect.objectContaining({
        model: 'ChatGPT',
        requestId: 'req-timeout',
        turnId: 'turn-timeout',
        deliveryStatus: 'error',
        errorCode: SEND_ERROR_CODES.HANDSHAKE,
      }),
    });

    vi.useRealTimers();
  });

  it('marks handshake mismatches when the responding content model does not match the requested model', async () => {
    chrome.tabs.sendMessage = vi.fn().mockResolvedValueOnce({
      type: MSG_TYPES.PONG,
      payload: {
        ready: true,
        model: 'Gemini',
        hostname: 'example.com',
        selectorSource: 'default',
        remoteConfigConfigured: false,
      },
    });

    await import('./index');

    listeners[0](
      {
        type: MSG_TYPES.BROADCAST_PROMPT,
        payload: {
          prompt: 'Hi',
          models: ['ChatGPT'],
          requestId: 'req-mismatch',
          turnId: 'turn-mismatch',
        },
      },
      {},
      vi.fn()
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.ON_RESPONSE_UPDATE,
      payload: expect.objectContaining({
        model: 'ChatGPT',
        requestId: 'req-mismatch',
        turnId: 'turn-mismatch',
        deliveryStatus: 'error',
        errorCode: SEND_ERROR_CODES.HANDSHAKE,
      }),
    });
    expect(chrome.tabs.sendMessage).toHaveBeenCalledTimes(1);
  });

  it('ignores sidepanel forwarding errors when streaming responses', async () => {
    chrome.runtime.sendMessage = vi.fn().mockRejectedValue(new Error('closed'));

    await import('./index');

    listeners[0](
      {
        type: MSG_TYPES.STREAM_RESPONSE,
        payload: {
          model: 'ChatGPT',
          text: 'Hello',
          isComplete: false,
          requestId: 'req-1',
          turnId: 'turn-1',
          deliveryStatus: 'streaming',
        },
      },
      {},
      vi.fn()
    );

    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.ON_RESPONSE_UPDATE,
      payload: {
        model: 'ChatGPT',
        text: 'Hello',
        isComplete: false,
        requestId: 'req-1',
        turnId: 'turn-1',
        deliveryStatus: 'streaming',
      },
    });
  });

  it('ignores unrelated runtime messages', async () => {
    await import('./index');

    const sendResponse = vi.fn();

    listeners[0](
      {
        type: 'UNRELATED_MESSAGE',
        payload: { ignored: true },
      },
      {},
      sendResponse
    );

    expect(sendResponse).not.toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
    expect(chrome.tabs.sendMessage).not.toHaveBeenCalled();
  });
});
