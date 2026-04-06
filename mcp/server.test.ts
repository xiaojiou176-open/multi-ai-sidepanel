import { describe, expect, it, vi } from 'vitest';
import { runServerCli, runServerMain } from './server';

describe('mcp/server entry runner', () => {
  it('starts the bridge, connects stdio transport, and logs the listening endpoint', async () => {
    const events: string[] = [];
    const transport = { kind: 'fake-stdio' };
    const currentBridgeServer = {
      start: vi.fn(async () => {
        events.push('start');
      }),
      getPort: vi.fn(() => 4315),
      close: vi.fn(async () => {
        events.push('close');
      }),
    };
    const currentMcpServer = {
      connect: vi.fn(async (receivedTransport: unknown) => {
        expect(receivedTransport).toBe(transport);
        events.push('connect');
      }),
    };
    const writeError = vi.fn();

    await runServerMain({
      currentBridgeServer,
      currentMcpServer,
      createTransport: () => transport,
      writeError,
    });

    expect(events).toEqual(['start', 'connect']);
    expect(writeError).toHaveBeenCalledWith(
      'Prompt Switchboard MCP sidecar listening on stdio with loopback bridge http://127.0.0.1:4315'
    );
    expect(currentBridgeServer.close).not.toHaveBeenCalled();
  });

  it('logs startup failure, closes the bridge, and exits with code 1', async () => {
    const startupError = new Error('bridge_start_failed');
    const currentBridgeServer = {
      start: vi.fn(async () => {
        throw startupError;
      }),
      getPort: vi.fn(() => 4315),
      close: vi.fn(async () => undefined),
    };
    const currentMcpServer = {
      connect: vi.fn(async () => undefined),
    };
    const writeError = vi.fn();
    const exit = vi.fn();

    await runServerCli({
      currentBridgeServer,
      currentMcpServer,
      createTransport: () => ({ kind: 'unused' }),
      writeError,
      exit,
    });

    expect(currentBridgeServer.close).toHaveBeenCalledTimes(1);
    expect(writeError).toHaveBeenCalledWith(
      'Prompt Switchboard MCP server failed to start:',
      startupError
    );
    expect(exit).toHaveBeenCalledWith(1);
  });
});
