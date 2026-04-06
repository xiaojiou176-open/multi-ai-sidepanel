import type { ModelName } from '../../utils/types';
import {
  WORKFLOW_BINDING_SOURCES,
  WORKFLOW_ERROR_CODES,
  WORKFLOW_RUN_STATUSES,
  WORKFLOW_STEP_STATUSES,
  WORKFLOW_STEP_TYPES,
  WORKFLOW_TOPOLOGIES,
  type WorkflowAdvanceResult,
  type WorkflowBinding,
  type WorkflowBindingPath,
  type WorkflowDefinition,
  type WorkflowErrorDetail,
  type WorkflowExternalAction,
  type WorkflowExternalUpdate,
  type WorkflowRunState,
  type WorkflowSeedFollowUpOutput,
  type WorkflowStepDefinition,
  type WorkflowStepOutput,
  type WorkflowStepRuntimeState,
} from './types';

const UNSUPPORTED_WORKFLOW_KEYS = new Set(['edges', 'branches', 'conditions', 'parallelSteps']);
const UNSUPPORTED_STEP_KEYS = new Set([
  'dependsOn',
  'next',
  'onSuccess',
  'onFailure',
  'when',
  'children',
]);

const getNow = (now?: number) => now ?? Date.now();

const cloneStepStates = (stepStates: WorkflowRunState['stepStates']) =>
  Object.fromEntries(
    Object.entries(stepStates).map(([stepId, stepState]) => [stepId, { ...stepState }])
  ) as WorkflowRunState['stepStates'];

const createError = (
  code: WorkflowErrorDetail['code'],
  message: string,
  details: Partial<WorkflowErrorDetail> = {}
): WorkflowErrorDetail => ({
  code,
  message,
  ...details,
});

const isWorkflowErrorDetail = (value: unknown): value is WorkflowErrorDetail =>
  Boolean(
    value &&
      typeof value === 'object' &&
      'code' in value &&
      typeof (value as { code?: unknown }).code === 'string' &&
      'message' in value &&
      typeof (value as { message?: unknown }).message === 'string'
  );

const normalizePath = (path?: WorkflowBindingPath) => {
  if (!path) return [];
  return Array.isArray(path) ? [...path] : String(path).split('.').filter(Boolean);
};

const readPath = (value: unknown, path?: WorkflowBindingPath): unknown => {
  return normalizePath(path).reduce<unknown>((current: unknown, segment: string) => {
    if (current === null || current === undefined) {
      return undefined;
    }

    if (Array.isArray(current)) {
      const index = Number(segment);
      return Number.isInteger(index) ? current[index] : undefined;
    }

    if (typeof current !== 'object') {
      return undefined;
    }

    return (current as Record<string, unknown>)[segment];
  }, value);
};

const validateWorkflowDefinition = (workflow: WorkflowDefinition): WorkflowErrorDetail | null => {
  if (workflow.topology !== WORKFLOW_TOPOLOGIES.LINEAR) {
    return createError(
      WORKFLOW_ERROR_CODES.UNSUPPORTED_TOPOLOGY,
      `Unsupported workflow topology: ${workflow.topology}. Only linear workflows are allowed.`
    );
  }

  for (const key of UNSUPPORTED_WORKFLOW_KEYS) {
    if (key in (workflow as unknown as Record<string, unknown>)) {
      return createError(
        WORKFLOW_ERROR_CODES.UNSUPPORTED_SHAPE,
        `Unsupported workflow feature "${key}". DAGs, branches, and conditions are out of scope for this substrate.`
      );
    }
  }

  const seenStepIds = new Set<string>();
  for (const step of workflow.steps) {
    if (seenStepIds.has(step.id)) {
      return createError(
        WORKFLOW_ERROR_CODES.DUPLICATE_STEP_ID,
        `Duplicate workflow step id: ${step.id}.`,
        { stepId: step.id }
      );
    }
    seenStepIds.add(step.id);

    for (const key of UNSUPPORTED_STEP_KEYS) {
      if (key in (step as unknown as Record<string, unknown>)) {
        return createError(
          WORKFLOW_ERROR_CODES.UNSUPPORTED_SHAPE,
          `Unsupported step feature "${key}" on step ${step.id}. Only ordered linear steps are supported.`,
          { stepId: step.id }
        );
      }
    }
  }

  return null;
};

