import { z } from 'zod';
import { buildCompareTurns, getMessageDeliveryStatus } from '../utils/messages';
import type { Message, ModelName, Session } from '../utils/types';
import { DELIVERY_STATUS, SEND_ERROR_CODES } from '../utils/types';
import { StorageService } from '../services/storage';
import {
  buildCompareMarkdownExport,
  buildCompareShareSummary,
} from '../sidepanel/utils/compareExport';
import { buildCompareInsightSummary } from '../sidepanel/utils/compareInsights';
import { buildDisagreementAnalysis } from '../sidepanel/utils/disagreementAnalyzer';
import {
  buildCompareAnalysisRequest,
  getAnalysisProvider,
  summarizeAnalysisAvailability,
} from '../services/analysis';
import { ANALYSIS_BLOCK_REASONS, ANALYSIS_EXECUTION_SURFACES } from '../services/analysis/types';
import {
  DEFAULT_SELECTED_MODELS,
  buildReadinessFailurePayload,
  buildReadinessErrorMessage,
  createAssistantPlaceholder,
  createDefaultSession,
  createUserTurnMessage,
  markTurnDeliveryFailure,
  normalizeSessionForRuntime,
  updateMessageFromPayload,
} from '../services/sessionRuntime';
import { getModelConfig } from '../utils/modelConfig';
import { tabManager } from './tabManager';
import {
  BRIDGE_COMMAND_NAMES,
  BridgeCommandSchemas,
  type BridgeStateSnapshot,
  type BridgeCommandName,
} from '../bridge/protocol';
import { broadcastPrompt, checkModelsReady, runCompareAnalysis } from './runtimeActions';
import { runSwitchyardCompareAnalysis } from './switchyardRuntime';

const resolveSessionContext = async (requestedSessionId?: string) => {
  const sessions = await StorageService.getSessions();
  const storedCurrentSessionId = await StorageService.getCurrentSessionId();
  let currentSessionId = requestedSessionId ?? storedCurrentSessionId;
  let nextSessions = sessions;
  let session = currentSessionId
    ? sessions.find((entry) => entry.id === currentSessionId) ?? null
    : null;

  if (!session) {
    session = createDefaultSession();
    nextSessions = [session, ...sessions];
    currentSessionId = session.id;
    await StorageService.saveSessions(nextSessions);
    await StorageService.saveCurrentSessionId(session.id);
  }

  return {
    session,
    currentSessionId: currentSessionId!,
    sessions: nextSessions,
  };
};

const resolveModels = (session: Session, requestedModels?: ModelName[]) => {
  if (requestedModels && requestedModels.length > 0) {
    return Array.from(new Set(requestedModels));
  }

  if (session.selectedModels.length > 0) {
    return [...session.selectedModels];
  }

  return [...DEFAULT_SELECTED_MODELS];
};

const saveMutatedSession = async (sessions: Session[], session: Session) => {
  const updatedSessions = sessions.map((entry) => (entry.id === session.id ? session : entry));
  await StorageService.saveSessions(updatedSessions);
  return updatedSessions;
};

const summarizeSession = (session: Session, currentSessionId: string | null) => {
  const turns = buildCompareTurns(session.messages);
  return {
    id: session.id,
    title: session.title,
    selectedModels: session.selectedModels,
    messageCount: session.messages.length,
    turnCount: turns.length,
    updatedAt: session.updatedAt,
    createdAt: session.createdAt,
    isCurrent: session.id === currentSessionId,
    latestTurnId: turns.at(-1)?.id ?? null,
  };
};

