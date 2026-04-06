import { getMessageDeliveryStatus, type CompareTurn } from '../../utils/messages';
import i18n from '../../i18n';
import type { ModelName } from '../../utils/types';
import type { CompareInsightSummary } from './compareInsights';
import type { DisagreementAnalysis } from './disagreementAnalyzer';
import {
  formatFailureClass,
  formatReadinessStatus,
  formatRuntimeStage,
} from './runtimeLabels';

const summarizeModels = (models: ModelName[]) =>
  models.length > 0 ? models.join(', ') : i18n.t('compare.export.none', 'None');

const getStatusLabel = (status: ReturnType<typeof getMessageDeliveryStatus> | 'pending') => {
  switch (status) {
    case 'complete':
      return i18n.t('compare.status.complete', 'Complete');
    case 'streaming':
      return i18n.t('compare.status.streaming', 'Streaming');
    case 'error':
      return i18n.t('compare.status.error', 'Failed');
    case 'pending':
    default:
      return i18n.t('compare.status.pending', 'Pending');
  }
};

export const buildCompareShareSummary = (
  turn: CompareTurn,
  requestedModels: ModelName[],
  insight: CompareInsightSummary,
  disagreement: DisagreementAnalysis
) => {
  const prompt =
    turn.userMessage?.text.trim() || i18n.t('compare.export.legacyPrompt', 'Legacy prompt');
  const completedModels = disagreement.completedModels.length
    ? disagreement.completedModels.join(', ')
    : i18n.t('compare.export.noneLowercase', 'none');
  const failedModels = disagreement.failedModels.length
    ? disagreement.failedModels.join(', ')
    : i18n.t('compare.export.noneLowercase', 'none');
  const nextMove =
    disagreement.recommendedAction === 'retry_failed'
      ? i18n.t('compare.export.nextMoveRetry', 'Retry the failed models.')
      : disagreement.recommendedAction === 'judge'
        ? i18n.t('compare.export.nextMoveJudge', 'Draft a follow-up review round.')
        : disagreement.recommendedAction === 'wait'
          ? i18n.t('compare.export.nextMoveWait', 'Wait for the remaining models.')
          : i18n.t(
              'compare.export.nextMoveContinue',
              'Continue from the strongest completed answer.'
            );

  return [
    i18n.t('compare.export.summaryTitle', 'Prompt Switchboard compare summary'),
    `${i18n.t('compare.export.prompt', 'Prompt')}: ${prompt}`,
    `${i18n.t('compare.export.models', 'Models')}: ${summarizeModels(requestedModels)}`,
    `${i18n.t('compare.export.completed', 'Completed')}: ${completedModels}`,
    `${i18n.t('compare.export.failed', 'Failed')}: ${failedModels}`,
    `${i18n.t('compare.export.pending', 'Pending')}: ${insight.pendingCount}`,
    `${i18n.t('compare.export.nextMove', 'Next move')}: ${nextMove}`,
  ].join('\n');
};

export const buildCompareMarkdownExport = (
  turn: CompareTurn,
  requestedModels: ModelName[],
  insight: CompareInsightSummary,
  disagreement: DisagreementAnalysis
) => {
  const prompt =
    turn.userMessage?.text.trim() || i18n.t('compare.export.legacyPrompt', 'Legacy prompt');
  const startedAt = new Date(turn.startedAt).toISOString();
  const rows = requestedModels
    .map((model) => {
      const response = turn.responses[model];
      const status = response ? getStatusLabel(getMessageDeliveryStatus(response)) : getStatusLabel('pending');
      const body =
        response?.text?.trim() || i18n.t('compare.export.noAnswer', '_No answer captured._');
      const stage =
        response?.data?.stage
          ? formatRuntimeStage(response.data.stage, i18n.t.bind(i18n))
          : response?.data?.readinessStatus
            ? formatReadinessStatus(response.data.readinessStatus, i18n.t.bind(i18n))
            : i18n.t('compare.export.notAvailable', 'n/a');
      return [
        `### ${model}`,
        ``,
        `- ${i18n.t('compare.export.statusLabel', 'Status')}: ${status}`,
        `- ${i18n.t('compare.export.stageLabel', 'Stage')}: ${stage}`,
        response?.data?.failureClass
          ? `- ${i18n.t('compare.export.failureClassLabel', 'Failure class')}: ${formatFailureClass(
              response.data.failureClass,
              i18n.t.bind(i18n)
            )}`
          : null,
        response?.data?.hostname
          ? `- ${i18n.t('compare.export.hostLabel', 'Host')}: ${response.data.hostname}`
          : null,
        ``,
        body,
      ]
        .filter(Boolean)
        .join('\n');
    })
    .join('\n\n');

  const reasons = disagreement.reasons.length
    ? disagreement.reasons.map((reason) => `- ${reason}`).join('\n')
    : `- ${i18n.t(
        'compare.export.noFollowUpReason',
        'No follow-up reason was generated for this turn.'
      )}`;

  return [
    `# ${i18n.t('compare.export.markdownTitle', 'Prompt Switchboard compare export')}`,
    '',
    `- ${i18n.t('compare.export.startedAt', 'Started at')}: ${startedAt}`,
    `- ${i18n.t('compare.export.models', 'Models')}: ${summarizeModels(requestedModels)}`,
    `- ${i18n.t('compare.export.completedCount', 'Completed')}: ${insight.completeCount}`,
    `- ${i18n.t('compare.export.failedCount', 'Failed')}: ${insight.failedCount}`,
    `- ${i18n.t('compare.export.pendingCount', 'Pending')}: ${insight.pendingCount}`,
    insight.fastestModel
      ? `- ${i18n.t('compare.export.fastestModel', 'Fastest model')}: ${insight.fastestModel}`
      : null,
    insight.longestCompletedModel
      ? `- ${i18n.t(
          'compare.export.followUpSeed',
          'Suggested follow-up seed'
        )}: ${insight.longestCompletedModel}`
      : null,
    '',
    `## ${i18n.t('compare.export.originalPrompt', 'Original prompt')}`,
    '',
    prompt,
    '',
    `## ${i18n.t('compare.export.followUpNotes', 'Follow-up notes')}`,
    '',
    reasons,
    '',
    `## ${i18n.t('compare.export.modelAnswers', 'Model answers')}`,
    '',
    rows,
    '',
    `> ${i18n.t(
      'compare.export.localFirstNote',
      'Prompt Switchboard keeps this compare export local-first. This file is generated inside the browser workflow and does not require a hosted relay.'
    )}`,
  ]
    .filter(Boolean)
    .join('\n');
};
