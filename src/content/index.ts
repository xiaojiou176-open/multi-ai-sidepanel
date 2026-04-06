import { FAILURE_CLASSES, MSG_TYPES, READINESS_STATUSES } from '../utils/types';
import type {
  CompareAnalysisResponsePayload,
  ExecuteCompareAnalysisPayload,
  ExecutePromptPayload,
  MessagePayload,
  ModelName,
  PingPayload,
} from '../utils/types';
import type { Scraper } from './scrapers/base';
import { scraperRegistry } from '../services/scraperRegistry';
import { SelectorService } from '../services/selectorService';
import i18n from '../i18n';
import { Logger, toErrorMessage } from '../utils/logger';

Logger.info('content_script_loaded', {
  surface: 'content',
});

let scraper: Scraper | null = null;
let currentModel: ModelName | null = null;
let stopObserving: (() => void) | null = null;

const hostname = window.location.hostname;
const resolved = scraperRegistry.getScraper(hostname);
if (resolved) {
  scraper = resolved.scraper;
  currentModel = resolved.model;
}

if (scraper && currentModel) {
  Logger.info('content_scraper_activated', {
    surface: 'content',
    model: currentModel,
  });

  chrome.runtime.onMessage.addListener((message: MessagePayload, _sender, sendResponse) => {
    if (message.type === MSG_TYPES.PING) {
      void respondToPing(message.payload as PingPayload | undefined, sendResponse);
      return true;
    }

    if (message.type === MSG_TYPES.EXECUTE_PROMPT) {
      const payload = message.payload as ExecutePromptPayload;
      void handleExecutePrompt(payload);
      return false;
    }

    if (message.type === MSG_TYPES.EXECUTE_COMPARE_ANALYSIS) {
      const payload = message.payload as ExecuteCompareAnalysisPayload;
      void handleExecuteCompareAnalysis(payload, sendResponse);
      return true;
    }

    return false;
  });
}

async function respondToPing(
  payload: PingPayload | undefined,
  sendResponse: (response?: unknown) => void
) {
  if (!currentModel) {
    sendResponse(undefined);
    return;
  }

  const selectorDiagnostics = await SelectorService.getSelectorDiagnostics(currentModel);
  const modelMatches = !payload?.expectedModel || payload.expectedModel === currentModel;
  const diagnosticsReady =
    selectorDiagnostics.readinessStatus === undefined
      ? true
      : selectorDiagnostics.readinessStatus === READINESS_STATUSES.READY;
  const ready = modelMatches && diagnosticsReady;
  const readinessStatus = !modelMatches
    ? READINESS_STATUSES.MODEL_MISMATCH
    : selectorDiagnostics.readinessStatus ?? READINESS_STATUSES.READY;
  const failureClass = !modelMatches
    ? FAILURE_CLASSES.HANDSHAKE_MISMATCH
    : selectorDiagnostics.failureClass;

  Logger.info('content_ready_pong', {
    surface: 'content',
    model: currentModel,
    hostname,
    ready,
    readinessStatus,
    failureClass,
    selectorSource: selectorDiagnostics.source,
    remoteConfigConfigured: selectorDiagnostics.remoteConfigConfigured,
  });

  sendResponse({
    type: MSG_TYPES.PONG,
    payload: {
      ready,
      model: currentModel,
      hostname,
      selectorSource: selectorDiagnostics.source,
      remoteConfigConfigured: selectorDiagnostics.remoteConfigConfigured,
      readinessStatus,
      failureClass,
      inputReady: selectorDiagnostics.inputReady ?? true,
      submitReady: selectorDiagnostics.submitReady ?? true,
      lastCheckedAt: selectorDiagnostics.lastCheckedAt ?? Date.now(),
    },
  });
}

