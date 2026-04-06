import type { CompareAnalysisResult } from '../../services/analysis';
import type { ModelName } from '../../utils/types';

export const WORKFLOW_TOPOLOGIES = {
  LINEAR: 'linear',
} as const;

export type WorkflowTopology = (typeof WORKFLOW_TOPOLOGIES)[keyof typeof WORKFLOW_TOPOLOGIES];

export const WORKFLOW_STEP_TYPES = {
  COMPARE: 'compare',
  ANALYZE_COMPARE: 'analyze_compare',
  RETRY_FAILED: 'retry_failed',
  SEED_FOLLOW_UP: 'seed_follow_up',
  CONTINUE_FROM_ANSWER: 'continue_from_answer',
} as const;

export type WorkflowStepType = (typeof WORKFLOW_STEP_TYPES)[keyof typeof WORKFLOW_STEP_TYPES];

export const WORKFLOW_RUN_STATUSES = {
  IDLE: 'idle',
  RUNNING: 'running',
  WAITING_EXTERNAL: 'waiting_external',
  SUCCESS: 'success',
  ERROR: 'error',
} as const;

export type WorkflowRunStatus = (typeof WORKFLOW_RUN_STATUSES)[keyof typeof WORKFLOW_RUN_STATUSES];

export const WORKFLOW_STEP_STATUSES = {
  PENDING: 'pending',
  WAITING_EXTERNAL: 'waiting_external',
  SUCCESS: 'success',
  ERROR: 'error',
} as const;

export type WorkflowStepStatus =
  (typeof WORKFLOW_STEP_STATUSES)[keyof typeof WORKFLOW_STEP_STATUSES];

export const WORKFLOW_ERROR_CODES = {
  UNSUPPORTED_TOPOLOGY: 'unsupported_topology',
  UNSUPPORTED_SHAPE: 'unsupported_shape',
  DUPLICATE_STEP_ID: 'duplicate_step_id',
  UNKNOWN_STEP: 'unknown_step',
  INVALID_BINDING: 'invalid_binding',
  BINDING_UNRESOLVED: 'binding_unresolved',
  INVALID_EXTERNAL_OUTPUT: 'invalid_external_output',
} as const;

export type WorkflowErrorCode = (typeof WORKFLOW_ERROR_CODES)[keyof typeof WORKFLOW_ERROR_CODES];

export interface WorkflowErrorDetail {
  code: WorkflowErrorCode;
  message: string;
  stepId?: string;
  bindingKey?: string;
}

export const WORKFLOW_BINDING_SOURCES = {
  INPUT: 'input',
  STEP_OUTPUT: 'step_output',
  ANALYSIS_RESULT: 'analysis_result',
} as const;

export type WorkflowBindingSource =
  (typeof WORKFLOW_BINDING_SOURCES)[keyof typeof WORKFLOW_BINDING_SOURCES];

export type WorkflowBindingPath = string | readonly string[];

export interface WorkflowInputBinding {
  source: typeof WORKFLOW_BINDING_SOURCES.INPUT;
  path?: WorkflowBindingPath;
}

export interface WorkflowStepOutputBinding {
  source: typeof WORKFLOW_BINDING_SOURCES.STEP_OUTPUT;
  stepId: string;
  path?: WorkflowBindingPath;
}

export interface WorkflowAnalysisResultBinding {
  source: typeof WORKFLOW_BINDING_SOURCES.ANALYSIS_RESULT;
  stepId: string;
  path?: WorkflowBindingPath;
}

export type WorkflowBinding =
  | WorkflowInputBinding
  | WorkflowStepOutputBinding
  | WorkflowAnalysisResultBinding;

export type WorkflowLiteralValue =
  | string
  | number
  | boolean
  | null
  | string[]
  | number[]
  | boolean[]
  | Record<string, unknown>;

export type WorkflowBindingValue = WorkflowBinding | WorkflowLiteralValue;

