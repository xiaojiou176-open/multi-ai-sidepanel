import { beforeEach, describe, expect, it, vi } from 'vitest';

const captureBridgeStateSnapshot = vi.fn();
const warnLogger = vi.fn();

vi.mock('./productActions', () => ({
  captureBridgeStateSnapshot,
}));

vi.mock('../utils/logger', () => ({
  Logger: {
    warn: warnLogger,
  },
  toErrorMessage: (error: unknown) =>
    error instanceof Error ? error.message : typeof error === 'string' ? error : 'unknown',
}));

const testGlobal = globalThis as Record<string, unknown>;

const flushMicrotasks = async () => {
  for (let index = 0; index < 20; index += 1) {
    await Promise.resolve();
  }
};

describe('mcpBridgeClient', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.useFakeTimers();
    captureBridgeStateSnapshot.mockResolvedValue({
      currentSessionId: null,
      sessions: [],
      currentSession: null,
      readiness: {},
    });
    testGlobal.chrome = undefined;
    vi.unstubAllGlobals();
  });

  it(
    'does not start when the browser runtime prerequisites are missing',
    async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { startMcpBridgeClient } = await import('./mcpBridgeClient');

    startMcpBridgeClient({
      executeCommand: vi.fn(),
      baseUrl: 'http://bridge.test',
    });

    await flushMicrotasks();

    expect(fetchMock).not.toHaveBeenCalled();
    },
    15_000
  );

  it('bootstraps and syncs state when the bridge has no pending command', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          bridgeKey: 'bridge-key',
          pollIntervalMs: 1000,
          bridgeVersion: 1,
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true, status: 204 })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);
    testGlobal.chrome = {
      runtime: {
        id: 'ext-123',
        getManifest: () => ({ version: '0.2.2' }),
      },
    };

    const { startMcpBridgeClient } = await import('./mcpBridgeClient');

    startMcpBridgeClient({
      executeCommand: vi.fn(),
      baseUrl: 'http://bridge.test',
    });

    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://bridge.test/v1/bridge/bootstrap');
    expect(fetchMock.mock.calls[1]?.[0]).toBe('http://bridge.test/v1/bridge/state');
    expect(fetchMock.mock.calls[2]?.[0]).toBe('http://bridge.test/v1/bridge/pull');
    expect(fetchMock.mock.calls[3]?.[0]).toBe('http://bridge.test/v1/bridge/state');
    expect(captureBridgeStateSnapshot).toHaveBeenCalledTimes(2);
  });

  it('executes a pulled command and posts the result envelope back to the bridge', async () => {
    const executeCommand = vi.fn().mockResolvedValue({
      status: 'queued',
      sessionId: 'session-1',
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          bridgeKey: 'bridge-key',
          pollIntervalMs: 1000,
          bridgeVersion: 1,
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'cmd-1',
          command: 'compare',
          args: {
            prompt: 'Compare these answers',
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);
    testGlobal.chrome = {
      runtime: {
        id: 'ext-123',
        getManifest: () => ({ version: '0.2.2' }),
      },
    };

    const { startMcpBridgeClient } = await import('./mcpBridgeClient');

    startMcpBridgeClient({
      executeCommand,
      baseUrl: 'http://bridge.test',
    });

    await flushMicrotasks();

    expect(executeCommand).toHaveBeenCalledWith({
      command: 'compare',
      args: {
        prompt: 'Compare these answers',
      },
    });
    expect(fetchMock.mock.calls[3]?.[0]).toBe('http://bridge.test/v1/bridge/results');
    expect(fetchMock.mock.calls[3]?.[1]).toMatchObject({
      method: 'POST',
      headers: expect.objectContaining({
        'x-prompt-switchboard-extension-id': 'ext-123',
        'x-prompt-switchboard-bridge-key': 'bridge-key',
      }),
    });
    expect(JSON.parse((fetchMock.mock.calls[3]?.[1] as RequestInit).body as string)).toMatchObject({
      id: 'cmd-1',
      ok: true,
      result: {
        status: 'queued',
        sessionId: 'session-1',
      },
    });
  });

  it('posts a structured error result when command execution throws', async () => {
    const executeCommand = vi.fn().mockRejectedValue(new Error('bridge exploded'));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          bridgeKey: 'bridge-key',
          pollIntervalMs: 1000,
          bridgeVersion: 1,
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'cmd-2',
          command: 'list_sessions',
          args: {},
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);
    testGlobal.chrome = {
      runtime: {
        id: 'ext-123',
        getManifest: () => ({ version: '0.2.2' }),
      },
    };

    const { startMcpBridgeClient } = await import('./mcpBridgeClient');

    startMcpBridgeClient({
      executeCommand,
      baseUrl: 'http://bridge.test',
    });

    await flushMicrotasks();

    expect(JSON.parse((fetchMock.mock.calls[3]?.[1] as RequestInit).body as string)).toMatchObject({
      id: 'cmd-2',
      ok: false,
      error: {
        code: 'bridge_command_failed',
        message: 'bridge exploded',
      },
    });
  });

  it('round-trips workflow bridge commands with nested input payloads', async () => {
    const executeCommand = vi.fn().mockResolvedValue({
      version: 'v1',
      action: 'run_workflow',
      ok: true,
      result: {
        runId: 'run-7',
        workflowId: 'compare-analyze-follow-up',
        status: 'running',
        requestedAt: 1_700_000_000_000,
        input: {
          prompt: 'Compare and summarize the strongest answer',
          exportFormat: 'summary',
        },
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          ok: true,
          bridgeKey: 'bridge-key',
          pollIntervalMs: 1000,
          bridgeVersion: 1,
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'cmd-3',
          command: 'run_workflow',
          args: {
            workflowId: 'compare-analyze-follow-up',
            turnId: 'turn-1',
            input: {
              prompt: 'Compare and summarize the strongest answer',
              exportFormat: 'summary',
            },
          },
        }),
      })
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: true });

    vi.stubGlobal('fetch', fetchMock);
    testGlobal.chrome = {
      runtime: {
        id: 'ext-123',
        getManifest: () => ({ version: '0.2.2' }),
      },
    };

    const { startMcpBridgeClient } = await import('./mcpBridgeClient');

    startMcpBridgeClient({
      executeCommand,
      baseUrl: 'http://bridge.test',
    });

    await flushMicrotasks();

    expect(executeCommand).toHaveBeenCalledWith({
      command: 'run_workflow',
      args: {
        workflowId: 'compare-analyze-follow-up',
        turnId: 'turn-1',
        input: {
          prompt: 'Compare and summarize the strongest answer',
          exportFormat: 'summary',
        },
      },
    });
    expect(JSON.parse((fetchMock.mock.calls[3]?.[1] as RequestInit).body as string)).toMatchObject({
      id: 'cmd-3',
      ok: true,
      result: {
        action: 'run_workflow',
        result: {
          runId: 'run-7',
          workflowId: 'compare-analyze-follow-up',
        },
      },
    });
  });
});
