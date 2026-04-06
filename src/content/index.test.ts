import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MSG_TYPES } from '../utils/types';
import type { Scraper } from './scrapers/base';

vi.mock('../services/scraperRegistry', () => ({
  scraperRegistry: {
    getScraper: vi.fn(),
  },
}));

vi.mock('../services/selectorService', () => ({
  SelectorService: {
    getSelectorDiagnostics: vi.fn().mockResolvedValue({
      source: 'default',
      remoteConfigConfigured: false,
    }),
  },
}));

describe('content index', () => {
  const listeners: Array<
    (
      message: { type: string; payload?: unknown },
      sender: unknown,
      sendResponse: (response?: unknown) => void
    ) => boolean | void
  > = [];

  beforeEach(async () => {
    vi.resetModules();
    listeners.length = 0;
    chrome.runtime.onMessage.addListener = vi.fn((cb) => listeners.push(cb));
    chrome.runtime.sendMessage = vi.fn().mockResolvedValue(undefined);
    const { SelectorService } = await import('../services/selectorService');
    vi.mocked(SelectorService.getSelectorDiagnostics).mockResolvedValue({
      source: 'default',
      remoteConfigConfigured: false,
      readinessStatus: 'ready',
      inputReady: true,
      submitReady: true,
      lastCheckedAt: 1,
    });
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('registers handler and executes prompt with scraper', async () => {
    const observeStop = vi.fn();
    let observeCallback: (text: string, done: boolean) => void = () => undefined;

    const scraper: Scraper = {
      fillInput: vi.fn().mockResolvedValue(undefined),
      clickSend: vi.fn().mockResolvedValue(undefined),
      observeResponse: vi.fn((cb) => {
        observeCallback = cb;
        return observeStop;
      }),
    };

    const { scraperRegistry } = await import('../services/scraperRegistry');
    (scraperRegistry.getScraper as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      scraper,
      model: 'ChatGPT',
    });

    await import('./index');

    expect(listeners.length).toBe(1);

    listeners[0](
      {
        type: MSG_TYPES.EXECUTE_PROMPT,
        payload: {
          prompt: 'Hello',
          requestId: 'req-1',
          turnId: 'turn-1',
          model: 'ChatGPT',
        },
      },
      {},
      vi.fn()
    );

    await vi.runAllTimersAsync();

    expect(scraper.observeResponse).toHaveBeenCalled();
    expect(scraper.fillInput).toHaveBeenCalledWith('Hello');
    expect(scraper.clickSend).toHaveBeenCalled();

    observeCallback('Typing', false);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.STREAM_RESPONSE,
      payload: expect.objectContaining({
        model: 'ChatGPT',
        text: 'Typing',
        isComplete: false,
        requestId: 'req-1',
        turnId: 'turn-1',
        deliveryStatus: 'streaming',
        completedAt: undefined,
        data: expect.objectContaining({
          hostname: window.location.hostname,
          selectorSource: 'default',
          remoteConfigConfigured: false,
        }),
      }),
    });

    observeCallback('Reply', true);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.STREAM_RESPONSE,
      payload: expect.objectContaining({
        model: 'ChatGPT',
        text: 'Reply',
        isComplete: true,
        requestId: 'req-1',
        turnId: 'turn-1',
        deliveryStatus: 'complete',
        completedAt: expect.any(Number),
      }),
    });
  });

  it('ignores unrelated runtime messages when scraper is active', async () => {
    const scraper: Scraper = {
      fillInput: vi.fn().mockResolvedValue(undefined),
      clickSend: vi.fn().mockResolvedValue(undefined),
      observeResponse: vi.fn(() => vi.fn()),
    };

    const { scraperRegistry } = await import('../services/scraperRegistry');
    (scraperRegistry.getScraper as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      scraper,
      model: 'ChatGPT',
    });

    await import('./index');

    listeners[0](
      {
        type: 'UNRELATED_MESSAGE',
        payload: { prompt: 'Ignored' },
      },
      {},
      vi.fn()
    );

    await vi.runAllTimersAsync();

    expect(scraper.observeResponse).not.toHaveBeenCalled();
    expect(scraper.fillInput).not.toHaveBeenCalled();
    expect(scraper.clickSend).not.toHaveBeenCalled();
  });

  it('cleans up observer on execution error', async () => {
    const observeStop = vi.fn();

    const scraper: Scraper = {
      fillInput: vi.fn().mockRejectedValue(new Error('fail')),
      clickSend: vi.fn().mockResolvedValue(undefined),
      observeResponse: vi.fn(() => observeStop),
    };

    const { scraperRegistry } = await import('../services/scraperRegistry');
    (scraperRegistry.getScraper as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      scraper,
      model: 'ChatGPT',
    });

    await import('./index');

    listeners[0](
      {
        type: MSG_TYPES.EXECUTE_PROMPT,
        payload: {
          prompt: 'Boom',
          requestId: 'req-1',
          turnId: 'turn-1',
          model: 'ChatGPT',
        },
      },
      {},
      vi.fn()
    );

    await vi.runAllTimersAsync();
    expect(observeStop).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.STREAM_RESPONSE,
      payload: expect.objectContaining({
        model: 'ChatGPT',
        requestId: 'req-1',
        turnId: 'turn-1',
        deliveryStatus: 'error',
      }),
    });
  });

  it('handles non-Error execution failures without dropping correlation fields', async () => {
    const observeStop = vi.fn();

    const scraper: Scraper = {
      fillInput: vi.fn().mockRejectedValue('string failure'),
      clickSend: vi.fn().mockResolvedValue(undefined),
      observeResponse: vi.fn(() => observeStop),
    };

    const { scraperRegistry } = await import('../services/scraperRegistry');
    (scraperRegistry.getScraper as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      scraper,
      model: 'ChatGPT',
    });

    await import('./index');

    listeners[0](
      {
        type: MSG_TYPES.EXECUTE_PROMPT,
        payload: {
          prompt: 'Boom',
          sessionId: 'session-1',
          requestId: 'req-2',
          turnId: 'turn-2',
          model: 'ChatGPT',
        },
      },
      {},
      vi.fn()
    );

    await vi.runAllTimersAsync();

    expect(observeStop).toHaveBeenCalled();
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.STREAM_RESPONSE,
      payload: expect.objectContaining({
        model: 'ChatGPT',
        requestId: 'req-2',
        turnId: 'turn-2',
        deliveryStatus: 'error',
        data: expect.objectContaining({
          stage: 'content_execute_prompt',
          selectorSource: 'default',
          remoteConfigConfigured: false,
        }),
      }),
    });
  });

  it('stops the previous observer before executing a second prompt', async () => {
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    let callCount = 0;

    const scraper: Scraper = {
      fillInput: vi.fn().mockResolvedValue(undefined),
      clickSend: vi.fn().mockResolvedValue(undefined),
      observeResponse: vi.fn(() => {
        callCount += 1;
        return callCount === 1 ? firstStop : secondStop;
      }),
    };

    const { scraperRegistry } = await import('../services/scraperRegistry');
    (scraperRegistry.getScraper as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      scraper,
      model: 'ChatGPT',
    });

    await import('./index');

    listeners[0](
      {
        type: MSG_TYPES.EXECUTE_PROMPT,
        payload: {
          prompt: 'First',
          requestId: 'req-1',
          turnId: 'turn-1',
          model: 'ChatGPT',
        },
      },
      {},
      vi.fn()
    );
    await vi.runAllTimersAsync();

    listeners[0](
      {
        type: MSG_TYPES.EXECUTE_PROMPT,
        payload: {
          prompt: 'Second',
          requestId: 'req-2',
          turnId: 'turn-2',
          model: 'ChatGPT',
        },
      },
      {},
      vi.fn()
    );
    await vi.runAllTimersAsync();

    expect(firstStop).toHaveBeenCalled();
    expect(secondStop).not.toHaveBeenCalled();
    expect(scraper.fillInput).toHaveBeenNthCalledWith(2, 'Second');
  });

  it('does not register handler when no scraper matches', async () => {
    const { scraperRegistry } = await import('../services/scraperRegistry');
    (scraperRegistry.getScraper as unknown as ReturnType<typeof vi.fn>).mockReturnValue(null);

    await import('./index');

    expect(listeners.length).toBe(0);
  });

  it('does not register handler when scraper resolves without a model', async () => {
    const scraper: Scraper = {
      fillInput: vi.fn().mockResolvedValue(undefined),
      clickSend: vi.fn().mockResolvedValue(undefined),
      observeResponse: vi.fn(() => vi.fn()),
    };

    const { scraperRegistry } = await import('../services/scraperRegistry');
    (scraperRegistry.getScraper as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      scraper,
      model: null,
    });

    await import('./index');

    expect(listeners.length).toBe(0);
  });

  it('responds to PING with content readiness diagnostics', async () => {
    const scraper: Scraper = {
      fillInput: vi.fn().mockResolvedValue(undefined),
      clickSend: vi.fn().mockResolvedValue(undefined),
      observeResponse: vi.fn(() => vi.fn()),
    };

    const { scraperRegistry } = await import('../services/scraperRegistry');
    (scraperRegistry.getScraper as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      scraper,
      model: 'ChatGPT',
    });

    await import('./index');

    const sendResponse = vi.fn();
    const didHandleAsync = listeners[0](
      {
        type: MSG_TYPES.PING,
        payload: { expectedModel: 'ChatGPT' },
      },
      {},
      sendResponse
    );

    await Promise.resolve();

    expect(didHandleAsync).toBe(true);
    expect(sendResponse).toHaveBeenCalledWith({
      type: MSG_TYPES.PONG,
      payload: expect.objectContaining({
        ready: true,
        model: 'ChatGPT',
        hostname: window.location.hostname,
        selectorSource: 'default',
        remoteConfigConfigured: false,
        readinessStatus: 'ready',
      }),
    });
  });

  it('marks PING as not ready when the submit control is missing', async () => {
    const scraper: Scraper = {
      fillInput: vi.fn().mockResolvedValue(undefined),
      clickSend: vi.fn().mockResolvedValue(undefined),
      observeResponse: vi.fn(() => vi.fn()),
    };

    const { scraperRegistry } = await import('../services/scraperRegistry');
    const { SelectorService } = await import('../services/selectorService');
    (scraperRegistry.getScraper as unknown as ReturnType<typeof vi.fn>).mockReturnValue({
      scraper,
      model: 'ChatGPT',
    });
    vi.mocked(SelectorService.getSelectorDiagnostics).mockResolvedValue({
      source: 'default',
      remoteConfigConfigured: false,
      readinessStatus: 'selector_drift_suspect',
      failureClass: 'selector_drift_suspect',
      inputReady: true,
      submitReady: false,
      lastCheckedAt: 1,
    });

    await import('./index');

    const sendResponse = vi.fn();
    listeners[0](
      {
        type: MSG_TYPES.PING,
        payload: { expectedModel: 'ChatGPT' },
      },
      {},
      sendResponse
    );

    await Promise.resolve();

    expect(sendResponse).toHaveBeenCalledWith({
      type: MSG_TYPES.PONG,
      payload: expect.objectContaining({
        ready: false,
        model: 'ChatGPT',
        readinessStatus: 'selector_drift_suspect',
        failureClass: 'selector_drift_suspect',
        inputReady: true,
        submitReady: false,
      }),
    });
  });
});
