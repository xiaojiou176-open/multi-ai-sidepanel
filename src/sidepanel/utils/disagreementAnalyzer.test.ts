import { describe, expect, it } from 'vitest';
import { DELIVERY_STATUS, MESSAGE_ROLES, type Message } from '../../utils/types';
import { buildCompareInsightSummary } from './compareInsights';
import { buildDisagreementAnalysis } from './disagreementAnalyzer';

describe('disagreementAnalyzer', () => {
  it('recommends a judge round when completed answers diverge', () => {
    const responses: Partial<Record<'ChatGPT' | 'Gemini', Message>> = {
      ChatGPT: {
        id: '1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'short answer',
        model: 'ChatGPT',
        timestamp: 1,
        completedAt: 10,
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
      },
      Gemini: {
        id: '2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'x'.repeat(160),
        model: 'Gemini',
        timestamp: 2,
        completedAt: 12,
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
      },
    };

    const insight = buildCompareInsightSummary(['ChatGPT', 'Gemini'], responses);
    const analysis = buildDisagreementAnalysis(['ChatGPT', 'Gemini'], responses, insight);

    expect(analysis.completedModels).toEqual(['ChatGPT', 'Gemini']);
    expect(analysis.failedModels).toEqual([]);
    expect(analysis.pendingModels).toEqual([]);
    expect(analysis.recommendedAction).toBe('judge');
    expect(analysis.suggestedModels).toEqual(['ChatGPT', 'Gemini']);
    expect(analysis.suggestedSeedModel).toBe('Gemini');
    expect(analysis.reasons).toContain(
      'Completed answers diverged enough to justify a focused follow-up review round.'
    );
  });

  it('recommends retry when failed and completed models are mixed', () => {
    const responses: Partial<Record<'ChatGPT' | 'Gemini' | 'Perplexity', Message>> = {
      ChatGPT: {
        id: '1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'done',
        model: 'ChatGPT',
        timestamp: 1,
        completedAt: 5,
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
      },
      Gemini: {
        id: '2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'failed',
        model: 'Gemini',
        timestamp: 2,
        deliveryStatus: DELIVERY_STATUS.ERROR,
      },
      Perplexity: {
        id: '3',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'still streaming',
        model: 'Perplexity',
        timestamp: 3,
        deliveryStatus: DELIVERY_STATUS.STREAMING,
      },
    };

    const insight = buildCompareInsightSummary(['ChatGPT', 'Gemini', 'Perplexity'], responses);
    const analysis = buildDisagreementAnalysis(
      ['ChatGPT', 'Gemini', 'Perplexity'],
      responses,
      insight
    );

    expect(analysis.completedModels).toEqual(['ChatGPT']);
    expect(analysis.failedModels).toEqual(['Gemini']);
    expect(analysis.pendingModels).toEqual(['Perplexity']);
    expect(analysis.recommendedAction).toBe('retry_failed');
    expect(analysis.suggestedModels).toEqual(['ChatGPT']);
    expect(analysis.suggestedSeedModel).toBe('ChatGPT');
    expect(analysis.reasons).toContain(
      'Some models failed while others completed, so this compare turn is split.'
    );
    expect(analysis.reasons).toContain(
      'Some models are still pending, so this compare turn is not final yet.'
    );
  });

  it('recommends waiting when only pending models remain unresolved', () => {
    const responses: Partial<Record<'ChatGPT' | 'Gemini', Message>> = {
      ChatGPT: {
        id: '1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'streaming',
        model: 'ChatGPT',
        timestamp: 1,
        deliveryStatus: DELIVERY_STATUS.STREAMING,
      },
    };

    const insight = buildCompareInsightSummary(['ChatGPT', 'Gemini'], responses);
    const analysis = buildDisagreementAnalysis(['ChatGPT', 'Gemini'], responses, insight);

    expect(analysis.completedModels).toEqual([]);
    expect(analysis.failedModels).toEqual([]);
    expect(analysis.pendingModels).toEqual(['ChatGPT', 'Gemini']);
    expect(analysis.recommendedAction).toBe('wait');
    expect(analysis.suggestedModels).toEqual(['ChatGPT', 'Gemini']);
  });
});