const coerceString = (
  value: unknown,
  stepId: string,
  bindingKey: string
): string | WorkflowErrorDetail => {
  if (typeof value === 'string' && value.trim().length > 0) {
    return value;
  }

  return createError(
    WORKFLOW_ERROR_CODES.BINDING_UNRESOLVED,
    `Binding "${bindingKey}" on step ${stepId} must resolve to a non-empty string.`,
    { stepId, bindingKey }
  );
};

const coerceOptionalString = (
  value: unknown,
  stepId: string,
  bindingKey: string
): string | undefined | WorkflowErrorDetail => {
  if (value === undefined) {
    return undefined;
  }

  return coerceString(value, stepId, bindingKey);
};

const coerceModels = (
  value: unknown,
  stepId: string,
  bindingKey: string
): ModelName[] | undefined | WorkflowErrorDetail => {
  if (value === undefined) {
    return undefined;
  }

  if (
    Array.isArray(value) &&
    value.length > 0 &&
    value.every((item) =>
      ['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok'].includes(String(item))
    )
  ) {
    return value as ModelName[];
  }

  return createError(
    WORKFLOW_ERROR_CODES.BINDING_UNRESOLVED,
    `Binding "${bindingKey}" on step ${stepId} must resolve to a non-empty model list.`,
    { stepId, bindingKey }
  );
};

const resolveBinding = (
  binding: WorkflowBinding,
  run: WorkflowRunState,
  step: WorkflowStepDefinition,
  bindingKey: string
): unknown | WorkflowErrorDetail => {
  if (binding.source === WORKFLOW_BINDING_SOURCES.INPUT) {
    const value = binding.path ? readPath(run.input, binding.path) : run.input;
    if (value === undefined) {
      return createError(
        WORKFLOW_ERROR_CODES.BINDING_UNRESOLVED,
        `Input binding "${bindingKey}" on step ${step.id} could not be resolved.`,
        { stepId: step.id, bindingKey }
      );
    }
    return value;
  }

  const sourceStep = run.stepStates[binding.stepId];
  if (!sourceStep) {
    return createError(
      WORKFLOW_ERROR_CODES.UNKNOWN_STEP,
      `Step ${step.id} references unknown step ${binding.stepId}.`,
      { stepId: step.id, bindingKey }
    );
  }

  if (binding.source === WORKFLOW_BINDING_SOURCES.STEP_OUTPUT) {
    if (!sourceStep.output) {
      return createError(
        WORKFLOW_ERROR_CODES.BINDING_UNRESOLVED,
        `Step output binding "${bindingKey}" on step ${step.id} is not available yet.`,
        { stepId: step.id, bindingKey }
      );
    }

    const value = binding.path ? readPath(sourceStep.output, binding.path) : sourceStep.output;
    if (value === undefined) {
      return createError(
        WORKFLOW_ERROR_CODES.BINDING_UNRESOLVED,
        `Step output binding "${bindingKey}" on step ${step.id} could not be resolved.`,
        { stepId: step.id, bindingKey }
      );
    }
    return value;
  }

  if (sourceStep.output?.type !== WORKFLOW_STEP_TYPES.ANALYZE_COMPARE) {
    return createError(
      WORKFLOW_ERROR_CODES.INVALID_BINDING,
      `Analysis-result binding "${bindingKey}" on step ${step.id} must point at an analyze_compare step.`,
      { stepId: step.id, bindingKey }
    );
  }

  const value = binding.path
    ? readPath(sourceStep.output.result, binding.path)
    : sourceStep.output.result;

  if (value === undefined) {
    return createError(
      WORKFLOW_ERROR_CODES.BINDING_UNRESOLVED,
      `Analysis-result binding "${bindingKey}" on step ${step.id} could not be resolved.`,
      { stepId: step.id, bindingKey }
    );
  }

  return value;
};

const resolveStepBindings = (
  run: WorkflowRunState,
  step: WorkflowStepDefinition
): Record<string, unknown> | WorkflowErrorDetail => {
  const resolved: Record<string, unknown> = {};
  const bindings = step.bindings ?? {};

  for (const [bindingKey, bindingValue] of Object.entries(bindings)) {
    if (
      bindingValue &&
      typeof bindingValue === 'object' &&
      'source' in bindingValue &&
      typeof bindingValue.source === 'string'
    ) {
      const result = resolveBinding(bindingValue as WorkflowBinding, run, step, bindingKey);
      if (isWorkflowErrorDetail(result)) {
        return result;
      }
      resolved[bindingKey] = result;
      continue;
    }

    resolved[bindingKey] = bindingValue;
  }

  return resolved;
};

