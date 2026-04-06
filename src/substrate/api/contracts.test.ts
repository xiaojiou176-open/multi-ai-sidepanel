import { describe, expect, it } from 'vitest';
import {
  PROMPT_SWITCHBOARD_API_SUBSTRATE,
  PROMPT_SWITCHBOARD_API_VERSION,
  SUBSTRATE_ACTION_NAMES,
  createSubstrateApiFailure,
  createSubstrateApiSuccess,
  isSubstrateApiFailure,
  isSubstrateApiSuccess,
  parseSubstrateApiCommand,
  parseSubstrateApiResult,
  safeParseSubstrateApiCommand,
} from './contracts';

describe('substrate api contracts', () => {
  it('parses a compare command envelope with the shared substrate/version header', () => {
    const parsed = parseSubstrateApiCommand({
      substrate: PROMPT_SWITCHBOARD_API_SUBSTRATE,
      version: PROMPT_SWITCHBOARD_API_VERSION,
      id: 'cmd-1',
      action: SUBSTRATE_ACTION_NAMES.COMPARE,
      args: {
        prompt: 'Compare these browser answers',
        sessionId: 'session-1',
        models: ['ChatGPT', 'Gemini'],
      },
    });

    expect(parsed).toEqual({
      substrate: PROMPT_SWITCHBOARD_API_SUBSTRATE,
      version: PROMPT_SWITCHBOARD_API_VERSION,
      id: 'cmd-1',
      action: SUBSTRATE_ACTION_NAMES.COMPARE,
      args: {
        prompt: 'Compare these browser answers',
        sessionId: 'session-1',
        models: ['ChatGPT', 'Gemini'],
      },
    });
  });

  it('rejects envelopes that drift away from the explicit schema version', () => {
    const parsed = safeParseSubstrateApiCommand({
      substrate: PROMPT_SWITCHBOARD_API_SUBSTRATE,
      version: 'v2',
      id: 'cmd-2',
      action: SUBSTRATE_ACTION_NAMES.CHECK_READINESS,
      args: {},
    });

    expect(parsed.success).toBe(false);
  });

  it('creates a workflow success envelope with action-specific payload typing', () => {
    const success = createSubstrateApiSuccess(
      {
        id: 'wf-1',
        action: SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW,
      },
      {
        runId: 'run-1',
        workflowId: 'workflow.compare-and-analyze',
        status: 'queued',
        requestedAt: 1_700_000_000_000,
        input: {
          prompt: 'Summarize the strongest answer',
          exportFormat: 'summary',
        },
      }
    );

    expect(isSubstrateApiSuccess(success)).toBe(true);
    expect(success.result.workflowId).toBe('workflow.compare-and-analyze');
    expect(success.result.input).toEqual({
      prompt: 'Summarize the strongest answer',
      exportFormat: 'summary',
    });
  });

  it('parses a get_workflow_run result with structured steps instead of unknown payloads', () => {
    const result = parseSubstrateApiResult({
      substrate: PROMPT_SWITCHBOARD_API_SUBSTRATE,
      version: PROMPT_SWITCHBOARD_API_VERSION,
      id: 'wf-2',
      action: SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN,
      ok: true,
      result: {
        runId: 'run-2',
        workflowId: 'workflow.compare-and-analyze',
        status: 'running',
        requestedAt: 1_700_000_000_000,
        startedAt: 1_700_000_000_500,
        currentStepId: 'step-2',
        steps: [
          {
            id: 'step-1',
            action: SUBSTRATE_ACTION_NAMES.COMPARE,
            status: 'completed',
            startedAt: 1_700_000_000_500,
            finishedAt: 1_700_000_001_000,
            output: {
              sessionId: 'session-1',
              turnId: 'turn-1',
            },
          },
          {
            id: 'step-2',
            action: SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE,
            status: 'waiting_external',
            startedAt: 1_700_000_001_001,
          },
        ],
        waitingFor: 'analysis tab completion',
      },
    });

    expect(isSubstrateApiSuccess(result)).toBe(true);
    if (!isSubstrateApiSuccess(result)) {
      throw new Error('expected success envelope');
    }
    const workflowResult = result.result as {
      steps: Array<{ action: string }>;
      waitingFor?: string;
    };
    expect(workflowResult.steps).toHaveLength(2);
    expect(workflowResult.steps[0]?.action).toBe(SUBSTRATE_ACTION_NAMES.COMPARE);
    expect(workflowResult.waitingFor).toBe('analysis tab completion');
  });

  it('creates failure envelopes that distinguish waiting_external from validation/runtime errors', () => {
    const waitingExternal = createSubstrateApiFailure(
      {
        id: 'cmd-3',
        action: SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS,
      },
      {
        kind: 'waiting_external',
        code: 'login_required',
        message: 'Sign in to Gemini before Prompt Switchboard can reuse the tab.',
        retryable: true,
        externalAction: {
          type: 'sign_in',
          target: 'Gemini',
          message: 'Complete the sign-in flow in the existing Gemini tab.',
        },
      }
    );

    const validation = createSubstrateApiFailure(
      {
        id: 'cmd-4',
        action: SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW,
      },
      {
        kind: 'validation',
        code: 'workflow_input_invalid',
        message: 'workflowId is required.',
        retryable: false,
        validationIssues: [
          {
            path: ['args', 'workflowId'],
            message: 'Expected a non-empty string.',
            code: 'too_small',
          },
        ],
      }
    );

    expect(isSubstrateApiFailure(waitingExternal)).toBe(true);
    expect(waitingExternal.error.kind).toBe('waiting_external');
    expect(waitingExternal.error.externalAction?.type).toBe('sign_in');

    expect(isSubstrateApiFailure(validation)).toBe(true);
    expect(validation.error.kind).toBe('validation');
    expect(validation.error.validationIssues?.[0]?.path).toEqual(['args', 'workflowId']);
  });

  it('parses analyze_compare success results with the typed analyst payload', () => {
    const result = parseSubstrateApiResult({
      substrate: PROMPT_SWITCHBOARD_API_SUBSTRATE,
      version: PROMPT_SWITCHBOARD_API_VERSION,
      id: 'analysis-1',
      action: SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE,
      ok: true,
      result: {
        status: 'success',
        sessionId: 'session-1',
        turnId: 'turn-1',
        provider: 'browser_session',
        analystModel: 'Gemini',
        result: {
          consensusSummary: 'Both models agree that local-first storage reduces hosted risk.',
          disagreementSummary: 'Gemini prefers a thinner export layer than ChatGPT.',
          recommendedAnswerModel: 'Gemini',
          recommendationReason: 'Gemini produced the clearest implementation plan.',
          nextQuestion: 'Should the workflow auto-export the compare summary?',
          synthesisDraft: 'Use one shared substrate contract before wiring bridge and MCP.',
          provider: 'browser_session',
          executionSurface: 'browser_tab',
          model: 'Gemini',
          createdAt: 1_700_000_000_000,
        },
      },
    });

    expect(isSubstrateApiSuccess(result)).toBe(true);
    if (!isSubstrateApiSuccess(result)) {
      throw new Error('expected success envelope');
    }
    const analysisResult = result.result as {
      result: {
        provider: string;
        executionSurface?: string;
        consensusSummary: string;
      };
    };
    expect(analysisResult.result.provider).toBe('browser_session');
    expect(analysisResult.result.executionSurface).toBe('browser_tab');
    expect(analysisResult.result.consensusSummary).toContain('local-first');
  });
});
