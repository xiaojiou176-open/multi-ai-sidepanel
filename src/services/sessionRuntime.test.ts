import { beforeEach, describe, expect, it, vi } from 'vitest';
import { normalizeSessionMessages } from '../utils/messages';
import {
  buildDeliveryErrorMessage,
  buildReadinessErrorMessage,
  buildReadinessFailurePayload,
  createAssistantPlaceholder,
  createDefaultSession,
  createUserTurnMessage,
  markTurnDeliveryFailure,
  normalizeSessionForRuntime,
  updateMessageFromPayload,
} from './sessionRuntime';
import {
  DELIVERY_STATUS,
  MESSAGE_ROLES,
  READINESS_STATUSES,
  SEND_ERROR_CODES,
  type Message,
  type Session,
} from '../utils/types';

vi.mock('../i18n', () => ({
  default: {
    t: (key: string, fallbackOrOptions?: string | { defaultValue?: string; model?: string }) => {
      if (typeof fallbackOrOptions === 'string') {
        return fallbackOrOptions;
      }

      if (fallbackOrOptions?.defaultValue) {
        return fallbackOrOptions.defaultValue.replace('{{model}}', fallbackOrOptions.model ?? '');
      }

      return key;
    },
  },
}));

vi.mock('../utils/messages', async () => {
  const actual = await vi.importActual<typeof import('../utils/messages')>('../utils/messages');
  return {
    ...actual,
    normalizeSessionMessages: vi.fn((messages: Message[]) => messages),
  };
});