const finalizeWithError = (
  workflow: WorkflowDefinition,
  run: WorkflowRunState,
  error: WorkflowErrorDetail,
  now?: number
): WorkflowAdvanceResult => {
  const nextRun: WorkflowRunState = {
    ...run,
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    status: WORKFLOW_RUN_STATUSES.ERROR,
    error,
    updatedAt: getNow(now),
  };

  return { run: nextRun };
};

const ensureOutputMatchesStep = (
  step: WorkflowStepDefinition,
  output: WorkflowStepOutput
): WorkflowErrorDetail | null => {
  if (output.type === step.type) {
    return null;
  }

  return createError(
    WORKFLOW_ERROR_CODES.INVALID_EXTERNAL_OUTPUT,
    `External output type ${output.type} does not match step ${step.id} (${step.type}).`,
    { stepId: step.id }
  );
};

const completeStep = (
  run: WorkflowRunState,
  step: WorkflowStepDefinition,
  stepState: WorkflowStepRuntimeState,
  output: WorkflowStepOutput,
  bindings: Record<string, unknown>,
  now?: number
): WorkflowRunState => {
  const updatedAt = getNow(now);
  const nextStepStates = cloneStepStates(run.stepStates);
  nextStepStates[step.id] = {
    ...stepState,
    status: WORKFLOW_STEP_STATUSES.SUCCESS,
    bindings,
    output,
    request: undefined,
    error: undefined,
    updatedAt,
  };

  return {
    ...run,
    status: WORKFLOW_RUN_STATUSES.RUNNING,
    cursor: run.cursor + 1,
    stepStates: nextStepStates,
    waitingForStepId: undefined,
    lastEmittedAction: undefined,
    lastOutput: output,
    updatedAt,
  };
};

const waitForExternalStep = (
  run: WorkflowRunState,
  step: WorkflowStepDefinition,
  stepState: WorkflowStepRuntimeState,
  bindings: Record<string, unknown>,
  request: WorkflowExternalAction,
  now?: number
): WorkflowAdvanceResult => {
  const updatedAt = getNow(now);
  const nextStepStates = cloneStepStates(run.stepStates);
  nextStepStates[step.id] = {
    ...stepState,
    status: WORKFLOW_STEP_STATUSES.WAITING_EXTERNAL,
    bindings,
    request,
    updatedAt,
  };

  return {
    run: {
      ...run,
      status: WORKFLOW_RUN_STATUSES.WAITING_EXTERNAL,
      stepStates: nextStepStates,
      waitingForStepId: step.id,
      lastEmittedAction: request,
      updatedAt,
    },
    emittedAction: request,
  };
};

const buildExternalRequest = (
  step: WorkflowStepDefinition,
  bindings: Record<string, unknown>
): WorkflowExternalAction | WorkflowErrorDetail => {
  if (step.type === WORKFLOW_STEP_TYPES.COMPARE) {
    const prompt = coerceString(bindings.prompt, step.id, 'prompt');
    if (typeof prompt !== 'string') return prompt;
    const sessionId = coerceOptionalString(bindings.sessionId, step.id, 'sessionId');
    if (sessionId && typeof sessionId !== 'string') return sessionId;
    const models = coerceModels(bindings.models, step.id, 'models');
    if (models && !Array.isArray(models)) return models;

    return {
      command: WORKFLOW_STEP_TYPES.COMPARE,
      stepId: step.id,
      args: {
        prompt,
        sessionId,
        models,
      },
    };
  }

  if (step.type === WORKFLOW_STEP_TYPES.ANALYZE_COMPARE) {
    const turnId = coerceString(bindings.turnId, step.id, 'turnId');
    if (typeof turnId !== 'string') return turnId;
    const sessionId = coerceOptionalString(bindings.sessionId, step.id, 'sessionId');
    if (sessionId && typeof sessionId !== 'string') return sessionId;

    return {
      command: WORKFLOW_STEP_TYPES.ANALYZE_COMPARE,
      stepId: step.id,
      args: {
        turnId,
        sessionId,
      },
    };
  }

  const turnId = coerceString(bindings.turnId, step.id, 'turnId');
  if (typeof turnId !== 'string') return turnId;
  const sessionId = coerceOptionalString(bindings.sessionId, step.id, 'sessionId');
  if (sessionId && typeof sessionId !== 'string') return sessionId;
  const models = coerceModels(bindings.models, step.id, 'models');
  if (models && !Array.isArray(models)) return models;

  return {
    command: WORKFLOW_STEP_TYPES.RETRY_FAILED,
    stepId: step.id,
    args: {
      turnId,
      sessionId,
      models,
    },
  };
};

