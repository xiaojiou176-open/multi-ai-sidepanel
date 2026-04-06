import { describe, expect, it, vi } from 'vitest';
import { createDoctorMessage, probeBridgeHealth, runDoctor } from './doctor';

describe('mcp/doctor entry runner', () => {
  it('reports a connected bridge when the health endpoint succeeds', async () => {
    const fetchImpl = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        connected: true,
        extensionId: 'extension-real',
        lastSeenAt: 12345,
      }),
    }));

    await expect(
      probeBridgeHealth({
        bridgeBaseUrl: 'http://127.0.0.1:4315',
        fetchImpl: fetchImpl as unknown as typeof fetch,
      })
    ).resolves.toEqual({
      reachable: true,
      statusCode: 200,
      connected: true,
      extensionId: 'extension-real',
      lastSeenAt: 12345,
      nextAction: 'Bridge is live. Open the side panel or call the MCP tools from a client.',
    });
  });

  it('writes the governed doctor envelope to stdout', async () => {
    const stdout = {
      write: vi.fn(),
    };
    const fetchImpl = vi.fn(async () => {
      throw new Error('connect ECONNREFUSED');
    });

    await runDoctor({
      bridgeBaseUrl: 'http://127.0.0.1:4315',
      fetchImpl: fetchImpl as unknown as typeof fetch,
      stdout,
    });

    expect(stdout.write).toHaveBeenCalledTimes(1);
    const rawPayload = stdout.write.mock.calls[0]?.[0];
    expect(typeof rawPayload).toBe('string');
    const message = JSON.parse(String(rawPayload)) as ReturnType<typeof createDoctorMessage>;
    expect(message.bridgeBaseUrl).toBe('http://127.0.0.1:4315');
    expect(message.bridgeHealth).toMatchObject({
      reachable: false,
      statusCode: null,
      connected: false,
      error: 'connect ECONNREFUSED',
    });
    expect(message.operatorSurface.executableCommands).toEqual([
      'npm run mcp:operator -- doctor',
      'npm run mcp:operator -- server',
      'npm run mcp:operator -- smoke',
    ]);
  });
});
