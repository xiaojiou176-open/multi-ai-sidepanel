import {
  DELIVERY_STATUS,
  FAILURE_CLASSES,
  MSG_TYPES,
  READINESS_STATUSES,
  SEND_ERROR_CODES,
  type BroadcastPromptPayload,
  type CheckModelsReadyPayload,
  type CompareAnalysisResponsePayload,
  type ExecuteCompareAnalysisPayload,
  type ModelReadinessReport,
  type ModelName,
  type PingPayload,
  type PongPayload,
  type RunCompareAnalysisPayload,
  type StreamResponsePayload,
} from '../utils/types';
import i18n from '../i18n';
import { tabManager } from './tabManager';
import { SelectorService } from '../services/selectorService';
import { StorageService } from '../services/storage';
import { Logger, toErrorMessage } from '../utils/logger';
import { applyStreamResponsePayloadToSessions } from '../services/sessionRuntime';

const CONTENT_READY_TIMEOUT_MS = 1500;
const ANALYSIS_TIMEOUT_MS = 90_000;

const createBackgroundError = (
  code: string,
  message: string,
  details?: Partial<{
    failureClass: string;
    readinessStatus: string;
    hostname: string;
    selectorSource: string;
    remoteConfigConfigured: boolean;
    inputReady: boolean;
    submitReady: boolean;
    lastCheckedAt: number;
  }>
) => {
  const error = new Error(message) as Error & { code?: string };
  error.code = code;
  Object.assign(error, details);
  return error;
};

const buildDeliveryErrorMessage = (model: ModelName, errorCode: string) => {
  if (errorCode === SEND_ERROR_CODES.HANDSHAKE) {
    return i18n.t('runtime.readinessContentUnavailable', {
      defaultValue: '{{model}} did not confirm readiness from the current browser tab.',
      model,
    });
  }

  return i18n.t('runtime.contentPromptDriveFailed', {
    defaultValue: 'Prompt Switchboard could not drive {{model}} on this page.',
    model,
  });
};

const toReadinessReport = (
  model: ModelName,
  tabId: number | null,
  pong: PongPayload
): ModelReadinessReport => ({
  model,
  ready: pong.ready,
  status: pong.readinessStatus,
  hostname: pong.hostname,
  selectorSource: pong.selectorSource,
  remoteConfigConfigured: pong.remoteConfigConfigured,
  failureClass: pong.failureClass,
  inputReady: pong.inputReady,
  submitReady: pong.submitReady,
  lastCheckedAt: pong.lastCheckedAt,
  tabId,
});

const toReadinessFailureReport = (
  model: ModelName,
  tabId: number,
  remoteConfigConfigured: boolean,
  lastCheckedAt: number,
  error: Error & {
    failureClass?: typeof FAILURE_CLASSES[keyof typeof FAILURE_CLASSES];
    readinessStatus?: typeof READINESS_STATUSES[keyof typeof READINESS_STATUSES];
    hostname?: string;
    selectorSource?: 'default' | 'cached';
    remoteConfigConfigured?: boolean;
    inputReady?: boolean;
    submitReady?: boolean;
    lastCheckedAt?: number;
  }
): ModelReadinessReport => ({
  model,
  ready: false,
  status: error.readinessStatus ?? READINESS_STATUSES.CONTENT_UNAVAILABLE,
  hostname: error.hostname,
  selectorSource: error.selectorSource,
  remoteConfigConfigured: error.remoteConfigConfigured ?? remoteConfigConfigured,
  failureClass: error.failureClass ?? FAILURE_CLASSES.HANDSHAKE_MISMATCH,
  inputReady: error.inputReady,
  submitReady: error.submitReady,
  lastCheckedAt: error.lastCheckedAt ?? lastCheckedAt,
  tabId,
});

const getCandidateTabIdsForModel = async (model: ModelName): Promise<number[]> => {
  if (
    typeof (tabManager as typeof tabManager & {
      getCandidateTabIds?: (model: ModelName) => Promise<number[]>;
    }).getCandidateTabIds === 'function'
  ) {
    return (tabManager as typeof tabManager & {
      getCandidateTabIds: (model: ModelName) => Promise<number[]>;
    }).getCandidateTabIds(model);
  }

  const existingTabId = await tabManager.getExistingTabId(model);
  return existingTabId ? [existingTabId] : [];
};

