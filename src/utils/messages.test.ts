import { describe, expect, it } from 'vitest';
import { buildCompareTurns, getMessageDeliveryStatus, normalizeSessionMessages } from './messages';
import { DELIVERY_STATUS, MESSAGE_ROLES, type Message } from './types';

describe('messages utils', () => {
  it('normalizes legacy messages into compare-ready records', () => {
    const legacyMessages: Message[] = [
      {
        id: 'user-1',
        role: MESSAGE_ROLES.USER,
        text: 'Legacy question',
        timestamp: 1,
      },
      {
        id: 'assistant-1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Legacy answer',
        model: 'ChatGPT',
        timestamp: 2,
        isStreaming: false,
      },
    ];

    const normalized = normalizeSessionMessages(legacyMessages, ['Gemini']);

    expect(normalized[0].turnId).toBeDefined();
    expect(normalized[0].requestedModels).toEqual(['Gemini']);
    expect(normalized[1].turnId).toBe(normalized[0].turnId);
    expect(normalized[1].deliveryStatus).toBe(DELIVERY_STATUS.COMPLETE);
    expect(normalized[1].completedAt).toBe(2);
  });

  it('builds compare turns from turn-aware messages', () => {
    const messages: Message[] = [
      {
        id: 'user-1',
        role: MESSAGE_ROLES.USER,
        text: 'Compare this',
        timestamp: 1,
        turnId: 'turn-1',
        requestId: 'req-1',
        requestedModels: ['ChatGPT', 'Gemini'],
      },
      {
        id: 'assistant-1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'ChatGPT answer',
        model: 'ChatGPT',
        timestamp: 2,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
        completedAt: 2,
      },
      {
        id: 'assistant-2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Gemini still streaming',
        model: 'Gemini',
        timestamp: 3,
        turnId: 'turn-1',
        requestId: 'req-1',
        deliveryStatus: DELIVERY_STATUS.STREAMING,
        isStreaming: true,
      },
    ];

    const turns = buildCompareTurns(messages);

    expect(turns).toHaveLength(1);
    expect(turns[0].userMessage?.text).toBe('Compare this');
    expect(turns[0].responses.ChatGPT?.text).toBe('ChatGPT answer');
    expect(turns[0].responses.Gemini?.deliveryStatus).toBe(DELIVERY_STATUS.STREAMING);
  });

  it('derives delivery status for assistant placeholders', () => {
    const pendingMessage: Message = {
      id: 'assistant-1',
      role: MESSAGE_ROLES.ASSISTANT,
      text: 'Waiting...',
      model: 'ChatGPT',
      timestamp: 1,
      isStreaming: true,
    };

    expect(getMessageDeliveryStatus(pendingMessage)).toBe(DELIVERY_STATUS.STREAMING);
  });

  it('treats system messages as complete and creates legacy turns for orphaned assistants', () => {
    const normalized = normalizeSessionMessages([
      {
        id: 'system-1',
        role: MESSAGE_ROLES.SYSTEM,
        text: 'note',
        timestamp: 1,
      },
      {
        id: 'assistant-1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'orphaned answer',
        model: 'ChatGPT',
        timestamp: 2,
        deliveryStatus: DELIVERY_STATUS.ERROR,
        deliveryErrorCode: 'runtime_error',
      },
    ]);

    expect(getMessageDeliveryStatus(normalized[0])).toBe(DELIVERY_STATUS.COMPLETE);
    expect(normalized[1].turnId).toBe('legacy-turn:1');
    expect(normalized[1].deliveryErrorCode).toBe('runtime_error');
  });
});
