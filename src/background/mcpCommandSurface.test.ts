import { beforeEach, describe, expect, it, vi } from 'vitest';

const executeSubstrateAction = vi.fn();

vi.mock('../substrate/api/executor', () => ({
  executeSubstrateAction,
}));

describe('executeBridgeCommand', () => {
  beforeEach(() => {
    executeSubstrateAction.mockReset();
    executeSubstrateAction.mockResolvedValue({
      version: 'v1',
      action: 'compare',
      ok: true,
      data: {
        status: 'queued',
        sessionId: 'session-1',
        turnId: 'turn-1',
        requestId: 'req-1',
        requestedModels: ['ChatGPT'],
        readyModels: ['ChatGPT'],
        blockedReports: [],
      },
    });
  });

  it('delegates compare commands into the substrate executor', async () => {
    const { executeBridgeCommand } = await import('./mcpCommandSurface');

    await executeBridgeCommand({
      command: 'compare',
      args: {
        prompt: 'Compare these answers',
        models: ['ChatGPT', 'Gemini'],
      },
    });

    expect(executeSubstrateAction).toHaveBeenCalledWith('compare', {
      prompt: 'Compare these answers',
      models: ['ChatGPT', 'Gemini'],
    });
  });

  it('rejects malformed retry commands before they reach the substrate executor', async () => {
    const { executeBridgeCommand } = await import('./mcpCommandSurface');

    await expect(
      executeBridgeCommand({
        command: 'retry_failed',
        args: {},
      } as never)
    ).rejects.toThrow();

    expect(executeSubstrateAction).not.toHaveBeenCalled();
  });

  it('delegates the remaining supported bridge commands into the substrate executor', async () => {
    const { executeBridgeCommand } = await import('./mcpCommandSurface');

    await executeBridgeCommand({
      command: 'check_readiness',
      args: { models: ['ChatGPT'] },
    });
    await executeBridgeCommand({
      command: 'open_model_tabs',
      args: { models: ['Gemini', 'Grok'] },
    });
    await executeBridgeCommand({
      command: 'get_session',
      args: { sessionId: 'session-1', includeMessages: true },
    });
    await executeBridgeCommand({
      command: 'list_sessions',
      args: { limit: 5 },
    });
    await executeBridgeCommand({
      command: 'export_compare',
      args: { sessionId: 'session-1', turnId: 'turn-1', format: 'summary' },
    });
    await executeBridgeCommand({
      command: 'analyze_compare',
      args: { sessionId: 'session-1', turnId: 'turn-1' },
    });
    await executeBridgeCommand({
      command: 'run_workflow',
      args: {
        workflowId: 'compare-analyze-follow-up',
        sessionId: 'session-1',
        turnId: 'turn-1',
        input: {
          prompt: 'Compare and summarize the strongest answer',
          models: ['ChatGPT'],
        },
      },
    });
    await executeBridgeCommand({
      command: 'get_workflow_run',
      args: { runId: 'run-1' },
    });

    expect(executeSubstrateAction).toHaveBeenNthCalledWith(1, 'check_readiness', {
      models: ['ChatGPT'],
    });
    expect(executeSubstrateAction).toHaveBeenNthCalledWith(2, 'open_model_tabs', {
      models: ['Gemini', 'Grok'],
    });
    expect(executeSubstrateAction).toHaveBeenNthCalledWith(3, 'get_session', {
      sessionId: 'session-1',
      includeMessages: true,
    });
    expect(executeSubstrateAction).toHaveBeenNthCalledWith(4, 'list_sessions', {
      limit: 5,
    });
    expect(executeSubstrateAction).toHaveBeenNthCalledWith(5, 'export_compare', {
      sessionId: 'session-1',
      turnId: 'turn-1',
      format: 'summary',
    });
    expect(executeSubstrateAction).toHaveBeenNthCalledWith(6, 'analyze_compare', {
      sessionId: 'session-1',
      turnId: 'turn-1',
    });
    expect(executeSubstrateAction).toHaveBeenNthCalledWith(7, 'run_workflow', {
      workflowId: 'compare-analyze-follow-up',
      sessionId: 'session-1',
      turnId: 'turn-1',
      input: {
        prompt: 'Compare and summarize the strongest answer',
        models: ['ChatGPT'],
      },
    });
    expect(executeSubstrateAction).toHaveBeenNthCalledWith(8, 'get_workflow_run', {
      runId: 'run-1',
    });
  });

  it('rejects unsupported bridge commands explicitly', async () => {
    const { executeBridgeCommand } = await import('./mcpCommandSurface');

    await expect(
      executeBridgeCommand({
        command: 'bridge_status',
        args: {},
      } as never)
    ).rejects.toThrow('prompt_switchboard_bridge_command_unsupported:bridge_status');
  });
});
