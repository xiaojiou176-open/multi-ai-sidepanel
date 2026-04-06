import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeSubstrateAction } from './executor';
import { SUBSTRATE_ACTION_NAMES } from './contracts';
import {
  advanceWorkflowRun,
  createCompareAnalyzeFollowUpWorkflow,
  createWorkflowRunState,
} from '../workflow';

const storageState: {
  runs: Array<{
    runId: string;
    run: ReturnType<typeof createWorkflowRunState>;
  }>;
} = {
  runs: [],
};

vi.mock('../../background/productActions', () => ({
  executeProductAction: vi.fn(),
}));

vi.mock('../../services/storage', () => ({
  StorageService: {
    getWorkflowRuns: vi.fn(async () => storageState.runs),
    getWorkflowRun: vi.fn(async (runId: string) =>
      storageState.runs.find((entry) => entry.runId === runId) ?? null
    ),
    saveWorkflowRun: vi.fn(async (record: { runId: string; run: ReturnType<typeof createWorkflowRunState> }) => {
      const index = storageState.runs.findIndex((entry) => entry.runId === record.runId);
      if (index >= 0) {
        storageState.runs[index] = record;
      } else {
        storageState.runs.unshift(record);
      }
    }),
  },
}));

const createWaitingCompareRun = () => {
  const workflow = createCompareAnalyzeFollowUpWorkflow();
  const advanced = advanceWorkflowRun(
    workflow,
    createWorkflowRunState(workflow, {
      prompt: 'Compare these answers',
      sessionId: 'session-1',
      models: ['ChatGPT'],
    })
  );

  return advanced.run;
};

describe('substrate executor workflow surfaces', () => {
  beforeEach(() => {
    storageState.runs = [];
  });

  it('lists workflow snapshots in descending updatedAt order', async () => {
    storageState.runs = [
      {
        runId: 'run-older',
        run: {
          ...createWaitingCompareRun(),
          updatedAt: 10,
        },
      },
      {
        runId: 'run-newer',
        run: {
          ...createWaitingCompareRun(),
          updatedAt: 20,
        },
      },
    ];

    const result = await executeSubstrateAction(SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS, {});

    expect(result).toMatchObject({
      ok: true,
      action: SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS,
      result: {
        runs: [
          expect.objectContaining({ runId: 'run-newer' }),
          expect.objectContaining({ runId: 'run-older' }),
        ],
      },
    });
  });

  it('requires an external update before resuming a waiting workflow', async () => {
    storageState.runs = [
      {
        runId: 'run-1',
        run: createWaitingCompareRun(),
      },
    ];

    const result = await executeSubstrateAction(SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW, {
      runId: 'run-1',
    });

    expect(result).toMatchObject({
      ok: false,
      action: SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW,
      error: expect.objectContaining({
        kind: 'waiting_external',
        code: 'workflow_external_update_required',
      }),
    });
  });

  it('resumes a waiting workflow and advances to the next emitted action', async () => {
    storageState.runs = [
      {
        runId: 'run-1',
        run: createWaitingCompareRun(),
      },
    ];

    const result = await executeSubstrateAction(SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW, {
      runId: 'run-1',
      externalUpdate: {
        stepId: 'compare',
        status: 'completed',
        output: {
          type: 'compare',
          prompt: 'Compare these answers',
          sessionId: 'session-1',
          turnId: 'turn-1',
          requestId: 'request-1',
          requestedModels: ['ChatGPT'],
          completedModels: ['ChatGPT'],
        },
      },
    });

    expect(result).toMatchObject({
      ok: true,
      action: SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW,
      result: expect.objectContaining({
        runId: 'run-1',
        currentStepId: 'analyze',
        waitingFor: 'waiting for step analyze',
        emittedAction: expect.objectContaining({
          command: 'analyze_compare',
          stepId: 'analyze',
          args: expect.objectContaining({
            turnId: 'turn-1',
            sessionId: 'session-1',
          }),
        }),
      }),
    });
  });

  it('keeps the final workflow step id visible after a completed seed-follow-up run', async () => {
    const runResult = await executeSubstrateAction(SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW, {
      workflowId: 'compare-analyze-follow-up',
      sessionId: 'session-1',
      turnId: 'turn-1',
      input: {
        prompt: 'Compare these answers',
        models: ['ChatGPT'],
        analysisResult: {
          provider: 'browser_session',
          model: 'ChatGPT',
          createdAt: 1,
          consensusSummary: 'Both agree',
          disagreementSummary: 'One is shorter',
          recommendationReason: 'ChatGPT is clearer',
          nextQuestion: 'What should we compare next?',
        },
      },
    });

    expect(runResult).toMatchObject({
      ok: true,
      action: SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW,
      result: expect.objectContaining({
        runId: expect.any(String),
      }),
    });

    const runId = (runResult as { ok: true; result: { runId: string } }).result.runId;
    const detailResult = await executeSubstrateAction(SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN, {
      runId,
    });

    expect(detailResult).toMatchObject({
      ok: true,
      action: SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN,
      result: expect.objectContaining({
        runId,
        status: 'completed',
        currentStepId: 'seed-follow-up',
        output: expect.objectContaining({
          type: 'seed_follow_up',
          prompt: 'What should we compare next?',
        }),
      }),
    });
  });
});
