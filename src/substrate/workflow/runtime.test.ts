import { describe, expect, it } from 'vitest';
import { ANALYSIS_PROVIDER_IDS, type CompareAnalysisResult } from '../../services/analysis';
import {
  advanceWorkflowRun,
  applyWorkflowExternalUpdate,
  createCompareAnalyzeFollowUpWorkflow,
  createWorkflowRunState,
} from './runtime';
import {
  WORKFLOW_BINDING_SOURCES,
  WORKFLOW_ERROR_CODES,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_STEP_TYPES,
  WORKFLOW_TOPOLOGIES,
  type WorkflowDefinition,
} from './types';

const compareWorkflow = createCompareAnalyzeFollowUpWorkflow();

const analysisResult: CompareAnalysisResult = {
  consensusSummary: 'Both answers prefer a browser-native workflow.',
  disagreementSummary: 'One answer is more explicit about retry behavior.',
  recommendedAnswerModel: 'ChatGPT',
  recommendationReason: 'It explains the follow-up path more clearly.',
  nextQuestion: 'Which follow-up should we ask next?',
  synthesisDraft: 'We should ask for the next browser-native validation step.',
  provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
  model: 'ChatGPT',
  createdAt: 10,
};

describe('workflow runtime substrate', () => {
  it('returns waiting_external for compare until an external result arrives', () => {
    const run = createWorkflowRunState(
      compareWorkflow,
      {
        prompt: 'Compare the latest answers.',
        sessionId: 'session-1',
        models: ['ChatGPT', 'Gemini'],
      },
      1
    );

    const result = advanceWorkflowRun(compareWorkflow, run, 2);

    expect(result.run.status).toBe(WORKFLOW_RUN_STATUSES.WAITING_EXTERNAL);
    expect(result.run.waitingForStepId).toBe('compare');
    expect(result.emittedAction).toEqual({
      command: WORKFLOW_STEP_TYPES.COMPARE,
      stepId: 'compare',
      args: {
        prompt: 'Compare the latest answers.',
        sessionId: 'session-1',
        models: ['ChatGPT', 'Gemini'],
      },
    });
  });

  it('completes a compare -> analyze_compare -> seed_follow_up chain after external updates', () => {
    const initialRun = createWorkflowRunState(
      compareWorkflow,
      {
        prompt: 'Compare the latest answers.',
        sessionId: 'session-1',
        models: ['ChatGPT', 'Gemini'],
      },
      1
    );

    const waitingOnCompare = advanceWorkflowRun(compareWorkflow, initialRun, 2).run;
    const compareCompleted = applyWorkflowExternalUpdate(
      compareWorkflow,
      waitingOnCompare,
      {
        stepId: 'compare',
        status: 'completed',
        output: {
          type: WORKFLOW_STEP_TYPES.COMPARE,
          prompt: 'Compare the latest answers.',
          sessionId: 'session-1',
          turnId: 'turn-1',
          requestId: 'request-1',
          requestedModels: ['ChatGPT', 'Gemini'],
          completedModels: ['ChatGPT', 'Gemini'],
        },
      },
      3
    );

    const waitingOnAnalyze = advanceWorkflowRun(compareWorkflow, compareCompleted, 4);
    expect(waitingOnAnalyze.run.status).toBe(WORKFLOW_RUN_STATUSES.WAITING_EXTERNAL);
    expect(waitingOnAnalyze.emittedAction).toEqual({
      command: WORKFLOW_STEP_TYPES.ANALYZE_COMPARE,
      stepId: 'analyze',
      args: {
        sessionId: 'session-1',
        turnId: 'turn-1',
      },
    });

    const analyzeCompleted = applyWorkflowExternalUpdate(
      compareWorkflow,
      waitingOnAnalyze.run,
      {
        stepId: 'analyze',
        status: 'completed',
        output: {
          type: WORKFLOW_STEP_TYPES.ANALYZE_COMPARE,
          sessionId: 'session-1',
          turnId: 'turn-1',
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          analystModel: 'ChatGPT',
          result: analysisResult,
        },
      },
      5
    );

    const completed = advanceWorkflowRun(compareWorkflow, analyzeCompleted, 6);

    expect(completed.run.status).toBe(WORKFLOW_RUN_STATUSES.SUCCESS);
    expect(completed.run.lastOutput).toEqual({
      type: WORKFLOW_STEP_TYPES.SEED_FOLLOW_UP,
      prompt: 'Which follow-up should we ask next?',
      sessionId: 'session-1',
      turnId: 'turn-1',
    });
  });

  it('resolves bindings from workflow input, prior step output, and analysis result', () => {
    const workflow: WorkflowDefinition = {
      id: 'binding-check',
      version: '1',
      topology: WORKFLOW_TOPOLOGIES.LINEAR,
      steps: [
        {
          id: 'compare',
          type: WORKFLOW_STEP_TYPES.COMPARE,
          bindings: {
            prompt: {
              source: WORKFLOW_BINDING_SOURCES.INPUT,
              path: 'prompt',
            },
            sessionId: {
              source: WORKFLOW_BINDING_SOURCES.INPUT,
              path: 'sessionId',
            },
          },
        },
        {
          id: 'analyze',
          type: WORKFLOW_STEP_TYPES.ANALYZE_COMPARE,
          bindings: {
            turnId: {
              source: WORKFLOW_BINDING_SOURCES.STEP_OUTPUT,
              stepId: 'compare',
              path: 'turnId',
            },
            sessionId: {
              source: WORKFLOW_BINDING_SOURCES.STEP_OUTPUT,
              stepId: 'compare',
              path: 'sessionId',
            },
          },
        },
        {
          id: 'continue',
          type: WORKFLOW_STEP_TYPES.CONTINUE_FROM_ANSWER,
          bindings: {
            prompt: {
              source: WORKFLOW_BINDING_SOURCES.ANALYSIS_RESULT,
              stepId: 'analyze',
              path: 'synthesisDraft',
            },
            sessionId: {
              source: WORKFLOW_BINDING_SOURCES.STEP_OUTPUT,
              stepId: 'compare',
              path: 'sessionId',
            },
            turnId: {
              source: WORKFLOW_BINDING_SOURCES.STEP_OUTPUT,
              stepId: 'compare',
              path: 'turnId',
            },
            answerText: {
              source: WORKFLOW_BINDING_SOURCES.ANALYSIS_RESULT,
              stepId: 'analyze',
              path: 'recommendationReason',
            },
          },
        },
      ],
    };

    const run = createWorkflowRunState(workflow, { prompt: 'Compare', sessionId: 'session-2' }, 1);
    const waitingOnCompare = advanceWorkflowRun(workflow, run, 2).run;
    const compareCompleted = applyWorkflowExternalUpdate(
      workflow,
      waitingOnCompare,
      {
        stepId: 'compare',
        status: 'completed',
        output: {
          type: WORKFLOW_STEP_TYPES.COMPARE,
          prompt: 'Compare',
          sessionId: 'session-2',
          turnId: 'turn-2',
          requestedModels: ['ChatGPT'],
          completedModels: ['ChatGPT'],
        },
      },
      3
    );
    const waitingOnAnalyze = advanceWorkflowRun(workflow, compareCompleted, 4).run;
    const analyzeCompleted = applyWorkflowExternalUpdate(
      workflow,
      waitingOnAnalyze,
      {
        stepId: 'analyze',
        status: 'completed',
        output: {
          type: WORKFLOW_STEP_TYPES.ANALYZE_COMPARE,
          sessionId: 'session-2',
          turnId: 'turn-2',
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          analystModel: 'ChatGPT',
          result: analysisResult,
        },
      },
      5
    );

    const completed = advanceWorkflowRun(workflow, analyzeCompleted, 6);

    expect(completed.run.lastOutput).toEqual({
      type: WORKFLOW_STEP_TYPES.CONTINUE_FROM_ANSWER,
      prompt: 'We should ask for the next browser-native validation step.',
      sessionId: 'session-2',
      turnId: 'turn-2',
      answerText: 'It explains the follow-up path more clearly.',
      model: undefined,
    });
  });

  it('rejects out-of-scope workflow shapes such as DAG-like next edges', () => {
    const workflow = {
      id: 'unsupported',
      version: '1',
      topology: WORKFLOW_TOPOLOGIES.LINEAR,
      steps: [
        {
          id: 'compare',
          type: WORKFLOW_STEP_TYPES.COMPARE,
          next: 'analyze',
          bindings: {
            prompt: {
              source: WORKFLOW_BINDING_SOURCES.INPUT,
              path: 'prompt',
            },
          },
        },
      ],
    } as unknown as WorkflowDefinition;

    const run = createWorkflowRunState(workflow, { prompt: 'Compare' }, 1);
    const result = advanceWorkflowRun(workflow, run, 2);

    expect(result.run.status).toBe(WORKFLOW_RUN_STATUSES.ERROR);
    expect(result.run.error).toEqual({
      code: WORKFLOW_ERROR_CODES.UNSUPPORTED_SHAPE,
      message:
        'Unsupported step feature "next" on step compare. Only ordered linear steps are supported.',
      stepId: 'compare',
    });
  });
});
