import { describe, expect, it } from 'vitest';
import { MESSAGE_ROLES, type Message } from '../../utils/types';
import {
  ANALYSIS_EXECUTION_SURFACES,
  ANALYSIS_BLOCK_REASONS,
  ANALYSIS_PROVIDER_IDS,
  buildCompareAnalysisRequest,
  canAnalyzeCompareTurn,
  createBlockedCompareAnalysisState,
  createIdleCompareAnalysisState,
  getAnalysisProvider,
  getAnalysisProviderOptions,
  summarizeAnalysisAvailability,
} from './index';

const completedResponse = (model: 'ChatGPT' | 'Gemini'): Message => ({
  id: `assistant-${model}`,
  role: MESSAGE_ROLES.ASSISTANT,
  text: `${model} answer`,
  model,
  timestamp: 2,
  deliveryStatus: 'complete',
  completedAt: 10,
});

const turn = {
  id: 'turn-1',
  userMessage: {
    id: 'user-1',
    role: MESSAGE_ROLES.USER,
    text: 'Compare the answers.',
    timestamp: 1,
    turnId: 'turn-1',
    requestId: 'req-1',
    requestedModels: ['ChatGPT', 'Gemini'],
  } as Message,
  responses: {
    ChatGPT: completedResponse('ChatGPT'),
    Gemini: completedResponse('Gemini'),
  },
};

describe('analysis index', () => {
  it('builds an analysis request from a compare turn', () => {
    const request = buildCompareAnalysisRequest(turn, ['ChatGPT', 'Gemini']);
    expect(request.prompt).toBe('Compare the answers.');
    expect(request.responses).toHaveLength(2);
    expect(request.responses[0]?.model).toBe('ChatGPT');
  });

  it('falls back to provided models when the user turn does not list requested models', () => {
    const request = buildCompareAnalysisRequest(
      {
        ...turn,
        userMessage: {
          ...turn.userMessage,
          requestedModels: undefined,
        },
      },
      ['ChatGPT', 'Gemini']
    );

    expect(request.requestedModels).toEqual(['ChatGPT', 'Gemini']);
  });

  it('requires two completed answers before analysis is available', () => {
    expect(canAnalyzeCompareTurn(turn, ['ChatGPT', 'Gemini'])).toBe(true);
    expect(
      canAnalyzeCompareTurn(
        {
          ...turn,
          responses: {
            ChatGPT: completedResponse('ChatGPT'),
          },
        },
        ['ChatGPT', 'Gemini']
      )
    ).toBe(false);
  });

  it('surfaces the browser-session provider and the local Switchyard runtime lane', () => {
    expect(getAnalysisProvider(ANALYSIS_PROVIDER_IDS.BROWSER_SESSION)?.availableInBrowserBuild).toBe(
      true
    );
    expect(
      getAnalysisProvider(ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME)?.availableInBrowserBuild
    ).toBe(
      true
    );
  });

  it('reports a clear block reason when fewer than two answers completed', () => {
    expect(
      summarizeAnalysisAvailability(
        {
          ...turn,
          responses: {
            ChatGPT: completedResponse('ChatGPT'),
          },
        },
        ['ChatGPT', 'Gemini']
      )
    ).toEqual({
      canRun: false,
      completedModels: ['ChatGPT'],
      blockReason: ANALYSIS_BLOCK_REASONS.NEEDS_TWO_COMPLETED_ANSWERS,
    });
  });

  it('reports a clear block reason when the compare turn is missing', () => {
    expect(summarizeAnalysisAvailability(null, ['ChatGPT', 'Gemini'])).toEqual({
      canRun: false,
      completedModels: [],
      blockReason: ANALYSIS_BLOCK_REASONS.ANALYSIS_TURN_NOT_FOUND,
    });
  });

  it('exposes provider options and compare-analysis state factories', () => {
    const options = getAnalysisProviderOptions();
    expect(options).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          availableInBrowserBuild: true,
          executionSurface: ANALYSIS_EXECUTION_SURFACES.BROWSER_TAB,
        }),
        expect.objectContaining({
          id: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
          availableInBrowserBuild: true,
          executionSurface: ANALYSIS_EXECUTION_SURFACES.FUTURE_RUNTIME,
        }),
      ])
    );

    expect(
      createIdleCompareAnalysisState({
        enabled: true,
        provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
        model: 'ChatGPT',
      })
    ).toMatchObject({
      status: 'idle',
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      model: 'ChatGPT',
    });

    expect(
      createBlockedCompareAnalysisState(
        {
          enabled: true,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
        },
        ANALYSIS_BLOCK_REASONS.MODEL_NOT_READY,
        'Model tab is not ready.'
      )
    ).toMatchObject({
      status: 'blocked',
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      model: 'ChatGPT',
      blockReason: ANALYSIS_BLOCK_REASONS.MODEL_NOT_READY,
      errorMessage: 'Model tab is not ready.',
    });
  });

  it('parses an honest recommendation payload from the browser-session provider', () => {
    const provider = getAnalysisProvider(ANALYSIS_PROVIDER_IDS.BROWSER_SESSION);
    const parsed = provider?.parseResult(
      JSON.stringify({
        consensusSummary: 'The answers agree on the main direction.',
        disagreementSummary: 'One answer is more implementation-specific.',
        recommendedAnswerModel: 'Gemini',
        recommendationReason: 'Gemini provides the strongest production-ready trade-off framing.',
        nextQuestion: 'Which trade-off matters most in production?',
        synthesisDraft: 'A balanced synthesis draft.',
      }),
      'ChatGPT'
    );

    expect(parsed?.recommendedAnswerModel).toBe('Gemini');
    expect(parsed?.recommendationReason).toContain('production-ready');
  });
});
