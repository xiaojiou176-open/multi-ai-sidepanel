import { describe, expect, it, vi } from 'vitest';
import { runOperatorCli, runOperatorCliEntry } from './operator';

describe('mcp/operator entry runner', () => {
  it('prints the help envelope without touching exit paths', async () => {
    const stdout = { write: vi.fn() };
    const exit = vi.fn();
    const setExitCode = vi.fn();

    await runOperatorCli({
      argv: ['help'],
      stdout,
      exit,
      setExitCode,
      parseArgv: vi.fn(() => ({
        command: 'help' as const,
        options: {},
      })),
      getHelp: vi.fn(() => ({
        ok: true as const,
        localOnly: true as const,
        surface: 'repo_local_operator_helper' as const,
        command: 'help' as const,
        transport: 'none' as const,
        result: {
          description: 'help',
        },
        metadata: {},
      })),
      runCommand: vi.fn(),
      runServer: vi.fn(),
    });

    expect(stdout.write).toHaveBeenCalledTimes(1);
    const rawPayload = stdout.write.mock.calls[0]?.[0];
    expect(typeof rawPayload).toBe('string');
    const payload = JSON.parse(String(rawPayload)) as {
      ok: boolean;
      surface: string;
      command: string;
    };
    expect(payload).toMatchObject({
      ok: true,
      surface: 'repo_local_operator_helper',
      command: 'help',
    });
    expect(exit).not.toHaveBeenCalled();
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it('exits with the server exit code when the server subcommand fails', async () => {
    const stdout = { write: vi.fn() };
    const exit = vi.fn();
    const setExitCode = vi.fn();

    await runOperatorCli({
      argv: ['server'],
      stdout,
      exit,
      setExitCode,
      parseArgv: vi.fn(() => ({
        command: 'server' as const,
        options: {
          bridgePort: 4315,
        },
      })),
      getHelp: vi.fn(),
      runCommand: vi.fn(),
      runServer: vi.fn(async () => 7),
    });

    expect(exit).toHaveBeenCalledWith(7);
    expect(stdout.write).not.toHaveBeenCalled();
    expect(setExitCode).not.toHaveBeenCalled();
  });

  it('writes the unhandled error envelope and exits 1 when the runner throws', async () => {
    const stdout = { write: vi.fn() };
    const exit = vi.fn();

    await runOperatorCliEntry({
      stdout,
      exit,
      argv: ['status'],
      parseArgv: vi.fn(() => ({
        command: 'status' as const,
        options: {},
      })),
      runCommand: vi.fn(async () => {
        throw new Error('unexpected_status_failure');
      }),
    });

    expect(stdout.write).toHaveBeenCalledTimes(1);
    const rawPayload = stdout.write.mock.calls[0]?.[0];
    expect(typeof rawPayload).toBe('string');
    const payload = JSON.parse(String(rawPayload)) as {
      ok: boolean;
      error: { code: string; message: string };
      metadata: { publicCliProduct: boolean };
    };
    expect(payload).toMatchObject({
      ok: false,
      error: {
        code: 'operator_unhandled_error',
        message: 'unexpected_status_failure',
      },
      metadata: {
        publicCliProduct: false,
      },
    });
    expect(exit).toHaveBeenCalledWith(1);
  });
});
