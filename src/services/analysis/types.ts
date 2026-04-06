import { z } from 'zod';
import type { CompareTurn } from '../../utils/messages';
import type { DeliveryDiagnostics, DeliveryStatus, ModelName } from '../../utils/types';

export const ANALYSIS_PROVIDER_IDS = {
  BROWSER_SESSION: 'browser_session',
  SWITCHYARD_RUNTIME: 'switchyard_runtime',
} as const;

export const LEGACY_ANALYSIS_PROVIDER_IDS = {
  GEMINI_BYOK: 'gemini_byok',
} as const;

export type AnalysisProviderId =
  (typeof ANALYSIS_PROVIDER_IDS)[keyof typeof ANALYSIS_PROVIDER_IDS];

export const normalizeAnalysisProviderId = (
  value: string | AnalysisProviderId
): AnalysisProviderId =>
  value === LEGACY_ANALYSIS_PROVIDER_IDS.GEMINI_BYOK
    ? ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME
    : (value as AnalysisProviderId);

export const ANALYSIS_EXECUTION_SURFACES = {
  BROWSER_TAB: 'browser_tab',
  FUTURE_RUNTIME: 'future_runtime',
} as const;

export type AnalysisExecutionSurface =
  (typeof ANALYSIS_EXECUTION_SURFACES)[keyof typeof ANALYSIS_EXECUTION_SURFACES];

export const ANALYSIS_STATUSES = {
  IDLE: 'idle',
  RUNNING: 'running',
  SUCCESS: 'success',
  ERROR: 'error',
  BLOCKED: 'blocked',
} as const;

export type AnalysisStatus = (typeof ANALYSIS_STATUSES)[keyof typeof ANALYSIS_STATUSES];

export const ANALYSIS_BLOCK_REASONS = {
  DISABLED: 'disabled',
  NEEDS_TWO_COMPLETED_ANSWERS: 'needs_two_completed_answers',
  PROVIDER_BLOCKED: 'provider_blocked',
  MODEL_NOT_READY: 'model_not_ready',
  ACTIVE_COMPARE_IN_FLIGHT: 'active_compare_in_flight',
  ANALYSIS_TURN_NOT_FOUND: 'analysis_turn_not_found',
  RUNTIME_UNAVAILABLE: 'runtime_unavailable',
  RUNTIME_AUTH_REQUIRED: 'runtime_auth_required',
  RUNTIME_MODEL_UNSUPPORTED: 'runtime_model_unsupported',
} as const;

export type AnalysisBlockReason =
  (typeof ANALYSIS_BLOCK_REASONS)[keyof typeof ANALYSIS_BLOCK_REASONS];

export interface CompareAnalysisResponseItem {
  model: ModelName;
  status: DeliveryStatus;
  text: string;
  diagnostics?: DeliveryDiagnostics;
}

export interface CompareAnalysisRequest {
  kind: 'compare_analyst';
  turnId: string;
  prompt: string;
  requestedModels: ModelName[];
  responses: CompareAnalysisResponseItem[];
}

export const CompareAnalysisResultSchema = z.object({
  consensusSummary: z.string().min(1),
  disagreementSummary: z.string().min(1),
  recommendedAnswerModel: z
    .enum(['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok'])
    .nullable()
    .optional(),
  recommendationReason: z.string().min(1),
  nextQuestion: z.string().min(1),
  synthesisDraft: z.string().min(1).optional(),
});

export type CompareAnalysisResult = z.infer<typeof CompareAnalysisResultSchema> & {
  provider: AnalysisProviderId;
  executionSurface?: AnalysisExecutionSurface;
  model: string;
  createdAt: number;
};

export interface CompareAnalysisState {
  status: AnalysisStatus;
  provider?: AnalysisProviderId;
  model?: string;
  requestId?: string;
  result?: CompareAnalysisResult;
  errorMessage?: string;
  blockReason?: AnalysisBlockReason;
  updatedAt: number;
}

export interface AnalysisProviderConfig {
  enabled: boolean;
  provider: AnalysisProviderId;
  model: ModelName;
}

export interface PreparedCompareAnalysisRun {
  provider: AnalysisProviderId;
  model: ModelName;
  prompt: string;
}

export interface AnalysisProviderDefinition {
  id: AnalysisProviderId;
  label: string;
  description: string;
  availableInBrowserBuild: boolean;
  executionSurface: AnalysisExecutionSurface;
  availabilityReason?: string;
  prepareRun: (request: CompareAnalysisRequest, model: ModelName) => PreparedCompareAnalysisRun;
  parseResult: (rawText: string, model: ModelName) => CompareAnalysisResult;
}

export interface CompareAnalysisRuntimeUpdate {
  turnId: string;
  requestId: string;
  model: ModelName;
  provider: AnalysisProviderId;
  status: 'success' | 'error';
  rawText?: string;
  errorMessage?: string;
}

export interface CompareAnalysisRuntimePayload {
  turnId: string;
  requestId: string;
  model: ModelName;
  provider: AnalysisProviderId;
  prompt: string;
}

export interface AnalysisAvailabilitySummary {
  canRun: boolean;
  completedModels: ModelName[];
  blockReason?: AnalysisBlockReason;
}

export type CompareTurnLike = Pick<CompareTurn, 'id' | 'userMessage' | 'responses'>;
