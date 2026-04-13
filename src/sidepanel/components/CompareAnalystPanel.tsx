import { useMemo } from 'react';
import {
  AlertTriangle,
  Bot,
  Copy,
  ExternalLink,
  RefreshCcw,
  Sparkles,
  Wand2,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { SETTINGS_OPEN_EVENT } from '../utils/shouldOpenSettingsFromUrl';
import { useSettings } from '../hooks/useSettings';
import {
  ANALYSIS_BLOCK_REASONS,
  ANALYSIS_STATUSES,
  getAnalysisProvider,
} from '../../services/analysis';
import { getMessageDeliveryStatus } from '../../utils/messages';
import type { Message, ModelName } from '../../utils/types';
import { useStore } from '../store';
import { getModelConfig } from '../../utils/modelConfig';
import { formatReadinessStatus } from '../utils/runtimeLabels';

type AnalystLabelTone = 'decision' | 'needsRun' | 'seed';

const analystLabelClasses: Record<AnalystLabelTone, string> = {
  decision:
    'border-[rgba(83,196,143,0.28)] bg-[rgba(83,196,143,0.12)] text-[color:var(--ps-success)]',
  needsRun:
    'border-[rgba(243,192,107,0.28)] bg-[rgba(243,192,107,0.12)] text-[color:var(--ps-warning)]',
  seed: 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] text-[color:var(--ps-text-muted)]',
};

