import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BRIDGE_COMMAND_NAMES } from '../bridge/protocol';
import {
  ANALYSIS_PROVIDER_IDS,
  type CompareAnalysisResult,
} from '../services/analysis';
import { ANALYSIS_EXECUTION_SURFACES } from '../services/analysis/types';
import { DELIVERY_STATUS, MESSAGE_ROLES, type Session } from '../utils/types';

const mocks = vi.hoisted(() => ({
  getSessions: vi.fn(),
  getCurrentSessionId: vi.fn(),
  saveSessions: vi.fn(),
  saveCurrentSessionId: vi.fn(),
  getSettings: vi.fn(),
  checkModelsReady: vi.fn(),
  broadcastPrompt: vi.fn(),
  runCompareAnalysis: vi.fn(),
  getExistingTabId: vi.fn(),
  getTabId: vi.fn(),
  buildCompareShareSummary: vi.fn(),
  buildCompareMarkdownExport: vi.fn(),
  buildCompareInsightSummary: vi.fn(),
  buildDisagreementAnalysis: vi.fn(),
  buildCompareAnalysisRequest: vi.fn(),
  summarizeAnalysisAvailability: vi.fn(),
  getAnalysisProvider: vi.fn(),
  runSwitchyardCompareAnalysis: vi.fn(),
}));

const storageState: {
  sessions: Session[];
  currentSessionId: string | null;
  settings: {
    analysis: {
      enabled: boolean;
      provider: 'browser_session' | 'switchyard_runtime';
      model: 'ChatGPT';
    };
  };
} = {
  sessions: [],
  currentSessionId: 'session-1',
  settings: {
    analysis: {
      enabled: true,
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      model: 'ChatGPT',
    },
  },
};

vi.mock('../services/storage', () => ({
  StorageService: {
    getSessions: mocks.getSessions,
    getCurrentSessionId: mocks.getCurrentSessionId,
    saveSessions: mocks.saveSessions,
    saveCurrentSessionId: mocks.saveCurrentSessionId,
    getSettings: mocks.getSettings,
  },
}));

vi.mock('./runtimeActions', () => ({
  checkModelsReady: mocks.checkModelsReady,
  broadcastPrompt: mocks.broadcastPrompt,
  runCompareAnalysis: mocks.runCompareAnalysis,
}));

vi.mock('./switchyardRuntime', () => ({
  runSwitchyardCompareAnalysis: mocks.runSwitchyardCompareAnalysis,
}));

vi.mock('./tabManager', () => ({
  tabManager: {
    getExistingTabId: mocks.getExistingTabId,
    getTabId: mocks.getTabId,
  },
}));

vi.mock('../sidepanel/utils/compareExport', () => ({
  buildCompareShareSummary: mocks.buildCompareShareSummary,
  buildCompareMarkdownExport: mocks.buildCompareMarkdownExport,
}));

vi.mock('../sidepanel/utils/compareInsights', () => ({
  buildCompareInsightSummary: mocks.buildCompareInsightSummary,
}));

vi.mock('../sidepanel/utils/disagreementAnalyzer', () => ({
  buildDisagreementAnalysis: mocks.buildDisagreementAnalysis,
}));

vi.mock('../services/analysis', async () => {
  const actual = await vi.importActual<typeof import('../services/analysis')>(
    '../services/analysis'
  );
  return {
    ...actual,
    buildCompareAnalysisRequest: mocks.buildCompareAnalysisRequest,
    summarizeAnalysisAvailability: mocks.summarizeAnalysisAvailability,
    getAnalysisProvider: mocks.getAnalysisProvider,
  };
});

const buildSession = (id: string, title: string): Session => ({
  id,
  title,
  createdAt: 100,
  updatedAt: 200,
  selectedModels: ['ChatGPT', 'Gemini'],
  messages: [
    {
      id: `${id}-user`,
      role: MESSAGE_ROLES.USER,
      text: 'Compare the trade-offs',
      timestamp: 1_000,
      turnId: `${id}-turn-1`,
      requestedModels: ['ChatGPT', 'Gemini'],
      deliveryStatus: DELIVERY_STATUS.COMPLETE,
      completedAt: 1_000,
    },
    {
      id: `${id}-assistant-1`,
      role: MESSAGE_ROLES.ASSISTANT,
      text: 'ChatGPT answer',
      model: 'ChatGPT',
      timestamp: 1_100,
      turnId: `${id}-turn-1`,
      deliveryStatus: DELIVERY_STATUS.COMPLETE,
      completedAt: 1_100,
    },
    {
      id: `${id}-assistant-2`,
      role: MESSAGE_ROLES.ASSISTANT,
      text: 'Gemini answer',
      model: 'Gemini',
      timestamp: 1_200,
      turnId: `${id}-turn-1`,
      deliveryStatus: DELIVERY_STATUS.COMPLETE,
      completedAt: 1_200,
    },
  ],
});

