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
  idle: 'border-slate-200 bg-slate-50 text-slate-700',
  runnable: 'border-sky-200 bg-sky-50 text-sky-700',
  waiting_external: 'border-cyan-200 bg-cyan-50 text-cyan-700',
  seed_ready: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  blocked: 'border-amber-200 bg-amber-50 text-amber-800',
  error: 'border-rose-200 bg-rose-50 text-rose-700',
  running_compare: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700',
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
      className="mt-4 rounded-[1.4rem] border border-sky-100 bg-sky-50/55 px-4 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-sky-700">
            {t('workflow.eyebrow', 'Next-step workflow')}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-slate-900">
            {getTitle(status, hasAnalystResult, t)}
          </h3>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
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
        <span className="rounded-full border border-white/80 bg-white px-3 py-2 text-slate-600">
          {t('workflow.meta.currentStep', 'Current step')}:{' '}
          {getCurrentStepLabel(currentStepId, t)}
        </span>
        <span className="rounded-full border border-white/80 bg-white px-3 py-2 text-slate-600">
          {t('workflow.meta.targets', 'Targets')}: {targetModels.join(', ')}
        </span>
        <span className="rounded-full border border-white/80 bg-white px-3 py-2 text-slate-600">
          {t('workflow.meta.seedOnly', 'Seed actions stay honest')}: {t('workflow.meta.seedOnlyValue', 'they stage the next prompt, they do not auto-send')}
        </span>
      </div>

      {canUseSeed && (
        <div className="mt-4 rounded-2xl border border-emerald-100 bg-white px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
            {t('workflow.seed.title', 'Staged next-round seed')}
          </p>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">{seedPrompt}</p>
        </div>
      )}

      {status === 'waiting_external' && nextActionSummary && (
        <div className="mt-4 rounded-2xl border border-amber-100 bg-white px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700">
            {t('workflow.nextAction.title', 'Next external action')}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium">
            {nextActionLabel && (
              <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-800">
                {nextActionLabel}
              </span>
            )}
            {emittedActionCommand && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                {t('workflow.nextAction.command', 'Command')}: {emittedActionCommand}
              </span>
            )}
            {emittedActionStepId && (
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-slate-600">
                {t('workflow.nextAction.step', 'Step')}: {emittedActionStepId}
              </span>
            )}
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-700">{nextActionSummary}</p>
        </div>
      )}

      <div className="mt-4 grid gap-2 sm:flex sm:flex-wrap">
        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          onClick={status === 'seed_ready' ? onRunNextCompare : onRunWorkflow}
          disabled={primaryActionDisabled}
        >
          {status === 'seed_ready' ? <Play size={14} /> : <Workflow size={14} />}
          <span>{getPrimaryLabel(status, hasAnalystResult, t)}</span>
        </button>

        <button
          type="button"
          className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-70 sm:w-auto"
          onClick={onUseSeed}
          disabled={!canUseSeed}
        >
          <Sparkles size={14} />
          <span>{t('workflow.actions.useSeedOnly', 'Seed composer only')}</span>
        </button>

        {(status === 'blocked' || status === 'error') && (
          <span className="inline-flex w-full items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-[11px] font-medium text-rose-700 sm:w-auto">
            <AlertTriangle size={13} />
            <span>{t('workflow.actions.fixAndRetry', 'Fix the blocker, then run workflow again')}</span>
          </span>
        )}

        {status === 'waiting_external' && (
          <span className="inline-flex w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] font-medium text-amber-800 sm:w-auto">
            <RefreshCcw size={13} />
            <span>{t('workflow.actions.waitingHint', 'This is a real running step, not just a seed action')}</span>
          </span>
        )}

        {status === 'seed_ready' && (
          <span className="inline-flex w-full items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-medium text-emerald-700 sm:w-auto">
            <ArrowRight size={13} />
            <span>{t('workflow.actions.seedHint', 'Choose whether to stage the prompt or send the next compare now')}</span>
          </span>
        )}
      </div>
    </section>
  );
};
