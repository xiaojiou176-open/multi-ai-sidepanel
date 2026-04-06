import { executeProductAction } from '../../background/productActions';
import { StorageService } from '../../services/storage';
import {
  applyWorkflowExternalUpdate,
  advanceWorkflowRun,
  createCompareAnalyzeFollowUpWorkflow,
  createWorkflowRunState,
  WORKFLOW_RUN_STATUSES,
  type WorkflowExternalUpdate,
} from '../workflow';
import type { ModelName } from '../../utils/types';
import {
  createSubstrateApiFailure,
  createSubstrateApiSuccess,
  SubstrateActionArgSchemas,
  SUBSTRATE_ACTION_NAMES,
  type SubstrateActionArgsMap,
  type SubstrateActionName,
  type SubstrateApiError,
  type SubstrateApiResultEnvelope,
} from './contracts';

const createCommand = <TAction extends SubstrateActionName>(action: TAction) => ({
  id: crypto.randomUUID(),
  action,
});

const createError = (error: SubstrateApiError) => error;

const WORKFLOW_TEMPLATE_ID = 'compare-analyze-follow-up';

type CompareLikeResult = {
  status: string;
  sessionId: string;
  turnId: string | null;
  requestId?: string | null;
  requestedModels?: unknown[];
  readyModels?: unknown[];
  blockedReports?: unknown[];
};

type AnalyzeCompareResult = {
  status: string;
  reason?: string;
  message?: string;
  sessionId?: string;
  turnId?: string;
};

const executeCompareLikeAction = async (
  action: 'compare' | 'retry_failed',
  args: SubstrateActionArgsMap['compare'] | SubstrateActionArgsMap['retry_failed']
): Promise<SubstrateApiResultEnvelope> => {
  const result = (await executeProductAction(action, args as never)) as CompareLikeResult;

  if (result.status === 'queued' || result.status === 'partially_blocked') {
    return createSubstrateApiSuccess(createCommand(action), {
      status: result.status,
      sessionId: result.sessionId,
      turnId: result.turnId,
      requestId: result.requestId,
      requestedModels: result.requestedModels,
      readyModels: result.readyModels,
      blockedReports: result.blockedReports,
    } as never);
  }

  return createSubstrateApiFailure(
    createCommand(action),
    createError({
      kind: result.status === 'blocked' ? 'blocked' : 'runtime',
      code: result.status === 'blocked' ? `${action}_blocked` : `${action}_delivery_failed`,
      message:
        action === SUBSTRATE_ACTION_NAMES.COMPARE
          ? 'Prompt Switchboard could not queue the requested compare run.'
          : 'Prompt Switchboard could not queue the requested retry run.',
      retryable: true,
      details: {
        ...result,
      } as never,
    })
  );
};

const executeAnalyzeCompareAction = async (
  args: SubstrateActionArgsMap['analyze_compare']
): Promise<SubstrateApiResultEnvelope> => {
  const result = (await executeProductAction(
    SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE,
    args
  )) as AnalyzeCompareResult;

  if (result.status === 'success') {
    return createSubstrateApiSuccess(
      createCommand(SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE),
      result as never
    );
  }

  return createSubstrateApiFailure(
    createCommand(SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE),
    createError({
      kind:
        result.reason === 'needs_two_completed_answers' || result.reason === 'active_compare_in_flight'
          ? 'waiting_external'
          : result.reason === 'turn_not_found'
            ? 'validation'
            : result.status === 'blocked'
              ? 'blocked'
              : 'runtime',
      code: result.reason ?? 'analysis_failed',
      message:
        result.message ??
        'Prompt Switchboard could not finish AI Compare Analyst for this turn.',
      retryable: result.reason !== 'turn_not_found',
      details: {
        ...result,
      } as never,
    })
  );
};

const mapRunStatus = (status: string) => {
  switch (status) {
    case 'success':
      return 'completed';
    case 'error':
      return 'failed';
    case 'waiting_external':
      return 'waiting_external';
    case 'running':
      return 'running';
    case 'idle':
    default:
      return 'queued';
  }
};

const resolveWorkflowDefinition = (workflowId: string) => {
  if (workflowId === WORKFLOW_TEMPLATE_ID) {
    return createCompareAnalyzeFollowUpWorkflow();
  }

  return null;
};

const resolveCurrentStepId = (run: ReturnType<typeof createWorkflowRunState>) => {
  if (run.waitingForStepId) {
    return run.waitingForStepId;
  }

  if (run.error?.stepId) {
    return run.error.stepId;
  }

  const latestCompletedStep = Object.values(run.stepStates)
    .filter((step) => step.status === 'success' || step.status === 'error')
    .at(-1);

  return latestCompletedStep?.stepId;
};

