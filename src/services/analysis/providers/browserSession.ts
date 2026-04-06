import {
  ANALYSIS_EXECUTION_SURFACES,
  ANALYSIS_PROVIDER_IDS,
  type AnalysisProviderDefinition,
} from '../types';
import { buildCompareAnalysisPrompt } from '../buildCompareAnalysisPrompt';
import { parseCompareAnalysisText } from '../parseCompareAnalysisText';

export const browserSessionAnalysisProvider: AnalysisProviderDefinition = {
  id: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
  label: 'Browser session',
  description:
    'Run one analysis prompt through a supported tab you already keep signed in.',
  availableInBrowserBuild: true,
  executionSurface: ANALYSIS_EXECUTION_SURFACES.BROWSER_TAB,
  prepareRun(request, model) {
    return {
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      model,
      prompt: buildCompareAnalysisPrompt(request),
    };
  },
  parseResult(rawText, model) {
    const parsed = parseCompareAnalysisText(rawText);
    return {
      ...parsed,
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      executionSurface: ANALYSIS_EXECUTION_SURFACES.BROWSER_TAB,
      model,
      createdAt: Date.now(),
    };
  },
};
