import { AlertTriangle, ArrowRight, Play, RefreshCcw, Sparkles, Workflow } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { ModelName } from '../../utils/types';

export type WorkflowPanelStatus =
  | 'idle'
  | 'runnable'
  | 'waiting_external'
  | 'seed_ready'
  | 'blocked'
  | 'error'
  | 'running_compare';

interface WorkflowPanelProps {
  turnId: string;
  status: WorkflowPanelStatus;
  targetModels: ModelName[];
  currentStepId?: string;
  waitingFor?: string;
  nextActionLabel?: string;
  nextActionSummary?: string;
  emittedActionCommand?: string;
  emittedActionStepId?: string;
  seedPrompt?: string;
  errorMessage?: string;
  hasAnalystResult: boolean;
  onRunWorkflow: () => void;
  onUseSeed: () => void;
  onRunNextCompare: () => void;
}

const statusToneMap: Record<WorkflowPanelStatus, string> = {
  idle: 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] text-[color:var(--ps-text-muted)]',
  runnable:
    'border-[rgba(138,155,255,0.28)] bg-[rgba(138,155,255,0.14)] text-[color:var(--ps-focus)]',
  waiting_external: 'border-cyan-400/30 bg-cyan-400/10 text-cyan-300',
  seed_ready:
    'border-[rgba(83,196,143,0.28)] bg-[rgba(83,196,143,0.12)] text-[color:var(--ps-success)]',
  blocked:
    'border-[rgba(243,192,107,0.28)] bg-[rgba(243,192,107,0.12)] text-[color:var(--ps-warning)]',
  error:
    'border-[rgba(255,123,134,0.28)] bg-[rgba(255,123,134,0.12)] text-[color:var(--ps-danger)]',
  running_compare: 'border-[rgba(255,138,91,0.28)] bg-[rgba(255,138,91,0.14)] text-[color:var(--ps-accent)]',
};

const getCurrentStepLabel = (
  currentStepId: string | undefined,
  t: ReturnType<typeof useTranslation>['t']
) => {
  if (!currentStepId) {
    return t('workflow.meta.notStarted', 'not started');
  }

  switch (currentStepId) {
    case 'compare':
      return t('workflow.step.compare', 'Compare');
    case 'analyze':
      return t('workflow.step.analyzeCompare', 'Analyze compare');
    case 'retry-failed':
      return t('workflow.step.retryFailed', 'Retry failed models');
    case 'seed-follow-up':
      return t('workflow.step.seedFollowUp', 'Seed next compare');
    case 'continue-from-answer':
      return t('workflow.step.continueFromAnswer', 'Continue from answer');
    default:
      return currentStepId;
  }
};

const getTitle = (
  status: WorkflowPanelStatus,
  hasAnalystResult: boolean,
  t: ReturnType<typeof useTranslation>['t']
) => {
  switch (status) {
    case 'runnable':
      return hasAnalystResult
        ? t('workflow.title.runnableSeedReady', 'Ready to stage the next move')
        : t('workflow.title.runnableNeedsAnalysis', 'Ready to turn this compare into the next move');
    case 'waiting_external':
      return t('workflow.title.waiting', 'Workflow is waiting on a browser-side step');
    case 'seed_ready':
      return t('workflow.title.seedReady', 'Next compare seed is ready');
    case 'blocked':
      return t('workflow.title.blocked', 'Workflow is blocked until this turn is ready');
    case 'error':
      return t('workflow.title.error', 'Workflow did not finish');
    case 'running_compare':
      return t('workflow.title.runningCompare', 'Running the next compare now');
    case 'idle':
    default:
      return t('workflow.title.idle', 'Next-step workflow');
  }
};

const getBody = (
  status: WorkflowPanelStatus,
  hasAnalystResult: boolean,
  waitingFor: string | undefined,
  errorMessage: string | undefined,
  t: ReturnType<typeof useTranslation>['t']
) => {
  if (status === 'seed_ready') {
    return t(
      'workflow.body.seedReady',
      'Prompt Switchboard has staged a next-round seed. You can place it in the composer or run the next compare now.'
    );
  }

  if (status === 'waiting_external') {
    return (
      waitingFor ??
      t(
        'workflow.body.waiting',
        'Prompt Switchboard is waiting for browser-side work to finish before it can stage the next step.'
      )
    );
  }

  if (status === 'blocked' || status === 'error') {
    return (
      errorMessage ??
      t(
        'workflow.body.errorFallback',
        'Prompt Switchboard could not turn this compare turn into a next-step workflow yet.'
      )
    );
  }

  if (status === 'running_compare') {
    return t(
      'workflow.body.runningCompare',
      'Prompt Switchboard is sending the staged next-round prompt through the compare-first lane.'
    );
  }

  if (hasAnalystResult) {
    return t(
      'workflow.body.withAnalysis',
      'Use the current compare evidence and analyst output to stage a clear next-round prompt.'
    );
  }

  return t(
    'workflow.body.needsAnalysis',
    'Prompt Switchboard can run AI Compare Analyst first, then stage the strongest next-round prompt.'
  );
};

const getPrimaryLabel = (
  status: WorkflowPanelStatus,
  hasAnalystResult: boolean,
  t: ReturnType<typeof useTranslation>['t']
) => {
  if (status === 'seed_ready') {
    return t('workflow.actions.runNextCompare', 'Run next compare now');
  }

  if (status === 'waiting_external') {
    return t('workflow.actions.waiting', 'Workflow in progress');
  }

  return hasAnalystResult
    ? t('workflow.actions.runWorkflow', 'Stage next step')
    : t('workflow.actions.runAnalystAndStage', 'Run analyst, then stage next step');
};

