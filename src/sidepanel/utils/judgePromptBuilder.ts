import type { Message, ModelName } from '../../utils/types';

type Translate = (key: string, defaultValue: string) => string;

const defaultT: Translate = (_key, defaultValue) => defaultValue;

export const buildJudgePrompt = (
  prompt: string,
  responses: Partial<Record<ModelName, Message>>,
  t: Translate = defaultT
) => {
  const sections = Object.entries(responses)
    .filter(([, response]) => Boolean(response?.text.trim()))
    .map(
      ([model, response]) =>
        `## ${model}\n${response?.text.trim()}\n`
    )
    .join('\n');

  return [
    t(
      'compare.followUpBuilder.intro',
      'Review the following model answers from the same original prompt.'
    ),
    t(
      'compare.followUpBuilder.goal',
      'Identify the strongest answer, the key disagreements, and the next follow-up question worth asking.'
    ),
    t('compare.followUpBuilder.return', 'Return:'),
    t('compare.followUpBuilder.strongest', '1. Strongest answer'),
    t('compare.followUpBuilder.reason', '2. Why it stands out'),
    t('compare.followUpBuilder.disagreements', '3. Key disagreements'),
    t('compare.followUpBuilder.followUp', '4. Suggested follow-up prompt'),
    '',
    `${t('compare.followUpBuilder.originalPrompt', 'Original prompt')}:\n${prompt}`,
    '',
    sections,
  ].join('\n');
};
