import { describe, expect, it } from 'vitest';
import { parseCompareAnalysisText } from './parseCompareAnalysisText';

describe('parseCompareAnalysisText', () => {
  it('parses fenced JSON responses into the analysis result shape', () => {
    const parsed = parseCompareAnalysisText(`
      Here is the result:

      \`\`\`json
      {
        "consensusSummary": "The answers agree on the main direction.",
        "disagreementSummary": "One answer is more implementation-specific.",
        "recommendedAnswerModel": "Gemini",
        "recommendationReason": "Gemini is the clearest next move.",
        "nextQuestion": "Which trade-off matters most in production?",
        "synthesisDraft": "A synthesis draft."
      }
      \`\`\`
    `);

    expect(parsed).toEqual({
      consensusSummary: 'The answers agree on the main direction.',
      disagreementSummary: 'One answer is more implementation-specific.',
      recommendedAnswerModel: 'Gemini',
      recommendationReason: 'Gemini is the clearest next move.',
      nextQuestion: 'Which trade-off matters most in production?',
      synthesisDraft: 'A synthesis draft.',
    });
  });

  it('parses bare JSON bodies and rejects invalid result shapes', () => {
    const bare = parseCompareAnalysisText(`{
      "consensusSummary": "The answers agree on the main direction.",
      "disagreementSummary": "One answer is more implementation-specific.",
      "recommendedAnswerModel": null,
      "recommendationReason": "No single answer is strong enough yet.",
      "nextQuestion": "What evidence should we gather next?"
    }`);

    expect(bare.recommendedAnswerModel).toBeNull();
    expect(() =>
      parseCompareAnalysisText(
        JSON.stringify({
          consensusSummary: '',
          disagreementSummary: 'Missing required fields should fail.',
        })
      )
    ).toThrow('analysis_invalid_json_shape');
  });
});
