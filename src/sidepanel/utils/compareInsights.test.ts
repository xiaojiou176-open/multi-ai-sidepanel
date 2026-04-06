import { describe, expect, it } from 'vitest';
import { DELIVERY_STATUS, MESSAGE_ROLES, type Message } from '../../utils/types';
import { buildCompareInsightSummary, buildCompareRunTimeline } from './compareInsights';

describe('compareInsights', () => {
  it('builds a summary across completion states and detects disagreement', () => {
    const responses: Partial<Record<'ChatGPT' | 'Gemini' | 'Perplexity', Message>> = {
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
        text: 'x'.repeat(140),
        model: 'Gemini',
        timestamp: 2,
        completedAt: 20,
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
      },
      Perplexity: {
        id: '3',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'failed',
        model: 'Perplexity',
        timestamp: 3,
        deliveryStatus: DELIVERY_STATUS.ERROR,
      },
    };

    const summary = buildCompareInsightSummary(
      ['ChatGPT', 'Gemini', 'Perplexity'],
      responses
    );

    expect(summary.completeCount).toBe(2);
    expect(summary.failedCount).toBe(1);
    expect(summary.pendingCount).toBe(0);
    expect(summary.fastestModel).toBe('ChatGPT');
    expect(summary.longestModel).toBe('Gemini');
    expect(summary.longestCompletedModel).toBe('Gemini');
    expect(summary.disagreementDetected).toBe(true);
    expect(summary.failedModels).toEqual(['Perplexity']);
  });

  it('counts missing and streaming responses as pending without forcing disagreement', () => {
    const responses: Partial<Record<'ChatGPT' | 'Gemini' | 'Perplexity', Message>> = {
      ChatGPT: {
        id: '1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'brief answer',
        model: 'ChatGPT',
        timestamp: 1,
        completedAt: 15,
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
      },
      Gemini: {
        id: '2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'still streaming',
        model: 'Gemini',
        timestamp: 2,
        deliveryStatus: DELIVERY_STATUS.STREAMING,
      },
    };

    const summary = buildCompareInsightSummary(
      ['ChatGPT', 'Gemini', 'Perplexity'],
      responses
    );

    expect(summary.completeCount).toBe(1);
    expect(summary.failedCount).toBe(0);
    expect(summary.pendingCount).toBe(2);
    expect(summary.fastestModel).toBe('ChatGPT');
    expect(summary.longestModel).toBe('Gemini');
    expect(summary.longestCompletedModel).toBe('ChatGPT');
    expect(summary.disagreementDetected).toBe(false);
    expect(summary.failedModels).toEqual([]);
  });

  it('keeps fastest model undefined when there are no completed responses', () => {
    const responses: Partial<Record<'ChatGPT' | 'Gemini', Message>> = {
      ChatGPT: {
        id: '1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'failed',
        model: 'ChatGPT',
        timestamp: 1,
        deliveryStatus: DELIVERY_STATUS.ERROR,
      },
      Gemini: {
        id: '2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: '   ',
        model: 'Gemini',
        timestamp: 2,
        deliveryStatus: DELIVERY_STATUS.PENDING,
      },
    };

    const summary = buildCompareInsightSummary(['ChatGPT', 'Gemini'], responses);

    expect(summary.completeCount).toBe(0);
    expect(summary.failedCount).toBe(1);
    expect(summary.pendingCount).toBe(1);
    expect(summary.fastestModel).toBeUndefined();
    expect(summary.longestModel).toBe('ChatGPT');
    expect(summary.longestCompletedModel).toBeUndefined();
    expect(summary.disagreementDetected).toBe(false);
    expect(summary.failedModels).toEqual(['ChatGPT']);
  });

  it('does not let an undefined completedAt outrank a timed completion', () => {
    const responses: Partial<Record<'ChatGPT' | 'Gemini', Message>> = {
      ChatGPT: {
        id: '1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'short',
        model: 'ChatGPT',
        timestamp: 1,
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
      },
      Gemini: {
        id: '2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'longer response body',
        model: 'Gemini',
        timestamp: 2,
        completedAt: 12,
        deliveryStatus: DELIVERY_STATUS.COMPLETE,
      },
    };

    const summary = buildCompareInsightSummary(['ChatGPT', 'Gemini'], responses);

    expect(summary.completeCount).toBe(2);
    expect(summary.fastestModel).toBe('Gemini');
    expect(summary.longestModel).toBe('Gemini');
    expect(summary.longestCompletedModel).toBe('Gemini');
    expect(summary.disagreementDetected).toBe(false);
  });

  it('maps blocked readiness and streaming states into a truthful run timeline', () => {
    const blockedTimeline = buildCompareRunTimeline(DELIVERY_STATUS.ERROR, {
      readinessStatus: 'selector_drift_suspect',
    });
    const streamingTimeline = buildCompareRunTimeline(DELIVERY_STATUS.STREAMING, {
      readinessStatus: 'ready',
    });

    expect(blockedTimeline.steps[0]?.tone).toBe('blocked');
    expect(blockedTimeline.summary).toContain('could not confirm the page controls');
    expect(streamingTimeline.steps.map((step) => step.tone)).toEqual([
      'done',
      'done',
      'current',
      'upcoming',
    ]);
  });
});
