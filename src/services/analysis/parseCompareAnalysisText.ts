import { CompareAnalysisResultSchema } from './types';

const extractJson = (rawText: string) => {
  const fenced = rawText.match(/```json\s*([\s\S]*?)```/i);
  if (fenced?.[1]) {
    return fenced[1].trim();
  }

  const start = rawText.indexOf('{');
  const end = rawText.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return rawText.slice(start, end + 1);
  }

  return rawText.trim();
};

export const parseCompareAnalysisText = (rawText: string) => {
  const parsed = CompareAnalysisResultSchema.safeParse(JSON.parse(extractJson(rawText)));
  if (!parsed.success) {
    throw new Error('analysis_invalid_json_shape');
  }

  return parsed.data;
};
