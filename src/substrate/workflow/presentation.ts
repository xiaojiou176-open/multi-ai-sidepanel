import { SUBSTRATE_ACTION_NAMES, type SubstrateActionSuccessPayloadMap } from '../api/contracts';
import type { ModelName } from '../../utils/types';
import type { WorkflowExternalAction } from './types';

type WorkflowListRunPayload = SubstrateActionSuccessPayloadMap['list_workflow_runs']['runs'][number];

export type WorkflowPresentableRun =
  | SubstrateActionSuccessPayloadMap['run_workflow']
  | SubstrateActionSuccessPayloadMap['get_workflow_run']
  | SubstrateActionSuccessPayloadMap['resume_workflow']
  | WorkflowListRunPayload;

export interface WorkflowRunPresentation {
  currentStepLabel?: string;
  seedPrompt?: string;
  nextActionLabel?: string;
  nextActionSummary?: string;
  waitingSummary?: string;
  emittedActionCommand?: WorkflowExternalAction['command'];
  emittedActionStepId?: string;
  resumeTemplate?: Record<string, unknown>;
}

const DEFAULT_MODELS: ModelName[] = ['ChatGPT'];

const normalizeStepKey = (value?: string) => value?.replace(/_/g, '-');

export const formatWorkflowStepLabel = (value?: string) => {
  switch (normalizeStepKey(value)) {
    case 'compare':
      return 'Compare';
    case 'analyze':
    case 'analyze-compare':
      return 'Analyze compare';
    case 'retry-failed':
      return 'Retry failed models';
    case 'seed-follow-up':
    case 'follow-up':
    case 'follow-up-seed':
      return 'Seed next compare';
    case 'continue-from-answer':
      return 'Continue from answer';
    default:
      return value;
  }
};

const extractSeedPrompt = (output: unknown) => {
  if (!output || typeof output !== 'object' || !('prompt' in output)) {
    return undefined;
  }

  const prompt = output.prompt;
  return typeof prompt === 'string' && prompt.trim().length > 0 ? prompt : undefined;
};

const buildResumeTemplate = (action?: WorkflowExternalAction) => {
  if (!action) {
    return undefined;
  }

  switch (action.command) {
    case SUBSTRATE_ACTION_NAMES.COMPARE: {
      const models = action.args.models?.length ? action.args.models : DEFAULT_MODELS;
      return {
        stepId: action.stepId,
        status: 'completed',
        output: {
          type: 'compare',
          prompt: action.args.prompt,
          sessionId: action.args.sessionId ?? '<session-id>',
          turnId: '<turn-id>',
          requestId: null,
          requestedModels: models,
          completedModels: models,
        },
      };
    }
    case SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE:
      return {
        stepId: action.stepId,
        status: 'completed',
        output: {
          type: 'analyze_compare',
          sessionId: action.args.sessionId ?? '<session-id>',
          turnId: action.args.turnId,
          provider: 'browser_session',
          analystModel: 'ChatGPT',
          result: {
            consensusSummary: '<consensus-summary>',
            disagreementSummary: '<disagreement-summary>',
            recommendationReason: '<recommendation-reason>',
            nextQuestion: '<next-question>',
            provider: 'browser_session',
            model: 'ChatGPT',
            createdAt: 0,
          },
        },
      };
    case SUBSTRATE_ACTION_NAMES.RETRY_FAILED:
      return {
        stepId: action.stepId,
        status: 'completed',
        output: {
          type: 'retry_failed',
          sessionId: action.args.sessionId ?? '<session-id>',
          turnId: action.args.turnId,
          requestId: null,
          requestedModels: action.args.models?.length ? action.args.models : DEFAULT_MODELS,
        },
      };
    default:
      return undefined;
  }
};

export const describeWorkflowExternalAction = (action?: WorkflowExternalAction) => {
  if (!action) {
    return undefined;
  }

  switch (action.command) {
    case SUBSTRATE_ACTION_NAMES.COMPARE:
      return `Run Compare for ${action.args.models?.join(', ') ?? DEFAULT_MODELS.join(', ')} with the staged prompt.`;
    case SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE:
      return `Run AI Compare Analyst for turn ${action.args.turnId}.`;
    case SUBSTRATE_ACTION_NAMES.RETRY_FAILED:
      return `Retry the failed models for turn ${action.args.turnId}.`;
    default:
      return undefined;
  }
};

export const presentWorkflowRun = (run: WorkflowPresentableRun): WorkflowRunPresentation => {
  const seedPrompt = 'output' in run ? extractSeedPrompt(run.output) : undefined;
  const nextActionSummary = describeWorkflowExternalAction(run.emittedAction);
  const emittedActionStepId = run.emittedAction?.stepId;

  return {
    currentStepLabel: formatWorkflowStepLabel(run.currentStepId),
    seedPrompt,
    nextActionLabel: formatWorkflowStepLabel(emittedActionStepId ?? run.emittedAction?.command),
    nextActionSummary,
    waitingSummary:
      ('waitingFor' in run && typeof run.waitingFor === 'string' && run.waitingFor.trim().length > 0
        ? run.waitingFor
        : nextActionSummary) ?? undefined,
    emittedActionCommand: run.emittedAction?.command,
    emittedActionStepId,
    resumeTemplate: buildResumeTemplate(run.emittedAction),
  };
};