const queueCompareTurn = async (
  session: Session,
  sessions: Session[],
  sessionId: string,
  prompt: string,
  models: ModelName[]
) => {
  const uniqueModels = Array.from(new Set(models));
  const requestId = crypto.randomUUID();
  const turnId = crypto.randomUUID();
  const readinessReports = await checkModelsReady({ models: uniqueModels });
  const readyModels = readinessReports.filter((report) => report.ready).map((report) => report.model);
  const blockedReports = readinessReports.filter((report) => !report.ready);

  if (readyModels.length === 0) {
    return {
      status: 'blocked',
      sessionId,
      turnId: null,
      requestId: null,
      requestedModels: uniqueModels,
      readyModels: [],
      blockedReports,
      readinessReports,
    };
  }

  const userMessage = createUserTurnMessage(prompt, turnId, requestId, uniqueModels);
  const placeholderMessages = uniqueModels.map((model) =>
    createAssistantPlaceholder(model, turnId, requestId)
  );
  let nextSession = normalizeSessionForRuntime({
    ...session,
    selectedModels: uniqueModels,
    messages: [...session.messages, userMessage, ...placeholderMessages],
    updatedAt: Date.now(),
  });

  blockedReports.forEach((report) => {
    nextSession = {
      ...nextSession,
      messages: nextSession.messages.map((message) =>
        message.role === 'assistant' && message.turnId === turnId && message.model === report.model
          ? updateMessageFromPayload(message, buildReadinessFailurePayload(report, requestId, turnId))
          : message
      ),
    };
  });

  await saveMutatedSession(sessions, nextSession);

  try {
    await broadcastPrompt({
      prompt,
      models: readyModels,
      sessionId,
      requestId,
      turnId,
    });
    return {
      status: blockedReports.length > 0 ? 'partially_blocked' : 'queued',
      sessionId,
      turnId,
      requestId,
      requestedModels: uniqueModels,
      readyModels,
      blockedReports,
      readinessReports,
    };
  } catch {
    const failedSession = markTurnDeliveryFailure(
      nextSession,
      turnId,
      readyModels,
      SEND_ERROR_CODES.RUNTIME,
      requestId
    );
    await saveMutatedSession(sessions, failedSession);
    return {
      status: 'delivery_failed',
      sessionId,
      turnId,
      requestId,
      requestedModels: uniqueModels,
      readyModels,
      blockedReports,
      readinessReports,
    };
  }
};

const resolveRetryModels = (messages: Message[], turnId: string, requested?: ModelName[]) => {
  if (requested && requested.length > 0) {
    return Array.from(new Set(requested));
  }

  const turn = buildCompareTurns(messages).find((entry) => entry.id === turnId);
  if (!turn) return [];

  return Object.entries(turn.responses)
    .filter(([, response]) => response?.deliveryStatus === DELIVERY_STATUS.ERROR)
    .map(([model]) => model as ModelName);
};

const getCurrentSessionIdSafe = async () => {
  const currentSessionId = await StorageService.getCurrentSessionId();
  return currentSessionId;
};

const resolveTurn = (session: Session, turnId?: string) => {
  const turns = buildCompareTurns(session.messages);
  if (turnId) {
    return turns.find((entry) => entry.id === turnId) ?? null;
  }

  return turns.at(-1) ?? null;
};

const hasActiveCompareInFlight = (session: Session) =>
  session.messages.some(
    (message) =>
      message.role === 'assistant' &&
      (getMessageDeliveryStatus(message) === DELIVERY_STATUS.PENDING ||
        getMessageDeliveryStatus(message) === DELIVERY_STATUS.STREAMING)
  );

type CheckReadinessParams = z.infer<typeof BridgeCommandSchemas.check_readiness>;
type OpenModelTabsParams = z.infer<typeof BridgeCommandSchemas.open_model_tabs>;
type CompareParams = z.infer<typeof BridgeCommandSchemas.compare>;
type RetryFailedParams = z.infer<typeof BridgeCommandSchemas.retry_failed>;
type GetSessionParams = z.infer<typeof BridgeCommandSchemas.get_session>;
type ListSessionsParams = z.infer<typeof BridgeCommandSchemas.list_sessions>;
type ExportCompareParams = z.infer<typeof BridgeCommandSchemas.export_compare>;
type AnalyzeCompareParams = z.infer<typeof BridgeCommandSchemas.analyze_compare>;

