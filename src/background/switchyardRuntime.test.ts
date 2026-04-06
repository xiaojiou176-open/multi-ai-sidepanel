import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runSwitchyardCompareAnalysis } from './switchyardRuntime';

describe('switchyardRuntime helper', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects unsupported runtime-backed models early', async () => {
    const result = await runSwitchyardCompareAnalysis({
      analystModel: 'Perplexity',
      prompt: 'Compare these answers',
    });

    expect(result).toEqual({
      ok: false,
      kind: 'runtime_model_unsupported',
      message:
        'The local Switchyard runtime lane does not currently expose a Perplexity analysis mapping.',
      details: {
        analystModel: 'Perplexity',
      },
    });
  });

  it('maps local auth/runtime blockers from the Switchyard service into typed failures', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: false,
        status: 409,
        async json() {
          return {
            error: {
              type: 'user-action-required',
              suggestedAction: 'Open the Switchyard auth portal first.',
            },
            auth: {
              providerId: 'chatgpt',
              transportHint: 'Open the Switchyard auth portal first.',
            },
          };
        },
      }))
    );

    const result = await runSwitchyardCompareAnalysis({
      analystModel: 'ChatGPT',
      prompt: 'Compare these answers',
    });

    expect(result).toEqual({
      ok: false,
      kind: 'runtime_auth_required',
      message: 'Open the Switchyard auth portal first.',
      details: {
        status: 409,
        provider: 'chatgpt',
        failureType: 'user-action-required',
      },
    });
  });

  it('returns raw runtime text when the local Switchyard service succeeds', async () => {
    const fetchSpy = vi.fn(async () => ({
        ok: true,
        async json() {
          return {
            ok: true,
            provider: 'chatgpt',
            model: 'gpt-4o',
            lane: 'web',
            outputText:
              '{"consensusSummary":"Agree","disagreementSummary":"Different emphasis","recommendationReason":"ChatGPT is clearer","nextQuestion":"What proof should we ask for next?"}',
          };
        },
      }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const result = await runSwitchyardCompareAnalysis({
      analystModel: 'ChatGPT',
      prompt: 'Compare these answers',
    });

    expect(result).toEqual({
      ok: true,
      rawText:
        '{"consensusSummary":"Agree","disagreementSummary":"Different emphasis","recommendationReason":"ChatGPT is clearer","nextQuestion":"What proof should we ask for next?"}',
      provider: 'chatgpt',
      model: 'gpt-4o',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4317/v1/runtime/invoke',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          provider: 'chatgpt',
          model: 'gpt-4o',
          input: 'Compare these answers',
          lane: 'web',
        }),
      })
    );
  });

  it('routes Gemini through the BYOK lane on the shared invoke endpoint', async () => {
    const fetchSpy = vi.fn(async () => ({
      ok: true,
      async json() {
        return {
          ok: true,
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          lane: 'byok',
          text:
            '{"consensusSummary":"Agree","disagreementSummary":"Different emphasis","recommendationReason":"Gemini is clearer","nextQuestion":"What proof should we ask for next?"}',
        };
      },
    }));
    vi.stubGlobal('fetch', fetchSpy as unknown as typeof fetch);

    const result = await runSwitchyardCompareAnalysis({
      analystModel: 'Gemini',
      prompt: 'Compare these answers',
    });

    expect(result).toEqual({
      ok: true,
      rawText:
        '{"consensusSummary":"Agree","disagreementSummary":"Different emphasis","recommendationReason":"Gemini is clearer","nextQuestion":"What proof should we ask for next?"}',
      provider: 'gemini',
      model: 'gemini-2.5-flash',
    });
    expect(fetchSpy).toHaveBeenCalledWith(
      'http://127.0.0.1:4317/v1/runtime/invoke',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          provider: 'gemini',
          model: 'gemini-2.5-flash',
          input: 'Compare these answers',
          lane: 'byok',
        }),
      })
    );
  });
});
