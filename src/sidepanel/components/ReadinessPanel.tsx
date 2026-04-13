import React, { useState } from 'react';
import {
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  TriangleAlert,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { getModelIcon } from '../../assets/icons/getModelIcon';
import { READINESS_STATUSES, type ModelName, type ModelReadinessReport } from '../../utils/types';
import { getModelConfig } from '../../utils/modelConfig';
import { REPAIR_GUIDE_LINKS, buildPublicDocUrl } from '../utils/publicDocs';
import { formatFailureClass, formatSelectorSource } from '../utils/runtimeLabels';

const getStatusLabel = (
  report: ModelReadinessReport | undefined,
  t: ReturnType<typeof useTranslation>['t']
) => {
  if (!report) return t('readiness.checking', 'Checking');

  switch (report.status) {
    case READINESS_STATUSES.READY:
      return t('readiness.ready', 'Ready');
    case READINESS_STATUSES.TAB_MISSING:
      return t('readiness.tabMissing', 'Tab missing');
    case READINESS_STATUSES.TAB_LOADING:
      return t('readiness.tabLoading', 'Loading');
    case READINESS_STATUSES.MODEL_MISMATCH:
      return t('readiness.modelMismatch', 'Wrong page');
    case READINESS_STATUSES.SELECTOR_DRIFT_SUSPECT:
      return t('readiness.selectorDrift', 'Selector drift');
    case READINESS_STATUSES.CONTENT_UNAVAILABLE:
    default:
      return t('readiness.contentUnavailable', 'Content unavailable');
  }
};

const getStatusTone = (report: ModelReadinessReport | undefined) => {
  if (!report || report.status === READINESS_STATUSES.TAB_LOADING) {
    return 'border-[rgba(243,192,107,0.28)] bg-[rgba(243,192,107,0.12)] text-[color:var(--ps-warning)]';
  }

  if (report.ready) {
    return 'border-[rgba(83,196,143,0.28)] bg-[rgba(83,196,143,0.12)] text-[color:var(--ps-success)]';
  }

  return 'border-[rgba(255,123,134,0.28)] bg-[rgba(255,123,134,0.12)] text-[color:var(--ps-danger)]';
};

const getRepairCopy = (
  report: ModelReadinessReport,
  t: ReturnType<typeof useTranslation>['t']
) => {
  switch (report.status) {
    case READINESS_STATUSES.TAB_MISSING:
      return {
        title: t('readiness.repair.tabMissingTitle', 'Open this model in a normal signed-in tab'),
        body: t(
          'readiness.repair.tabMissingBody',
          'Prompt Switchboard cannot route the next compare run until this model is open in the same browser profile.'
        ),
      };
    case READINESS_STATUSES.TAB_LOADING:
      return {
        title: t('readiness.repair.tabLoadingTitle', 'Let this tab finish loading, then re-check'),
        body: t(
          'readiness.repair.tabLoadingBody',
          'The target chat surface is still loading, so Prompt Switchboard is waiting for the page to settle before it can safely send.'
        ),
      };
    case READINESS_STATUSES.MODEL_MISMATCH:
      return {
        title: t('readiness.repair.modelMismatchTitle', 'This tab is open, but it is the wrong chat surface'),
        body: t(
          'readiness.repair.modelMismatchBody',
          'Open the expected site for this model, then run readiness again so the compare flow points to the right page.'
        ),
      };
    case READINESS_STATUSES.SELECTOR_DRIFT_SUSPECT:
      return {
        title: t(
          'readiness.repair.selectorDriftTitle',
          'Prompt Switchboard found the page, but could not confirm the send controls'
        ),
        body:
          report.inputReady && report.submitReady === false
            ? t(
                'readiness.repair.submitMissingBody',
                'The input area is present, but the send action is not. This usually means the page is mid-load, signed out, or the site markup changed.'
              )
            : t(
                'readiness.repair.selectorDriftBody',
                'This page may be signed out, on the wrong screen, or affected by selector drift. Re-open the model tab and re-check before the next run.'
              ),
      };
    case READINESS_STATUSES.CONTENT_UNAVAILABLE:
    default:
      return {
        title: t(
          'readiness.repair.contentUnavailableTitle',
          'Prompt Switchboard could not complete the in-tab handshake'
        ),
        body: t(
          'readiness.repair.contentUnavailableBody',
          'Re-open the model tab or refresh the page, then run readiness again before the next compare attempt.'
        ),
      };
  }
};

interface ReadinessPanelProps {
  models: ModelName[];
  onOpenSettings?: () => void;
  compact?: boolean;
}

export const ReadinessPanel: React.FC<ReadinessPanelProps> = ({
  models,
  onOpenSettings,
  compact = false,
}) => {
  const { t } = useTranslation();
  const modelReadiness = useStore((state) => state.modelReadiness);
  const refreshModelReadiness = useStore((state) => state.refreshModelReadiness);
  const isCheckingReadiness = useStore((state) => state.isCheckingReadiness);
  const repairGuideLinks = REPAIR_GUIDE_LINKS.map((link) => ({
    ...link,
    href: buildPublicDocUrl(link.path),
  }));
  const [showRepairDetails, setShowRepairDetails] = useState(false);
  const attentionReports = models
    .map((model) => ({ model, report: modelReadiness[model] }))
    .filter(
      (entry): entry is { model: ModelName; report: ModelReadinessReport } => Boolean(entry.report?.ready === false)
    );
  const readyCount = models.filter((model) => modelReadiness[model]?.ready).length;
  const loadingCount = models.filter(
    (model) => modelReadiness[model]?.status === READINESS_STATUSES.TAB_LOADING
  ).length;
  const checkingCount = models.filter((model) => !modelReadiness[model]).length;
  const blockedCount = attentionReports.filter(
    ({ report }) => report.status !== READINESS_STATUSES.TAB_LOADING
  ).length;
  const modelsToOpen = attentionReports
    .filter(
      ({ report }) =>
        report.status === READINESS_STATUSES.TAB_MISSING ||
        report.status === READINESS_STATUSES.MODEL_MISMATCH
    )
    .map(({ model }) => model);

  const hasBlockingIssue = models.some((model) => {
    const report = modelReadiness[model];
    if (!report) return false;
    if (report.status === READINESS_STATUSES.TAB_LOADING) return false;
    return !report.ready;
  });

  return (
    <section
      className="border-b border-[color:var(--ps-border)] bg-[rgba(7,8,10,0.76)] px-4 py-4 backdrop-blur-xl"
      data-testid="readiness-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="ps-eyebrow">
            {t('readiness.eyebrow', 'Model readiness')}
          </p>
          <div className="mt-1 flex items-center gap-2 text-sm text-[color:var(--ps-text-muted)]">
            {hasBlockingIssue ? (
              <TriangleAlert size={14} className="text-[color:var(--ps-danger)]" />
            ) : (
              <ShieldCheck size={14} className="text-[color:var(--ps-success)]" />
            )}
            <span>
              {hasBlockingIssue
                ? t(
                    'readiness.summaryIssue',
                    'Some selected models need attention before the next compare run.'
                  )
                : t(
                    'readiness.summaryOk',
                    'Selected models look ready, or Prompt Switchboard is checking them now.'
                  )}
            </span>
          </div>
        </div>

        <button
          type="button"
          className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)] disabled:cursor-not-allowed disabled:opacity-70"
          onClick={() => {
            void refreshModelReadiness(models);
          }}
          disabled={isCheckingReadiness}
        >
          <RefreshCcw size={13} className={isCheckingReadiness ? 'animate-spin' : ''} />
          <span>{t('readiness.refresh', 'Refresh')}</span>
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {models.map((model) => {
          const report = modelReadiness[model];
          return (
            <div
              key={model}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs font-medium ${getStatusTone(report)}`}
              data-testid={`readiness-pill-${model}`}
              title={report?.hostname || model}
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(255,255,255,0.1)] text-[color:var(--ps-text)]">
                {getModelIcon(model, 'h-3 w-3')}
              </span>
              <span>{model}</span>
              <span className="rounded-full bg-[rgba(255,255,255,0.1)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                {getStatusLabel(report, t)}
              </span>
            </div>
          );
        })}
      </div>

      {compact ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.25rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] px-4 py-3 shadow-sm">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
              {t('readiness.nextMove.eyebrow', 'Best next move')}
            </p>
            <p className="mt-1 text-sm font-semibold text-[color:var(--ps-text)]">
              {hasBlockingIssue
                ? t('readiness.nextMove.blockedTitle', 'Use the repair center before the next compare')
                : t('readiness.nextMove.readyTitle', 'Stay on the result board unless a tab truly fails')}
            </p>
            <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
              {hasBlockingIssue
                ? t(
                    'readiness.nextMove.blockedBody',
                    'This keeps the compare board readable and stops the analyst lane from overreacting to avoidable missing tabs.'
                  )
                : t(
                    'readiness.compact.readyBody',
                    'Readiness is now just a health strip. Keep your attention on the compare result, not on repeated health checks.'
                  )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[11px] font-medium">
            <span className="rounded-full border border-[rgba(83,196,143,0.24)] bg-[rgba(83,196,143,0.12)] px-2.5 py-1 text-[color:var(--ps-success)]">
              {t('readiness.workspacePulse.readyEyebrow', 'Ready now')}: {readyCount}
            </span>
            <span className="rounded-full border border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.12)] px-2.5 py-1 text-[color:var(--ps-danger)]">
              {t('readiness.workspacePulse.blockedEyebrow', 'Needs repair')}: {blockedCount}
            </span>
            <span className="rounded-full border border-[rgba(243,192,107,0.24)] bg-[rgba(243,192,107,0.12)] px-2.5 py-1 text-[color:var(--ps-warning)]">
              {t('readiness.workspacePulse.pendingEyebrow', 'Still settling')}: {loadingCount + checkingCount}
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {hasBlockingIssue && (
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.12)] px-3 py-2 text-xs font-medium text-[color:var(--ps-danger)] transition-colors hover:bg-[rgba(255,123,134,0.2)]"
                onClick={() => setShowRepairDetails((open) => !open)}
                aria-expanded={showRepairDetails}
              >
                {showRepairDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                <span>
                  {showRepairDetails
                    ? t('readiness.repair.hideDetails', 'Hide repair details')
                    : t('readiness.repair.showDetails', 'Review repair steps')}
                </span>
              </button>
            )}
            <button
              type="button"
              className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
              onClick={() => {
                void refreshModelReadiness(models);
              }}
            >
              <RefreshCcw size={13} className={isCheckingReadiness ? 'animate-spin' : ''} />
              <span>{t('readiness.nextMove.recheckAll', 'Re-check selected models')}</span>
            </button>
            {onOpenSettings && (
              <button
                type="button"
                className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                onClick={onOpenSettings}
              >
                <Settings2 size={13} />
                <span>{t('readiness.nextMove.modelHealth', 'Open model health overview')}</span>
              </button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_repeat(3,minmax(0,1fr))]">
            <div
              className={`rounded-[1.45rem] border px-4 py-3 shadow-sm ${
                hasBlockingIssue
                  ? 'border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.12)]'
                  : 'border-[rgba(83,196,143,0.24)] bg-[rgba(83,196,143,0.12)]'
              }`}
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
                {t('readiness.workspacePulse.eyebrow', 'Readiness pulse')}
              </p>
              <p className="mt-2 text-sm font-semibold text-[color:var(--ps-text)]">
                {hasBlockingIssue
                  ? t('readiness.workspacePulse.blockedTitle', 'Repair first, then compare')
                  : t('readiness.workspacePulse.readyTitle', 'Good enough to start a clean compare')}
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--ps-text-muted)]">
                {hasBlockingIssue
                  ? t(
                      'readiness.workspacePulse.blockedBody',
                      'Use this panel like a pre-flight checklist: unblock the broken tabs here so the result board and analyst lane do not start from missing answers.'
                    )
                  : t(
                      'readiness.workspacePulse.readyBody',
                      'At least one selected tab is usable. Ask once, then come back only if the result board exposes a real failure.'
                    )}
              </p>
            </div>

            <div className="ps-metric-card rounded-[1.45rem] px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
                {t('readiness.workspacePulse.readyEyebrow', 'Ready now')}
              </p>
              <p className="mt-2 text-2xl font-semibold text-[color:var(--ps-text)]">{readyCount}</p>
              <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                {t(
                  'readiness.workspacePulse.readyBodyCompact',
                  'These tabs can participate in the next compare turn right away.'
                )}
              </p>
            </div>

            <div className="ps-metric-card rounded-[1.45rem] px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
                {t('readiness.workspacePulse.blockedEyebrow', 'Needs repair')}
              </p>
              <p className="mt-2 text-2xl font-semibold text-[color:var(--ps-text)]">{blockedCount}</p>
              <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                {t(
                  'readiness.workspacePulse.blockedBodyCompact',
                  'Fix these before you trust analyst recommendations or workflow staging.'
                )}
              </p>
            </div>

            <div className="ps-metric-card rounded-[1.45rem] px-4 py-3 shadow-sm">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
                {t('readiness.workspacePulse.pendingEyebrow', 'Still settling')}
              </p>
              <p className="mt-2 text-2xl font-semibold text-[color:var(--ps-text)]">
                {loadingCount + checkingCount}
              </p>
              <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                {t(
                  'readiness.workspacePulse.pendingBodyCompact',
                  'These tabs are loading or still being checked, so re-run readiness after the pages settle.'
                )}
              </p>
            </div>
          </div>

          <div className="ps-shell-panel mt-4 flex flex-wrap items-center justify-between gap-3 rounded-[1.45rem] px-4 py-3 shadow-sm">
            <div className="min-w-0">
              <p className="ps-eyebrow">
                {t('readiness.nextMove.eyebrow', 'Best next move')}
              </p>
              <p className="mt-1 text-sm font-semibold text-[color:var(--ps-text)]">
                {hasBlockingIssue
                  ? t('readiness.nextMove.blockedTitle', 'Use the repair center before the next compare')
                  : t('readiness.nextMove.readyTitle', 'You can switch back to the result board and ask once')}
              </p>
              <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                {hasBlockingIssue
                  ? t(
                      'readiness.nextMove.blockedBody',
                      'This keeps the compare board readable and stops the analyst lane from overreacting to avoidable missing tabs.'
                    )
                  : t(
                      'readiness.nextMove.readyBody',
                      'Readiness has done its job. The next useful signal should come from a real compare run, not from repeatedly refreshing this panel.'
                    )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {modelsToOpen.length > 0 && (
                <button
                  type="button"
                  className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.12)] px-3 py-2 text-xs font-medium text-[color:var(--ps-danger)] transition-colors hover:bg-[rgba(255,123,134,0.2)]"
                  onClick={() => {
                    modelsToOpen.forEach((model) =>
                      window.open(getModelConfig(model).openUrl, '_blank', 'noopener,noreferrer')
                    );
                  }}
                >
                  <ArrowUpRight size={13} />
                  <span>{t('readiness.nextMove.openBlocked', 'Open blocked tabs')}</span>
                </button>
              )}
              <button
                type="button"
                className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                onClick={() => {
                  void refreshModelReadiness(models);
                }}
              >
                <RefreshCcw size={13} className={isCheckingReadiness ? 'animate-spin' : ''} />
                <span>{t('readiness.nextMove.recheckAll', 'Re-check selected models')}</span>
              </button>
              {onOpenSettings && (
                <button
                  type="button"
                  className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                  onClick={onOpenSettings}
                >
                  <Settings2 size={13} />
                  <span>{t('readiness.nextMove.modelHealth', 'Open model health overview')}</span>
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {attentionReports.length > 0 && (
        <div className="mt-4 rounded-[1.45rem] border border-[rgba(255,123,134,0.2)] bg-[rgba(255,123,134,0.08)] px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-danger)]">
                {t('readiness.repair.eyebrow', 'Repair center')}
              </p>
              <p className="mt-1 text-sm text-[color:var(--ps-text-soft)]">
                {t(
                  'readiness.repair.summary',
                  'Resolve the blocking models here, then run one more readiness check before the next compare.'
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
                <span className="rounded-full border border-[rgba(255,123,134,0.24)] bg-[rgba(255,255,255,0.08)] px-2.5 py-1 text-[color:var(--ps-danger)]">
                  {attentionReports.length}{' '}
                  {attentionReports.length === 1
                    ? t('readiness.repair.blockerSingle', 'model needs attention')
                    : t('readiness.repair.blockerPlural', 'models need attention')}
                </span>
                {attentionReports.slice(0, 3).map(({ model }) => (
                  <span
                    key={model}
                    className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-[color:var(--ps-text-muted)]"
                  >
                    {model}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,123,134,0.24)] bg-[rgba(255,255,255,0.08)] px-3 py-2 text-xs font-medium text-[color:var(--ps-danger)] transition-colors hover:bg-[rgba(255,123,134,0.16)]"
              onClick={() => setShowRepairDetails((open) => !open)}
              aria-expanded={showRepairDetails}
            >
              {showRepairDetails ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span>
                {showRepairDetails
                  ? t('readiness.repair.hideDetails', 'Hide repair details')
                  : t('readiness.repair.showDetails', 'Review repair steps')}
              </span>
            </button>
          </div>

          {showRepairDetails && (
            <div className="mt-4">
              <div className="mb-3 flex flex-wrap gap-2">
                {repairGuideLinks.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                    onClick={() => window.open(link.href, '_blank', 'noopener,noreferrer')}
                  >
                    <ArrowUpRight size={13} />
                    <span>{t(`readiness.repair.guideLink.${link.id}`, link.fallbackLabel)}</span>
                  </button>
                ))}
                {onOpenSettings && (
                  <button
                    type="button"
                    className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                    onClick={onOpenSettings}
                  >
                    <Settings2 size={13} />
                    <span>{t('readiness.repair.modelHealth', 'Open model health')}</span>
                  </button>
                )}
              </div>

              <div className="grid gap-3 xl:grid-cols-2">
                {attentionReports.map(({ model, report }) => {
                  const copy = getRepairCopy(report, t);
                  const canOpenModel =
                    report.status !== READINESS_STATUSES.TAB_LOADING &&
                    report.status !== READINESS_STATUSES.READY;

                  return (
                    <article
                      key={model}
                      data-testid={`readiness-repair-${model}`}
                      className="rounded-[1.45rem] border border-[color:var(--ps-border)] bg-[rgba(10,12,18,0.86)] p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-[color:var(--ps-text)]">{model}</p>
                          <p className="mt-1 text-sm font-medium text-[color:var(--ps-danger)]">{copy.title}</p>
                          <p className="mt-2 text-sm leading-6 text-[color:var(--ps-text-muted)]">{copy.body}</p>
                        </div>
                        <span
                          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em] ${getStatusTone(report)}`}
                        >
                          {getStatusLabel(report, t)}
                        </span>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2">
                        {canOpenModel && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.12)] px-3 py-2 text-xs font-medium text-[color:var(--ps-danger)] transition-colors hover:bg-[rgba(255,123,134,0.18)]"
                            onClick={() =>
                              window.open(
                                getModelConfig(model).openUrl,
                                '_blank',
                                'noopener,noreferrer'
                              )
                            }
                          >
                            <ArrowUpRight size={13} />
                            <span>{t('readiness.repair.openModel', 'Open model tab')}</span>
                          </button>
                        )}
                        <button
                          type="button"
                          className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                          onClick={() => {
                            void refreshModelReadiness([model]);
                          }}
                        >
                          <RefreshCcw
                            size={13}
                            className={isCheckingReadiness ? 'animate-spin' : ''}
                          />
                          <span>{t('readiness.repair.recheckModel', 'Re-check this model')}</span>
                        </button>
                      </div>

                      <div className="mt-3 flex flex-wrap gap-2 text-[11px]">
                        {report.hostname && (
                          <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 font-medium text-[color:var(--ps-text-muted)]">
                            {t('readiness.repair.currentHost', 'Current host')}: {report.hostname}
                          </span>
                        )}
                        {report.failureClass && (
                          <span className="rounded-full border border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.12)] px-2.5 py-1 font-medium text-[color:var(--ps-danger)]">
                            {t('readiness.repair.failureClass', 'Failure')}:{' '}
                            {formatFailureClass(report.failureClass, (key, defaultValue) =>
                              t(key, defaultValue)
                            )}
                          </span>
                        )}
                        {report.selectorSource && (
                          <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 font-medium text-[color:var(--ps-text-muted)]">
                            {t('readiness.repair.selectors', 'Selectors')}:{' '}
                            {formatSelectorSource(report.selectorSource, (key, defaultValue) =>
                              t(key, defaultValue)
                            )}
                          </span>
                        )}
                        {report.inputReady !== undefined && (
                          <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 font-medium text-[color:var(--ps-text-muted)]">
                            {t('readiness.repair.input', 'Input')}:{' '}
                            {report.inputReady
                              ? t('readiness.repair.readyShort', 'ready')
                              : t('readiness.repair.missingShort', 'missing')}
                          </span>
                        )}
                        {report.submitReady !== undefined && (
                          <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 font-medium text-[color:var(--ps-text-muted)]">
                            {t('readiness.repair.submit', 'Submit')}:{' '}
                            {report.submitReady
                              ? t('readiness.repair.readyShort', 'ready')
                              : t('readiness.repair.missingShort', 'missing')}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
