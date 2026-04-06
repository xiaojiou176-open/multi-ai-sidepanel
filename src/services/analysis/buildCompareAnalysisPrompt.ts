import type { CompareAnalysisRequest } from './types';

export const buildCompareAnalysisPrompt = (request: CompareAnalysisRequest) => {
  const responseBlocks = request.responses
    .map((response) => {
      const diagnostics = response.diagnostics
        ? JSON.stringify(response.diagnostics, null, 2)
        : 'null';

      return [
        `Model: ${response.model}`,
        `Status: ${response.status}`,
        `Diagnostics: ${diagnostics}`,
        'Answer:',
        response.text.trim() || '[No captured answer]',
      ].join('\n');
    })
    .join('\n\n---\n\n');

  return [
    'You are analyzing a Prompt Switchboard compare turn.',
    'Return strict JSON with these keys:',
    'consensusSummary: short paragraph about where the completed answers agree.',
    'disagreementSummary: short paragraph about where the answers meaningfully diverge.',
    'recommendedAnswerModel: one of the requested model names when one answer is the best next-step candidate, or null when no reliable single recommendation exists.',
    'recommendationReason: short paragraph that explains why that answer is the best next-step candidate, or why no single answer should be recommended yet.',
    'nextQuestion: one concrete next question the user should ask in the follow-up round.',
    'synthesisDraft: optional merged draft that combines the strongest useful ideas.',
    '',
    'Do not include markdown fences.',
    'Do not invent claims that are not supported by the compare turn.',
    'Do not force a winner if the compare turn is mixed or still too uncertain.',
    '',
    `Original prompt:\n${request.prompt}`,
    '',
    `Requested models: ${request.requestedModels.join(', ')}`,
    '',
    'Responses:',
    responseBlocks,
  ].join('\n');
};
