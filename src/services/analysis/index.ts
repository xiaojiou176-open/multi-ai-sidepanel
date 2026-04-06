import { getMessageDeliveryStatus } from '../../utils/messages';
import { DELIVERY_STATUS, MESSAGE_ROLES, type ModelName } from '../../utils/types';
import { browserSessionAnalysisProvider } from './providers/browserSession';
import { switchyardRuntimeAnalysisProvider } from './providers/switchyardRuntime';
import {
  ANALYSIS_BLOCK_REASONS,
  ANALYSIS_PROVIDER_IDS,
  ANALYSIS_STATUSES,
  normalizeAnalysisProviderId,
  type AnalysisAvailabilitySummary,
  type AnalysisProviderConfig,
  type AnalysisProviderDefinition,
  type AnalysisProviderId,
  type CompareAnalysisRequest,
  type CompareAnalysisState,
  type CompareTurnLike,
} from './types';

const providerRegistry: Record<AnalysisProviderId, AnalysisProviderDefinition> = {
  [ANALYSIS_PROVIDER_IDS.BROWSER_SESSION]: browserSessionAnalysisProvider,
  [ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME]: switchyardRuntimeAnalysisProvider,
};

const toRequestedModels = (turn: CompareTurnLike, fallbackModels: ModelName[]) =>
  turn.userMessage?.requestedModels?.length ? turn.userMessage.requestedModels : fallbackModels;

export const buildCompareAnalysisRequest = (
  turn: CompareTurnLike,
  fallbackModels: ModelName[]
): CompareAnalysisRequest => {
  const requestedModels = toRequestedModels(turn, fallbackModels);

  return {
    kind: 'compare_analyst',
    turnId: turn.id,
    prompt: turn.userMessage?.text ?? '',
    requestedModels,
    responses: requestedModels.map((model) => {
      const response = turn.responses[model];
      return {
        model,
        status: response ? getMessageDeliveryStatus(response) : DELIVERY_STATUS.PENDING,
        text: response?.text ?? '',
        diagnostics: response?.data,
      };
    }),
  };
};

export const getCompletedAnalysisModels = (request: CompareAnalysisRequest) =>
  request.responses
    .filter((response) => response.status === 'complete' && response.text.trim().length > 0)
    .map((response) => response.model);

export const canAnalyzeCompareTurn = (turn: CompareTurnLike, fallbackModels: ModelName[]) => {
  if (!turn.userMessage || turn.userMessage.role !== MESSAGE_ROLES.USER) {
    return false;
  }

  return getCompletedAnalysisModels(buildCompareAnalysisRequest(turn, fallbackModels)).length >= 2;
};

export const summarizeAnalysisAvailability = (
  turn: CompareTurnLike | null,
  fallbackModels: ModelName[]
): AnalysisAvailabilitySummary => {
  if (!turn) {
    return {
      canRun: false,
      completedModels: [],
      blockReason: ANALYSIS_BLOCK_REASONS.ANALYSIS_TURN_NOT_FOUND,
    };
  }

  const request = buildCompareAnalysisRequest(turn, fallbackModels);
  const completedModels = getCompletedAnalysisModels(request);

  if (completedModels.length < 2) {
    return {
      canRun: false,
      completedModels,
      blockReason: ANALYSIS_BLOCK_REASONS.NEEDS_TWO_COMPLETED_ANSWERS,
    };
  }

  return {
    canRun: true,
    completedModels,
  };
};

export const getAnalysisProvider = (providerId: AnalysisProviderId | string) =>
  providerRegistry[normalizeAnalysisProviderId(providerId)];

export const getAnalysisProviderOptions = () =>
  (Object.values(providerRegistry) as AnalysisProviderDefinition[]).map((provider) => ({
    id: provider.id,
    label: provider.label,
    description: provider.description,
    availableInBrowserBuild: provider.availableInBrowserBuild,
    executionSurface: provider.executionSurface,
    availabilityReason: provider.availabilityReason,
  }));

export const createIdleCompareAnalysisState = (
  config: AnalysisProviderConfig
): CompareAnalysisState => ({
  status: ANALYSIS_STATUSES.IDLE,
  provider: config.provider,
  model: config.model,
  updatedAt: Date.now(),
});

export const createBlockedCompareAnalysisState = (
  config: AnalysisProviderConfig,
  blockReason: CompareAnalysisState['blockReason'],
  errorMessage: string
): CompareAnalysisState => ({
  status: ANALYSIS_STATUSES.BLOCKED,
  provider: config.provider,
  model: config.model,
  blockReason,
  errorMessage,
  updatedAt: Date.now(),
});

export * from './types';
