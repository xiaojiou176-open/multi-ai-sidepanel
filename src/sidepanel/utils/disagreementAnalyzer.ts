import i18n from '../../i18n';
import type { Message, ModelName } from '../../utils/types';
import type { CompareInsightSummary } from './compareInsights';

export interface DisagreementAnalysis {
  completedModels: ModelName[];
  failedModels: ModelName[];
  pendingModels: ModelName[];
  reasons: string[];
  recommendedAction: 'judge' | 'retry_failed' | 'wait' | 'continue';
  suggestedModels: ModelName[];
  suggestedSeedModel?: ModelName;
}

export const buildDisagreementAnalysis = (
  requestedModels: ModelName[],
  responses: Partial<Record<ModelName, Message>>,
  insight: CompareInsightSummary
): DisagreementAnalysis => {
  const completedModels: ModelName[] = [];
  const failedModels: ModelName[] = [];
  const pendingModels: ModelName[] = [];

  requestedModels.forEach((model) => {
    const response = responses[model];
    if (!response) {
      pendingModels.push(model);
      return;
    }

    switch (response.deliveryStatus) {
      case 'complete':
        completedModels.push(model);
        break;
      case 'error':
        failedModels.push(model);
        break;
      default:
        pendingModels.push(model);
        break;
    }
  });

  const reasons: string[] = [];

  if (insight.disagreementDetected && completedModels.length >= 2) {
    reasons.push(
      i18n.t(
        'analysisInsights.reasonDisagreement',
        'Completed answers diverged enough to justify a focused follow-up review round.'
      )
    );
  }

  if (failedModels.length > 0 && completedModels.length > 0) {
    reasons.push(
      i18n.t(
        'analysisInsights.reasonSplit',
        'Some models failed while others completed, so this compare turn is split.'
      )
    );
  } else if (failedModels.length > 0) {
    reasons.push(
      i18n.t(
        'analysisInsights.reasonFailedOnly',
        'Some models failed and need targeted recovery.'
      )
    );
  }

  if (pendingModels.length > 0) {
    reasons.push(
      i18n.t(
        'analysisInsights.reasonPending',
        'Some models are still pending, so this compare turn is not final yet.'
      )
    );
  }

  let recommendedAction: DisagreementAnalysis['recommendedAction'] = 'continue';
  if (failedModels.length > 0) {
    recommendedAction = 'retry_failed';
  } else if (insight.disagreementDetected && completedModels.length >= 2) {
    recommendedAction = 'judge';
  } else if (pendingModels.length > 0) {
    recommendedAction = 'wait';
  }

  return {
    completedModels,
    failedModels,
    pendingModels,
    reasons,
    recommendedAction,
    suggestedModels:
      completedModels.length > 0
        ? completedModels
        : failedModels.length > 0
          ? failedModels
          : requestedModels,
    suggestedSeedModel: insight.longestCompletedModel ?? completedModels[0],
  };
};
