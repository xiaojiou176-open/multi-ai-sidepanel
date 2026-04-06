import { describe, expect, it } from 'vitest';
import { parseOperatorArgv, runOperatorCommand } from './operatorShared';

describe('operatorShared workflow-run contract', () => {
  it('parses workflow-run CLI arguments into operator options', () => {
    expect(
      parseOperatorArgv([
        'workflow-run',
        '--session-id',
        'session-real',
        '--turn-id',
        'turn-real',
        '--prompt',
        'Real prompt payload',
        '--models',
        'ChatGPT,Gemini',
      ])
    ).toEqual({
      command: 'workflow-run',
      options: {
        bridgePort: undefined,
        externalUpdate: undefined,
        models: ['ChatGPT', 'Gemini'],
        prompt: 'Real prompt payload',
        runId: undefined,
        sessionId: 'session-real',
        turnId: 'turn-real',
      },
    });
  });

  it('prints a governed workflow template that preserves caller-provided values', async () => {
    const envelope = await runOperatorCommand('workflow-run', {
      sessionId: 'session-real',
      turnId: 'turn-real',
      prompt: 'Real prompt payload',
      models: ['ChatGPT', 'Gemini'],
    });

    expect(envelope.ok).toBe(true);
    if (!envelope.ok) {
      throw new Error('expected success envelope');
    }

    expect(envelope.result).toMatchObject({
      mode: 'governed_mcp_tool_template',
      tool: 'prompt_switchboard.run_workflow',
      arguments: {
        workflowId: 'compare-analyze-follow-up',
        sessionId: 'session-real',
        turnId: 'turn-real',
        input: {
          prompt: 'Real prompt payload',
          models: ['ChatGPT', 'Gemini'],
        },
      },
    });
  });
});
