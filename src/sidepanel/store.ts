import i18n from '../i18n';
import { create } from 'zustand';
import {
  DELIVERY_STATUS,
  ModelName,
  MSG_TYPES,
  CheckModelsReadyPayload,
  CompareAnalysisResponsePayload,
  Message,
  ModelReadinessReport,
  READINESS_STATUSES,
  Session,
  MESSAGE_ROLES,
  SEND_ERROR_CODES,
  StreamResponsePayload,
  type SendErrorCode,
} from '../utils/types';
import { StorageService } from '../services/storage';
import { smartGenerateTitle } from '../utils/titleGenerator';
import { Logger, toErrorMessage } from '../utils/logger';
import { buildCompareTurns, normalizeSessionMessages } from '../utils/messages';
import {
  ANALYSIS_BLOCK_REASONS,
  ANALYSIS_EXECUTION_SURFACES,
  ANALYSIS_STATUSES,
  type CompareAnalysisState,
} from '../services/analysis/types';
import {
  createBlockedCompareAnalysisState,
  createIdleCompareAnalysisState,
  getAnalysisProvider,
  summarizeAnalysisAvailability,
} from '../services/analysis';
import {
  SUBSTRATE_ACTION_NAMES,
  isSubstrateApiSuccess,
  safeParseSubstrateApiResult,
  SubstrateActionOutcomeSchemas,
  type SubstrateActionArgsMap,
  type SubstrateActionName,
  type SubstrateActionOutcome,
  type SubstrateActionSuccessPayloadMap,
} from '../substrate/api';
import { presentWorkflowRun } from '../substrate/workflow';
import {
  buildDeliveryErrorMessage,
  buildReadinessErrorMessage,
  buildReadinessFailurePayload,
  createAssistantPlaceholder,
  createUserTurnMessage,
  markTurnDeliveryFailure,
} from '../services/sessionRuntime';

type WorkflowRunDetailPayload = SubstrateActionSuccessPayloadMap['get_workflow_run'];

type WorkflowSeedSource = 'next_question';

type WorkflowUxStatus =
  | 'idle'
  | 'runnable'
  | 'waiting_external'
  | 'seed_ready'
  | 'blocked'
  | 'error'
  | 'running_compare';

interface WorkflowTurnState {
  turnId: string;
  runId?: string;
  workflowId: string;
  status: WorkflowUxStatus;
  currentStepId?: string;
  waitingFor?: string;
  nextActionLabel?: string;
  nextActionSummary?: string;
  emittedActionCommand?: string;
  emittedActionStepId?: string;
  targetModels: ModelName[];
  seedSource: WorkflowSeedSource;
  seedPrompt?: string;
  errorMessage?: string;
  updatedAt: number;
}

interface AppState {
  // Session Management
  sessions: Session[];
  currentSessionId: string | null;

  // UI State
  input: string;
  isGenerating: boolean;
  inflightModels: ModelName[];
  selectedModels: ModelName[];
  sendErrorCode: SendErrorCode | null;
  lastSendKey: string | null;
  lastSendAt: number | null;
  modelReadiness: Partial<Record<ModelName, ModelReadinessReport>>;
  isCheckingReadiness: boolean;
  lastReadinessCheckAt: number | null;
  analysisByTurn: Record<string, CompareAnalysisState>;
  workflowByTurn: Record<string, WorkflowTurnState>;

  // Message Operations
  addMessage: (message: Message) => void;
  updateLastMessage: (
    payloadOrModel: StreamResponsePayload | ModelName,
    text?: string,
    isComplete?: boolean
  ) => void;
  sendMessage: () => void;
  clearMessages: () => void;
  retryTurnForModels: (turnId: string, models: ModelName[]) => Promise<void>;
  runCompareAnalysis: (turnId: string) => Promise<void>;
  stageWorkflowFromNextQuestion: (turnId: string, targetModels: ModelName[]) => Promise<void>;
  applyWorkflowSeedToComposer: (turnId: string) => void;
  runWorkflowSeedCompare: (turnId: string) => Promise<void>;
  clearCompareAnalysis: (turnId: string) => void;
  handleCompareAnalysisUpdate: (payload: CompareAnalysisResponsePayload) => void;

  // Session Operations
  createNewSession: () => void;
  switchSession: (sessionId: string) => void;
  deleteSession: (sessionId: string) => void;
  updateSessionTitle: (sessionId: string, title: string) => void;
  loadSessions: () => Promise<void>;
  importSessions: (sessions: Session[], currentSessionId?: string | null) => Promise<void>;

  // Model Selection
  toggleModel: (model: ModelName) => void;
  setSelectedModelsForCurrentSession: (models: ModelName[]) => void;

  // Input
  setInput: (text: string) => void;

  // Streaming
  setGenerating: (isGenerating: boolean) => void;
  refreshModelReadiness: (models?: ModelName[]) => Promise<ModelReadinessReport[]>;
}

// ==================== Session Helpers ====================
const DEFAULT_SELECTED_MODELS: ModelName[] = ['ChatGPT'];
const IDEMPOTENCY_WINDOW_MS = 5000;

const toReadinessMap = (reports: ModelReadinessReport[]) =>
  Object.fromEntries(reports.map((report) => [report.model, report])) as Partial<
    Record<ModelName, ModelReadinessReport>
  >;

const requestModelReadiness = async (models: ModelName[]): Promise<ModelReadinessReport[]> => {
  const uniqueModels = Array.from(new Set(models));
  const response = (await chrome.runtime.sendMessage({
    type: MSG_TYPES.CHECK_MODELS_READY,
    payload: {
      models: uniqueModels,
    } satisfies CheckModelsReadyPayload,
  })) as { reports?: ModelReadinessReport[] } | undefined;

  return Array.isArray(response?.reports) ? response.reports : [];
};

const sessionHasTurn = (sessions: Session[], sessionId: string, turnId: string) =>
  Boolean(
    sessions
      .find((entry) => entry.id === sessionId)
      ?.messages.some((message) => message.turnId === turnId)
  );