const AnalystLabel = ({
  label,
  tone,
}: {
  label: string;
  tone: AnalystLabelTone;
}) => (
  <span
    className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold ${analystLabelClasses[tone]}`}
  >
    {label}
  </span>
);

const copyText = async (text: string) => {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
};

interface CompareAnalystPanelProps {
  turnId: string;
  requestedModels: ModelName[];
  responses: Partial<Record<ModelName, Message>>;
  followUpModels: ModelName[];
}

export const CompareAnalystPanel = ({
  turnId,
  requestedModels,
  responses,
  followUpModels,
}: CompareAnalystPanelProps) => {
  const { t } = useTranslation();
  const settings = useSettings();
  const provider = getAnalysisProvider(settings.analysis.provider);
  const storedAnalysis = useStore((state) => state.analysisByTurn[turnId]);
  const runCompareAnalysis = useStore((state) => state.runCompareAnalysis);
  const setInput = useStore((state) => state.setInput);
  const setSelectedModelsForCurrentSession = useStore(
    (state) => state.setSelectedModelsForCurrentSession
  );
  const modelReadiness = useStore((state) => state.modelReadiness);
  const refreshModelReadiness = useStore((state) => state.refreshModelReadiness);

  const analysis = storedAnalysis ?? {
    status: ANALYSIS_STATUSES.IDLE,
    provider: settings.analysis.provider,
    model: settings.analysis.model,
    updatedAt: 0,
  };

  const completedResponses = useMemo(
    () =>
      requestedModels.filter((model) => {
        const response = responses[model];
        return response && getMessageDeliveryStatus(response) === 'complete';
      }),
    [requestedModels, responses]
  );

  const openAnalysisSettings = () => {
    window.dispatchEvent(new Event(SETTINGS_OPEN_EVENT));
  };

  const analystModel = settings.analysis.model as ModelName;
  const analystReadiness = modelReadiness[analystModel];
  const providerBlocked = provider ? !provider.availableInBrowserBuild : true;
  const usingRuntimeLane = settings.analysis.provider === 'switchyard_runtime';
  const providerLabel =
    usingRuntimeLane
      ? t('settings.analysis.byokTitle', 'Local Switchyard runtime')
      : settings.analysis.provider === 'browser_session'
        ? t('settings.analysis.browserSessionTitle', 'Browser-session analyst')
        : settings.analysis.provider;
  const providerAvailabilityReason =
    usingRuntimeLane
      ? t(
          'settings.analysis.byokBody',
          'This lane needs a local Switchyard service plus a compatible runtime-backed provider session before Prompt Switchboard can use it.'
        )
      : provider?.availabilityReason;
  const needsTwoAnswers = completedResponses.length < 2;
  const analysisResult =
    analysis.status === ANALYSIS_STATUSES.SUCCESS ? analysis.result : undefined;
  const recommendedResponse =
    analysisResult?.recommendedAnswerModel
      ? responses[analysisResult.recommendedAnswerModel]
      : undefined;
  const stateLabel = analysisResult
    ? t('analysis.state.ready', 'Decision guidance ready')
    : t('analysis.state.needsRun', 'Needs analyst run');
  const showPrimaryRunAction =
    settings.analysis.enabled &&
    !providerBlocked &&
    (analysis.status === ANALYSIS_STATUSES.IDLE || analysis.status === ANALYSIS_STATUSES.SUCCESS);

  if (needsTwoAnswers) {
    return (
      <section className="rounded-[1.4rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-4 py-4">
        <div className="flex items-center gap-2">
          <Bot className="text-[color:var(--ps-text-muted)]" size={16} />
          <p className="text-sm font-semibold text-[color:var(--ps-text)]">
            {t('analysis.title', 'AI Compare Analyst')}
          </p>
        </div>
        <p className="mt-2 text-sm text-[color:var(--ps-text-muted)]">
          {t(
            'analysis.empty',
            'Wait until at least two model answers are complete before running AI Compare Analyst.'
          )}
        </p>
      </section>
    );
  }

  return (
    <section
      className="ps-shell-panel rounded-[1.4rem] px-4 py-4"
      data-testid={`compare-analyst-panel-${turnId}`}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="ps-eyebrow">
            {t('analysis.eyebrow', 'AI Compare Analyst')}
          </p>
          <h3 className="mt-1 text-sm font-semibold text-[color:var(--ps-text)]">
            {t('analysis.title', 'Turn compare results into the next move')}
          </h3>
          <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
            {providerBlocked
              ? t(
                  'analysis.boundaryBlocked',
                  'Core compare stays local-first. Prompt Switchboard only exposes runtime-backed analysis when the local runtime lane is truly available.'
                )
              : usingRuntimeLane
                ? t(
                    'analysis.runtimeBoundary',
                    'Core compare stays browser-native. This optional lane sends one analysis prompt through a local Switchyard runtime while Prompt Switchboard keeps the cockpit, tabs, and compare workflow.'
                  )
                : t(
                  'analysis.boundary',
                  'Core compare stays local-first. The analyst runs one structured prompt through your chosen browser tab and keeps the result inside this workspace.'
                )}
          </p>
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-medium">
            <span className="rounded-full border border-[rgba(138,155,255,0.28)] bg-[rgba(138,155,255,0.12)] px-2.5 py-1 text-[color:var(--ps-focus)]">
              {t('analysis.modeLabel', 'Lane')}: {providerLabel}
            </span>
            <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2.5 py-1 text-[color:var(--ps-text-muted)]">
              {t('analysis.modelLabel', 'Analyst model')}: {analystModel}
            </span>
            <AnalystLabel
              label={stateLabel}
              tone={analysisResult ? 'decision' : 'needsRun'}
            />
          </div>
          <p className="mt-3 text-sm text-[color:var(--ps-text-muted)]">
            {analysisResult
              ? t(
                  'analysis.role.ready',
                  'This panel is a decision checkpoint. It suggests the next move, but you still choose what to send.'
                )
              : t(
                  'analysis.role.pending',
                  'Run the analyst when you want decision guidance. Until then, compare stays a manual review step.'
                )}
          </p>
        </div>

        {showPrimaryRunAction && (
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(138,155,255,0.28)] bg-[rgba(138,155,255,0.12)] px-3 py-2 text-xs font-medium text-[color:var(--ps-focus)] transition-colors hover:bg-[rgba(138,155,255,0.18)]"
              onClick={() => {
                void runCompareAnalysis(turnId);
              }}
            >
              <Wand2 size={14} />
              <span>{t('analysis.run', 'Analyze compare')}</span>
            </button>
          )}
      </div>

      {(!settings.analysis.enabled ||
        providerBlocked ||
        (analysis.status === ANALYSIS_STATUSES.BLOCKED &&
          analysis.blockReason === ANALYSIS_BLOCK_REASONS.PROVIDER_BLOCKED)) && (
        <div className="mt-4 rounded-2xl border border-[rgba(243,192,107,0.24)] bg-[rgba(255,255,255,0.05)] px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <AnalystLabel
              label={t('analysis.state.needsRun', 'Needs analyst run')}
              tone="needsRun"
            />
            <p className="text-sm font-semibold text-[color:var(--ps-text)]">
              {providerBlocked
                ? usingRuntimeLane
                  ? t('analysis.blocked.runtimeTitle', 'The local Switchyard runtime lane is not ready')
                  : t('analysis.blocked.title', 'Direct BYOK analysis is gated in this build')
                : t('analysis.disabled.title', 'AI Compare Analyst is turned off')}
            </p>
          </div>
          <p className="mt-2 text-sm text-[color:var(--ps-text-muted)]">
            {providerBlocked
              ? providerAvailabilityReason ??
                t(
                  'analysis.blocked.body',
                  'Prompt Switchboard keeps the BYOK lane disabled here because provider guidance says browser builds should not ship production API keys client-side.'
                )
              : t(
                  'analysis.disabled.body',
                  'Turn the analyst back on in settings when you want an extra compare-result summary lane.'
                )}
          </p>
          <div className="mt-3">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-[rgba(243,192,107,0.28)] bg-[rgba(243,192,107,0.12)] px-3 py-2 text-xs font-medium text-[color:var(--ps-warning)] transition-colors hover:bg-[rgba(243,192,107,0.18)]"
              onClick={openAnalysisSettings}
            >
              <Sparkles size={14} />
              <span>{t('analysis.blocked.cta', 'Open analysis settings')}</span>
            </button>
          </div>
        </div>
      )}

      {analysis.status === ANALYSIS_STATUSES.BLOCKED &&
        analysis.blockReason === ANALYSIS_BLOCK_REASONS.MODEL_NOT_READY && (
        <div className="mt-4 rounded-2xl border border-amber-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-amber-700">
            <AlertTriangle size={16} />
            <AnalystLabel
              label={t('analysis.state.needsRun', 'Needs analyst run')}
              tone="needsRun"
            />
            <p className="text-sm font-semibold">
              {t('analysis.modelBlocked.title', 'The analyst tab is not ready yet')}
            </p>
            </div>
            <p className="mt-2 text-sm text-slate-600">
              {analysis.errorMessage ||
                t(
                  'analysis.modelBlocked.body',
                  'Open the selected analyst model in a normal signed-in tab, then run one more readiness check before starting the analysis lane.'
                )}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 transition-colors hover:bg-amber-100"
                onClick={() =>
                  window.open(getModelConfig(analystModel).openUrl, '_blank', 'noopener,noreferrer')
                }
              >
                <ExternalLink size={14} />
                <span>{t('analysis.modelBlocked.open', 'Open analyst tab')}</span>
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => {
                  void refreshModelReadiness([analystModel]);
                }}
              >
                <RefreshCcw size={14} />
                <span>{t('analysis.modelBlocked.refresh', 'Check analyst readiness')}</span>
              </button>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-medium text-slate-600">
                {t('analysis.modelBlocked.state', 'Latest readiness')}:&nbsp;
                {analystReadiness
                  ? formatReadinessStatus(analystReadiness.status, (key, defaultValue) =>
                      t(key, defaultValue)
                    )
                  : t('readiness.unchecked', 'No live tab checked yet')}
              </span>
            </div>
          </div>
        )}

      {analysis.status === ANALYSIS_STATUSES.RUNNING && (
        <div className="mt-4 rounded-2xl border border-sky-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center gap-2 text-sky-700">
            <RefreshCcw size={16} className="animate-spin" />
            <AnalystLabel
              label={t('analysis.state.needsRun', 'Needs analyst run')}
              tone="needsRun"
            />
            <p className="text-sm font-semibold">
              {t('analysis.loading.title', 'Analyzing this compare turn')}
            </p>
          </div>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>{t('analysis.loading.consensus', 'Summarizing consensus across the completed answers')}</li>
            <li>{t('analysis.loading.disagreement', 'Looking for meaningful disagreement, not just length differences')}</li>
            <li>{t('analysis.loading.nextQuestion', 'Drafting the strongest next question for the follow-up round')}</li>
          </ul>
        </div>
      )}

      {analysis.status === ANALYSIS_STATUSES.ERROR && (
        <div className="mt-4 rounded-2xl border border-rose-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <AnalystLabel
              label={t('analysis.state.needsRun', 'Needs analyst run')}
              tone="needsRun"
            />
            <p className="text-sm font-semibold text-slate-900">
              {t('analysis.failure.title', 'AI analysis did not finish')}
            </p>
          </div>
          <p className="mt-2 text-sm text-slate-600">
            {analysis.errorMessage ||
              (usingRuntimeLane
                ? t(
                    'analysis.failure.runtimeLane',
                    'The local Switchyard runtime lane could not finish this request.'
                  )
                : t(
                    'analysis.failure.runtime',
                    'The browser-session analysis lane could not finish this request.'
                  ))}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-100"
              onClick={() => {
                void runCompareAnalysis(turnId);
              }}
            >
              <RefreshCcw size={14} />
              <span>{t('analysis.failure.retry', 'Try analysis again')}</span>
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
              onClick={openAnalysisSettings}
            >
              <Sparkles size={14} />
              <span>{t('analysis.failure.settings', 'Open analysis settings')}</span>
            </button>
          </div>
        </div>
      )}

      {analysisResult && (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white px-4 py-4">
          <div className="flex flex-wrap items-center gap-2">
            <AnalystLabel
              label={t('analysis.state.guidance', 'Decision guidance')}
              tone="decision"
            />
            <p className="text-sm font-semibold text-slate-900">
              {analysisResult.consensusSummary}
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <AnalystLabel
                label={t('analysis.state.guidance', 'Decision guidance')}
                tone="decision"
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                {t('analysis.recommendedAnswer', 'Recommended answer')}
              </p>
            </div>
            <p className="mt-2 text-sm font-semibold text-slate-900">
              {analysisResult.recommendedAnswerModel
                ? t(
                    'analysis.recommendedAnswerModel',
                    '{{model}} is the strongest answer to continue from right now.',
                    {
                      model: analysisResult.recommendedAnswerModel,
                    }
                  )
                : t(
                    'analysis.recommendedAnswerNone',
                    'No single answer is reliable enough to recommend yet.'
                  )}
            </p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              {analysisResult.recommendationReason}
            </p>
          </div>

          <div className="mt-4 rounded-2xl border border-indigo-100 bg-indigo-50/70 px-4 py-4">
            <div className="flex flex-wrap items-center gap-2">
              <AnalystLabel
                label={t('analysis.state.guidance', 'Decision guidance')}
                tone="decision"
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-indigo-600">
                {t('analysis.nextQuestion', 'Suggested next question')}
              </p>
            </div>
            <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-slate-800">
              {analysisResult.nextQuestion}
            </p>
          </div>

          <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">
              {t('analysis.details', 'Why this suggestion')}
            </summary>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {t('analysis.consensus', 'Consensus')}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {analysisResult.consensusSummary}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {t('analysis.disagreement', 'Disagreement')}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {analysisResult.disagreementSummary}
                </p>
              </div>
              <div className="rounded-2xl border border-slate-100 bg-white px-4 py-3 lg:col-span-2">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                  {t('analysis.recommendationReason', 'Why this answer is recommended')}
                </p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  {analysisResult.recommendationReason}
                </p>
              </div>
            </div>
          </details>

          {analysisResult.synthesisDraft && (
            <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
              <summary className="cursor-pointer text-sm font-semibold text-slate-900">
                {t('analysis.synthesis', 'Synthesis draft')}
              </summary>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-slate-700">
                {analysisResult.synthesisDraft}
              </p>
            </details>
          )}

          <div className="mt-4 rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
              {t('analysis.actions.workflowTitle', 'Primary next-step path')}
            </p>
            <p className="mt-2 text-sm leading-6 text-sky-900">
              {t(
                'analysis.actions.workflowHint',
                'Use the workflow panel to stage or run the next compare. The actions below only prepare guidance and seed text.'
              )}
            </p>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <div className="rounded-2xl border border-indigo-100 bg-indigo-50/60 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <AnalystLabel
                  label={t('analysis.state.seed', 'Seed only')}
                  tone="seed"
                />
                <p className="text-sm font-semibold text-slate-900">
                  {t('analysis.actions.nextQuestionTitle', 'Follow-up question')}
                </p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {t(
                  'analysis.actions.nextQuestionBody',
                  'Prepares the strongest next prompt in the composer for the selected follow-up models. You still choose when to send it.'
                )}
              </p>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs font-medium text-indigo-700 transition-colors hover:bg-indigo-100"
                onClick={() => {
                  setSelectedModelsForCurrentSession(followUpModels);
                  setInput(analysisResult.nextQuestion);
                }}
              >
                <Wand2 size={14} />
                <span>{t('analysis.actions.useNextQuestion', 'Seed next compare with suggested question')}</span>
              </button>
            </div>

            {analysisResult.recommendedAnswerModel && recommendedResponse?.text.trim() && (
              <div className="rounded-2xl border border-emerald-100 bg-emerald-50/60 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <AnalystLabel
                    label={t('analysis.state.seed', 'Seed only')}
                    tone="seed"
                  />
                  <p className="text-sm font-semibold text-slate-900">
                    {t('analysis.actions.recommendedTitle', 'Recommended answer lane')}
                  </p>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {t(
                    'analysis.actions.recommendedBody',
                    'Prepares the recommended answer in the composer as a next-round seed. It is guidance, not a final verdict.'
                  )}
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 transition-colors hover:bg-emerald-100"
                  onClick={() => {
                    setSelectedModelsForCurrentSession([analysisResult.recommendedAnswerModel!]);
                    setInput(recommendedResponse.text);
                  }}
                >
                  <Sparkles size={14} />
                  <span>
                    {t('analysis.actions.useRecommendedAnswer', 'Seed next compare from recommended answer')}
                  </span>
                </button>
              </div>
            )}

            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
              <div className="flex flex-wrap items-center gap-2">
                <AnalystLabel
                  label={t('analysis.state.notes', 'Notes only')}
                  tone="seed"
                />
                <p className="text-sm font-semibold text-slate-900">
                  {t('analysis.actions.copyTitle', 'Copy summary')}
                </p>
              </div>
              <p className="mt-2 text-sm text-slate-600">
                {t(
                  'analysis.actions.copyBody',
                  'Copies notes only. It does not change the active workflow lane.'
                )}
              </p>
              <button
                type="button"
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                onClick={() => {
                  void copyText(
                    [
                      analysisResult.consensusSummary,
                      analysisResult.disagreementSummary,
                      analysisResult.recommendedAnswerModel
                        ? `${analysisResult.recommendedAnswerModel}: ${analysisResult.recommendationReason}`
                        : analysisResult.recommendationReason,
                      analysisResult.nextQuestion,
                    ].join('\n\n')
                  );
                }}
              >
                <Copy size={14} />
                <span>{t('analysis.actions.copySummary', 'Copy decision guidance')}</span>
              </button>
            </div>

            {analysisResult.synthesisDraft && (
              <div className="rounded-2xl border border-slate-200 bg-slate-50/70 px-4 py-4">
                <div className="flex flex-wrap items-center gap-2">
                  <AnalystLabel
                    label={t('analysis.state.seed', 'Seed only')}
                    tone="seed"
                  />
                  <p className="text-sm font-semibold text-slate-900">
                    {t('analysis.actions.synthesisTitle', 'Synthesis draft')}
                  </p>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {t(
                    'analysis.actions.synthesisBody',
                    'Stages a reusable draft in the composer. You still decide whether to send it.'
                  )}
                </p>
                <button
                  type="button"
                  className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50"
                  onClick={() => {
                    setInput(analysisResult.synthesisDraft ?? '');
                    setSelectedModelsForCurrentSession(followUpModels);
                  }}
                >
                  <Sparkles size={14} />
                  <span>{t('analysis.actions.useSynthesis', 'Seed next compare with synthesis draft')}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
