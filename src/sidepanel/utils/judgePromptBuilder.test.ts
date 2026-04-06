import { describe, expect, it } from 'vitest';
import { MESSAGE_ROLES, type Message } from '../../utils/types';
import { buildJudgePrompt } from './judgePromptBuilder';

describe('judgePromptBuilder', () => {
  it('assembles a judge prompt from the original prompt and completed responses', () => {
    const prompt = 'Compare these answers.';
    const responses: Partial<Record<'ChatGPT' | 'Gemini', Message>> = {
      ChatGPT: {
        id: '1',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'ChatGPT answer',
        model: 'ChatGPT',
        timestamp: 1,
      },
      Gemini: {
        id: '2',
        role: MESSAGE_ROLES.ASSISTANT,
        text: 'Gemini answer',
        model: 'Gemini',
        timestamp: 2,
      },
    };

    const judgePrompt = buildJudgePrompt(prompt, responses);

    expect(judgePrompt).toContain('Original prompt:\nCompare these answers.');
    expect(judgePrompt).toContain('## ChatGPT');
    expect(judgePrompt).toContain('ChatGPT answer');
    expect(judgePrompt).toContain('## Gemini');
    expect(judgePrompt).toContain('Gemini answer');
    expect(judgePrompt).toContain('Suggested follow-up prompt');
    expect(judgePrompt).toContain('Review the following model answers');
  });
});