describe('productActions', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();

    storageState.sessions = [buildSession('session-1', 'Primary'), buildSession('session-2', 'Archive')];
    storageState.currentSessionId = 'session-1';
    storageState.settings.analysis.enabled = true;
    storageState.settings.analysis.provider = ANALYSIS_PROVIDER_IDS.BROWSER_SESSION;
    storageState.settings.analysis.model = 'ChatGPT';

    mocks.getSessions.mockImplementation(async () => storageState.sessions);
    mocks.getCurrentSessionId.mockImplementation(async () => storageState.currentSessionId);
    mocks.saveSessions.mockResolvedValue(undefined);
    mocks.saveCurrentSessionId.mockResolvedValue(undefined);
    mocks.getSettings.mockImplementation(async () => storageState.settings);
    mocks.checkModelsReady.mockResolvedValue([]);
    mocks.broadcastPrompt.mockResolvedValue(undefined);
    mocks.runCompareAnalysis.mockResolvedValue({ ok: true, text: 'raw analysis' });
    mocks.runSwitchyardCompareAnalysis.mockResolvedValue({
      ok: true,
      rawText: 'raw runtime analysis',
      provider: 'chatgpt',
      model: 'gpt-4o',
    });
    mocks.getExistingTabId.mockResolvedValue(11);
    mocks.getTabId.mockResolvedValue(22);
    mocks.buildCompareShareSummary.mockReturnValue('summary export');
    mocks.buildCompareMarkdownExport.mockReturnValue('# markdown export');
    mocks.buildCompareInsightSummary.mockReturnValue({
      completeCount: 2,
      failedCount: 0,
      pendingCount: 0,
      disagreementDetected: false,
      failedModels: [],
    });
    mocks.buildDisagreementAnalysis.mockReturnValue({
      completedModels: ['ChatGPT', 'Gemini'],
      failedModels: [],
      recommendedAction: 'continue_best_answer',
      reasons: ['Use the strongest completed answer.'],
    });
    mocks.buildCompareAnalysisRequest.mockReturnValue({ kind: 'compare_analyst' });
    mocks.summarizeAnalysisAvailability.mockReturnValue({
      canRun: true,
      completedModels: ['ChatGPT', 'Gemini'],
    });
    mocks.getAnalysisProvider.mockReturnValue({
      id: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      availableInBrowserBuild: true,
      executionSurface: ANALYSIS_EXECUTION_SURFACES.BROWSER_TAB,
      prepareRun: vi.fn(() => ({
        provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
        model: 'ChatGPT',
        prompt: 'analysis prompt',
      })),
      parseResult: vi.fn(
        (): CompareAnalysisResult => ({
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          createdAt: 1,
          consensusSummary: 'They broadly agree.',
          disagreementSummary: 'One answer is more implementation-specific.',
          recommendedAnswerModel: 'ChatGPT',
          recommendationReason: 'ChatGPT is the clearest fit.',
          nextQuestion: 'What should we test next?',
          synthesisDraft: 'Start with the clearer answer, then branch into validation.',
        })
      ),
    });
  });

  it('lists recent sessions with limit and current-session markers', async () => {
    const { executeProductAction } = await import('./productActions');

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.LIST_SESSIONS, { limit: 1 });

    expect(result).toEqual({
      sessions: [
        expect.objectContaining({
          id: 'session-1',
          title: 'Primary',
          isCurrent: true,
          turnCount: 1,
          latestTurnId: 'session-1-turn-1',
        }),
      ],
    });
  });

  it('creates a default session when the requested/current session does not exist yet', async () => {
    storageState.sessions = [];
    storageState.currentSessionId = null;

    const { executeProductAction } = await import('./productActions');
    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.CHECK_READINESS, {});

    expect(mocks.saveSessions).toHaveBeenCalledTimes(1);
    expect(mocks.saveCurrentSessionId).toHaveBeenCalledTimes(1);
    expect(result).toEqual({
      models: ['ChatGPT'],
      reports: [],
      checkedAt: expect.any(Number),
    });
  });

  it('captures a current bridge snapshot with session summaries and readiness', async () => {
    mocks.checkModelsReady.mockResolvedValue([
      {
        model: 'ChatGPT',
        ready: true,
        status: 'ready',
        remoteConfigConfigured: false,
        lastCheckedAt: 123,
      },
    ]);
    const { captureBridgeStateSnapshot } = await import('./productActions');

    const result = await captureBridgeStateSnapshot();

    expect(result).toEqual({
      currentSessionId: 'session-1',
      sessions: [
        expect.objectContaining({
          id: 'session-1',
          title: 'Primary',
          isCurrent: true,
          latestTurnId: 'session-1-turn-1',
        }),
        expect.objectContaining({
          id: 'session-2',
          title: 'Archive',
          isCurrent: false,
          latestTurnId: 'session-2-turn-1',
        }),
      ],
      currentSession: expect.objectContaining({
        id: 'session-1',
        title: 'Primary',
        selectedModels: ['ChatGPT', 'Gemini'],
        messageCount: 3,
        turns: [
          expect.objectContaining({
            id: 'session-1-turn-1',
            prompt: 'Compare the trade-offs',
            requestedModels: ['ChatGPT', 'Gemini'],
          }),
        ],
      }),
      readiness: {
        ChatGPT: {
          ready: true,
          status: 'ready',
          hostname: undefined,
          lastCheckedAt: 123,
        },
      },
    });
  });

  it('checks readiness for the resolved model set', async () => {
    mocks.checkModelsReady.mockResolvedValue([
      {
        model: 'ChatGPT',
        ready: true,
        status: 'ready',
        remoteConfigConfigured: false,
        lastCheckedAt: 321,
      },
    ]);
    const { executeProductAction } = await import('./productActions');

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.CHECK_READINESS, {
      models: ['ChatGPT'],
    });

    expect(mocks.checkModelsReady).toHaveBeenCalledWith({ models: ['ChatGPT'] });
    expect(result).toEqual({
      models: ['ChatGPT'],
      reports: [
        expect.objectContaining({
          model: 'ChatGPT',
          ready: true,
          status: 'ready',
        }),
      ],
      checkedAt: expect.any(Number),
    });
  });

  it('reuses existing tabs when opening model tabs for MCP callers', async () => {
    const { executeProductAction } = await import('./productActions');
    mocks.getExistingTabId.mockResolvedValueOnce(11).mockResolvedValueOnce(null);
    mocks.getTabId.mockResolvedValueOnce(22);

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.OPEN_MODEL_TABS, {
      models: ['ChatGPT', 'Gemini'],
    });

    expect(result).toEqual({
      tabs: [
        expect.objectContaining({
          model: 'ChatGPT',
          tabId: 11,
          existed: true,
        }),
        expect.objectContaining({
          model: 'Gemini',
          tabId: 22,
          existed: false,
        }),
      ],
    });
  });

  it('blocks compare when no selected model tab is ready and partially queues when at least one model is ready', async () => {
    const { executeProductAction } = await import('./productActions');

    mocks.checkModelsReady.mockResolvedValueOnce([
      {
        model: 'ChatGPT',
        ready: false,
        status: 'tab_missing',
        remoteConfigConfigured: false,
        failureClass: 'tab_unavailable',
        lastCheckedAt: 1,
      },
    ]);

    await expect(
      executeProductAction(BRIDGE_COMMAND_NAMES.COMPARE, {
        sessionId: 'session-1',
        prompt: 'Compare these answers',
        models: ['ChatGPT'],
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'blocked',
        sessionId: 'session-1',
        turnId: null,
        requestId: null,
        requestedModels: ['ChatGPT'],
        readyModels: [],
        blockedReports: [
          expect.objectContaining({
            model: 'ChatGPT',
            ready: false,
            status: 'tab_missing',
          }),
        ],
        readinessReports: [
          expect.objectContaining({
            model: 'ChatGPT',
            ready: false,
            status: 'tab_missing',
          }),
        ],
      })
    );

    mocks.checkModelsReady.mockResolvedValueOnce([
      {
        model: 'ChatGPT',
        ready: true,
        status: 'ready',
        remoteConfigConfigured: false,
        lastCheckedAt: 2,
      },
      {
        model: 'Gemini',
        ready: false,
        status: 'tab_missing',
        remoteConfigConfigured: false,
        failureClass: 'tab_unavailable',
        lastCheckedAt: 2,
      },
    ]);

    await expect(
      executeProductAction(BRIDGE_COMMAND_NAMES.COMPARE, {
        sessionId: 'session-1',
        prompt: 'Compare these answers',
        models: ['ChatGPT', 'Gemini'],
      })
    ).resolves.toEqual(
      expect.objectContaining({
        status: 'partially_blocked',
        sessionId: 'session-1',
        turnId: expect.any(String),
        requestId: expect.any(String),
        requestedModels: ['ChatGPT', 'Gemini'],
        readyModels: ['ChatGPT'],
        blockedReports: [
          expect.objectContaining({
            model: 'Gemini',
            ready: false,
            status: 'tab_missing',
          }),
        ],
        readinessReports: expect.any(Array),
      })
    );

    expect(mocks.broadcastPrompt).toHaveBeenCalledWith({
      prompt: 'Compare these answers',
      models: ['ChatGPT'],
      sessionId: 'session-1',
      requestId: expect.any(String),
      turnId: expect.any(String),
    });
  });

  it('marks compare turns as delivery_failed when prompt fan-out throws after readiness passes', async () => {
    const { executeProductAction } = await import('./productActions');
    mocks.checkModelsReady.mockResolvedValueOnce([
      {
        model: 'ChatGPT',
        ready: true,
        status: 'ready',
        remoteConfigConfigured: false,
        lastCheckedAt: 5,
      },
    ]);
    mocks.broadcastPrompt.mockRejectedValueOnce(new Error('fanout exploded'));

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.COMPARE, {
      sessionId: 'session-1',
      prompt: 'Compare these answers',
      models: ['ChatGPT'],
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'delivery_failed',
        sessionId: 'session-1',
        turnId: expect.any(String),
        requestId: expect.any(String),
        requestedModels: ['ChatGPT'],
        readyModels: ['ChatGPT'],
        blockedReports: [],
        readinessReports: expect.any(Array),
      })
    );
    expect(mocks.saveSessions).toHaveBeenCalled();
  });

  it('returns session detail with turns and optional messages', async () => {
    const { executeProductAction } = await import('./productActions');

    const withoutMessages = await executeProductAction(BRIDGE_COMMAND_NAMES.GET_SESSION, {
      sessionId: 'session-1',
    });
    const withMessages = await executeProductAction(BRIDGE_COMMAND_NAMES.GET_SESSION, {
      sessionId: 'session-1',
      includeMessages: true,
    });

    expect(withoutMessages).toEqual(
      expect.objectContaining({
        id: 'session-1',
        title: 'Primary',
        turns: [
          expect.objectContaining({
            id: 'session-1-turn-1',
            prompt: 'Compare the trade-offs',
            responseModels: ['ChatGPT', 'Gemini'],
          }),
        ],
        messages: undefined,
      })
    );
    expect(withMessages).toEqual(
      expect.objectContaining({
        id: 'session-1',
        messages: storageState.sessions[0]?.messages,
      })
    );
  });

  it('exports compare turns through the requested summary format', async () => {
    const { executeProductAction } = await import('./productActions');

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.EXPORT_COMPARE, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      format: 'summary',
    });

    expect(mocks.buildCompareShareSummary).toHaveBeenCalled();
    expect(result).toEqual({
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      format: 'summary',
      content: 'summary export',
    });
  });

  it('returns blocked export states for missing turns and supports markdown exports', async () => {
    const { executeProductAction } = await import('./productActions');

    const blocked = await executeProductAction(BRIDGE_COMMAND_NAMES.EXPORT_COMPARE, {
      sessionId: 'session-1',
      turnId: 'missing-turn',
      format: 'summary',
    });
    const markdown = await executeProductAction(BRIDGE_COMMAND_NAMES.EXPORT_COMPARE, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      format: 'markdown',
    });

    expect(blocked).toEqual({
      status: 'blocked',
      reason: 'turn_not_found',
      sessionId: 'session-1',
      turnId: 'missing-turn',
    });
    expect(markdown).toEqual({
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      format: 'markdown',
      content: '# markdown export',
    });
    expect(mocks.buildCompareMarkdownExport).toHaveBeenCalled();
  });

  it('falls back to the latest compare turn when export or analysis does not receive an explicit turn id', async () => {
    const { executeProductAction } = await import('./productActions');

    const exportResult = await executeProductAction(BRIDGE_COMMAND_NAMES.EXPORT_COMPARE, {
      sessionId: 'session-1',
      format: 'summary',
    });
    mocks.checkModelsReady.mockResolvedValueOnce([
      {
        model: 'ChatGPT',
        ready: true,
        status: 'ready',
        remoteConfigConfigured: false,
        lastCheckedAt: 33,
      },
    ]);
    const analysisResult = await executeProductAction(BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE, {
      sessionId: 'session-1',
    });

    expect(exportResult).toEqual({
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      format: 'summary',
      content: 'summary export',
    });
    expect(analysisResult).toEqual({
      status: 'success',
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      analystModel: 'ChatGPT',
      result: expect.objectContaining({
        consensusSummary: 'They broadly agree.',
      }),
    });
  });

  it('blocks retry_failed when the turn has no failed model cards to replay', async () => {
    const { executeProductAction } = await import('./productActions');

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.RETRY_FAILED, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });

    expect(result).toEqual({
      status: 'blocked',
      reason: 'no_failed_models',
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });
  });

  it('retries only failed models and blocks when the target turn is missing', async () => {
    const failedSession = buildSession('session-1', 'Primary');
    failedSession.messages = failedSession.messages.map((message) =>
      message.role === MESSAGE_ROLES.ASSISTANT && message.model === 'Gemini'
        ? {
            ...message,
            deliveryStatus: DELIVERY_STATUS.ERROR,
          }
        : message
    );
    storageState.sessions = [failedSession];

    const { executeProductAction } = await import('./productActions');
    mocks.checkModelsReady.mockResolvedValueOnce([
      {
        model: 'Gemini',
        ready: true,
        status: 'ready',
        remoteConfigConfigured: false,
        lastCheckedAt: 4,
      },
    ]);

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.RETRY_FAILED, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });

    expect(result).toEqual(
      expect.objectContaining({
        status: 'queued',
        sessionId: 'session-1',
        turnId: expect.any(String),
        requestId: expect.any(String),
        requestedModels: ['Gemini'],
        readyModels: ['Gemini'],
        blockedReports: [],
        readinessReports: expect.any(Array),
      })
    );
    expect(mocks.broadcastPrompt).toHaveBeenLastCalledWith({
      prompt: 'Compare the trade-offs',
      models: ['Gemini'],
      sessionId: 'session-1',
      requestId: expect.any(String),
      turnId: expect.any(String),
    });

    const missingTurn = await executeProductAction(BRIDGE_COMMAND_NAMES.RETRY_FAILED, {
      sessionId: 'session-1',
      turnId: 'missing-turn',
      models: ['ChatGPT'],
    });

    expect(missingTurn).toEqual({
      status: 'blocked',
      reason: 'turn_not_found',
      sessionId: 'session-1',
      turnId: 'missing-turn',
    });
  });

  it('blocks compare analysis when the analyst lane is disabled', async () => {
    storageState.settings.analysis.enabled = false;
    const { executeProductAction } = await import('./productActions');

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });

    expect(result).toEqual({
      status: 'blocked',
      reason: 'analysis_disabled',
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });
  });

  it('blocks compare analysis when the turn is missing or availability says it cannot run', async () => {
    const { executeProductAction } = await import('./productActions');

    const missingTurn = await executeProductAction(BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE, {
      sessionId: 'session-1',
      turnId: 'missing-turn',
    });

    expect(missingTurn).toEqual({
      status: 'blocked',
      reason: 'turn_not_found',
      sessionId: 'session-1',
      turnId: 'missing-turn',
    });

    mocks.summarizeAnalysisAvailability.mockReturnValueOnce({
      canRun: false,
      completedModels: ['ChatGPT'],
      blockReason: 'needs_two_completed_answers',
    });

    const unavailable = await executeProductAction(BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });

    expect(unavailable).toEqual({
      status: 'blocked',
      reason: 'needs_two_completed_answers',
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      completedModels: ['ChatGPT'],
    });
  });

  it('blocks compare analysis when the selected provider is unavailable in this browser build', async () => {
    mocks.getAnalysisProvider.mockReturnValue({
      availableInBrowserBuild: false,
      availabilityReason: 'Provider is gated here.',
    });
    const { executeProductAction } = await import('./productActions');

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });

    expect(result).toEqual({
      status: 'blocked',
      reason: 'provider_blocked',
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      message: 'Provider is gated here.',
    });
  });

  it('returns a parsed compare-analysis result when the provider run succeeds', async () => {
    const { executeProductAction } = await import('./productActions');
    mocks.checkModelsReady.mockResolvedValueOnce([
      {
        model: 'ChatGPT',
        ready: true,
        status: 'ready',
        remoteConfigConfigured: false,
        lastCheckedAt: 44,
      },
    ]);

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });

    expect(mocks.runCompareAnalysis).toHaveBeenCalledWith({
      prompt: 'analysis prompt',
      turnId: 'session-1-turn-1',
      analysisRequestId: expect.any(String),
      model: 'ChatGPT',
    });
    expect(result).toEqual({
      status: 'success',
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      analystModel: 'ChatGPT',
      result: expect.objectContaining({
        consensusSummary: 'They broadly agree.',
        recommendationReason: 'ChatGPT is the clearest fit.',
        nextQuestion: 'What should we test next?',
      }),
    });
  });

  it('surfaces compare-analysis runtime failures as product-level error payloads', async () => {
    mocks.runCompareAnalysis.mockResolvedValueOnce({
      ok: false,
      errorCode: 'runtime_error',
      errorMessage: 'AI Compare Analyst could not finish this request.',
    });
    mocks.checkModelsReady.mockResolvedValueOnce([
      {
        model: 'ChatGPT',
        ready: true,
        status: 'ready',
        remoteConfigConfigured: false,
        lastCheckedAt: 45,
      },
    ]);
    const { executeProductAction } = await import('./productActions');

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });

    expect(result).toEqual({
      status: 'error',
      reason: 'runtime_error',
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      message: 'AI Compare Analyst could not finish this request.',
    });
  });

  it('routes runtime-backed analysis through the local Switchyard adapter', async () => {
    storageState.settings.analysis.provider = ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME;
    mocks.getAnalysisProvider.mockReturnValue({
      id: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
      availableInBrowserBuild: true,
      executionSurface: ANALYSIS_EXECUTION_SURFACES.FUTURE_RUNTIME,
      prepareRun: vi.fn(() => ({
        provider: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
        model: 'ChatGPT',
        prompt: 'runtime analysis prompt',
      })),
      parseResult: vi.fn(
        (): CompareAnalysisResult => ({
          provider: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
          executionSurface: ANALYSIS_EXECUTION_SURFACES.FUTURE_RUNTIME,
          model: 'ChatGPT',
          createdAt: 2,
          consensusSummary: 'Runtime agrees on the primary direction.',
          disagreementSummary: 'One answer still wants more validation.',
          recommendedAnswerModel: 'ChatGPT',
          recommendationReason: 'The runtime result stays concise and correct.',
          nextQuestion: 'Which proof should we request next?',
        })
      ),
    });
    const { executeProductAction } = await import('./productActions');

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });

    expect(mocks.runSwitchyardCompareAnalysis).toHaveBeenCalledWith({
      analystModel: 'ChatGPT',
      prompt: 'runtime analysis prompt',
    });
    expect(result).toEqual({
      status: 'success',
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      provider: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
      analystModel: 'ChatGPT',
      result: expect.objectContaining({
        consensusSummary: 'Runtime agrees on the primary direction.',
        executionSurface: ANALYSIS_EXECUTION_SURFACES.FUTURE_RUNTIME,
      }),
    });
  });

  it('surfaces runtime-backed auth blockers as blocked analysis results', async () => {
    storageState.settings.analysis.provider = ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME;
    mocks.getAnalysisProvider.mockReturnValue({
      id: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
      availableInBrowserBuild: true,
      executionSurface: ANALYSIS_EXECUTION_SURFACES.FUTURE_RUNTIME,
      prepareRun: vi.fn(() => ({
        provider: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
        model: 'ChatGPT',
        prompt: 'runtime analysis prompt',
      })),
      parseResult: vi.fn(),
    });
    mocks.runSwitchyardCompareAnalysis.mockResolvedValueOnce({
      ok: false,
      kind: 'runtime_auth_required',
      message: 'Open the local auth portal before retrying this runtime lane.',
    });
    const { executeProductAction } = await import('./productActions');

    const result = await executeProductAction(BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE, {
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
    });

    expect(result).toEqual({
      status: 'blocked',
      reason: 'runtime_auth_required',
      sessionId: 'session-1',
      turnId: 'session-1-turn-1',
      message: 'Open the local auth portal before retrying this runtime lane.',
    });
  });

  it('throws a hard error for unsupported MCP product actions', async () => {
    const { executeProductAction } = await import('./productActions');

    await expect(
      executeProductAction('unsupported_action' as never, {} as never)
    ).rejects.toThrow('Unsupported MCP action: unsupported_action');
  });
});