export interface WorkflowStepDefinition {
  id: string;
  type: WorkflowStepType;
  bindings?: Record<string, WorkflowBindingValue>;
}

export interface WorkflowDefinition {
  id: string;
  version: string;
  topology: WorkflowTopology;
  steps: WorkflowStepDefinition[];
}

export interface WorkflowCompareAction {
  command: typeof WORKFLOW_STEP_TYPES.COMPARE;
  stepId: string;
  args: {
    prompt: string;
    sessionId?: string;
    models?: ModelName[];
  };
}

export interface WorkflowAnalyzeCompareAction {
  command: typeof WORKFLOW_STEP_TYPES.ANALYZE_COMPARE;
  stepId: string;
  args: {
    turnId: string;
    sessionId?: string;
  };
}

export interface WorkflowRetryFailedAction {
  command: typeof WORKFLOW_STEP_TYPES.RETRY_FAILED;
  stepId: string;
  args: {
    turnId: string;
    sessionId?: string;
    models?: ModelName[];
  };
}

export type WorkflowExternalAction =
  | WorkflowCompareAction
  | WorkflowAnalyzeCompareAction
  | WorkflowRetryFailedAction;

export interface WorkflowCompareOutput {
  type: typeof WORKFLOW_STEP_TYPES.COMPARE;
  prompt: string;
  sessionId?: string;
  turnId: string;
  requestId?: string | null;
  requestedModels: ModelName[];
  completedModels: ModelName[];
}

export interface WorkflowAnalyzeCompareOutput {
  type: typeof WORKFLOW_STEP_TYPES.ANALYZE_COMPARE;
  sessionId?: string;
  turnId: string;
  provider?: string;
  analystModel?: string;
  result: CompareAnalysisResult;
}

export interface WorkflowRetryFailedOutput {
  type: typeof WORKFLOW_STEP_TYPES.RETRY_FAILED;
  sessionId?: string;
  turnId: string;
  requestId?: string | null;
  requestedModels: ModelName[];
}

export interface WorkflowSeedFollowUpOutput {
  type: typeof WORKFLOW_STEP_TYPES.SEED_FOLLOW_UP;
  prompt: string;
  sessionId?: string;
  turnId?: string;
}

export interface WorkflowContinueFromAnswerOutput {
  type: typeof WORKFLOW_STEP_TYPES.CONTINUE_FROM_ANSWER;
  prompt: string;
  sessionId?: string;
  turnId?: string;
  answerText?: string;
  model?: ModelName;
}

export type WorkflowStepOutput =
  | WorkflowCompareOutput
  | WorkflowAnalyzeCompareOutput
  | WorkflowRetryFailedOutput
  | WorkflowSeedFollowUpOutput
  | WorkflowContinueFromAnswerOutput;

export interface WorkflowStepRuntimeState {
  stepId: string;
  type: WorkflowStepType;
  status: WorkflowStepStatus;
  bindings?: Record<string, unknown>;
  request?: WorkflowExternalAction;
  output?: WorkflowStepOutput;
  error?: WorkflowErrorDetail;
  updatedAt: number;
}

export interface WorkflowRunState {
  workflowId: string;
  workflowVersion: string;
  status: WorkflowRunStatus;
  cursor: number;
  input: Record<string, unknown>;
  stepStates: Record<string, WorkflowStepRuntimeState>;
  waitingForStepId?: string;
  lastEmittedAction?: WorkflowExternalAction;
  lastOutput?: WorkflowStepOutput;
  error?: WorkflowErrorDetail;
  updatedAt: number;
}

export type WorkflowExternalUpdate =
  | {
      stepId: string;
      status: 'completed';
      output: WorkflowStepOutput;
    }
  | {
      stepId: string;
      status: 'error';
      error: WorkflowErrorDetail;
    };

export interface WorkflowAdvanceResult {
  run: WorkflowRunState;
  emittedAction?: WorkflowExternalAction;
}