const appendTurnMessagesToStore = ({
  addMessage,
  updateLastMessage,
  prompt,
  requestedModels,
  turnId,
  requestId,
  blockedReports,
}: {
  addMessage: (message: Message) => void;
  updateLastMessage: (
    payloadOrModel: StreamResponsePayload | ModelName,
    text?: string,
    isComplete?: boolean
  ) => void;
  prompt: string;
  requestedModels: ModelName[];
  turnId: string;
  requestId: string;
  blockedReports: ModelReadinessReport[];
}) => {
  addMessage(createUserTurnMessage(prompt, turnId, requestId, requestedModels));
  requestedModels
    .map((model) => createAssistantPlaceholder(model, turnId, requestId))
    .forEach((message) => addMessage(message));
  blockedReports.forEach((report) => {
    updateLastMessage(buildReadinessFailurePayload(report, requestId, turnId));
  });
};

const syncOrAppendTurnFromStorage = async ({
  get,
  currentSessionId,
  prompt,
  requestedModels,
  turnId,
  requestId,
  blockedReports,
}: {
  get: () => AppState;
  currentSessionId: string;
  prompt: string;
  requestedModels: ModelName[];
  turnId: string;
  requestId: string;
  blockedReports: ModelReadinessReport[];
}) => {
  const storageSessions = await StorageService.getSessions();
  if (sessionHasTurn(storageSessions, currentSessionId, turnId)) {
    await get().loadSessions();
    return;
  }

  appendTurnMessagesToStore({
    addMessage: get().addMessage,
    updateLastMessage: get().updateLastMessage,
    prompt,
    requestedModels,
    turnId,
    requestId,
    blockedReports,
  });
};

const executeSubstrateBackgroundAction = async <TAction extends SubstrateActionName>(
  action: TAction,
  args: SubstrateActionArgsMap[TAction]
): Promise<SubstrateActionOutcome<TAction>> => {
  const response = await chrome.runtime.sendMessage({
    type: MSG_TYPES.EXECUTE_SUBSTRATE_ACTION,
    payload: {
      action,
      args,
    },
  });

  const directParse = SubstrateActionOutcomeSchemas[action].safeParse(response);
  if (directParse.success) {
    return directParse.data as SubstrateActionOutcome<TAction>;
  }

  const apiParse = safeParseSubstrateApiResult(response);
  if (apiParse.success && apiParse.data.action === action) {
    if (isSubstrateApiSuccess(apiParse.data)) {
      return SubstrateActionOutcomeSchemas[action].parse({
        version: apiParse.data.version,
        action,
        ok: true,
        data: apiParse.data.result,
      }) as SubstrateActionOutcome<TAction>;
    }

    return SubstrateActionOutcomeSchemas[action].parse({
      version: apiParse.data.version,
      action,
      ok: false,
      error: apiParse.data.error,
    }) as SubstrateActionOutcome<TAction>;
  }

  return SubstrateActionOutcomeSchemas[action].parse(response) as SubstrateActionOutcome<TAction>;
};

const getOutcomeReadinessReports = (
  outcome: SubstrateActionOutcome<'compare' | 'retry_failed'>
) => {
  if (outcome.ok) {
    return (outcome.data as { readinessReports?: ModelReadinessReport[] }).readinessReports ?? [];
  }

  const details =
    outcome.error.details && typeof outcome.error.details === 'object'
      ? (outcome.error.details as {
          readinessReports?: ModelReadinessReport[];
        })
      : null;
  return details?.readinessReports ?? [];
};

const getOutcomeReadyModels = (outcome: SubstrateActionOutcome<'compare' | 'retry_failed'>) => {
  if (outcome.ok) {
    return outcome.data.readyModels;
  }

  const details =
    outcome.error.details && typeof outcome.error.details === 'object'
      ? (outcome.error.details as {
          readyModels?: ModelName[];
        })
      : null;
  return details?.readyModels ?? [];
};

const toSendErrorCodeFromSubstrateError = (
  outcome: SubstrateActionOutcome<'compare' | 'retry_failed'>
): SendErrorCode => {
  if (outcome.ok) {
    return SEND_ERROR_CODES.RUNTIME;
  }

  if (outcome.error.kind === 'blocked' || outcome.error.kind === 'waiting_external') {
    return SEND_ERROR_CODES.HANDSHAKE;
  }

  return SEND_ERROR_CODES.RUNTIME;
};

const toWorkflowUxStatus = (detail: WorkflowRunDetailPayload): WorkflowUxStatus => {
  if (detail.output && typeof detail.output === 'object' && 'prompt' in detail.output) {
    return 'seed_ready';
  }

  switch (detail.status) {
    case 'blocked':
      return 'blocked';
    case 'failed':
      return 'error';
    case 'running':
    case 'queued':
    case 'waiting_external':
      return 'waiting_external';
    case 'completed':
      return 'seed_ready';
    default:
      return 'idle';
  }
};

const createWorkflowTurnStateFromDetail = (
  turnId: string,
  detail: WorkflowRunDetailPayload,
  targetModels: ModelName[],
  fallbackErrorMessage?: string
): WorkflowTurnState => {
  const presentation = presentWorkflowRun(detail);

  return {
    turnId,
    runId: detail.runId,
    workflowId: detail.workflowId,
    status: toWorkflowUxStatus(detail),
    currentStepId: detail.currentStepId,
    waitingFor: presentation.waitingSummary,
    nextActionLabel: presentation.nextActionLabel,
    nextActionSummary: presentation.nextActionSummary,
    emittedActionCommand: presentation.emittedActionCommand,
    emittedActionStepId: presentation.emittedActionStepId,
    targetModels,
    seedSource: 'next_question',
    seedPrompt: presentation.seedPrompt,
    errorMessage: fallbackErrorMessage,
    updatedAt: Date.now(),
  };
};

const createWorkflowBlockedState = (
  turnId: string,
  targetModels: ModelName[],
  errorMessage: string
): WorkflowTurnState => ({
  turnId,
  workflowId: 'compare-analyze-follow-up',
  status: 'blocked',
  targetModels,
  seedSource: 'next_question',
  errorMessage,
  updatedAt: Date.now(),
});

const createWorkflowErrorState = (
  turnId: string,
  targetModels: ModelName[],
  errorMessage: string
): WorkflowTurnState => ({
  turnId,
  workflowId: 'compare-analyze-follow-up',
  status: 'error',
  targetModels,
  seedSource: 'next_question',
  errorMessage,
  updatedAt: Date.now(),
});

const createDefaultSession = (): Session => ({
  id: crypto.randomUUID(),
  title: i18n.t('runtime.sessionNew', 'New Chat'),
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  selectedModels: [...DEFAULT_SELECTED_MODELS],
});