export const forwardResponseUpdate = (payload: StreamResponsePayload) => {
  void Promise.all([StorageService.getSessions(), StorageService.getCurrentSessionId()])
    .then(async ([sessions, currentSessionId]) => {
      const { updatedSessions, didUpdateAnySession } = applyStreamResponsePayloadToSessions({
        sessions,
        currentSessionId,
        payload,
      });

      if (didUpdateAnySession) {
        await StorageService.saveSessions(updatedSessions);
      }
    })
    .catch(() => undefined);
  void StorageService.saveBufferedStreamUpdate(payload).catch(() => undefined);
  void chrome.runtime
    .sendMessage({
      type: MSG_TYPES.ON_RESPONSE_UPDATE,
      payload,
    })
    .catch(() => {
      // Side panel might be closed, ignore.
    });
};

async function ensureContentReady(tabId: number, model: ModelName): Promise<PongPayload> {
  const pingPayload: PingPayload = { expectedModel: model };
  let handshakeTimeoutId: ReturnType<typeof setTimeout> | undefined;
  const handshakeTimeout = new Promise<never>((_, reject) => {
    handshakeTimeoutId = setTimeout(() => {
      reject(
        createBackgroundError(
          SEND_ERROR_CODES.HANDSHAKE,
          `content_ready_timeout:${model}:${CONTENT_READY_TIMEOUT_MS}`
        )
      );
    }, CONTENT_READY_TIMEOUT_MS);
  });

  try {
    const response = (await Promise.race([
      Promise.resolve(
        chrome.tabs.sendMessage(tabId, {
          type: MSG_TYPES.PING,
          payload: pingPayload,
        })
      ),
      handshakeTimeout,
    ])) as { type: string; payload?: unknown } | undefined;

    if (!response || response.type !== MSG_TYPES.PONG) {
      throw createBackgroundError(
        SEND_ERROR_CODES.HANDSHAKE,
        `content_ready_missing_or_invalid:${model}`
      );
    }

    const pong = response.payload as PongPayload | undefined;

    if (!pong || pong.model !== model) {
      throw createBackgroundError(
        SEND_ERROR_CODES.HANDSHAKE,
        `content_ready_mismatch:${model}:${pong?.model ?? 'unknown'}`,
        {
          failureClass: FAILURE_CLASSES.HANDSHAKE_MISMATCH,
          readinessStatus: READINESS_STATUSES.MODEL_MISMATCH,
          hostname: pong?.hostname,
          selectorSource: pong?.selectorSource,
          remoteConfigConfigured: pong?.remoteConfigConfigured,
          inputReady: pong?.inputReady,
          submitReady: pong?.submitReady,
          lastCheckedAt: pong?.lastCheckedAt,
        }
      );
    }

    if (!pong.ready) {
      throw createBackgroundError(
        SEND_ERROR_CODES.HANDSHAKE,
        `content_ready_blocked:${model}:${pong.readinessStatus}`,
        {
          failureClass: pong.failureClass ?? FAILURE_CLASSES.HANDSHAKE_MISMATCH,
          readinessStatus: pong.readinessStatus,
          hostname: pong.hostname,
          selectorSource: pong.selectorSource,
          remoteConfigConfigured: pong.remoteConfigConfigured,
          inputReady: pong.inputReady,
          submitReady: pong.submitReady,
          lastCheckedAt: pong.lastCheckedAt,
        }
      );
    }

    return pong;
  } finally {
    if (handshakeTimeoutId) {
      clearTimeout(handshakeTimeoutId);
    }
  }
}

