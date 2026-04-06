import i18n from '../../i18n';
import {
  DELIVERY_STATUS,
  READINESS_STATUSES,
  type DeliveryDiagnostics,
  type DeliveryStatus,
  type Message,
  type ModelName,
} from '../../utils/types';

export interface CompareInsightSummary {
  completeCount: number;
  failedCount: number;
  pendingCount: number;
  fastestModel?: ModelName;
  longestModel?: ModelName;
  longestCompletedModel?: ModelName;
  disagreementDetected: boolean;
  failedModels: ModelName[];
}

export interface CompareRunTimelineStep {
  id: 'readiness' | 'handoff' | 'response' | 'finish';
  label: string;
  tone: 'done' | 'current' | 'blocked' | 'upcoming';
}

export interface CompareRunTimeline {
  summary: string;
  emphasis: 'good' | 'warn' | 'danger' | 'neutral';
  steps: CompareRunTimelineStep[];
}

const buildBaseTimeline = (): CompareRunTimelineStep[] => [
  {
    id: 'readiness',
    label: i18n.t('compare.timeline.readiness', 'Ready check'),
    tone: 'upcoming',
  },
  {
    id: 'handoff',
    label: i18n.t('compare.timeline.handoff', 'Browser handoff'),
    tone: 'upcoming',
  },
  {
    id: 'response',
    label: i18n.t('compare.timeline.response', 'Answer stream'),
    tone: 'upcoming',
  },
  {
    id: 'finish',
    label: i18n.t('compare.timeline.finish', 'Finished'),
    tone: 'upcoming',
  },
];

const buildReadinessBlockedTimeline = (
  readinessStatus: string | undefined
): CompareRunTimeline => {
  const steps = buildBaseTimeline();
  steps[0].tone = 'blocked';

  const summary =
    readinessStatus === READINESS_STATUSES.TAB_LOADING
      ? i18n.t(
          'analysisInsights.summaryTabLoading',
          'The tab is still loading, so Prompt Switchboard is waiting before it can continue.'
        )
      : readinessStatus === READINESS_STATUSES.TAB_MISSING
        ? i18n.t(
            'analysisInsights.summaryTabMissing',
            'A supported model tab is missing, so this compare run could not start there.'
          )
        : readinessStatus === READINESS_STATUSES.MODEL_MISMATCH
          ? i18n.t(
              'analysisInsights.summaryModelMismatch',
              'A tab exists, but it is not the expected chat surface for this model.'
            )
          : readinessStatus === READINESS_STATUSES.SELECTOR_DRIFT_SUSPECT
            ? i18n.t(
                'analysisInsights.summarySelectorDrift',
                'Prompt Switchboard could not confirm the page controls before the run started.'
              )
            : i18n.t(
                'analysisInsights.summaryReadyCheckBlocked',
                'The compare run stopped before Prompt Switchboard could confirm the tab was ready.'
              );

  return {
    summary,
    emphasis: 'danger',
    steps,
  };
};