const normalizeSessionForStore = (session: Session): Session => ({
  ...session,
  messages: normalizeSessionMessages(session.messages, session.selectedModels),
});

const toStreamPayload = (
  payloadOrModel: StreamResponsePayload | ModelName,
  text?: string,
  isComplete = false
): StreamResponsePayload =>
  typeof payloadOrModel === 'string'
    ? {
        model: payloadOrModel,
        text: text ?? '',
        isComplete,
      }
    : payloadOrModel;

const resolveDeliveryStatus = (payload: StreamResponsePayload) => {
  if (payload.deliveryStatus) {
    return payload.deliveryStatus;
  }

  if (payload.errorCode) {
    return DELIVERY_STATUS.ERROR;
  }

  return payload.isComplete ? DELIVERY_STATUS.COMPLETE : DELIVERY_STATUS.STREAMING;
};

const updateMessageFromPayload = (message: Message, payload: StreamResponsePayload): Message => {
  const deliveryStatus = resolveDeliveryStatus(payload);
  const nextText =
    payload.text ||
    (deliveryStatus === DELIVERY_STATUS.ERROR && payload.errorCode
      ? buildDeliveryErrorMessage(payload.errorCode)
      : message.text);
  const completedAt =
    payload.completedAt ??
    (deliveryStatus === DELIVERY_STATUS.COMPLETE || deliveryStatus === DELIVERY_STATUS.ERROR
      ? Date.now()
      : undefined);

  return {
    ...message,
    text: nextText,
    turnId: payload.turnId,
    requestId: payload.requestId,
    model: payload.model,
    isStreaming:
      deliveryStatus === DELIVERY_STATUS.STREAMING || deliveryStatus === DELIVERY_STATUS.PENDING,
    deliveryStatus,
    deliveryErrorCode: payload.errorCode ?? message.deliveryErrorCode,
    completedAt,
    data: payload.data ?? message.data,
  };
};