const buildPureOutput = (
  step: WorkflowStepDefinition,
  bindings: Record<string, unknown>
): WorkflowSeedFollowUpOutput | WorkflowStepOutput | WorkflowErrorDetail => {
  const prompt = coerceString(bindings.prompt, step.id, 'prompt');
  if (typeof prompt !== 'string') return prompt;

  const sessionId = coerceOptionalString(bindings.sessionId, step.id, 'sessionId');
  if (sessionId && typeof sessionId !== 'string') return sessionId;
  const turnId = coerceOptionalString(bindings.turnId, step.id, 'turnId');
  if (turnId && typeof turnId !== 'string') return turnId;

  if (step.type === WORKFLOW_STEP_TYPES.SEED_FOLLOW_UP) {
    return {
      type: WORKFLOW_STEP_TYPES.SEED_FOLLOW_UP,
      prompt,
      sessionId,
      turnId,
    };
  }

  const answerText = coerceOptionalString(bindings.answerText, step.id, 'answerText');
  if (answerText && typeof answerText !== 'string') return answerText;
  const model = coerceOptionalString(bindings.model, step.id, 'model');
  if (model && typeof model !== 'string') return model;

  return {
    type: WORKFLOW_STEP_TYPES.CONTINUE_FROM_ANSWER,
    prompt,
    sessionId,
    turnId,
    answerText,
    model: model as ModelName | undefined,
  };
};

export const createWorkflowRunState = (
  workflow: WorkflowDefinition,
  input: Record<string, unknown>,
  now?: number
): WorkflowRunState => {
  const updatedAt = getNow(now);
  return {
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    status: WORKFLOW_RUN_STATUSES.IDLE,
    cursor: 0,
    input,
    stepStates: Object.fromEntries(
      workflow.steps.map((step) => [
        step.id,
        {
          stepId: step.id,
          type: step.type,
          status: WORKFLOW_STEP_STATUSES.PENDING,
          updatedAt,
        },
      ])
    ),
    updatedAt,
  };
};

export const applyWorkflowExternalUpdate = (
  workflow: WorkflowDefinition,
  run: WorkflowRunState,
  update: WorkflowExternalUpdate,
  now?: number
): WorkflowRunState => {
  const updatedAt = getNow(now);
  const step = workflow.steps.find((entry) => entry.id === update.stepId);
  if (!step) {
    return {
      ...run,
      status: WORKFLOW_RUN_STATUSES.ERROR,
      error: createError(
        WORKFLOW_ERROR_CODES.UNKNOWN_STEP,
        `Workflow update targets unknown step ${update.stepId}.`,
        { stepId: update.stepId }
      ),
      updatedAt,
    };
  }

  const stepState = run.stepStates[update.stepId];
  const nextStepStates = cloneStepStates(run.stepStates);

  if (update.status === 'error') {
    nextStepStates[update.stepId] = {
      ...stepState,
      status: WORKFLOW_STEP_STATUSES.ERROR,
      error: update.error,
      updatedAt,
    };

    return {
      ...run,
      status: WORKFLOW_RUN_STATUSES.ERROR,
      stepStates: nextStepStates,
      waitingForStepId: undefined,
      error: update.error,
      updatedAt,
    };
  }

  const mismatch = ensureOutputMatchesStep(step, update.output);
  if (mismatch) {
    nextStepStates[update.stepId] = {
      ...stepState,
      status: WORKFLOW_STEP_STATUSES.ERROR,
      error: mismatch,
      updatedAt,
    };
    return {
      ...run,
      status: WORKFLOW_RUN_STATUSES.ERROR,
      stepStates: nextStepStates,
      waitingForStepId: undefined,
      error: mismatch,
      updatedAt,
    };
  }

  nextStepStates[update.stepId] = {
    ...stepState,
    status: WORKFLOW_STEP_STATUSES.SUCCESS,
    output: update.output,
    request: undefined,
    error: undefined,
    updatedAt,
  };

  return {
    ...run,
    status: WORKFLOW_RUN_STATUSES.RUNNING,
    stepStates: nextStepStates,
    waitingForStepId: undefined,
    lastOutput: update.output,
    updatedAt,
  };
};

