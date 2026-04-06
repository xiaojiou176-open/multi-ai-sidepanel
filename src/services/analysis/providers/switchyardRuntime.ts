import {
  ANALYSIS_EXECUTION_SURFACES,
  ANALYSIS_PROVIDER_IDS,
  type AnalysisProviderDefinition,
} from '../types';
import { buildCompareAnalysisPrompt } from '../buildCompareAnalysisPrompt';
import { parseCompareAnalysisText } from '../parseCompareAnalysisText';
import type { ModelName } from '../../../utils/types';

export const SWITCHYARD_RUNTIME_BASE_URL = 'http://127.0.0.1:4317' as const;

export const SWITCHYARD_RUNTIME_MODEL_MAP = {
  ChatGPT: {
    invokeRoute: 'web',
    provider: 'chatgpt',
    model: 'gpt-4o',
  },
  Gemini: {
    invokeRoute: 'byok',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
  },
  Qwen: {
    invokeRoute: 'web',
    provider: 'qwen',
    model: 'qwen3.5-plus',
  },
  Grok: {
    invokeRoute: 'web',
    provider: 'grok',
    model: 'grok-3',
  },
} as const satisfies Partial<
  Record<ModelName, { invokeRoute: 'web' | 'byok'; provider: string; model: string }>
>;

export const getSwitchyardRuntimeTarget = (model: ModelName) =>
  SWITCHYARD_RUNTIME_MODEL_MAP[model as keyof typeof SWITCHYARD_RUNTIME_MODEL_MAP] ?? null;

export const isSwitchyardRuntimeSupportedModel = (
  model: ModelName
): model is keyof typeof SWITCHYARD_RUNTIME_MODEL_MAP =>
  model in SWITCHYARD_RUNTIME_MODEL_MAP;

export const switchyardRuntimeAnalysisProvider: AnalysisProviderDefinition = {
  id: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
  label: 'Local Switchyard runtime',
  description:
    'Route one analysis prompt through a local Switchyard service without letting Switchyard take over Prompt Switchboard tab orchestration.',
  availableInBrowserBuild: true,
  executionSurface: ANALYSIS_EXECUTION_SURFACES.FUTURE_RUNTIME,
  availabilityReason:
    'Requires a local Switchyard service on http://127.0.0.1:4317 plus a compatible runtime-backed provider session.',
  prepareRun(request, model) {
    return {
      provider: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
      model,
      prompt: buildCompareAnalysisPrompt(request),
    };
  },
  parseResult(rawText, model) {
    const parsed = parseCompareAnalysisText(rawText);
    return {
      ...parsed,
      provider: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
      executionSurface: ANALYSIS_EXECUTION_SURFACES.FUTURE_RUNTIME,
      model,
      createdAt: Date.now(),
    };
  },
};