export const captureBridgeStateSnapshot = async (): Promise<BridgeStateSnapshot> => {
  const sessions = await StorageService.getSessions();
  const currentSessionId = await StorageService.getCurrentSessionId();
  const currentSession =
    (currentSessionId
      ? sessions.find((entry) => entry.id === currentSessionId) ?? null
      : sessions[0] ?? null) ?? null;
  const selectedModels =
    currentSession?.selectedModels?.length && currentSession.selectedModels.length > 0
      ? currentSession.selectedModels
      : DEFAULT_SELECTED_MODELS;
  const readinessReports = await checkModelsReady({ models: selectedModels }).catch(() => []);

  return {
    currentSessionId: currentSessionId ?? null,
    sessions: sessions.map((session) => summarizeSession(session, currentSessionId)),
    currentSession: currentSession
      ? {
          id: currentSession.id,
          title: currentSession.title,
          selectedModels: currentSession.selectedModels,
          messageCount: currentSession.messages.length,
          turns: buildCompareTurns(currentSession.messages).map((turn) => ({
            id: turn.id,
            prompt: turn.userMessage?.text ?? '',
            requestedModels: turn.userMessage?.requestedModels ?? [],
            statuses: Object.fromEntries(
              Object.entries(turn.responses).map(([model, response]) => [
                model,
                response?.deliveryStatus ?? 'pending',
              ])
            ),
            startedAt: turn.startedAt,
          })),
        }
      : null,
    readiness: Object.fromEntries(
      readinessReports.map((report) => [
        report.model,
        {
          ready: report.ready,
          status: report.status,
          hostname: report.hostname,
          lastCheckedAt: report.lastCheckedAt,
        },
      ])
    ),
  };
};

