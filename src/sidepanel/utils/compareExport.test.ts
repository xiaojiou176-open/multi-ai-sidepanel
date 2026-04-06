import { describe, expect, it } from 'vitest';
import { MESSAGE_ROLES, DELIVERY_STATUS, type Message } from '../../utils/types';
import type { CompareTurn } from '../../utils/messages';
import { buildCompareMarkdownExport, buildCompareShareSummary } from './compareExport';
import { buildCompareInsightSummary } from './compareInsights';
import { buildDisagreementAnalysis } from './disagreementAnalyzer';

describe('compareExport', () => {
  const turn: CompareTurn = {
    id: 'turn-1',
    startedAt: 1,
    userMessage: {
      id: 'user-1',
      role: MESSAGE_ROLES.USER,
      text: 'Compare these answers.',
      timestamp: 1,
      turnId: 'turn-1',
      requestId: 'req-1',
      requestedModels: ['ChatGPT', 'Gemini'],
    },
    responses: {
      ChatGPT: {
        id: 'assistant-1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'ChatGPT answer',
        model: 'ChatGPT',
        timestamp: 2,
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
        completedAt: 5,
      } as Message,
      Gemini: {
        id: 'assistant-2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Gemini answer',
        model: 'Gemini',
        timestamp: 3,
        deliveryStatus: DELIVERY_STATUS.ERROR,
        data: {
          stage: 'delivery',
        },
      } as Message,
    },
  };

  it('builds a compact compare share summary', () => {
    const requestedModels = ['ChatGPT', 'Gemini'] as const;
    const insight = buildCompareInsightSummary(requestedModels as never, turn.responses);
    const disagreement = buildDisagreementAnalysis(
      requestedModels as never,
      turn.responses,
      insight
    );

    const summary = buildCompareShareSummary(turn, requestedModels as never, insight, disagreement);

    expect(summary).toContain('Prompt Switchboard compare summary');
    expect(summary).toContain('Prompt: Compare these answers.');
    expect(summary).toContain('Completed: ChatGPT');
    expect(summary).toContain('Failed: Gemini');
  });

  it('builds a readable Markdown export for a compare turn', () => {
    const requestedModels = ['ChatGPT', 'Gemini'] as const;
    const insight = buildCompareInsightSummary(requestedModels as never, turn.responses);
    const disagreement = buildDisagreementAnalysis(
      requestedModels as never,
      turn.responses,
      insight
    );

    const markdown = buildCompareMarkdownExport(
      turn,
      requestedModels as never,
      insight,
      disagreement
    );

    expect(markdown).toContain('# Prompt Switchboard compare export');
    expect(markdown).toContain('## Original prompt');
    expect(markdown).toContain('## ChatGPT');
    expect(markdown).toContain('ChatGPT answer');
    expect(markdown).toContain('## Gemini');
    expect(markdown).toContain('Gemini answer');
    expect(markdown).toContain('Prompt Switchboard keeps this compare export local-first.');
  });
});