const toWorkflowSummary = (runId: string, run: ReturnType<typeof createWorkflowRunState>) => ({
  runId,
  workflowId: run.workflowId,
  status: mapRunStatus(run.status),
  requestedAt: run.updatedAt,
  startedAt: run.updatedAt,
  currentStepId: resolveCurrentStepId(run),
  emittedAction: run.lastEmittedAction,
});

const toWorkflowDetails = (runId: string, run: ReturnType<typeof createWorkflowRunState>) => ({
  ...toWorkflowSummary(runId, run),
  steps: Object.values(run.stepStates)
    .filter((step) =>
      ['compare', 'analyze_compare', 'retry_failed', 'seed_follow_up', 'continue_from_answer'].includes(step.type)
    )
    .map((step) => ({
      id: step.stepId,
      action: step.type,
      status:
        step.status === 'success'
          ? 'completed'
          : step.status === 'error'
            ? 'failed'
            : step.status,
      startedAt: step.updatedAt,
      finishedAt: step.status === 'success' || step.status === 'error' ? step.updatedAt : undefined,
      message: step.error?.message,
      output:
        step.output && typeof step.output === 'object'
          ? (step.output as unknown as Record<string, unknown>)
          : undefined,
      error: step.error
        ? {
            kind: 'runtime',
            code: step.error.code,
            message: step.error.message,
            retryable: false,
          }
        : undefined,
    })),
  output:
    run.lastOutput && typeof run.lastOutput === 'object'
      ? (run.lastOutput as unknown as Record<string, unknown>)
      : undefined,
  waitingFor: run.waitingForStepId ? `waiting for step ${run.waitingForStepId}` : undefined,
  emittedAction: run.lastEmittedAction,
});

const executeRunWorkflowAction = async (
  args: SubstrateActionArgsMap['run_workflow']
): Promise<SubstrateApiResultEnvelope> => {
  const workflow = resolveWorkflowDefinition(args.workflowId);
  if (!workflow) {
    return createSubstrateApiFailure(createCommand(SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW), {
      kind: 'validation',
      code: 'workflow_template_unknown',
      message: `Unknown workflow template: ${args.workflowId}.`,
      retryable: false,
    });
  }

  const runId = crypto.randomUUID();
  let run = createWorkflowRunState(workflow, {
    ...(args.input ?? {}),
    sessionId: args.sessionId ?? args.input?.sessionId,
    turnId: args.turnId ?? args.input?.turnId,
  });

  let advanced = advanceWorkflowRun(workflow, run);
  run = advanced.run;

  if (args.turnId) {
    const inputModels = ((args.input?.models as ModelName[] | undefined) ?? ['ChatGPT']) as ModelName[];
    run = applyWorkflowExternalUpdate(
      workflow,
      run,
      {
        stepId: 'compare',
        status: 'completed',
        output: {
          type: 'compare',
          prompt: String(args.input?.prompt ?? ''),
          sessionId: args.sessionId,
          turnId: args.turnId,
          requestId: null,
          requestedModels: inputModels,
          completedModels: inputModels,
        },
      }
    );
    advanced = advanceWorkflowRun(workflow, run);
    run = advanced.run;
  }

  const analysisResult =
    args.input && typeof args.input.analysisResult === 'object' && args.input.analysisResult
      ? (args.input.analysisResult as Record<string, unknown>)
      : null;

  if (args.turnId && analysisResult) {
    run = applyWorkflowExternalUpdate(
      workflow,
      run,
      {
        stepId: 'analyze',
        status: 'completed',
        output: {
          type: 'analyze_compare',
          sessionId: args.sessionId,
          turnId: args.turnId,
          provider: String(analysisResult.provider ?? 'browser_session'),
          analystModel: String(analysisResult.model ?? 'ChatGPT'),
          result: analysisResult as never,
        },
      }
    );
    advanced = advanceWorkflowRun(workflow, run);
    run = advanced.run;
  }

  await StorageService.saveWorkflowRun({ runId, run });
  return createSubstrateApiSuccess(createCommand(SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW), {
    ...toWorkflowSummary(runId, run),
    input: (args.input ?? {}) as never,
  } as never);
};

const executeListWorkflowRunsAction = async (
  args: SubstrateActionArgsMap['list_workflow_runs']
): Promise<SubstrateApiResultEnvelope> => {
  const records = await StorageService.getWorkflowRuns();
  const sorted = [...records].sort((left, right) => right.run.updatedAt - left.run.updatedAt);
  const limited = args.limit ? sorted.slice(0, args.limit) : sorted;

  return createSubstrateApiSuccess(
    createCommand(SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS),
    {
      runs: limited.map((record) => toWorkflowSummary(record.runId, record.run)),
    } as never
  );
};