async function checkModelReadiness(model: ModelName): Promise<ModelReadinessReport> {
  const remoteConfigConfigured = SelectorService.isRemoteConfigConfigured();
  const lastCheckedAt = Date.now();
  const candidateTabIds = await getCandidateTabIdsForModel(model);

  if (candidateTabIds.length === 0) {
    return {
      model,
      ready: false,
      status: READINESS_STATUSES.TAB_MISSING,
      remoteConfigConfigured,
      failureClass: FAILURE_CLASSES.TAB_UNAVAILABLE,
      lastCheckedAt,
      tabId: null,
    };
  }

  let firstFailure: ModelReadinessReport | null = null;

  for (const tabId of candidateTabIds) {
    const tab = await chrome.tabs.get(tabId).catch(() => null);
    if (!tab) {
      firstFailure ??= {
        model,
        ready: false,
        status: READINESS_STATUSES.TAB_MISSING,
        remoteConfigConfigured,
        failureClass: FAILURE_CLASSES.TAB_UNAVAILABLE,
        lastCheckedAt,
        tabId: null,
      };
      continue;
    }

    const loadingFailure =
      tab.status !== 'complete'
        ? {
            model,
            ready: false,
            status: READINESS_STATUSES.TAB_LOADING,
            remoteConfigConfigured,
            lastCheckedAt,
            tabId,
            hostname: tab.url ? new URL(tab.url).hostname : undefined,
          }
        : null;

    try {
      const pong = await ensureContentReady(tabId, model);
      if (
        typeof (tabManager as typeof tabManager & {
          rememberTabId?: (model: ModelName, tabId: number) => Promise<void>;
        }).rememberTabId === 'function'
      ) {
        await (tabManager as typeof tabManager & {
          rememberTabId: (model: ModelName, tabId: number) => Promise<void>;
        }).rememberTabId(model, tabId);
      }
      return toReadinessReport(model, tabId, pong);
    } catch (error) {
      if (loadingFailure) {
        firstFailure ??= loadingFailure;
      } else {
        firstFailure ??= toReadinessFailureReport(
          model,
          tabId,
          remoteConfigConfigured,
          lastCheckedAt,
          error as Error & {
            failureClass?: typeof FAILURE_CLASSES[keyof typeof FAILURE_CLASSES];
            readinessStatus?: typeof READINESS_STATUSES[keyof typeof READINESS_STATUSES];
            hostname?: string;
            selectorSource?: 'default' | 'cached';
            remoteConfigConfigured?: boolean;
            inputReady?: boolean;
            submitReady?: boolean;
            lastCheckedAt?: number;
          }
        );
      }
    }
  }

  return (
    firstFailure ?? {
      model,
      ready: false,
      status: READINESS_STATUSES.TAB_MISSING,
      remoteConfigConfigured,
      failureClass: FAILURE_CLASSES.TAB_UNAVAILABLE,
      lastCheckedAt,
      tabId: null,
    }
  );
}

export async function checkModelsReady(
  payload: CheckModelsReadyPayload
): Promise<ModelReadinessReport[]> {
  const models = Array.from(new Set(payload.models));
  return Promise.all(models.map((model) => checkModelReadiness(model)));
}

export async function broadcastPrompt(payload: BroadcastPromptPayload) {
  const { prompt, models, sessionId, requestId, turnId } = payload;

  for (const model of models) {
    try {
      const tabId = await tabManager.getTabId(model);
      await tabManager.ensureTabReady(tabId);
      const contentReady = await ensureContentReady(tabId, model);

      await Promise.resolve(
        chrome.tabs.sendMessage(tabId, {
          type: MSG_TYPES.EXECUTE_PROMPT,
          payload: {
            prompt,
            sessionId,
            requestId,
            turnId,
            model,
          },
        })
      );

      Logger.info('prompt_sent', {
        surface: 'background',
        sessionId,
        model,
        requestId,
        turnId,
        tabId,
        selectorSource: contentReady.selectorSource,
        remoteConfigConfigured: contentReady.remoteConfigConfigured,
        hostname: contentReady.hostname,
      });
    } catch (error) {
      const errorCode =
        (error as { code?: string })?.code === SEND_ERROR_CODES.HANDSHAKE
          ? SEND_ERROR_CODES.HANDSHAKE
          : SEND_ERROR_CODES.RUNTIME;
      Logger.error('prompt_error', {
        surface: 'background',
        sessionId,
        model,
        requestId,
        turnId,
        code: errorCode,
        error: toErrorMessage(error),
      });
      forwardResponseUpdate({
        model,
        requestId,
        turnId,
        text: buildDeliveryErrorMessage(model, errorCode),
        isComplete: true,
        deliveryStatus: DELIVERY_STATUS.ERROR,
        errorCode,
        completedAt: Date.now(),
        data: {
          stage:
            errorCode === SEND_ERROR_CODES.HANDSHAKE ? 'content_ready_handshake' : 'delivery',
          failureClass:
            ((error as { failureClass?: typeof FAILURE_CLASSES[keyof typeof FAILURE_CLASSES] })
              .failureClass ??
              (errorCode === SEND_ERROR_CODES.HANDSHAKE
                ? FAILURE_CLASSES.HANDSHAKE_MISMATCH
                : FAILURE_CLASSES.TRANSIENT_DELIVERY_OR_RUNTIME)),
          readinessStatus: (
            error as { readinessStatus?: typeof READINESS_STATUSES[keyof typeof READINESS_STATUSES] }
          ).readinessStatus,
          hostname: (error as { hostname?: string }).hostname,
          selectorSource: (error as { selectorSource?: 'default' | 'cached' }).selectorSource,
          remoteConfigConfigured: (error as { remoteConfigConfigured?: boolean })
            .remoteConfigConfigured,
          inputReady: (error as { inputReady?: boolean }).inputReady,
          submitReady: (error as { submitReady?: boolean }).submitReady,
          lastCheckedAt: (error as { lastCheckedAt?: number }).lastCheckedAt,
        },
      });
    }
  }
}