export const buildCompareRunTimeline = (
  status: DeliveryStatus,
  diagnostics?: DeliveryDiagnostics
): CompareRunTimeline => {
  const steps = buildBaseTimeline();
  const readinessStatus = diagnostics?.readinessStatus;

  if (readinessStatus && readinessStatus !== READINESS_STATUSES.READY) {
    return buildReadinessBlockedTimeline(readinessStatus);
  }

  if (status === DELIVERY_STATUS.PENDING) {
    steps[0].tone = 'done';
    steps[1].tone = 'current';
    return {
      summary:
        i18n.t(
          'analysisInsights.summaryQueued',
          'Ready check passed. Prompt Switchboard is handing this run off to the active browser tab.'
        ),
      emphasis: 'neutral',
      steps,
    };
  }

  if (status === DELIVERY_STATUS.STREAMING) {
    steps[0].tone = 'done';
    steps[1].tone = 'done';
    steps[2].tone = 'current';
    return {
      summary: i18n.t(
        'analysisInsights.summaryStreaming',
        'The prompt was delivered and this model is still streaming its answer.'
      ),
      emphasis: 'good',
      steps,
    };
  }

  if (status === DELIVERY_STATUS.COMPLETE) {
    return {
      summary: i18n.t(
        'analysisInsights.summaryComplete',
        'This model finished the run and returned a completed answer.'
      ),
      emphasis: 'good',
      steps: steps.map((step) => ({ ...step, tone: 'done' })),
    };
  }

  if (diagnostics?.stage === 'content_ready_handshake') {
    steps[0].tone = 'done';
    steps[1].tone = 'blocked';
    return {
      summary: i18n.t(
        'analysisInsights.summaryHandoffBlocked',
        'The tab was found, but Prompt Switchboard could not complete the browser handoff.'
      ),
      emphasis: 'danger',
      steps,
    };
  }

  if (diagnostics?.stage === 'content_execute_prompt') {
    steps[0].tone = 'done';
    steps[1].tone = 'done';
    steps[2].tone = 'blocked';
    return {
      summary: i18n.t(
        'analysisInsights.summaryExecutionBlocked',
        'The tab was ready, but the prompt run failed before a final answer could be captured.'
      ),
      emphasis: 'danger',
      steps,
    };
  }

  if (diagnostics?.stage === 'delivery') {
    steps[0].tone = 'done';
    steps[1].tone = 'done';
    steps[2].tone = 'blocked';
    return {
      summary: i18n.t(
        'analysisInsights.summaryDeliveryBlocked',
        'The model started, but Prompt Switchboard could not complete delivery back into the compare board.'
      ),
      emphasis: 'danger',
      steps,
    };
  }

  steps[0].tone = 'done';
  steps[1].tone = 'done';
  steps[2].tone = 'blocked';
  return {
    summary: i18n.t(
      'analysisInsights.summaryLifecycleFailed',
      'This run failed after the initial handoff, so Prompt Switchboard could not finish the answer lifecycle.'
    ),
    emphasis: 'danger',
    steps,
  };
};

export const buildCompareInsightSummary = (
  requestedModels: ModelName[],
  responses: Partial<Record<ModelName, Message>>
): CompareInsightSummary => {
  let completeCount = 0;
  let failedCount = 0;
  let pendingCount = 0;
  let fastestModel: ModelName | undefined;
  let longestModel: ModelName | undefined;
  let longestCompletedModel: ModelName | undefined;
  let fastestCompletedAt = Number.POSITIVE_INFINITY;
  let longestLength = -1;
  let longestCompletedLength = -1;

  requestedModels.forEach((model) => {
    const response = responses[model];
    if (!response) {
      pendingCount += 1;
      return;
    }

    switch (response.deliveryStatus) {
      case 'complete':
        completeCount += 1;
        if ((response.completedAt ?? Number.POSITIVE_INFINITY) < fastestCompletedAt) {
          fastestCompletedAt = response.completedAt ?? Number.POSITIVE_INFINITY;
          fastestModel = model;
        }
        if (response.text.trim().length > longestCompletedLength) {
          longestCompletedLength = response.text.trim().length;
          longestCompletedModel = model;
        }
        break;
      case 'error':
        failedCount += 1;
        break;
      default:
        pendingCount += 1;
        break;
    }

    const responseLength = response.text.trim().length;
    if (responseLength > longestLength) {
      longestLength = responseLength;
      longestModel = model;
    }
  });

  const textLengths = requestedModels
    .map((model) => responses[model]?.text.trim().length ?? 0)
    .filter((length) => length > 0)
    .sort((left, right) => left - right);
  const disagreementDetected =
    textLengths.length >= 2 && textLengths[textLengths.length - 1] - textLengths[0] >= 80;

  return {
    completeCount,
    failedCount,
    pendingCount,
    fastestModel,
    longestModel,
    longestCompletedModel,
    disagreementDetected,
    failedModels: requestedModels.filter((model) => responses[model]?.deliveryStatus === 'error'),
  };
};
