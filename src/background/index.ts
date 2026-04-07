import {
  type CompareAnalysisResponsePayload,
  type ExecuteSubstrateActionMessage,
  MSG_TYPES,
  type RunCompareAnalysisPayload,
  SEND_ERROR_CODES,
  type BroadcastPromptPayload,
  type CheckModelsReadyPayload,
  hasMessageType,
  type MessagePayload,
  type StreamResponsePayload,
} from '../utils/types';
import { startMcpBridgeClient } from './mcpBridgeClient';
import { executeBridgeCommand } from './mcpCommandSurface';
import { executeSubstrateAction } from '../substrate/api/executor';
import i18n from '../i18n';
import { SelectorService } from '../services/selectorService';
import { StorageService } from '../services/storage';
import { Logger, toErrorMessage } from '../utils/logger';
import {
  broadcastPrompt,
  checkModelsReady,
  forwardResponseUpdate,
  runCompareAnalysis,
} from './runtimeActions';

const BACKGROUND_CHECK_READY_TIMEOUT_MS = 5_000;
const BACKGROUND_SUBSTRATE_TIMEOUT_MS = 10_000;
const BACKGROUND_ANALYSIS_TIMEOUT_MS = 95_000;

const withTimeout = <T>(promise: Promise<T>, timeoutMs: number, label: string) =>
  Promise.race<T>([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label}_timeout:${timeoutMs}`)), timeoutMs)
    ),
  ]);

Logger.info('background_service_started', { surface: 'background' });
SelectorService.fetchAndCacheSelectors();
startMcpBridgeClient({ executeCommand: executeBridgeCommand });

chrome.runtime.onMessage.addListener((message: MessagePayload, _sender, sendResponse) => {
  if (hasMessageType(message, MSG_TYPES.BROADCAST_PROMPT)) {
    void broadcastPrompt(message.payload as BroadcastPromptPayload);
    sendResponse({ status: 'processing' });
    return true; // Async response
  }

  if (hasMessageType(message, MSG_TYPES.CHECK_MODELS_READY)) {
    withTimeout(
      checkModelsReady(message.payload as CheckModelsReadyPayload),
      BACKGROUND_CHECK_READY_TIMEOUT_MS,
      'background_check_models_ready'
    )
      .then((reports) => sendResponse({ reports }))
      .catch((error) => {
        Logger.error('background_check_models_ready_failed', {
          surface: 'background',
          code: 'background_check_models_ready_failed',
          error: toErrorMessage(error),
        });
        sendResponse({ reports: [] });
      });
    return true;
  }

  if (hasMessageType(message, MSG_TYPES.EXECUTE_SUBSTRATE_ACTION)) {
    const payload = (message as ExecuteSubstrateActionMessage).payload ?? {};
    if (!payload.action) {
      sendResponse({
        version: 'v2alpha1',
        action: 'unknown',
        ok: false,
        error: {
          kind: 'validation',
          code: 'missing_action',
          message:
            'Prompt Switchboard could not execute a substrate action without an action name.',
          retryable: false,
        },
      });
      return true;
    }

    withTimeout(
      executeSubstrateAction(payload.action as never, payload.args),
      BACKGROUND_SUBSTRATE_TIMEOUT_MS,
      `background_execute_substrate_action:${payload.action}`
    )
      .then((outcome) => sendResponse(outcome))
      .catch((error) => {
        Logger.error('background_execute_substrate_action_failed', {
          surface: 'background',
          code: 'background_execute_substrate_action_failed',
          action: payload.action,
          error: toErrorMessage(error),
        });
        sendResponse({
          version: 'v2alpha1',
          action: payload.action,
          ok: false,
          error: {
            kind: 'runtime',
            code: 'substrate_action_failed',
            message: toErrorMessage(error),
            retryable: true,
          },
        });
      });
    return true;
  }

  if (hasMessageType(message, MSG_TYPES.RUN_COMPARE_ANALYSIS)) {
    withTimeout(
      runCompareAnalysis(message.payload as RunCompareAnalysisPayload),
      BACKGROUND_ANALYSIS_TIMEOUT_MS,
      'background_run_compare_analysis'
    )
      .then((payload) => sendResponse(payload))
      .catch((error) => {
        Logger.error('background_run_compare_analysis_failed', {
          surface: 'background',
          code: 'background_run_compare_analysis_failed',
          error: toErrorMessage(error),
        });
        const payload = message.payload as RunCompareAnalysisPayload;
        sendResponse({
          ok: false,
          model: payload.model,
          turnId: payload.turnId,
          analysisRequestId: payload.analysisRequestId,
          completedAt: Date.now(),
          errorCode: SEND_ERROR_CODES.RUNTIME,
          errorMessage: i18n.t(
            'runtime.analysisRuntimeFailed',
            'Prompt Switchboard could not finish AI analysis in the target tab.'
          ),
        } satisfies CompareAnalysisResponsePayload);
      });
    return true;
  }

  if (hasMessageType(message, MSG_TYPES.GET_BUFFERED_UPDATES)) {
    StorageService.consumeBufferedStreamUpdates()
      .then((updates) => sendResponse({ updates }))
      .catch((error) => {
        Logger.error('background_get_buffered_updates_failed', {
          surface: 'background',
          code: 'background_get_buffered_updates_failed',
          error: toErrorMessage(error),
        });
        sendResponse({ updates: [] });
      });
    return true;
  }

  // Forward stream responses from Content Script to Side Panel
  if (hasMessageType(message, MSG_TYPES.STREAM_RESPONSE)) {
    void forwardResponseUpdate(message.payload as StreamResponsePayload);
  }
});

// Open Side Panel on action click
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