export const advanceWorkflowRun = (
  workflow: WorkflowDefinition,
  run: WorkflowRunState,
  now?: number
): WorkflowAdvanceResult => {
  const validationError = validateWorkflowDefinition(workflow);
  if (validationError) {
    return finalizeWithError(workflow, run, validationError, now);
  }

  let currentRun: WorkflowRunState = {
    ...run,
    workflowId: workflow.id,
    workflowVersion: workflow.version,
    stepStates: cloneStepStates(run.stepStates),
    status:
      run.status === WORKFLOW_RUN_STATUSES.IDLE ? WORKFLOW_RUN_STATUSES.RUNNING : run.status,
    updatedAt: getNow(now),
  };

  while (currentRun.cursor < workflow.steps.length) {
    const step = workflow.steps[currentRun.cursor];
    const stepState = currentRun.stepStates[step.id];

    if (!stepState) {
      return finalizeWithError(
        workflow,
        currentRun,
        createError(
          WORKFLOW_ERROR_CODES.UNKNOWN_STEP,
          `Missing runtime state for step ${step.id}.`,
          { stepId: step.id }
        ),
        now
      );
    }

    if (stepState.status === WORKFLOW_STEP_STATUSES.ERROR && stepState.error) {
      return finalizeWithError(workflow, currentRun, stepState.error, now);
    }

    if (stepState.status === WORKFLOW_STEP_STATUSES.SUCCESS && stepState.output) {
      currentRun = {
        ...currentRun,
        cursor: currentRun.cursor + 1,
        lastOutput: stepState.output,
        status: WORKFLOW_RUN_STATUSES.RUNNING,
        updatedAt: getNow(now),
      };
      continue;
    }

    const resolvedBindings = resolveStepBindings(currentRun, step);
    if (isWorkflowErrorDetail(resolvedBindings)) {
      return finalizeWithError(workflow, currentRun, resolvedBindings, now);
    }

    if (
      step.type === WORKFLOW_STEP_TYPES.COMPARE ||
      step.type === WORKFLOW_STEP_TYPES.ANALYZE_COMPARE ||
      step.type === WORKFLOW_STEP_TYPES.RETRY_FAILED
    ) {
      if (stepState.request) {
        return {
          run: {
            ...currentRun,
            status: WORKFLOW_RUN_STATUSES.WAITING_EXTERNAL,
            waitingForStepId: step.id,
            lastEmittedAction: stepState.request,
            updatedAt: getNow(now),
          },
          emittedAction: stepState.request,
        };
      }

      const request = buildExternalRequest(step, resolvedBindings);
      if (isWorkflowErrorDetail(request)) {
        return finalizeWithError(workflow, currentRun, request, now);
      }

      return waitForExternalStep(currentRun, step, stepState, resolvedBindings, request, now);
    }

    const output = buildPureOutput(step, resolvedBindings);
    if (isWorkflowErrorDetail(output)) {
      return finalizeWithError(workflow, currentRun, output, now);
    }

    currentRun = completeStep(currentRun, step, stepState, output, resolvedBindings, now);
  }

  return {
    run: {
      ...currentRun,
      status: WORKFLOW_RUN_STATUSES.SUCCESS,
      waitingForStepId: undefined,
      updatedAt: getNow(now),
    },
  };
};

export const createCompareAnalyzeFollowUpWorkflow = (): WorkflowDefinition => ({
  id: 'compare-analyze-follow-up',
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
        models: {
          source: WORKFLOW_BINDING_SOURCES.INPUT,
          path: 'models',
        },
      },
    },
    {
      id: 'analyze',
      type: WORKFLOW_STEP_TYPES.ANALYZE_COMPARE,
      bindings: {
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
      },
    },
    {
      id: 'seed-follow-up',
      type: WORKFLOW_STEP_TYPES.SEED_FOLLOW_UP,
      bindings: {
        prompt: {
          source: WORKFLOW_BINDING_SOURCES.ANALYSIS_RESULT,
          stepId: 'analyze',
          path: 'nextQuestion',
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
      },
    },
  ],
});
