import { describe, expect, it, vi } from 'vitest';
import { browserSessionAnalysisProvider } from './browserSession';
import { switchyardRuntimeAnalysisProvider } from './switchyardRuntime';
import { ANALYSIS_EXECUTION_SURFACES, type CompareAnalysisRequest } from '../types';

const request: CompareAnalysisRequest = {
  kind: 'compare_analyst' as const,
  turnId: 'turn-1',
  prompt: 'Compare these answers.',
  requestedModels: ['ChatGPT', 'Gemini'],
  responses: [
    {
      model: 'ChatGPT' as const,
      status: 'complete' as const,
      text: 'Answer one',
    },
    {
      model: 'Gemini' as const,
      status: 'complete' as const,
      text: 'Answer two',
    },
  ],
};

describe('analysis providers', () => {
  it('builds a browser-session analysis prompt and annotates parsed results', () => {
    expect(browserSessionAnalysisProvider.executionSurface).toBe(
      ANALYSIS_EXECUTION_SURFACES.BROWSER_TAB
    );
    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(1234);

    const prepared = browserSessionAnalysisProvider.prepareRun(request, 'ChatGPT');
    expect(prepared).toEqual({
      provider: 'browser_session',
      model: 'ChatGPT',
      prompt: expect.stringContaining('You are analyzing a Prompt Switchboard compare turn.'),
    });
    expect(prepared.prompt).toContain('Requested models: ChatGPT, Gemini');

    const parsed = browserSessionAnalysisProvider.parseResult(
      JSON.stringify({
        consensusSummary: 'The answers agree on the main direction.',
        disagreementSummary: 'One answer is more implementation-specific.',
        recommendedAnswerModel: 'Gemini',
        recommendationReason: 'Gemini is the clearer next move.',
        nextQuestion: 'Which trade-off matters most in production?',
        synthesisDraft: 'A synthesis draft.',
      }),
      'ChatGPT'
    );

    expect(parsed).toEqual({
      provider: 'browser_session',
      executionSurface: 'browser_tab',
      model: 'ChatGPT',
      createdAt: 1234,
      consensusSummary: 'The answers agree on the main direction.',
      disagreementSummary: 'One answer is more implementation-specific.',
      recommendedAnswerModel: 'Gemini',
      recommendationReason: 'Gemini is the clearer next move.',
      nextQuestion: 'Which trade-off matters most in production?',
      synthesisDraft: 'A synthesis draft.',
    });

    dateSpy.mockRestore();
  });

  it('keeps the future Switchyard runtime lane gated in browser builds', () => {
    expect(switchyardRuntimeAnalysisProvider.executionSurface).toBe(
      ANALYSIS_EXECUTION_SURFACES.FUTURE_RUNTIME
    );
    expect(switchyardRuntimeAnalysisProvider.availableInBrowserBuild).toBe(true);
    expect(switchyardRuntimeAnalysisProvider.availabilityReason).toContain(
      'Requires a local Switchyard service'
    );

    const prepared = switchyardRuntimeAnalysisProvider.prepareRun(request, 'ChatGPT');
    expect(prepared).toEqual({
      provider: 'switchyard_runtime',
      model: 'ChatGPT',
      prompt: expect.stringContaining('You are analyzing a Prompt Switchboard compare turn.'),
    });

    const dateSpy = vi.spyOn(Date, 'now').mockReturnValue(5678);
    const parsed = switchyardRuntimeAnalysisProvider.parseResult(
      JSON.stringify({
        consensusSummary: 'The runtime agrees on the simplest path.',
        disagreementSummary: 'One answer prefers more instrumentation.',
        recommendedAnswerModel: 'ChatGPT',
        recommendationReason: 'ChatGPT stays the clearest continuation.',
        nextQuestion: 'What proof should we ask for next?',
      }),
      'ChatGPT'
    );
    expect(parsed).toEqual({
      provider: 'switchyard_runtime',
      executionSurface: 'future_runtime',
      model: 'ChatGPT',
      createdAt: 5678,
      consensusSummary: 'The runtime agrees on the simplest path.',
      disagreementSummary: 'One answer prefers more instrumentation.',
      recommendedAnswerModel: 'ChatGPT',
      recommendationReason: 'ChatGPT stays the clearest continuation.',
      nextQuestion: 'What proof should we ask for next?',
    });
    dateSpy.mockRestore();
  });
});