const executeGetWorkflowRunAction = async (
  args: SubstrateActionArgsMap['get_workflow_run']
): Promise<SubstrateApiResultEnvelope> => {
  const record = await StorageService.getWorkflowRun(args.runId);
  if (!record) {
    return createSubstrateApiFailure(createCommand(SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN), {
      kind: 'validation',
      code: 'workflow_run_not_found',
      message:
        `Workflow run ${args.runId} is no longer available. ` +
        'Workflow snapshots are only kept for the current browser session, so stage the next step again from the compare turn.',
      retryable: false,
    });
  }

  return createSubstrateApiSuccess(
    createCommand(SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN),
    toWorkflowDetails(record.runId, record.run) as never
  );
};

const executeResumeWorkflowAction = async (
  args: SubstrateActionArgsMap['resume_workflow']
): Promise<SubstrateApiResultEnvelope> => {
  const record = await StorageService.getWorkflowRun(args.runId);
  if (!record) {
    return createSubstrateApiFailure(createCommand(SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW), {
      kind: 'validation',
      code: 'workflow_run_not_found',
      message:
        `Workflow run ${args.runId} is no longer available. ` +
        'Workflow snapshots are only kept for the current browser session, so stage the next step again from the compare turn.',
      retryable: false,
    });
  }

  const workflow = resolveWorkflowDefinition(record.run.workflowId);
  if (!workflow) {
    return createSubstrateApiFailure(createCommand(SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW), {
      kind: 'validation',
      code: 'workflow_template_unknown',
      message: `Unknown workflow template: ${record.run.workflowId}.`,
      retryable: false,
    });
  }

  if (record.run.status === WORKFLOW_RUN_STATUSES.WAITING_EXTERNAL && !args.externalUpdate) {
    return createSubstrateApiFailure(createCommand(SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW), {
      kind: 'waiting_external',
      code: 'workflow_external_update_required',
      message:
        'This workflow is waiting for an external step result. Provide `externalUpdate` or inspect the emitted action first.',
      retryable: true,
      details: {
        runId: record.runId,
        workflowId: record.run.workflowId,
        currentStepId: record.run.waitingForStepId,
        emittedAction: record.run.lastEmittedAction,
      } as never,
    });
  }

  const updatedRun = args.externalUpdate
    ? applyWorkflowExternalUpdate(
        workflow,
        record.run,
        args.externalUpdate as WorkflowExternalUpdate
      )
    : record.run;
  const advanced = advanceWorkflowRun(workflow, updatedRun);

  await StorageService.saveWorkflowRun({
    runId: record.runId,
    run: advanced.run,
  });

  return createSubstrateApiSuccess(
    createCommand(SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW),
    toWorkflowDetails(record.runId, advanced.run) as never
  );
};

export const executeSubstrateAction = async (
  action: SubstrateActionName,
  rawArgs: unknown
): Promise<SubstrateApiResultEnvelope> => {
  const args = SubstrateActionArgSchemas[action].parse(rawArgs) as SubstrateActionArgsMap[typeof action];

  switch (action) {
    case SUBSTRATE_ACTION_NAMES.CHECK_READINESS:
    case SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS:
    case SUBSTRATE_ACTION_NAMES.GET_SESSION:
    case SUBSTRATE_ACTION_NAMES.LIST_SESSIONS:
    case SUBSTRATE_ACTION_NAMES.EXPORT_COMPARE: {
      const result = await executeProductAction(action, args as never);
      return createSubstrateApiSuccess(createCommand(action), result as never);
    }
    case SUBSTRATE_ACTION_NAMES.COMPARE:
      return executeCompareLikeAction(action, args as SubstrateActionArgsMap['compare']);
    case SUBSTRATE_ACTION_NAMES.RETRY_FAILED:
      return executeCompareLikeAction(action, args as SubstrateActionArgsMap['retry_failed']);
    case SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE:
      return executeAnalyzeCompareAction(args as SubstrateActionArgsMap['analyze_compare']);
    case SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW:
      return executeRunWorkflowAction(args as SubstrateActionArgsMap['run_workflow']);
    case SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS:
      return executeListWorkflowRunsAction(args as SubstrateActionArgsMap['list_workflow_runs']);
    case SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN:
      return executeGetWorkflowRunAction(args as SubstrateActionArgsMap['get_workflow_run']);
    case SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW:
      return executeResumeWorkflowAction(args as SubstrateActionArgsMap['resume_workflow']);
    default: {
      const exhaustiveCheck: never = action;
      return createSubstrateApiFailure(createCommand(action), {
        kind: 'validation',
        code: 'unsupported_substrate_action',
        message: `Unsupported substrate action: ${String(exhaustiveCheck)}`,
        retryable: false,
      });
    }
  }
};