describe('sessionRuntime', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.stubGlobal('crypto', {
      randomUUID: vi.fn().mockReturnValue('uuid-1'),
    } as unknown as Crypto);
    vi.spyOn(Date, 'now').mockReturnValue(1_700_000_000_000);
  });

  it('builds delivery error copy for each send error class', () => {
    expect(buildDeliveryErrorMessage(SEND_ERROR_CODES.TIMEOUT)).toBe(
      'This model timed out before it could respond.'
    );
    expect(buildDeliveryErrorMessage(SEND_ERROR_CODES.RUNTIME)).toBe(
      'Prompt Switchboard could not deliver this prompt to the target tab.'
    );
    expect(buildDeliveryErrorMessage(SEND_ERROR_CODES.HANDSHAKE)).toBe(
      'Prompt Switchboard could not confirm that the target tab was ready.'
    );
    expect(buildDeliveryErrorMessage(SEND_ERROR_CODES.REJECTED)).toBe(
      'This model rejected the prompt request before a response was received.'
    );
  });

  it('builds readiness-facing copy and payload diagnostics for blocked models', () => {
    const report = {
      model: 'Gemini' as const,
      ready: false,
      status: READINESS_STATUSES.SELECTOR_DRIFT_SUSPECT,
      remoteConfigConfigured: true,
      selectorSource: 'cached' as const,
      failureClass: 'selector_drift_suspect' as const,
      inputReady: true,
      submitReady: false,
      hostname: 'gemini.google.com',
      lastCheckedAt: 123,
    };

    expect(buildReadinessErrorMessage(report)).toBe(
      'Gemini looks open, but Prompt Switchboard could not confirm the input controls on this page.'
    );

    expect(buildReadinessFailurePayload(report, 'req-1', 'turn-1')).toEqual({
      model: 'Gemini',
      requestId: 'req-1',
      turnId: 'turn-1',
      text: 'Gemini looks open, but Prompt Switchboard could not confirm the input controls on this page.',
      isComplete: true,
      deliveryStatus: DELIVERY_STATUS.ERROR,
      errorCode: SEND_ERROR_CODES.HANDSHAKE,
      completedAt: 1_700_000_000_000,
      data: {
        stage: 'content_ready_handshake',
        hostname: 'gemini.google.com',
        selectorSource: 'cached',
        remoteConfigConfigured: true,
        failureClass: 'selector_drift_suspect',
        readinessStatus: 'selector_drift_suspect',
        inputReady: true,
        submitReady: false,
        lastCheckedAt: 123,
      },
    });
  });

  it('creates default sessions, user messages, and assistant placeholders with runtime defaults', () => {
    expect(createDefaultSession()).toEqual({
      id: 'uuid-1',
      title: 'New Chat',
      messages: [],
      createdAt: 1_700_000_000_000,
      updatedAt: 1_700_000_000_000,
      selectedModels: ['ChatGPT'],
    });

    expect(
      createUserTurnMessage('Compare these outputs', 'turn-1', 'req-1', ['ChatGPT', 'Gemini'])
    ).toEqual({
      id: 'uuid-1',
      role: MESSAGE_ROLES.USER,
      text: 'Compare these outputs',
      timestamp: 1_700_000_000_000,
      turnId: 'turn-1',
      requestId: 'req-1',
      requestedModels: ['ChatGPT', 'Gemini'],
      isStreaming: false,
      deliveryStatus: DELIVERY_STATUS.COMPLETE,
      completedAt: 1_700_000_000_000,
    });

    expect(createAssistantPlaceholder('ChatGPT', 'turn-1', 'req-1')).toEqual({
      id: 'uuid-1',
      role: MESSAGE_ROLES.ASSISTANT,
      text: 'Waiting for response…',
      model: 'ChatGPT',
      timestamp: 1_700_000_000_000,
      turnId: 'turn-1',
      requestId: 'req-1',
      isStreaming: true,
      deliveryStatus: DELIVERY_STATUS.PENDING,
    });
  });

  it('updates messages from payloads and marks delivery failures only for the targeted turn/models', () => {
    const assistantMessage: Message = {
      id: 'assistant-1',
      role: MESSAGE_ROLES.ASSISTANT,
      text: 'Waiting for response…',
      model: 'ChatGPT',
      timestamp: 10,
      turnId: 'turn-1',
      requestId: 'req-1',
      isStreaming: true,
      deliveryStatus: DELIVERY_STATUS.PENDING,
    };

    expect(
      updateMessageFromPayload(assistantMessage, {
        model: 'ChatGPT',
        turnId: 'turn-1',
        requestId: 'req-1',
        text: '',
        isComplete: true,
        errorCode: SEND_ERROR_CODES.RUNTIME,
        data: {
          stage: 'delivery',
        },
      })
    ).toMatchObject({
      text: 'Prompt Switchboard could not deliver this prompt to the target tab.',
      deliveryStatus: DELIVERY_STATUS.ERROR,
      deliveryErrorCode: SEND_ERROR_CODES.RUNTIME,
      completedAt: 1_700_000_000_000,
      isStreaming: false,
      data: {
        stage: 'delivery',
      },
    });

    const session: Session = {
      id: 'session-1',
      title: 'Current',
      createdAt: 1,
      updatedAt: 1,
      selectedModels: ['ChatGPT', 'Gemini'],
      messages: [
        assistantMessage,
        {
          ...assistantMessage,
          id: 'assistant-2',
          model: 'Gemini',
          turnId: 'turn-1',
        },
        {
          ...assistantMessage,
          id: 'assistant-3',
          model: 'Grok',
          turnId: 'turn-2',
        },
      ],
    };

    const failed = markTurnDeliveryFailure(
      session,
      'turn-1',
      ['ChatGPT', 'Gemini'],
      SEND_ERROR_CODES.TIMEOUT,
      'req-2'
    );

    expect(failed.messages[0]).toMatchObject({
      model: 'ChatGPT',
      deliveryStatus: DELIVERY_STATUS.ERROR,
      deliveryErrorCode: SEND_ERROR_CODES.TIMEOUT,
      text: 'This model timed out before it could respond.',
      requestId: 'req-2',
    });
    expect(failed.messages[1]).toMatchObject({
      model: 'Gemini',
      deliveryStatus: DELIVERY_STATUS.ERROR,
      deliveryErrorCode: SEND_ERROR_CODES.TIMEOUT,
      text: 'This model timed out before it could respond.',
      requestId: 'req-2',
    });
    expect(failed.messages[2]).toMatchObject({
      model: 'Grok',
      turnId: 'turn-2',
      deliveryStatus: DELIVERY_STATUS.PENDING,
    });
  });

  it('delegates session normalization to normalizeSessionMessages', () => {
    const session: Session = {
      id: 'session-1',
      title: 'Current',
      createdAt: 1,
      updatedAt: 1,
      selectedModels: ['ChatGPT'],
      messages: [],
    };

    const result = normalizeSessionForRuntime(session);

    expect(normalizeSessionMessages).toHaveBeenCalledWith(session.messages, session.selectedModels);
    expect(result).toEqual(session);
  });
});
