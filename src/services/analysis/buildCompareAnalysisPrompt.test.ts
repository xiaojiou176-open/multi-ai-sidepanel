import { describe, expect, it } from 'vitest';
import { buildCompareAnalysisPrompt } from './buildCompareAnalysisPrompt';

describe('buildCompareAnalysisPrompt', () => {
  it('embeds the prompt, requested models, diagnostics, and captured answers into one strict JSON instruction', () => {
    const prompt = buildCompareAnalysisPrompt({
      kind: 'compare_analyst',
      turnId: 'turn-1',
      prompt: 'Compare these answers.',
      requestedModels: ['ChatGPT', 'Gemini'],
      responses: [
        {
          model: 'ChatGPT',
          status: 'complete',
          text: 'Answer one',
          diagnostics: {
            stage: 'delivery',
            readinessStatus: 'ready',
          },
        },
        {
          model: 'Gemini',
          status: 'error',
          text: '',
        },
      ],
    });

    expect(prompt).toContain('You are analyzing a Prompt Switchboard compare turn.');
    expect(prompt).toContain('Return strict JSON with these keys:');
    expect(prompt).toContain('Original prompt:\nCompare these answers.');
    expect(prompt).toContain('Requested models: ChatGPT, Gemini');
    expect(prompt).toContain('Model: ChatGPT');
    expect(prompt).toContain('Status: complete');
    expect(prompt).toContain('"stage": "delivery"');
    expect(prompt).toContain('Model: Gemini');
    expect(prompt).toContain('Status: error');
    expect(prompt).toContain('[No captured answer]');
    expect(prompt).toContain('Do not force a winner if the compare turn is mixed or still too uncertain.');
  });
});