export const WorkflowPanel = ({
  turnId,
  status,
  targetModels,
  currentStepId,
  waitingFor,
  nextActionLabel,
  nextActionSummary,
  emittedActionCommand,
  emittedActionStepId,
  seedPrompt,
  errorMessage,
  hasAnalystResult,
  onRunWorkflow,
  onUseSeed,
  onRunNextCompare,
}: WorkflowPanelProps) => {
  const { t } = useTranslation();
  const canUseSeed = Boolean(seedPrompt?.trim());
  const primaryActionDisabled = status === 'waiting_external' || status === 'running_compare';

  return (
    <section
      data-testid={`workflow-panel-${turnId}`}
      className="ps-shell-panel mt-4 rounded-[1.4rem] px-4 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="ps-eyebrow">
            {t('workflow.eyebrow', 'Next-step workflow')}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-[color:var(--ps-text)]">
            {getTitle(status, hasAnalystResult, t)}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--ps-text-muted)]">
            {getBody(status, hasAnalystResult, waitingFor, errorMessage, t)}
          </p>
        </div>
        <span
          className={`inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] ${statusToneMap[status]}`}
        >
          {t(`workflow.status.${status}`, status)}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-[11px] font-medium">
        <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-[color:var(--ps-text-muted)]">
          {t('workflow.meta.currentStep', 'Current step')}:{' '}
          {getCurrentStepLabel(currentStepId, t)}
        </span>
        <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-[color:var(--ps-text-muted)]">
          {t('workflow.meta.targets', 'Targets')}: {targetModels.join(', ')}
        </span>
        <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-[color:var(--ps-text-muted)]">
          {t('workflow.meta.seedOnly', 'Seed actions stay honest')}: {t('workflow.meta.seedOnlyValue', 'they stage the next prompt, they do not auto-send')}
        </span>
      </div>

      {canUseSeed && (
        <div className="mt-4 rounded-2xl border border-[rgba(83,196,143,0.24)] bg-[rgba(255,255,255,0.05)] px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ps-success)]">
            {t('workflow.seed.title', 'Staged next-round seed')}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--ps-text-soft)]">{seedPrompt}</p>
        </div>
      )}

      {status === 'waiting_external' && nextActionSummary && (
        <div className="mt-4 rounded-2xl border border-[rgba(243,192,107,0.24)] bg-[rgba(255,255,255,0.05)] px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ps-warning)]">
            {t('workflow.nextAction.title', 'Next external action')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium">
            {nextActionLabel && (
              <span className="rounded-full border border-[rgba(243,192,107,0.24)] bg-[rgba(243,192,107,0.12)] px-2.5 py-1 text-[color:var(--ps-warning)]">
                {nextActionLabel}
              </span>
            )}
            {emittedActionCommand && (
              <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-[color:var(--ps-text-muted)]">
                {t('workflow.nextAction.command', 'Command')}: {emittedActionCommand}
              </span>
            )}
            {emittedActionStepId && (
              <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-[color:var(--ps-text-muted)]">
                {t('workflow.nextAction.step', 'Step')}: {emittedActionStepId}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm leading-6 text-[color:var(--ps-text-soft)]">{nextActionSummary}</p>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-[rgba(138,155,255,0.28)] bg-[rgba(138,155,255,0.12)] px-3 py-2 text-xs font-medium text-[color:var(--ps-focus)] transition-colors hover:bg-[rgba(138,155,255,0.18)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          onClick={status === 'seed_ready' ? onRunNextCompare : onRunWorkflow}
          disabled={primaryActionDisabled}
        >
          {status === 'seed_ready' ? <Play size={14} /> : <Workflow size={14} />}
          <span>{getPrimaryLabel(status, hasAnalystResult, t)}</span>
        </button>

        <button
          type="button"
          className="ps-action-secondary inline-flex w-full items-center justify-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)] disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          onClick={onUseSeed}
          disabled={!canUseSeed}
        >
          <Sparkles size={14} />
          <span>{t('workflow.actions.useSeedOnly', 'Seed composer only')}</span>
        </button>

        {(status === 'blocked' || status === 'error') && (
          <span className="inline-flex w-full items-center gap-2 rounded-full border border-[rgba(255,123,134,0.28)] bg-[rgba(255,123,134,0.12)] px-3 py-2 text-[11px] font-medium text-[color:var(--ps-danger)] sm:w-auto">
            <AlertTriangle size={13} />
            <span>{t('workflow.actions.fixAndRetry', 'Fix the blocker, then run workflow again')}</span>
          </span>
        )}

        {status === 'waiting_external' && (
          <span className="inline-flex w-full items-center gap-2 rounded-full border border-[rgba(243,192,107,0.28)] bg-[rgba(243,192,107,0.12)] px-3 py-2 text-[11px] font-medium text-[color:var(--ps-warning)] sm:w-auto">
            <RefreshCcw size={13} />
            <span>{t('workflow.actions.waitingHint', 'This is a real running step, not just a seed action')}</span>
          </span>
        )}

        {status === 'seed_ready' && (
          <span className="inline-flex w-full items-center gap-2 rounded-full border border-[rgba(83,196,143,0.28)] bg-[rgba(83,196,143,0.12)] px-3 py-2 text-[11px] font-medium text-[color:var(--ps-success)] sm:w-auto">
            <ArrowRight size={13} />
            <span>{t('workflow.actions.seedHint', 'Choose whether to stage the prompt or send the next compare now')}</span>
          </span>
        )}
      </div>
    </section>
  );
};