export async function runCompareAnalysis(
  payload: RunCompareAnalysisPayload
): Promise<CompareAnalysisResponsePayload> {
  const { prompt, model, turnId, analysisRequestId } = payload;

  try {
    const tabId = await tabManager.getTabId(model);
    await tabManager.ensureTabReady(tabId);
    const contentReady = await ensureContentReady(tabId, model);

    const executePayload: ExecuteCompareAnalysisPayload = {
      prompt,
      model,
      turnId,
      analysisRequestId,
    };

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<CompareAnalysisResponsePayload>((resolve) => {
      timeoutId = setTimeout(() => {
        resolve({
          ok: false,
          model,
          turnId,
          analysisRequestId,
          completedAt: Date.now(),
          errorCode: SEND_ERROR_CODES.TIMEOUT,
          errorMessage: 'AI analysis timed out before the target tab returned a final response.',
          data: {
            stage: 'analysis_delivery',
            hostname: contentReady.hostname,
            selectorSource: contentReady.selectorSource,
            remoteConfigConfigured: contentReady.remoteConfigConfigured,
            readinessStatus: contentReady.readinessStatus,
            inputReady: contentReady.inputReady,
            submitReady: contentReady.submitReady,
            lastCheckedAt: contentReady.lastCheckedAt,
          },
        });
      }, ANALYSIS_TIMEOUT_MS);
    });

    const responsePromise = Promise.resolve(
      chrome.tabs.sendMessage(tabId, {
        type: MSG_TYPES.EXECUTE_COMPARE_ANALYSIS,
        payload: executePayload,
      })
    ) as Promise<CompareAnalysisResponsePayload | undefined>;

    const response = await Promise.race([responsePromise, timeoutPromise]);
    if (timeoutId) {
      clearTimeout(timeoutId);
    }

    if (!response) {
      return {
        ok: false,
        model,
        turnId,
        analysisRequestId,
        completedAt: Date.now(),
        errorCode: SEND_ERROR_CODES.RUNTIME,
        errorMessage: 'The target tab did not return an AI analysis response.',
      };
    }

    return response;
  } catch (error) {
    const errorCode =
      (error as { code?: string })?.code === SEND_ERROR_CODES.HANDSHAKE
        ? SEND_ERROR_CODES.HANDSHAKE
        : SEND_ERROR_CODES.RUNTIME;

    return {
      ok: false,
      model,
      turnId,
      analysisRequestId,
      completedAt: Date.now(),
      errorCode,
      errorMessage:
        errorCode === SEND_ERROR_CODES.HANDSHAKE
          ? `Prompt Switchboard could not confirm that ${model} was ready for AI analysis.`
          : `Prompt Switchboard could not start AI analysis in ${model}.`,
      data: {
        stage: errorCode === SEND_ERROR_CODES.HANDSHAKE ? 'content_ready_handshake' : 'analysis_delivery',
        failureClass:
          ((error as { failureClass?: typeof FAILURE_CLASSES[keyof typeof FAILURE_CLASSES] })
            .failureClass ??
            (errorCode === SEND_ERROR_CODES.HANDSHAKE
              ? FAILURE_CLASSES.HANDSHAKE_MISMATCH
              : FAILURE_CLASSES.TRANSIENT_DELIVERY_OR_RUNTIME)),
        readinessStatus: (
          error as { readinessStatus?: typeof READINESS_STATUSES[keyof typeof READINESS_STATUSES] }
        ).readinessStatus,
        hostname: (error as { hostname?: string }).hostname,
        selectorSource: (error as { selectorSource?: 'default' | 'cached' }).selectorSource,
        remoteConfigConfigured: (error as { remoteConfigConfigured?: boolean })
          .remoteConfigConfigured,
        inputReady: (error as { inputReady?: boolean }).inputReady,
        submitReady: (error as { submitReady?: boolean }).submitReady,
        lastCheckedAt: (error as { lastCheckedAt?: number }).lastCheckedAt,
      },
    };
  }
}
