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
    return 'border-amber-200 bg-amber-50 text-amber-700';
  }

  if (report.ready) {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  }

  return 'border-rose-200 bg-rose-50 text-rose-700';
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
}

export const ReadinessPanel: React.FC<ReadinessPanelProps> = ({ models, onOpenSettings }) => {
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

  const hasBlockingIssue = models.some((model) => {
    const report = modelReadiness[model];
    if (!report) return false;
    if (report.status === READINESS_STATUSES.TAB_LOADING) return false;
    return !report.ready;
  });

  return (
    <section
      className="border-b border-rose-100/80 bg-white/70 px-4 py-3 backdrop-blur-sm"
      data-testid="readiness-panel"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-fuchsia-600">
            {t('readiness.eyebrow', 'Model readiness')}
          </p>
          <div className="mt-1 flex items-center gap-2 text-sm text-slate-600">
            {hasBlockingIssue ? (
              <TriangleAlert size={14} className="text-rose-500" />
            ) : (
              <ShieldCheck size={14} className="text-emerald-600" />
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
          className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-white px-3 py-2 text-xs font-medium text-slate-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-70"
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
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/80 text-slate-700">
                {getModelIcon(model, 'h-3 w-3')}
              </span>
              <span>{model}</span>
              <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em]">
                {getStatusLabel(report, t)}
              </span>
            </div>
          );
        })}
      </div>

      {attentionReports.length > 0 && (
        <div className="mt-4 rounded-[1.45rem] border border-rose-100 bg-rose-50/55 px-4 py-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-rose-700">
                {t('readiness.repair.eyebrow', 'Repair center')}
              </p>
              <p className="mt-1 text-sm text-slate-700">
                {t(
                  'readiness.repair.summary',
                  'Resolve the blocking models here, then run one more readiness check before the next compare.'
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-medium">
                <span className="rounded-full border border-rose-200 bg-white px-2.5 py-1 text-rose-700">
                  {attentionReports.length}{' '}
                  {attentionReports.length === 1
                    ? t('readiness.repair.blockerSingle', 'model needs attention')
                    : t('readiness.repair.blockerPlural', 'models need attention')}
                </span>
                {attentionReports.slice(0, 3).map(({ model }) => (
                  <span
                    key={model}
                    className="rounded-full border border-white/90 bg-white/80 px-2.5 py-1 text-slate-600"
                  >
                    {model}
                  </span>
                ))}
              </div>
            </div>

            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
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
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                    onClick={() => window.open(link.href, '_blank', 'noopener,noreferrer')}
                  >
                    <ArrowUpRight size={13} />
                    <span>{t(`readiness.repair.guideLink.${link.id}`, link.fallbackLabel)}</span>
                  </button>
                ))}
                {onOpenSettings && (
                  <button
                    type="button"
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
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
                      className="rounded-[1.45rem] border border-rose-100 bg-white/90 p-4 shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-slate-900">{model}</p>
                          <p className="mt-1 text-sm font-medium text-rose-800">{copy.title}</p>
                          <p className="mt-2 text-sm leading-6 text-slate-600">{copy.body}</p>
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
                            className="inline-flex items-center gap-2 rounded-full border border-rose-100 bg-rose-50/80 px-3 py-2 text-xs font-medium text-rose-800 transition-colors hover:bg-rose-100"
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
                          className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
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
                          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
                            {t('readiness.repair.currentHost', 'Current host')}: {report.hostname}
                          </span>
                        )}
                        {report.failureClass && (
                          <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 font-medium text-rose-700">
                            {t('readiness.repair.failureClass', 'Failure')}:{' '}
                            {formatFailureClass(report.failureClass, (key, defaultValue) =>
                              t(key, defaultValue)
                            )}
                          </span>
                        )}
                        {report.selectorSource && (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
                            {t('readiness.repair.selectors', 'Selectors')}:{' '}
                            {formatSelectorSource(report.selectorSource, (key, defaultValue) =>
                              t(key, defaultValue)
                            )}
                          </span>
                        )}
                        {report.inputReady !== undefined && (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
                            {t('readiness.repair.input', 'Input')}:{' '}
                            {report.inputReady
                              ? t('readiness.repair.readyShort', 'ready')
                              : t('readiness.repair.missingShort', 'missing')}
                          </span>
                        )}
                        {report.submitReady !== undefined && (
                          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-medium text-slate-600">
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