// ==================== Store ====================
export const useStore = create<AppState>((set, get) => ({
  sessions: [createDefaultSession()],
  currentSessionId: null,
  input: '',
  isGenerating: false,
  inflightModels: [],
  selectedModels: ['ChatGPT'],
  sendErrorCode: null,
  lastSendKey: null,
  lastSendAt: null,
  modelReadiness: {},
  isCheckingReadiness: false,
  lastReadinessCheckAt: null,
  analysisByTurn: {},
  workflowByTurn: {},

  // Initialize
  loadSessions: async () => {
    try {
      const sessions = await StorageService.getSessions();
      const currentSessionId = await StorageService.getCurrentSessionId();

      if (sessions.length === 0) {
        // Create default session
        const defaultSession = createDefaultSession();
        await StorageService.saveSessions([defaultSession]);
        await StorageService.saveCurrentSessionId(defaultSession.id);

        set({
          sessions: [defaultSession],
          currentSessionId: defaultSession.id,
          selectedModels: defaultSession.selectedModels,
          analysisByTurn: {},
          workflowByTurn: {},
        });
      } else {
        let didNormalize = false;
        const normalizedSessions = sessions.map((session) => {
          const normalizedModels =
            session.selectedModels?.length > 0 ? session.selectedModels : DEFAULT_SELECTED_MODELS;
          const nextSession = normalizeSessionForStore({
            ...session,
            selectedModels: [...normalizedModels],
          });

          if (
            normalizedModels !== session.selectedModels ||
            JSON.stringify(nextSession.messages) !== JSON.stringify(session.messages)
          ) {
            didNormalize = true;
          }

          return nextSession;
        });

        if (didNormalize) {
          await StorageService.saveSessions(normalizedSessions);
        }

        const activeSession =
          normalizedSessions.find((s) => s.id === currentSessionId) || normalizedSessions[0];
        const normalizedSelectedModels =
          activeSession.selectedModels?.length > 0
            ? activeSession.selectedModels
            : DEFAULT_SELECTED_MODELS;
        set({
          sessions: normalizedSessions,
          currentSessionId: activeSession.id,
          selectedModels: normalizedSelectedModels,
          inflightModels: [],
          isGenerating: false,
          analysisByTurn: {},
          workflowByTurn: {},
        });
      }
    } catch (error) {
      Logger.error('sidepanel_load_sessions_failed', {
        surface: 'sidepanel',
        code: 'sidepanel_load_sessions_failed',
        error: toErrorMessage(error),
      });
      // Fallback to default session
      const defaultSession = createDefaultSession();
      set({
        sessions: [defaultSession],
        currentSessionId: defaultSession.id,
        selectedModels: defaultSession.selectedModels,
        inflightModels: [],
        isGenerating: false,
        analysisByTurn: {},
        workflowByTurn: {},
      });
    }
  },

  importSessions: async (sessions, nextCurrentSessionId) => {
    const sanitizedSessions =
      sessions.length > 0
        ? sessions.map((session) =>
            normalizeSessionForStore({
              ...session,
              selectedModels:
                session.selectedModels?.length > 0
                  ? session.selectedModels
                  : DEFAULT_SELECTED_MODELS,
            })
          )
        : [createDefaultSession()];

    const resolvedCurrentSessionId =
      nextCurrentSessionId &&
      sanitizedSessions.some((session) => session.id === nextCurrentSessionId)
        ? nextCurrentSessionId
        : sanitizedSessions[0].id;

    await StorageService.saveSessions(sanitizedSessions);
    await StorageService.saveCurrentSessionId(resolvedCurrentSessionId);

    const activeSession =
      sanitizedSessions.find((session) => session.id === resolvedCurrentSessionId) ||
      sanitizedSessions[0];

    set({
      sessions: sanitizedSessions,
      currentSessionId: resolvedCurrentSessionId,
      selectedModels:
        activeSession.selectedModels?.length > 0
          ? activeSession.selectedModels
          : DEFAULT_SELECTED_MODELS,
      input: '',
      inflightModels: [],
      isGenerating: false,
      analysisByTurn: {},
      workflowByTurn: {},
    });
  },

  setInput: (text) => set({ input: text }),
  setGenerating: (isGenerating) => set({ isGenerating }),

  refreshModelReadiness: async (models) => {
    const requestedModels =
      models && models.length > 0
        ? Array.from(new Set(models))
        : Array.from(new Set(get().selectedModels));

    if (requestedModels.length === 0) {
      set({
        modelReadiness: {},
        lastReadinessCheckAt: Date.now(),
        isCheckingReadiness: false,
      });
      return [];
    }

    set({ isCheckingReadiness: true });

    try {
      const reports = await requestModelReadiness(requestedModels);
      set({
        modelReadiness: toReadinessMap(reports),
        lastReadinessCheckAt: Date.now(),
        isCheckingReadiness: false,
      });
      return reports;
    } catch (error) {
      Logger.error('sidepanel_refresh_model_readiness_failed', {
        surface: 'sidepanel',
        code: 'sidepanel_refresh_model_readiness_failed',
        error: toErrorMessage(error),
      });
      set({
        isCheckingReadiness: false,
        lastReadinessCheckAt: Date.now(),
      });
      return [];
    }
  },

  toggleModel: (model) =>
    set((state) => {
      const models = state.selectedModels.includes(model)
        ? state.selectedModels.filter((m) => m !== model)
        : [...state.selectedModels, model];

      if (models.length === 0) {
        return state;
      }

      // Update current session's selected models
      const { sessions, currentSessionId } = state;
      if (currentSessionId) {
        const updatedSessions = sessions.map((s) =>
          s.id === currentSessionId ? { ...s, selectedModels: models, updatedAt: Date.now() } : s
        );
        StorageService.saveSessions(updatedSessions);
        return { selectedModels: models, sessions: updatedSessions };
      }

      return { selectedModels: models };
    }),

  setSelectedModelsForCurrentSession: (models) =>
    set((state) => {
      const uniqueModels = Array.from(new Set(models));
      if (uniqueModels.length === 0) {
        return state;
      }

      const { sessions, currentSessionId } = state;
      if (!currentSessionId) {
        return { selectedModels: uniqueModels };
      }

      const updatedSessions = sessions.map((session) =>
        session.id === currentSessionId
          ? { ...session, selectedModels: uniqueModels, updatedAt: Date.now() }
          : session
      );
      StorageService.saveSessions(updatedSessions);
      return {
        selectedModels: uniqueModels,
        sessions: updatedSessions,
      };
    }),

  addMessage: (message) =>
    set((state) => {
      const { sessions, currentSessionId } = state;
      if (!currentSessionId) return state;

      const messageWithDefaults = {
        ...message,
        isStreaming: message.isStreaming ?? false,
        deliveryStatus:
          message.deliveryStatus ??
          (message.role === MESSAGE_ROLES.ASSISTANT
            ? DELIVERY_STATUS.PENDING
            : DELIVERY_STATUS.COMPLETE),
        completedAt:
          message.completedAt ??
          (message.role === MESSAGE_ROLES.ASSISTANT ? undefined : message.timestamp),
      };

      const updatedSessions = sessions.map((s) =>
        s.id === currentSessionId
          ? { ...s, messages: [...s.messages, messageWithDefaults], updatedAt: Date.now() }
          : s
      );

      StorageService.saveSessions(updatedSessions);
      return { sessions: updatedSessions };
    }),

  updateLastMessage: (payloadOrModel, text, isComplete = false) =>
    set((state) => {
      const payload = toStreamPayload(payloadOrModel, text, isComplete);
      const deliveryStatus = resolveDeliveryStatus(payload);
      let didUpdateAnySession = false;

      const updatedSessions = state.sessions.map((session) => {
        const matchesTurn = payload.turnId
          ? session.messages.some((message) => message.turnId === payload.turnId)
          : session.id === state.currentSessionId;

        if (!matchesTurn) {
          return session;
        }

        const messages = [...session.messages];
        const lastMsgIndex = messages.findLastIndex(
          (m) =>
            m.model === payload.model &&
            m.role === MESSAGE_ROLES.ASSISTANT &&
            (payload.turnId ? m.turnId === payload.turnId : true)
        );

        if (lastMsgIndex !== -1) {
          messages[lastMsgIndex] = updateMessageFromPayload(messages[lastMsgIndex], payload);
        } else {
          messages.push({
            id: crypto.randomUUID(),
            role: MESSAGE_ROLES.ASSISTANT,
            text:
              payload.text ||
              (payload.errorCode
                ? buildDeliveryErrorMessage(payload.errorCode)
                : i18n.t('runtime.waitingResponse', 'Waiting for response…')),
            model: payload.model,
            timestamp: Date.now(),
            turnId: payload.turnId,
            requestId: payload.requestId,
            isStreaming:
              deliveryStatus === DELIVERY_STATUS.PENDING ||
              deliveryStatus === DELIVERY_STATUS.STREAMING,
            deliveryStatus,
            deliveryErrorCode: payload.errorCode,
            completedAt: payload.completedAt,
            data: payload.data,
          });
        }

        didUpdateAnySession = true;
        return { ...session, messages, updatedAt: Date.now() };
      });

      if (!didUpdateAnySession) {
        return state;
      }

      StorageService.saveSessions(updatedSessions);

      const nextInflightModels =
        deliveryStatus === DELIVERY_STATUS.COMPLETE || deliveryStatus === DELIVERY_STATUS.ERROR
          ? state.inflightModels.filter((m) => m !== payload.model)
          : state.inflightModels;

      return {
        sessions: updatedSessions,
        inflightModels: nextInflightModels,
        isGenerating: nextInflightModels.length > 0,
      };
    }),

  clearMessages: () =>
    set((state) => {
      const { sessions, currentSessionId } = state;
      if (!currentSessionId) return state;

      const updatedSessions = sessions.map((s) =>
        s.id === currentSessionId ? { ...s, messages: [], updatedAt: Date.now() } : s
      );

      StorageService.saveSessions(updatedSessions);
      return {
        sessions: updatedSessions,
        inflightModels: [],
        isGenerating: false,
        analysisByTurn: {},
        workflowByTurn: {},
      };
    }),

  sendMessage: async () => {
    const { input, selectedModels, currentSessionId, lastSendKey, lastSendAt } = get();
    if (!input.trim() || selectedModels.length === 0 || !currentSessionId) return;
    const uniqueModels = Array.from(new Set(selectedModels));
    const requestKey = `${currentSessionId}:${input.trim()}:${uniqueModels.join(',')}`;
    const now = Date.now();

    if (lastSendKey === requestKey && lastSendAt && now - lastSendAt < IDEMPOTENCY_WINDOW_MS) {
      Logger.warn('send_message_idempotent_skip', {
        surface: 'sidepanel',
        sessionId: currentSessionId,
        requestKey,
      });
      return;
    }

    const readinessReports = await get().refreshModelReadiness(uniqueModels);
    const resolvedReports =
      readinessReports.length > 0
        ? readinessReports
        : uniqueModels.map(
            (model): ModelReadinessReport => ({
              model,
              ready: true,
              status: READINESS_STATUSES.READY,
              remoteConfigConfigured: false,
              lastCheckedAt: Date.now(),
            })
          );
    const readyModels = resolvedReports
      .filter((report) => report.ready)
      .map((report) => report.model);
    if (readyModels.length === 0) {
      set({
        sendErrorCode: SEND_ERROR_CODES.HANDSHAKE,
        lastSendKey: requestKey,
        lastSendAt: now,
        modelReadiness: toReadinessMap(resolvedReports),
        lastReadinessCheckAt: now,
      });
      return;
    }

    set({
      isGenerating: true,
      inflightModels: [...readyModels],
      sendErrorCode: null,
      lastSendKey: requestKey,
      lastSendAt: now,
      modelReadiness: toReadinessMap(resolvedReports),
      lastReadinessCheckAt: now,
    });

    try {
      const outcome = await executeSubstrateBackgroundAction(SUBSTRATE_ACTION_NAMES.COMPARE, {
        prompt: input,
        sessionId: currentSessionId,
        models: uniqueModels,
      });
      const latestReadinessReports = getOutcomeReadinessReports(outcome);
      const latestReadyModels = getOutcomeReadyModels(outcome);

      if (outcome.ok) {
        await syncOrAppendTurnFromStorage({
          get,
          currentSessionId,
          prompt: input,
          requestedModels: uniqueModels,
          turnId: outcome.data.turnId,
          requestId: outcome.data.requestId,
          blockedReports: outcome.data.blockedReports,
        });

        const currentSession = get().sessions.find((entry) => entry.id === currentSessionId);
        if (
          currentSession &&
          currentSession.messages.filter((message) => message.role === MESSAGE_ROLES.USER)
            .length === 1
        ) {
          try {
            const title = await smartGenerateTitle(input);
            get().updateSessionTitle(currentSessionId, title);
          } catch (error) {
            Logger.error('sidepanel_generate_title_failed', {
              surface: 'sidepanel',
              code: 'sidepanel_generate_title_failed',
              sessionId: currentSessionId,
              error: toErrorMessage(error),
            });
          }
        }
      } else {
        const details =
          outcome.error.details && typeof outcome.error.details === 'object'
            ? (outcome.error.details as {
                turnId?: string;
                requestId?: string;
                requestedModels?: ModelName[];
                readyModels?: ModelName[];
              })
            : null;

        if (details?.turnId && details.requestId) {
          if (!sessionHasTurn(get().sessions, currentSessionId, details.turnId)) {
            appendTurnMessagesToStore({
              addMessage: get().addMessage,
              updateLastMessage: get().updateLastMessage,
              prompt: input,
              requestedModels: details.requestedModels ?? uniqueModels,
              turnId: details.turnId,
              requestId: details.requestId,
              blockedReports: [],
            });
          }

          const updatedSessions = get().sessions.map((session) =>
            session.id === currentSessionId
              ? markTurnDeliveryFailure(
                  session,
                  details.turnId!,
                  details.readyModels ?? readyModels,
                  SEND_ERROR_CODES.RUNTIME,
                  details.requestId!
                )
              : session
          );
          StorageService.saveSessions(updatedSessions);
          set({ sessions: updatedSessions });
        }
      }

      set({
        input: outcome.ok ? '' : input,
        inflightModels: outcome.ok ? latestReadyModels : [],
        isGenerating: outcome.ok && latestReadyModels.length > 0,
        sendErrorCode: outcome.ok ? null : toSendErrorCodeFromSubstrateError(outcome),
        modelReadiness:
          latestReadinessReports.length > 0
            ? toReadinessMap(latestReadinessReports)
            : get().modelReadiness,
        lastReadinessCheckAt:
          latestReadinessReports.length > 0 ? Date.now() : get().lastReadinessCheckAt,
      });
    } catch (error) {
      Logger.error('send_message_unexpected', {
        surface: 'sidepanel',
        sessionId: currentSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      set({
        input,
        isGenerating: false,
        inflightModels: [],
        sendErrorCode: SEND_ERROR_CODES.RUNTIME,
      });
    }
  },

  retryTurnForModels: async (turnId, models) => {
    const { currentSessionId } = get();
    if (!currentSessionId || models.length === 0) return;

    const session = get().sessions.find((entry) => entry.id === currentSessionId);
    const userMessage = session?.messages.find(
      (message) => message.role === MESSAGE_ROLES.USER && message.turnId === turnId
    );
    if (!session || !userMessage?.text) return;

    const uniqueModels = Array.from(new Set(models));
    const requestKey = `${currentSessionId}:${userMessage.text.trim()}:${uniqueModels.join(',')}:retry`;
    const now = Date.now();
    const readinessReports = await get().refreshModelReadiness(uniqueModels);
    const readyModels = readinessReports
      .filter((report) => report.ready)
      .map((report) => report.model);
    if (readyModels.length === 0) {
      set({
        sendErrorCode: SEND_ERROR_CODES.HANDSHAKE,
        lastSendKey: requestKey,
        lastSendAt: now,
        modelReadiness: toReadinessMap(readinessReports),
        lastReadinessCheckAt: now,
      });
      return;
    }

    set({
      isGenerating: true,
      inflightModels: [...readyModels],
      sendErrorCode: null,
      lastSendKey: requestKey,
      lastSendAt: now,
      modelReadiness: toReadinessMap(readinessReports),
      lastReadinessCheckAt: now,
    });

    try {
      const outcome = await executeSubstrateBackgroundAction(SUBSTRATE_ACTION_NAMES.RETRY_FAILED, {
        turnId,
        sessionId: currentSessionId,
        models: uniqueModels,
      });
      const latestReadinessReports = getOutcomeReadinessReports(outcome);
      const latestReadyModels = getOutcomeReadyModels(outcome);

      if (outcome.ok) {
        await syncOrAppendTurnFromStorage({
          get,
          currentSessionId,
          prompt: userMessage.text,
          requestedModels: uniqueModels,
          turnId: outcome.data.turnId,
          requestId: outcome.data.requestId,
          blockedReports: outcome.data.blockedReports,
        });
      } else {
        const details =
          outcome.error.details && typeof outcome.error.details === 'object'
            ? (outcome.error.details as {
                turnId?: string;
                requestId?: string;
                requestedModels?: ModelName[];
                readyModels?: ModelName[];
              })
            : null;
        if (details?.turnId && details.requestId) {
          if (!sessionHasTurn(get().sessions, currentSessionId, details.turnId)) {
            appendTurnMessagesToStore({
              addMessage: get().addMessage,
              updateLastMessage: get().updateLastMessage,
              prompt: userMessage.text,
              requestedModels: details.requestedModels ?? uniqueModels,
              turnId: details.turnId,
              requestId: details.requestId,
              blockedReports: [],
            });
          }

          const updatedSessions = get().sessions.map((entry) =>
            entry.id === currentSessionId
              ? markTurnDeliveryFailure(
                  entry,
                  details.turnId!,
                  details.readyModels ?? readyModels,
                  SEND_ERROR_CODES.RUNTIME,
                  details.requestId!
                )
              : entry
          );
          StorageService.saveSessions(updatedSessions);
          set({ sessions: updatedSessions });
        }
      }

      set({
        inflightModels: outcome.ok ? latestReadyModels : [],
        isGenerating: outcome.ok && latestReadyModels.length > 0,
        sendErrorCode: outcome.ok ? null : toSendErrorCodeFromSubstrateError(outcome),
        modelReadiness:
          latestReadinessReports.length > 0
            ? toReadinessMap(latestReadinessReports)
            : get().modelReadiness,
        lastReadinessCheckAt:
          latestReadinessReports.length > 0 ? Date.now() : get().lastReadinessCheckAt,
      });
    } catch (error) {
      Logger.error('retry_turn_for_models_failed', {
        surface: 'sidepanel',
        code: 'retry_turn_for_models_failed',
        turnId,
        error: toErrorMessage(error),
      });
      set({
        isGenerating: false,
        inflightModels: [],
        sendErrorCode: SEND_ERROR_CODES.RUNTIME,
      });
    }
  },

  runCompareAnalysis: async (turnId) => {
    const { currentSessionId, sessions } = get();
    if (!currentSessionId) return;

    const session = sessions.find((entry) => entry.id === currentSessionId);
    if (!session) return;

    const turn = buildCompareTurns(session.messages).find((entry) => entry.id === turnId);
    if (!turn) {
      const settings = await StorageService.getSettings();
      set((state) => ({
        analysisByTurn: {
          ...state.analysisByTurn,
          [turnId]: createBlockedCompareAnalysisState(
            settings.analysis,
            ANALYSIS_BLOCK_REASONS.ANALYSIS_TURN_NOT_FOUND,
            i18n.t(
              'runtime.analysisTurnMissing',
              'Prompt Switchboard could not find this compare turn for analysis.'
            )
          ),
        },
      }));
      return;
    }

    const settings = await StorageService.getSettings();
    if (!settings.analysis.enabled) {
      set((state) => ({
        analysisByTurn: {
          ...state.analysisByTurn,
          [turnId]: createBlockedCompareAnalysisState(
            settings.analysis,
            ANALYSIS_BLOCK_REASONS.DISABLED,
            i18n.t(
              'analysis.errors.disabledInSettings',
              'The AI Compare Analyst is turned off in settings.'
            )
          ),
        },
      }));
      return;
    }

    if (get().isGenerating) {
      set((state) => ({
        analysisByTurn: {
          ...state.analysisByTurn,
          [turnId]: createBlockedCompareAnalysisState(
            settings.analysis,
            ANALYSIS_BLOCK_REASONS.ACTIVE_COMPARE_IN_FLIGHT,
            i18n.t(
              'analysis.errors.compareInFlight',
              'Wait for the active compare run to finish before starting AI analysis.'
            )
          ),
        },
      }));
      return;
    }

    const availability = summarizeAnalysisAvailability(turn, get().selectedModels);
    if (!availability.canRun) {
      set((state) => ({
        analysisByTurn: {
          ...state.analysisByTurn,
          [turnId]: createBlockedCompareAnalysisState(
            settings.analysis,
            availability.blockReason ?? ANALYSIS_BLOCK_REASONS.NEEDS_TWO_COMPLETED_ANSWERS,
            i18n.t(
              'analysis.empty',
              'Wait until at least two model answers are complete before running AI Compare Analyst.'
            )
          ),
        },
      }));
      return;
    }

    const provider = getAnalysisProvider(settings.analysis.provider);
    if (!provider) {
      set((state) => ({
        analysisByTurn: {
          ...state.analysisByTurn,
          [turnId]: {
            status: ANALYSIS_STATUSES.ERROR,
            provider: settings.analysis.provider,
            model: settings.analysis.model,
            errorMessage: i18n.t(
              'analysis.errors.providerUnavailable',
              'The selected analysis provider is not available in this build.'
            ),
            updatedAt: Date.now(),
          },
        },
      }));
      return;
    }

    if (!provider.availableInBrowserBuild) {
      set((state) => ({
        analysisByTurn: {
          ...state.analysisByTurn,
          [turnId]: createBlockedCompareAnalysisState(
            settings.analysis,
            ANALYSIS_BLOCK_REASONS.PROVIDER_BLOCKED,
            settings.analysis.provider === 'switchyard_runtime'
              ? i18n.t(
                  'analysis.blocked.body',
                  'Prompt Switchboard keeps the BYOK lane disabled here because provider guidance says browser builds should not ship production API keys client-side.'
                )
              : (provider.availabilityReason ??
                  i18n.t(
                    'analysis.blocked.fallback',
                    'This analysis provider is blocked in the browser build.'
                  ))
          ),
        },
      }));
      return;
    }

    const analystModel = settings.analysis.model as ModelName;
    let analystReadiness: ModelReadinessReport | undefined;
    if (provider.executionSurface === ANALYSIS_EXECUTION_SURFACES.BROWSER_TAB) {
      const readinessReports = await get().refreshModelReadiness([analystModel]);
      analystReadiness = readinessReports[0];
      if (!analystReadiness?.ready) {
        set((state) => ({
          analysisByTurn: {
            ...state.analysisByTurn,
            [turnId]: createBlockedCompareAnalysisState(
              settings.analysis,
              ANALYSIS_BLOCK_REASONS.MODEL_NOT_READY,
              analystReadiness
                ? buildReadinessErrorMessage(analystReadiness)
                : `${analystModel} is not ready for the browser-session analysis lane.`
            ),
          },
        }));
        return;
      }
    }

    const requestId = crypto.randomUUID();

    set((state) => ({
      analysisByTurn: {
        ...state.analysisByTurn,
        [turnId]: {
          ...createIdleCompareAnalysisState(settings.analysis),
          provider: settings.analysis.provider,
          model: settings.analysis.model,
          requestId,
          status: ANALYSIS_STATUSES.RUNNING,
          updatedAt: Date.now(),
        },
      },
    }));

    try {
      const outcome = await executeSubstrateBackgroundAction(
        SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE,
        {
          sessionId: currentSessionId,
          turnId,
        }
      );

      if (!outcome.ok) {
        const details =
          outcome.error.details && typeof outcome.error.details === 'object'
            ? (outcome.error.details as {
                reason?: string;
              })
            : null;
        const reason = details?.reason;
        const blockReason =
          reason && Object.values(ANALYSIS_BLOCK_REASONS).includes(reason as never)
            ? (reason as (typeof ANALYSIS_BLOCK_REASONS)[keyof typeof ANALYSIS_BLOCK_REASONS])
            : outcome.error.kind === 'validation'
              ? ANALYSIS_BLOCK_REASONS.ANALYSIS_TURN_NOT_FOUND
              : outcome.error.kind === 'waiting_external'
                ? ANALYSIS_BLOCK_REASONS.NEEDS_TWO_COMPLETED_ANSWERS
                : outcome.error.kind === 'blocked'
                  ? ANALYSIS_BLOCK_REASONS.RUNTIME_UNAVAILABLE
                  : null;

        if (blockReason) {
          set((state) => ({
            analysisByTurn: {
              ...state.analysisByTurn,
              [turnId]: createBlockedCompareAnalysisState(
                settings.analysis,
                blockReason,
                outcome.error.message
              ),
            },
          }));
          return;
        }

        set((state) => ({
          analysisByTurn: {
            ...state.analysisByTurn,
            [turnId]: {
              status: ANALYSIS_STATUSES.ERROR,
              provider: settings.analysis.provider,
              model: analystModel,
              requestId,
              errorMessage: outcome.error.message,
              updatedAt: Date.now(),
            },
          },
        }));
        return;
      }

      set((state) => ({
        analysisByTurn: {
          ...state.analysisByTurn,
          [turnId]: {
            status: ANALYSIS_STATUSES.SUCCESS,
            provider: outcome.data.provider,
            model: outcome.data.analystModel,
            requestId,
            result: outcome.data.result,
            updatedAt: Date.now(),
          },
        },
      }));
    } catch (error) {
      Logger.error('run_compare_analysis_failed', {
        surface: 'sidepanel',
        code: 'run_compare_analysis_failed',
        turnId,
        error: toErrorMessage(error),
      });

      set((state) => ({
        analysisByTurn: {
          ...state.analysisByTurn,
          [turnId]: {
            status: ANALYSIS_STATUSES.ERROR,
            provider: settings.analysis.provider,
            model: settings.analysis.model,
            requestId,
            errorMessage:
              settings.analysis.provider === 'switchyard_runtime'
                ? i18n.t(
                    'analysis.errors.runtimeStartFailed',
                    'Prompt Switchboard could not start the local Switchyard runtime lane.'
                  )
                : i18n.t(
                    'analysis.errors.startFailed',
                    'Prompt Switchboard could not start the browser-session analysis run.'
                  ),
            updatedAt: Date.now(),
          },
        },
      }));
    }
  },

  stageWorkflowFromNextQuestion: async (turnId, targetModels) => {
    const { currentSessionId, sessions } = get();
    if (!currentSessionId) return;

    const session = sessions.find((entry) => entry.id === currentSessionId);
    if (!session) return;

    const turn = buildCompareTurns(session.messages).find((entry) => entry.id === turnId);
    if (!turn) {
      set((state) => ({
        workflowByTurn: {
          ...state.workflowByTurn,
          [turnId]: createWorkflowErrorState(
            turnId,
            targetModels,
            i18n.t(
              'workflow.errors.turnMissing',
              'Prompt Switchboard could not find this compare turn for workflow staging.'
            )
          ),
        },
      }));
      return;
    }

    set((state) => ({
      workflowByTurn: {
        ...state.workflowByTurn,
        [turnId]: {
          turnId,
          workflowId: 'compare-analyze-follow-up',
          status: 'waiting_external',
          currentStepId: 'analyze',
          waitingFor: i18n.t(
            'workflow.waiting.preparing',
            'Preparing the next-step workflow from this compare turn…'
          ),
          targetModels,
          seedSource: 'next_question',
          updatedAt: Date.now(),
        },
      },
    }));

    let analysisState = get().analysisByTurn[turnId];
    if (analysisState?.status !== ANALYSIS_STATUSES.SUCCESS) {
      await get().runCompareAnalysis(turnId);
      analysisState = get().analysisByTurn[turnId];
    }

    if (
      !analysisState ||
      analysisState.status !== ANALYSIS_STATUSES.SUCCESS ||
      !analysisState.result
    ) {
      const message =
        analysisState?.errorMessage ??
        i18n.t(
          'workflow.errors.analysisRequired',
          'Run AI Compare Analyst first so Prompt Switchboard can stage the next question.'
        );
      set((state) => ({
        workflowByTurn: {
          ...state.workflowByTurn,
          [turnId]: createWorkflowBlockedState(turnId, targetModels, message),
        },
      }));
      return;
    }

    const runOutcome = await executeSubstrateBackgroundAction(SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW, {
      workflowId: 'compare-analyze-follow-up',
      sessionId: currentSessionId,
      turnId,
      input: {
        prompt: turn.userMessage?.text ?? '',
        models: targetModels,
        analysisResult: analysisState.result,
      },
    });

    if (!runOutcome.ok) {
      set((state) => ({
        workflowByTurn: {
          ...state.workflowByTurn,
          [turnId]:
            runOutcome.error.kind === 'blocked'
              ? createWorkflowBlockedState(turnId, targetModels, runOutcome.error.message)
              : createWorkflowErrorState(turnId, targetModels, runOutcome.error.message),
        },
      }));
      return;
    }

    const detailOutcome = await executeSubstrateBackgroundAction(
      SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN,
      {
        runId: runOutcome.data.runId,
      }
    );

    if (!detailOutcome.ok) {
      set((state) => ({
        workflowByTurn: {
          ...state.workflowByTurn,
          [turnId]: {
            turnId,
            runId: runOutcome.data.runId,
            workflowId: runOutcome.data.workflowId,
            status:
              runOutcome.data.status === 'completed'
                ? 'seed_ready'
                : runOutcome.data.status === 'blocked'
                  ? 'blocked'
                  : runOutcome.data.status === 'failed'
                    ? 'error'
                    : 'waiting_external',
            currentStepId: runOutcome.data.currentStepId,
            targetModels,
            seedSource: 'next_question',
            errorMessage: detailOutcome.error.message,
            updatedAt: Date.now(),
          },
        },
      }));
      return;
    }

    set((state) => ({
      workflowByTurn: {
        ...state.workflowByTurn,
        [turnId]: createWorkflowTurnStateFromDetail(turnId, detailOutcome.data, targetModels),
      },
    }));
  },

  applyWorkflowSeedToComposer: (turnId) => {
    const workflowState = get().workflowByTurn[turnId];
    if (!workflowState?.seedPrompt) return;

    get().setSelectedModelsForCurrentSession(workflowState.targetModels);
    get().setInput(workflowState.seedPrompt);
  },

  runWorkflowSeedCompare: async (turnId) => {
    const workflowState = get().workflowByTurn[turnId];
    if (!workflowState?.seedPrompt) return;

    set((state) => ({
      workflowByTurn: {
        ...state.workflowByTurn,
        [turnId]: {
          ...workflowState,
          status: 'running_compare',
          updatedAt: Date.now(),
        },
      },
    }));

    get().setSelectedModelsForCurrentSession(workflowState.targetModels);
    get().setInput(workflowState.seedPrompt);
    await Promise.resolve();
    await get().sendMessage();
  },

  clearCompareAnalysis: (turnId) =>
    set((state) => {
      if (!state.analysisByTurn[turnId]) {
        return state;
      }

      const nextAnalysisByTurn = { ...state.analysisByTurn };
      delete nextAnalysisByTurn[turnId];
      return {
        analysisByTurn: nextAnalysisByTurn,
      };
    }),

  handleCompareAnalysisUpdate: (payload) =>
    set((state) => {
      const current = state.analysisByTurn[payload.turnId];
      const settingsAnalysis = state.analysisByTurn[payload.turnId]
        ? {
            provider: state.analysisByTurn[payload.turnId].provider,
            model: state.analysisByTurn[payload.turnId].model,
          }
        : null;

      if (!current || current.requestId !== payload.analysisRequestId) {
        return state;
      }

      if (!payload.ok || !payload.text) {
        return {
          analysisByTurn: {
            ...state.analysisByTurn,
            [payload.turnId]: {
              status: ANALYSIS_STATUSES.ERROR,
              provider: current.provider,
              model: current.model,
              requestId: payload.analysisRequestId,
              errorMessage:
                payload.errorMessage ?? 'The browser-session analysis run did not finish cleanly.',
              updatedAt: Date.now(),
            },
          },
        };
      }

      try {
        const provider = current.provider ? getAnalysisProvider(current.provider) : undefined;
        if (!provider) {
          throw new Error('analysis_provider_missing');
        }

        const result = provider.parseResult(payload.text, payload.model);
        return {
          analysisByTurn: {
            ...state.analysisByTurn,
            [payload.turnId]: {
              status: ANALYSIS_STATUSES.SUCCESS,
              provider: current.provider,
              model: payload.model,
              requestId: payload.analysisRequestId,
              result,
              updatedAt: Date.now(),
            },
          },
        };
      } catch (error) {
        Logger.error('compare_analysis_parse_failed', {
          surface: 'sidepanel',
          code: 'compare_analysis_parse_failed',
          turnId: payload.turnId,
          error: toErrorMessage(error),
        });

        return {
          analysisByTurn: {
            ...state.analysisByTurn,
            [payload.turnId]: {
              status: ANALYSIS_STATUSES.ERROR,
              provider: settingsAnalysis?.provider,
              model: payload.model,
              requestId: payload.analysisRequestId,
              errorMessage:
                'The analysis tab returned a response, but it did not match the expected JSON shape.',
              updatedAt: Date.now(),
            },
          },
        };
      }
    }),

  createNewSession: () => {
    const newSession = createDefaultSession();
    const { sessions } = get();
    const updatedSessions = [newSession, ...sessions];

    StorageService.saveSessions(updatedSessions);
    StorageService.saveCurrentSessionId(newSession.id);

    set({
      sessions: updatedSessions,
      currentSessionId: newSession.id,
      selectedModels: newSession.selectedModels,
      input: '',
      inflightModels: [],
      isGenerating: false,
      analysisByTurn: {},
      workflowByTurn: {},
    });
  },

  switchSession: (sessionId) => {
    const { sessions } = get();
    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    StorageService.saveCurrentSessionId(sessionId);
    set({
      currentSessionId: sessionId,
      selectedModels: session.selectedModels?.length
        ? session.selectedModels
        : DEFAULT_SELECTED_MODELS,
      input: '',
      inflightModels: [],
      isGenerating: false,
      analysisByTurn: {},
      workflowByTurn: {},
    });
  },

  deleteSession: (sessionId) => {
    const { sessions, currentSessionId } = get();
    if (sessions.length <= 1) {
      // Don't delete the last session, clear it instead
      get().clearMessages();
      return;
    }

    const updatedSessions = sessions.filter((s) => s.id !== sessionId);
    StorageService.saveSessions(updatedSessions);

    // If deleting current session, switch to the first session
    if (sessionId === currentSessionId) {
      const newCurrent = updatedSessions[0];
      StorageService.saveCurrentSessionId(newCurrent.id);
      set({
        sessions: updatedSessions,
        currentSessionId: newCurrent.id,
        selectedModels: newCurrent.selectedModels?.length
          ? newCurrent.selectedModels
          : DEFAULT_SELECTED_MODELS,
        inflightModels: [],
        isGenerating: false,
        analysisByTurn: {},
        workflowByTurn: {},
      });
    } else {
      set({ sessions: updatedSessions });
    }
  },

  updateSessionTitle: (sessionId, title) => {
    const { sessions } = get();
    const updatedSessions = sessions.map((s) =>
      s.id === sessionId ? { ...s, title, updatedAt: Date.now() } : s
    );

    StorageService.saveSessions(updatedSessions);
    set({ sessions: updatedSessions });
  },
}));