async function handleExecutePrompt(payload: ExecutePromptPayload) {
  if (!scraper || !currentModel) return;

  const selectorDiagnostics = await SelectorService.getSelectorDiagnostics(currentModel);

  try {
    Logger.info('content_execute_prompt_start', {
      surface: 'content',
      sessionId: payload.sessionId,
      requestId: payload.requestId,
      turnId: payload.turnId,
      model: payload.model,
      selectorSource: selectorDiagnostics.source,
      remoteConfigConfigured: selectorDiagnostics.remoteConfigConfigured,
    });

    // CRITICAL: Start observing BEFORE sending the message
    // Otherwise we miss fast responses (especially the first one)
    stopObserving?.();
    stopObserving = scraper.observeResponse((text, isComplete) => {
      const data = {
        hostname,
        selectorSource: selectorDiagnostics.source,
        remoteConfigConfigured: selectorDiagnostics.remoteConfigConfigured,
        readinessStatus: selectorDiagnostics.readinessStatus,
        inputReady: selectorDiagnostics.inputReady,
        submitReady: selectorDiagnostics.submitReady,
        lastCheckedAt: selectorDiagnostics.lastCheckedAt,
      };

      // Send response updates back to sidepanel through background
      chrome.runtime.sendMessage({
        type: MSG_TYPES.STREAM_RESPONSE,
        payload: {
          model: currentModel!,
          requestId: payload.requestId,
          turnId: payload.turnId,
          text: text,
          isComplete: isComplete,
          deliveryStatus: isComplete ? 'complete' : 'streaming',
          completedAt: isComplete ? Date.now() : undefined,
          data: Object.fromEntries(
            Object.entries(data).filter(([, value]) => value !== undefined)
          ),
        },
      });
    });

    // Wait a bit for the MutationObserver to fully activate
    // This is crucial for fast-responding platforms like Perplexity and ChatGPT
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Now send the message
    await scraper.fillInput(payload.prompt);
    await scraper.clickSend();
  } catch (error) {
    Logger.error('content_execute_prompt_failed', {
      surface: 'content',
      sessionId: payload.sessionId,
      requestId: payload.requestId,
      turnId: payload.turnId,
      model: payload.model,
      error: toErrorMessage(error),
    });
    chrome.runtime.sendMessage({
      type: MSG_TYPES.STREAM_RESPONSE,
      payload: {
        model: payload.model,
        requestId: payload.requestId,
        turnId: payload.turnId,
        text: i18n.t('runtime.contentPromptDriveFailed', {
          defaultValue: 'Prompt Switchboard could not drive {{model}} on this page.',
          model: payload.model,
        }),
        isComplete: true,
        deliveryStatus: 'error',
        errorCode: 'runtime_error',
        completedAt: Date.now(),
        data: {
          stage: 'content_execute_prompt',
          hostname,
          selectorSource: selectorDiagnostics.source,
          remoteConfigConfigured: selectorDiagnostics.remoteConfigConfigured,
          readinessStatus: selectorDiagnostics.readinessStatus,
          failureClass:
            selectorDiagnostics.failureClass || FAILURE_CLASSES.TRANSIENT_DELIVERY_OR_RUNTIME,
          inputReady: selectorDiagnostics.inputReady,
          submitReady: selectorDiagnostics.submitReady,
          lastCheckedAt: selectorDiagnostics.lastCheckedAt,
        },
      },
    });
    stopObserving?.();
    stopObserving = null;
  }
}

async function handleExecuteCompareAnalysis(
  payload: ExecuteCompareAnalysisPayload,
  sendResponse: (response?: CompareAnalysisResponsePayload) => void
) {
  if (!scraper || !currentModel) {
    sendResponse({
      ok: false,
      model: payload.model,
      turnId: payload.turnId,
      analysisRequestId: payload.analysisRequestId,
      completedAt: Date.now(),
      errorCode: 'runtime_error',
      errorMessage: i18n.t(
        'runtime.contentScraperMissing',
        'Prompt Switchboard could not find an active scraper for this page.'
      ),
    });
    return;
  }

  const selectorDiagnostics = await SelectorService.getSelectorDiagnostics(currentModel);

  try {
    let didRespond = false;

    stopObserving?.();
    stopObserving = scraper.observeResponse((text, isComplete) => {
      if (!isComplete || didRespond) return;

      didRespond = true;
      stopObserving?.();
      stopObserving = null;
      sendResponse({
        ok: true,
        model: currentModel!,
        turnId: payload.turnId,
        analysisRequestId: payload.analysisRequestId,
        text,
        completedAt: Date.now(),
        data: {
          hostname,
          selectorSource: selectorDiagnostics.source,
          remoteConfigConfigured: selectorDiagnostics.remoteConfigConfigured,
          readinessStatus: selectorDiagnostics.readinessStatus,
          inputReady: selectorDiagnostics.inputReady,
          submitReady: selectorDiagnostics.submitReady,
          lastCheckedAt: selectorDiagnostics.lastCheckedAt,
        },
      });
    });

    await new Promise((resolve) => setTimeout(resolve, 100));
    await scraper.fillInput(payload.prompt);
    await scraper.clickSend();
  } catch (error) {
    Logger.error('content_execute_compare_analysis_failed', {
      surface: 'content',
      model: payload.model,
      turnId: payload.turnId,
      analysisRequestId: payload.analysisRequestId,
      error: toErrorMessage(error),
    });
    stopObserving?.();
    stopObserving = null;
    sendResponse({
      ok: false,
      model: payload.model,
      turnId: payload.turnId,
      analysisRequestId: payload.analysisRequestId,
      completedAt: Date.now(),
      errorCode: 'runtime_error',
      errorMessage: i18n.t('runtime.contentAnalysisDriveFailed', {
        defaultValue: 'Prompt Switchboard could not drive {{model}} on this page for AI analysis.',
        model: payload.model,
      }),
      data: {
        stage: 'content_execute_prompt',
        hostname,
        selectorSource: selectorDiagnostics.source,
        remoteConfigConfigured: selectorDiagnostics.remoteConfigConfigured,
        readinessStatus: selectorDiagnostics.readinessStatus,
        failureClass:
          selectorDiagnostics.failureClass || FAILURE_CLASSES.TRANSIENT_DELIVERY_OR_RUNTIME,
        inputReady: selectorDiagnostics.inputReady,
        submitReady: selectorDiagnostics.submitReady,
        lastCheckedAt: selectorDiagnostics.lastCheckedAt,
      },
    });
  }
}