export const executeProductAction = async (
  action: BridgeCommandName,
  params:
    | CheckReadinessParams
    | OpenModelTabsParams
    | CompareParams
    | RetryFailedParams
    | GetSessionParams
    | ListSessionsParams
    | ExportCompareParams
    | AnalyzeCompareParams
) => {
  switch (action) {
    case BRIDGE_COMMAND_NAMES.CHECK_READINESS: {
      const typedParams = params as CheckReadinessParams;
      const { session } = await resolveSessionContext();
      const models = resolveModels(session, typedParams.models);
      const reports = await checkModelsReady({ models });
      return {
        models,
        reports,
        checkedAt: Date.now(),
      };
    }

    case BRIDGE_COMMAND_NAMES.OPEN_MODEL_TABS: {
      const typedParams = params as OpenModelTabsParams;
      const { session } = await resolveSessionContext();
      const models = resolveModels(session, typedParams.models);
      const tabs = await Promise.all(
        models.map(async (model) => {
          const existingTabId = await tabManager.getExistingTabId(model);
          const tabId = existingTabId ?? (await tabManager.getTabId(model));
          return {
            model,
            tabId,
            openUrl: getModelConfig(model).openUrl,
            existed: Boolean(existingTabId),
          };
        })
      );
      return { tabs };
    }

    case BRIDGE_COMMAND_NAMES.COMPARE: {
      const typedParams = params as CompareParams;
      const { session, sessions, currentSessionId } = await resolveSessionContext(
        typedParams.sessionId
      );
      const models = resolveModels(session, typedParams.models);
      return queueCompareTurn(
        session,
        sessions,
        currentSessionId,
        typedParams.prompt,
        models
      );
    }

    case BRIDGE_COMMAND_NAMES.RETRY_FAILED: {
      const typedParams = params as RetryFailedParams;
      const { session, sessions, currentSessionId } = await resolveSessionContext(
        typedParams.sessionId
      );
      const retryModels = resolveRetryModels(
        session.messages,
        typedParams.turnId,
        typedParams.models
      );
      if (retryModels.length === 0) {
        return {
          status: 'blocked',
          reason: 'no_failed_models',
          sessionId: currentSessionId,
          turnId: typedParams.turnId,
        };
      }

      const turn = buildCompareTurns(session.messages).find(
        (entry) => entry.id === typedParams.turnId
      );
      const prompt = turn?.userMessage?.text ?? '';
      if (!prompt) {
        return {
          status: 'blocked',
          reason: 'turn_not_found',
          sessionId: currentSessionId,
          turnId: typedParams.turnId,
        };
      }

      return queueCompareTurn(session, sessions, currentSessionId, prompt, retryModels);
    }

    case BRIDGE_COMMAND_NAMES.GET_SESSION: {
      const typedParams = params as GetSessionParams;
      const currentSessionId = await getCurrentSessionIdSafe();
      const { session } = await resolveSessionContext(typedParams.sessionId);
      const turns = buildCompareTurns(session.messages).map((turn) => ({
        id: turn.id,
        prompt: turn.userMessage?.text ?? '',
        requestedModels: turn.userMessage?.requestedModels ?? [],
        responseModels: Object.keys(turn.responses),
        statuses: Object.fromEntries(
          Object.entries(turn.responses).map(([model, response]) => [
            model,
            response?.deliveryStatus ?? 'pending',
          ])
        ),
        startedAt: turn.startedAt,
      }));

      return {
        ...summarizeSession(session, currentSessionId),
        turns,
        messages: typedParams.includeMessages ? session.messages : undefined,
      };
    }

    case BRIDGE_COMMAND_NAMES.LIST_SESSIONS: {
      const typedParams = params as ListSessionsParams;
      const sessions = await StorageService.getSessions();
      const currentSessionId = await getCurrentSessionIdSafe();
      const limitedSessions =
        typedParams.limit && typedParams.limit > 0
          ? sessions.slice(0, typedParams.limit)
          : sessions;
      return {
        sessions: limitedSessions.map((session) => summarizeSession(session, currentSessionId)),
      };
    }

    case BRIDGE_COMMAND_NAMES.EXPORT_COMPARE: {
      const typedParams = params as ExportCompareParams;
      const { session } = await resolveSessionContext(typedParams.sessionId);
      const turn = resolveTurn(session, typedParams.turnId);
      if (!turn) {
        return {
          status: 'blocked',
          reason: 'turn_not_found',
          sessionId: session.id,
          turnId: typedParams.turnId ?? null,
        };
      }

      const requestedModels =
        turn.userMessage?.requestedModels?.length && turn.userMessage.requestedModels.length > 0
          ? turn.userMessage.requestedModels
          : session.selectedModels;
      const insight = buildCompareInsightSummary(requestedModels, turn.responses);
      const disagreement = buildDisagreementAnalysis(requestedModels, turn.responses, insight);

      return {
        sessionId: session.id,
        turnId: turn.id,
        format: typedParams.format,
        content:
          typedParams.format === 'summary'
            ? buildCompareShareSummary(turn, requestedModels, insight, disagreement)
            : buildCompareMarkdownExport(turn, requestedModels, insight, disagreement),
      };
    }

    case BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE: {
      const typedParams = params as AnalyzeCompareParams;
      const { session } = await resolveSessionContext(typedParams.sessionId);
      const turn = resolveTurn(session, typedParams.turnId);
      if (!turn) {
        return {
          status: 'blocked',
          reason: 'turn_not_found',
          sessionId: session.id,
          turnId: typedParams.turnId ?? null,
        };
      }

      const settings = await StorageService.getSettings();
      if (!settings.analysis.enabled) {
        return {
          status: 'blocked',
          reason: 'analysis_disabled',
          sessionId: session.id,
          turnId: turn.id,
        };
      }

      if (hasActiveCompareInFlight(session)) {
        return {
          status: 'blocked',
          reason: 'active_compare_in_flight',
          sessionId: session.id,
          turnId: turn.id,
          message: 'Wait for the active compare run to finish before starting AI Compare Analyst.',
        };
      }

      const fallbackModels =
        turn.userMessage?.requestedModels?.length && turn.userMessage.requestedModels.length > 0
          ? turn.userMessage.requestedModels
          : session.selectedModels;
      const availability = summarizeAnalysisAvailability(turn, fallbackModels);
      if (!availability.canRun) {
        return {
          status: 'blocked',
          reason: availability.blockReason ?? 'analysis_unavailable',
          sessionId: session.id,
          turnId: turn.id,
          completedModels: availability.completedModels,
        };
      }

      const provider = getAnalysisProvider(settings.analysis.provider);
      if (!provider || !provider.availableInBrowserBuild) {
        return {
          status: 'blocked',
          reason: ANALYSIS_BLOCK_REASONS.PROVIDER_BLOCKED,
          sessionId: session.id,
          turnId: turn.id,
          message:
            provider?.availabilityReason ??
            'The selected analyst provider is not available in this browser build.',
        };
      }

      const analysisRequest = buildCompareAnalysisRequest(turn, fallbackModels);
      const analystModel = settings.analysis.model;
      const preparedRun = provider.prepareRun(analysisRequest, analystModel);
      if (provider.executionSurface === ANALYSIS_EXECUTION_SURFACES.BROWSER_TAB) {
        const analystReadiness = (await checkModelsReady({ models: [analystModel] }))[0];
        if (!analystReadiness?.ready) {
          return {
            status: 'blocked',
            reason: ANALYSIS_BLOCK_REASONS.MODEL_NOT_READY,
            sessionId: session.id,
            turnId: turn.id,
            message: analystReadiness
              ? buildReadinessErrorMessage(analystReadiness)
              : `${analystModel} is not ready for the browser-session analysis lane.`,
          };
        }

        const response = await runCompareAnalysis({
          prompt: preparedRun.prompt,
          turnId: turn.id,
          analysisRequestId: crypto.randomUUID(),
          model: preparedRun.model,
        });

        if (!response.ok || !response.text) {
          return {
            status: 'error',
            reason: response.errorCode ?? 'analysis_failed',
            sessionId: session.id,
            turnId: turn.id,
            message: response.errorMessage ?? 'AI Compare Analyst could not finish this request.',
          };
        }

        return {
          status: 'success',
          sessionId: session.id,
          turnId: turn.id,
          provider: preparedRun.provider,
          analystModel,
          result: provider.parseResult(response.text, preparedRun.model),
        };
      }

      const runtimeResponse = await runSwitchyardCompareAnalysis({
        analystModel: preparedRun.model,
        prompt: preparedRun.prompt,
      });

      if (!runtimeResponse.ok) {
        return {
          status: runtimeResponse.kind === 'runtime_error' ? 'error' : 'blocked',
          reason:
            runtimeResponse.kind === 'runtime_auth_required'
              ? ANALYSIS_BLOCK_REASONS.RUNTIME_AUTH_REQUIRED
              : runtimeResponse.kind === 'runtime_model_unsupported'
                ? ANALYSIS_BLOCK_REASONS.RUNTIME_MODEL_UNSUPPORTED
                : runtimeResponse.kind === 'runtime_unavailable'
                  ? ANALYSIS_BLOCK_REASONS.RUNTIME_UNAVAILABLE
                  : 'analysis_failed',
          sessionId: session.id,
          turnId: turn.id,
          message: runtimeResponse.message,
        };
      }

      return {
        status: 'success',
        sessionId: session.id,
        turnId: turn.id,
        provider: preparedRun.provider,
        analystModel,
        result: provider.parseResult(runtimeResponse.rawText, preparedRun.model),
      };
    }

    default: {
      throw new Error(`Unsupported MCP action: ${String(action)}`);
    }
  }
};
