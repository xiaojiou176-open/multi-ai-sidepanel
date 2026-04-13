import { useMemo } from 'react';
import {
  ArrowUpRight,
  Copy,
  Download,
  ExternalLink,
  Gavel,
  Repeat2,
  ShieldCheck,
  Sparkles,
  Workflow,
  RefreshCcw,
  Wand2,
  CheckCircle2,
  CircleDashed,
  AlertTriangle,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { getModelIcon } from '../../assets/icons/getModelIcon';
import { MODEL_ORDER, getModelConfig } from '../../utils/modelConfig';
import { buildCompareTurns, getMessageDeliveryStatus } from '../../utils/messages';
import { buildCompareInsightSummary, buildCompareRunTimeline } from '../utils/compareInsights';
import { buildDisagreementAnalysis } from '../utils/disagreementAnalyzer';
import { buildJudgePrompt } from '../utils/judgePromptBuilder';
import { buildCompareMarkdownExport, buildCompareShareSummary } from '../utils/compareExport';
import { getPromptPacks, getStarterPrompts } from '../utils/promptPacks';
import {
  formatFailureClass,
  formatReadinessStatus,
  formatSelectorSource,
} from '../utils/runtimeLabels';
import { useStore } from '../store';
import { CompareAnalystPanel } from './CompareAnalystPanel';
import { WorkflowPanel } from './WorkflowPanel';
import {
  BUILDER_GUIDE_LINKS,
  ESSENTIAL_GUIDE_LINKS,
  REPAIR_GUIDE_LINKS,
  buildPublicDocUrl,
} from '../utils/publicDocs';
import {
  DELIVERY_STATUS,
  type DeliveryDiagnostics,
  type DeliveryStatus,
  type Message,
} from '../../utils/types';

interface CompareViewProps {
  messages: Message[];
}

const essentialQuickstartLinks = ESSENTIAL_GUIDE_LINKS.map((link) => ({
  ...link,
  url: buildPublicDocUrl(link.path),
}));

const builderQuickstartLinks = BUILDER_GUIDE_LINKS.map((link) => ({
  ...link,
  url: buildPublicDocUrl(link.path),
}));

const blockedStateGuideLinks = REPAIR_GUIDE_LINKS.map((link) => ({
  ...link,
  url: buildPublicDocUrl(link.path),
}));

const statusClassNames: Record<DeliveryStatus, string> = {
  [DELIVERY_STATUS.PENDING]: 'border border-amber-200 bg-amber-50 text-amber-700',
  [DELIVERY_STATUS.STREAMING]: 'border border-sky-200 bg-sky-50 text-sky-700',
  [DELIVERY_STATUS.COMPLETE]: 'border border-emerald-200 bg-emerald-50 text-emerald-700',
  [DELIVERY_STATUS.ERROR]: 'border border-rose-200 bg-rose-50 text-rose-700',
};

const getStatusLabel = (status: DeliveryStatus, t: ReturnType<typeof useTranslation>['t']) => {
  switch (status) {
    case DELIVERY_STATUS.PENDING:
      return t('compare.status.pending', 'Pending');
    case DELIVERY_STATUS.STREAMING:
      return t('compare.status.streaming', 'Streaming');
    case DELIVERY_STATUS.ERROR:
      return t('compare.status.error', 'Failed');
    case DELIVERY_STATUS.COMPLETE:
    default:
      return t('compare.status.complete', 'Complete');
  }
};

const copyToClipboard = async (text: string) => {
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

const downloadTextFile = (filename: string, text: string) => {
  const blob = new Blob([text], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
};

const getStageMeta = (stage: string | undefined, t: ReturnType<typeof useTranslation>['t']) => {
  switch (stage) {
    case 'content_ready_handshake':
      return {
        label: t('compare.diagnostics.stage', 'Stage'),
        value: t('compare.diagnostics.stageHandshake', 'handshake'),
      };
    case 'content_execute_prompt':
      return {
        label: t('compare.diagnostics.stage', 'Stage'),
        value: t('compare.diagnostics.stageExecution', 'execution'),
      };
    case 'delivery':
      return {
        label: t('compare.diagnostics.stage', 'Stage'),
        value: t('compare.diagnostics.stageDelivery', 'delivery'),
      };
    default:
      return stage
        ? {
            label: t('compare.diagnostics.stage', 'Stage'),
            value: stage,
          }
        : null;
  }
};

const buildDiagnosticRows = (
  diagnostics: DeliveryDiagnostics | undefined,
  t: ReturnType<typeof useTranslation>['t']
) => {
  if (!diagnostics) return [];

  const rows: Array<{ label: string; value: string }> = [];
  const stageMeta = getStageMeta(diagnostics.stage, t);

  if (stageMeta) {
    rows.push(stageMeta);
  }

  if (diagnostics.readinessStatus) {
    rows.push({
      label: t('compare.diagnostics.readiness', 'Readiness'),
      value: formatReadinessStatus(diagnostics.readinessStatus, (key, defaultValue) =>
        t(key, defaultValue)
      ),
    });
  }

  if (diagnostics.failureClass) {
    rows.push({
      label: t('compare.diagnostics.failureClass', 'Failure class'),
      value: formatFailureClass(diagnostics.failureClass, (key, defaultValue) =>
        t(key, defaultValue)
      ),
    });
  }

  if (diagnostics.selectorSource) {
    rows.push({
      label: t('compare.diagnostics.selectors', 'Selectors'),
      value: formatSelectorSource(diagnostics.selectorSource, (key, defaultValue) =>
        t(key, defaultValue)
      ),
    });
  }

  if (diagnostics.hostname) {
    rows.push({
      label: t('compare.diagnostics.host', 'Host'),
      value: diagnostics.hostname,
    });
  }

  if (diagnostics.remoteConfigConfigured !== undefined) {
    rows.push({
      label: t('compare.diagnostics.remoteConfig', 'Remote config'),
      value: diagnostics.remoteConfigConfigured
        ? t('compare.diagnostics.configured', 'configured')
        : t('compare.diagnostics.notConfigured', 'not configured'),
    });
  }

  if (diagnostics.inputReady !== undefined) {
    rows.push({
      label: t('compare.diagnostics.input', 'Input'),
      value: diagnostics.inputReady
        ? t('compare.diagnostics.readyShort', 'ready')
        : t('compare.diagnostics.missingShort', 'missing'),
    });
  }

  if (diagnostics.submitReady !== undefined) {
    rows.push({
      label: t('compare.diagnostics.submit', 'Submit'),
      value: diagnostics.submitReady
        ? t('compare.diagnostics.readyShort', 'ready')
        : t('compare.diagnostics.missingShort', 'missing'),
    });
  }

  return rows;
};

const timelineStateClassNames = {
  done: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  current: 'border-sky-200 bg-sky-50 text-sky-700',
  blocked: 'border-rose-200 bg-rose-50 text-rose-700',
  upcoming: 'border-slate-200 bg-slate-50 text-slate-500',
};

export const CompareView = ({ messages }: CompareViewProps) => {
  const { t } = useTranslation();
  const promptPacks = getPromptPacks((key, defaultValue) => t(key, defaultValue));
  const starterPrompts = getStarterPrompts((key, defaultValue) => t(key, defaultValue));
  const turns = useMemo(() => buildCompareTurns(messages), [messages]);
  const retryTurnForModels = useStore((state) => state.retryTurnForModels);
  const setInput = useStore((state) => state.setInput);
  const selectedModels = useStore((state) => state.selectedModels);
  const modelReadiness = useStore((state) => state.modelReadiness);
  const refreshModelReadiness = useStore((state) => state.refreshModelReadiness);
  const setSelectedModelsForCurrentSession = useStore(
    (state) => state.setSelectedModelsForCurrentSession
  );
  const analysisByTurn = useStore((state) => state.analysisByTurn);
  const workflowByTurn = useStore((state) => state.workflowByTurn);
  const stageWorkflowFromNextQuestion = useStore((state) => state.stageWorkflowFromNextQuestion);
  const applyWorkflowSeedToComposer = useStore((state) => state.applyWorkflowSeedToComposer);
  const runWorkflowSeedCompare = useStore((state) => state.runWorkflowSeedCompare);

  const readyCount = selectedModels.filter((model) => modelReadiness[model]?.ready).length;
  const blockedModels = selectedModels.filter((model) => {
    const report = modelReadiness[model];
    return report && !report.ready && report.status !== 'tab_loading';
  });
  const blockedReports = blockedModels
    .map((model) => ({ model, report: modelReadiness[model] }))
    .filter(
      (
        entry
      ): entry is {
        model: (typeof selectedModels)[number];
        report: NonNullable<(typeof modelReadiness)[(typeof selectedModels)[number]]>;
      } => Boolean(entry.report)
    );
  const modelsToOpen = selectedModels.length > 0 ? selectedModels : MODEL_ORDER;

  if (turns.length === 0) {
    return (
      <div
        className="h-full overflow-y-auto px-6 py-6"
        data-testid="compare-empty-state"
      >
        <div className="mx-auto flex min-h-full w-full max-w-2xl items-start justify-center">
          <div className="w-full rounded-[2rem] border border-[color:var(--ps-border)] bg-[rgba(12,14,20,0.92)] p-8 text-center shadow-[0_28px_80px_rgba(0,0,0,0.36)]">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl border border-[rgba(255,138,91,0.24)] bg-[linear-gradient(135deg,rgba(255,138,91,0.18),rgba(138,155,255,0.22))] text-white shadow-[0_18px_40px_rgba(0,0,0,0.26)]">
            <Workflow size={28} />
          </div>
          <h2 className="mt-5 text-2xl font-semibold tracking-tight text-[color:var(--ps-text)]">
            {t('compare.emptyTitle', 'Compare multiple AI answers without tab juggling')}
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-7 text-[color:var(--ps-text-muted)]">
            {t('compare.empty', 'Send a prompt to compare model responses side by side.')}
          </p>
          <div className="mt-6 grid gap-4 text-left lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-[1.6rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Wand2 className="text-[color:var(--ps-accent)]" size={18} />
                <p className="text-sm font-semibold text-[color:var(--ps-text)]">
                  {t('compare.onboarding.title', 'First compare checklist')}
                </p>
              </div>
              <div className="mt-4 space-y-3">
                <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  {selectedModels.length > 0 ? (
                    <CheckCircle2 className="mt-0.5 text-[color:var(--ps-success)]" size={18} />
                  ) : (
                    <CircleDashed className="mt-0.5 text-[color:var(--ps-text-muted)]" size={18} />
                  )}
                  <div>
                    <p className="text-sm font-semibold text-[color:var(--ps-text)]">
                      {t('compare.onboarding.stepModels', '1. Pick the models you want to compare')}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                      {selectedModels.length > 0
                        ? t(
                            'compare.onboarding.modelsReady',
                            'You already have models selected. Keep them, or refine the list before the first run.'
                          )
                        : t(
                            'compare.onboarding.modelsMissing',
                            'Start by choosing at least one model from the selector in the header.'
                          )}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  {readyCount > 0 ? (
                    <CheckCircle2 className="mt-0.5 text-[color:var(--ps-success)]" size={18} />
                  ) : blockedModels.length > 0 ? (
                    <AlertTriangle className="mt-0.5 text-[color:var(--ps-danger)]" size={18} />
                  ) : (
                    <CircleDashed className="mt-0.5 text-[color:var(--ps-text-muted)]" size={18} />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[color:var(--ps-text)]">
                      {t('compare.onboarding.stepReady', '2. Make sure at least one tab is ready')}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                      {readyCount > 0
                        ? t(
                            'compare.onboarding.readyCount',
                            '{{count}} selected model looks ready for the first compare run.',
                            { count: readyCount }
                          )
                        : blockedModels.length > 0
                          ? t(
                              'compare.onboarding.readyBlocked',
                              'Some selected models still need attention. Open the right tabs, sign in if needed, then refresh readiness.'
                            )
                          : t(
                              'compare.onboarding.readyUnknown',
                              'Open the sites you want to use, then run a readiness check before sending the first prompt.'
                            )}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          modelsToOpen.forEach((model) =>
                            window.open(getModelConfig(model).openUrl, '_blank', 'noopener,noreferrer')
                          );
                        }}
                        className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                      >
                        <ExternalLink size={14} />
                        <span>{t('compare.onboarding.openTabs', 'Open selected tabs')}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void refreshModelReadiness(modelsToOpen);
                        }}
                        className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                      >
                        <RefreshCcw size={14} />
                        <span>{t('compare.onboarding.refreshReady', 'Check readiness')}</span>
                      </button>
                    </div>
                    {blockedModels.length > 0 && (
                      <div className="mt-3 rounded-2xl border border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.08)] px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[color:var(--ps-danger)]">
                          {t('compare.onboarding.repairHelpTitle', 'Blocked? Start here')}
                        </p>
                        <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                          {t(
                            'compare.onboarding.repairHelpBody',
                            'Use the first compare guide, supported sites page, FAQ, or trust boundary to recover the blocked model before you run readiness again.'
                          )}
                        </p>
                        <div className="mt-3 grid gap-2">
                          {blockedReports.map(({ model, report }) => (
                            <div
                              key={model}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-3 py-3"
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[rgba(255,255,255,0.08)] text-[color:var(--ps-text)]">
                                    {getModelIcon(model, 'h-3 w-3')}
                                  </span>
                                  <span className="text-sm font-semibold text-[color:var(--ps-text)]">{model}</span>
                                  <span className="rounded-full border border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.12)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[color:var(--ps-danger)]">
                                    {formatReadinessStatus(report.status, (key, defaultValue) =>
                                      t(key, defaultValue)
                                    )}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs text-[color:var(--ps-text-muted)]">
                                  {report.hostname
                                    ? t(
                                        'compare.onboarding.repairModelHost',
                                        'Current host: {{hostname}}',
                                        { hostname: report.hostname }
                                      )
                                    : t(
                                        'compare.onboarding.repairModelHostMissing',
                                        'Prompt Switchboard has not confirmed a usable host for this model yet.'
                                      )}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  window.open(
                                    getModelConfig(model).openUrl,
                                    '_blank',
                                    'noopener,noreferrer'
                                  )
                                }
                                className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.12)] px-3 py-2 text-xs font-medium text-[color:var(--ps-danger)] transition-colors hover:bg-[rgba(255,123,134,0.18)]"
                              >
                                <ArrowUpRight size={13} />
                                <span>
                                  {t('compare.onboarding.repairOpenModel', 'Open this model')}
                                </span>
                              </button>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {blockedStateGuideLinks.map((link) => (
                            <button
                              key={link.id}
                              type="button"
                              onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                              className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                            >
                              <ArrowUpRight size={13} />
                              <span>
                                {t(
                                  `compare.onboarding.repairGuideLink.${link.id}`,
                                  link.fallbackLabel
                                )}
                              </span>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] px-4 py-3">
                  <Wand2 className="mt-0.5 text-[color:var(--ps-warning)]" size={18} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-[color:var(--ps-text)]">
                      {t('compare.onboarding.stepPrompt', '3. Start with a prompt that makes differences obvious')}
                    </p>
                    <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                      {t(
                        'compare.onboarding.promptHint',
                        'Pick a question that invites structure, trade-offs, or a rewrite so the compare board is worth reading.'
                      )}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {starterPrompts.map((prompt) => (
                        <button
                          key={prompt}
                          type="button"
                          onClick={() => setInput(prompt)}
                          className="rounded-full border border-[rgba(138,155,255,0.24)] bg-[rgba(138,155,255,0.14)] px-3 py-2 text-xs font-medium text-[color:var(--ps-text-soft)] transition-colors hover:bg-[rgba(138,155,255,0.22)]"
                        >
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid gap-3">
              <div className="rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-4">
                <Wand2 className="text-[color:var(--ps-focus)]" size={18} />
                <p className="mt-3 text-sm font-semibold text-[color:var(--ps-text)]">
                  {t('compare.packsTitle', 'Prompt packs')}
                </p>
                <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                  {t(
                    'compare.packsBody',
                    'Start from reusable compare packs instead of a blank prompt when you want faster, more consistent experiments.'
                  )}
                </p>
                <div className="mt-3 flex flex-col gap-2">
                  {promptPacks.slice(0, 3).map((pack) => (
                    <button
                      key={pack.id}
                      type="button"
                      className="rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-3 py-3 text-left transition-colors hover:bg-[rgba(138,155,255,0.12)]"
                      onClick={() => {
                        setSelectedModelsForCurrentSession(pack.recommendedModels);
                        setInput(pack.prompts[0]?.prompt ?? '');
                      }}
                    >
                      <span className="block text-sm font-semibold text-[color:var(--ps-text)]">{pack.name}</span>
                      <span className="mt-1 block text-xs text-[color:var(--ps-text-muted)]">{pack.description}</span>
                      <span className="mt-2 inline-flex rounded-full border border-[rgba(138,155,255,0.24)] bg-[rgba(138,155,255,0.12)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ps-focus)]">
                        {pack.prompts.length} {t('compare.packPrompts', 'prompts')}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-4">
                <Sparkles className="text-[color:var(--ps-accent)]" size={18} />
                <p className="mt-3 text-sm font-semibold text-[color:var(--ps-text)]">
                  {t('compare.highlight.compareTitle', 'Compare side by side')}
                </p>
                <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                  {t(
                    'compare.highlight.compareBody',
                    'Line up the same prompt across multiple models in one clean board.'
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-4">
                <ShieldCheck className="text-[color:var(--ps-warning)]" size={18} />
                <p className="mt-3 text-sm font-semibold text-[color:var(--ps-text)]">
                  {t('compare.highlight.localTitle', 'Keep it local-first')}
                </p>
                <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                  {t(
                    'compare.highlight.localBody',
                    'Use your existing browser sessions without a hosted relay or account layer.'
                  )}
                </p>
              </div>
              <div className="rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-4">
                <ArrowUpRight className="text-violet-300" size={18} />
                <p className="mt-3 text-sm font-semibold text-[color:var(--ps-text)]">
                  {t('compare.highlight.setupTitle', 'Setup help when you need it')}
                </p>
                <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                  {t(
                    'compare.highlight.setupBody',
                    'Jump straight to the install guide, first compare guide, supported sites list, FAQ, or trust boundary without leaving the compare-first story.'
                  )}
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {essentialQuickstartLinks.map((link) => (
                    <button
                      key={link.id}
                      type="button"
                      onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                      className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                    >
                      <span>{t(`compare.highlight.setupLink.${link.id}`, link.fallbackLabel)}</span>
                    </button>
                  ))}
                </div>
                <div className="mt-5 rounded-2xl border border-dashed border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] p-3">
                  <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-[color:var(--ps-text-muted)]">
                    <CircleDashed size={13} />
                    <span>
                      {t('compare.highlight.builderTitle', 'Builder lane (Optional)')}
                    </span>
                  </div>
                  <p className="mt-2 text-xs font-medium uppercase tracking-[0.12em] text-[color:var(--ps-text-muted)]">
                    {t('compare.highlight.builderKickoff', 'After the first compare succeeds')}
                  </p>
                  <p className="mt-2 text-sm text-[color:var(--ps-text-muted)]">
                    {t(
                      'compare.highlight.builderBody',
                      'MCP starter kits and agent guides are useful after the first compare succeeds, not before.'
                    )}
                  </p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {builderQuickstartLinks.map((link) => (
                      <button
                        key={link.id}
                        type="button"
                        onClick={() => window.open(link.url, '_blank', 'noopener,noreferrer')}
                        className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                      >
                        <span>{t(`compare.highlight.setupLink.${link.id}`, link.fallbackLabel)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <div className="rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-4">
                <ExternalLink className="text-[color:var(--ps-success)]" size={18} />
                <p className="mt-3 text-sm font-semibold text-[color:var(--ps-text)]">
                  {t('compare.highlight.reuseTitle', 'Reuse the tabs you trust')}
                </p>
                <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                  {t(
                    'compare.highlight.reuseBody',
                    'Open the supported AI sites you already use and route one prompt across them.'
                  )}
                </p>
              </div>
            </div>
          </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full space-y-5 overflow-y-auto px-4 py-5 text-[color:var(--ps-text)]" data-testid="compare-view">
      {turns.map((turn, turnIndex) => {
        const requestedModels = turn.userMessage?.requestedModels?.length
          ? turn.userMessage.requestedModels
          : MODEL_ORDER.filter((model) => Boolean(turn.responses[model]));
        const insight = buildCompareInsightSummary(requestedModels, turn.responses);
        const disagreement = buildDisagreementAnalysis(requestedModels, turn.responses, insight);
        const followUpModels =
          disagreement.suggestedModels.length > 0 ? disagreement.suggestedModels : requestedModels;
        const analysisState = analysisByTurn[turn.id];
        const workflowState = workflowByTurn[turn.id];
        const markdownExport = buildCompareMarkdownExport(
          turn,
          requestedModels,
          insight,
          disagreement
        );
        const shareSummary = buildCompareShareSummary(
          turn,
          requestedModels,
          insight,
          disagreement
        );
        const compareDecisionLabel =
          insight.failedCount > 0
            ? t('compare.decisionSnapshot.recoverLabel', 'Recover failed cards first')
            : insight.pendingCount > 0
              ? t('compare.decisionSnapshot.waitLabel', 'Wait for the remaining cards')
              : disagreement.recommendedAction === 'judge'
                ? t('compare.decisionSnapshot.followUpLabel', 'Stage a tighter follow-up compare')
                : t(
                    'compare.decisionSnapshot.exportLabel',
                    'Choose the strongest answer, then export or continue'
                  );
        const compareDecisionBody =
          insight.failedCount > 0
            ? t(
                'compare.decisionSnapshot.recoverBody',
                'This turn already has useful signal, but it is not analyst-ready until the failed cards are retried or intentionally left behind.'
              )
            : insight.pendingCount > 0
              ? t(
                  'compare.decisionSnapshot.waitBody',
                  'Keep the board stable until every important model has answered. Premature analyst work tends to amplify timing noise.'
                )
              : disagreement.recommendedAction === 'judge'
                ? t(
                    'compare.decisionSnapshot.followUpBody',
                    'The answers are complete enough to compare, but not close enough to stop. Use workflow or analyst guidance to shape the next question.'
                  )
                : t(
                    'compare.decisionSnapshot.exportBody',
                    'This board already has enough signal to pick a best-fit answer, continue in the original tab, or carry a readable export outside the side panel.'
                  );
        const analystSnapshotLabel =
          analysisState?.status === 'success'
            ? t('compare.decisionSnapshot.analystReady', 'Analyst guidance is ready')
            : t('compare.decisionSnapshot.analystPending', 'Analyst lane stays optional');
        const analystSnapshotBody =
          analysisState?.status === 'success'
            ? t(
                'compare.decisionSnapshot.analystReadyBody',
                'Use the analyst lane to summarize consensus and disagreement only after the result board already looks worth reading.'
              )
            : t(
                'compare.decisionSnapshot.analystPendingBody',
                'You do not need AI commentary to decide the first next move. The result board and workflow lane should stay understandable on their own.'
              );
        const workflowSnapshotLabel =
          workflowState?.status === 'runnable' || insight.completeCount >= 2
            ? t('compare.decisionSnapshot.workflowReady', 'Workflow seed can be staged')
            : t('compare.decisionSnapshot.workflowWaiting', 'Workflow seed still needs more signal');
        const workflowSnapshotBody =
          workflowState?.status === 'runnable' || insight.completeCount >= 2
            ? workflowState?.nextActionSummary ??
              t(
                'compare.decisionSnapshot.workflowReadyBody',
                'You already have enough completed answers to stage the next compare instead of manually copying context across cards.'
              )
            : t(
                'compare.decisionSnapshot.workflowWaitingBody',
                'Finish at least two usable answers before the staged next-step lane becomes more trustworthy than manual guessing.'
              );

        return (
          <section
            key={turn.id}
            className="overflow-hidden rounded-[2rem] border border-[color:var(--ps-border)] bg-[rgba(12,14,20,0.88)] shadow-[0_20px_50px_rgba(0,0,0,0.3)]"
            data-testid={`compare-turn-${turnIndex}`}
          >
            <div className="border-b border-[color:var(--ps-border)] bg-[linear-gradient(135deg,rgba(255,138,91,0.12),rgba(138,155,255,0.12))] px-5 py-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[color:var(--ps-text-muted)]">
                    {t('compare.turnLabel', 'Prompt comparison')}
                  </span>
                  <span className="inline-flex rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.08)] px-2.5 py-1 text-xs font-medium text-[color:var(--ps-text-muted)] shadow-sm">
                    {requestedModels.length} {t('compare.modelsLabel', 'models')}
                  </span>
                  <span className="inline-flex rounded-full border border-[rgba(83,196,143,0.28)] bg-[rgba(83,196,143,0.12)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ps-success)]">
                    {insight.completeCount} {t('compare.insight.complete', 'complete')}
                  </span>
                  {insight.failedCount > 0 && (
                    <span className="inline-flex rounded-full border border-[rgba(255,123,134,0.28)] bg-[rgba(255,123,134,0.12)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ps-danger)]">
                      {insight.failedCount} {t('compare.insight.failed', 'failed')}
                    </span>
                  )}
                  {insight.pendingCount > 0 && (
                    <span className="inline-flex rounded-full border border-[rgba(243,192,107,0.28)] bg-[rgba(243,192,107,0.12)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ps-warning)]">
                      {insight.pendingCount} {t('compare.insight.pending', 'pending')}
                    </span>
                  )}
                  {insight.fastestModel && (
                    <span className="inline-flex rounded-full border border-[rgba(138,155,255,0.28)] bg-[rgba(138,155,255,0.12)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ps-focus)]">
                      {t('compare.insight.fastest', 'Fastest')}: {insight.fastestModel}
                    </span>
                  )}
                  {insight.longestModel && (
                    <span className="inline-flex rounded-full border border-[rgba(255,138,91,0.28)] bg-[rgba(255,138,91,0.12)] px-2.5 py-1 text-[11px] font-medium text-[color:var(--ps-accent)]">
                      {t('compare.insight.longest', 'Longest')}: {insight.longestModel}
                    </span>
                  )}
                  {insight.disagreementDetected && (
                    <span className="inline-flex rounded-full border border-violet-300/30 bg-violet-300/10 px-2.5 py-1 text-[11px] font-medium text-violet-200">
                      {t('compare.insight.disagreement', 'Possible disagreement')}
                    </span>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {insight.failedModels.length > 0 && (
                    <button
                      type="button"
                      className="inline-flex items-center gap-2 rounded-full border border-[rgba(255,123,134,0.28)] bg-[rgba(255,123,134,0.12)] px-3 py-2 text-xs font-medium text-[color:var(--ps-danger)] transition-colors hover:bg-[rgba(255,123,134,0.18)]"
                      onClick={() => {
                        void retryTurnForModels(turn.id, insight.failedModels);
                      }}
                    >
                      <Repeat2 size={13} />
                      <span>{t('compare.retryFailed', 'Retry failed only')}</span>
                    </button>
                  )}
                  <button
                    type="button"
                    className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                    onClick={() => {
                      void copyToClipboard(shareSummary);
                    }}
                  >
                    <Copy size={13} />
                    <span>{t('compare.copySummary', 'Copy compare summary')}</span>
                  </button>
                  <button
                    type="button"
                    className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                    onClick={() => {
                      void copyToClipboard(markdownExport);
                    }}
                  >
                    <Copy size={13} />
                    <span>{t('compare.copyMarkdown', 'Copy Markdown')}</span>
                  </button>
                  <button
                    type="button"
                    className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                    onClick={() => {
                      downloadTextFile(`prompt-switchboard-compare-${turnIndex + 1}.md`, markdownExport);
                    }}
                  >
                    <Download size={13} />
                    <span>{t('compare.downloadMarkdown', 'Export Markdown')}</span>
                  </button>
                </div>
              </div>
              <p className="mt-2 text-xs font-medium uppercase tracking-[0.16em] text-[color:var(--ps-accent)]">
                {t('compare.promptLabel', 'You asked')}
              </p>
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[color:var(--ps-text-soft)]">
                {turn.userMessage?.text ?? t('compare.legacyPrompt', 'Legacy prompt')}
              </p>

            </div>

            <div className="px-4 pb-4 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-[1.4rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] px-4 py-3">
                <div>
                  <p className="ps-eyebrow">
                    {t('compare.results.eyebrow', 'Result board')}
                  </p>
                  <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                    {t(
                      'compare.results.summary',
                      'Review the completed answers first, then use workflow and analyst lanes to decide the next move.'
                    )}
                  </p>
                </div>
                <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.08)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--ps-text-muted)]">
                  {t('compare.results.targets', 'Current targets')}: {requestedModels.join(', ')}
                </span>
              </div>
            </div>

            <div className="px-4 pb-4">
              <div className="grid gap-3 xl:grid-cols-3">
                <div className="rounded-[1.45rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] px-4 py-4 shadow-sm">
                  <p className="ps-eyebrow">
                    {t('compare.decisionSnapshot.boardEyebrow', 'Board health')}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ps-text)]">{compareDecisionLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--ps-text-muted)]">{compareDecisionBody}</p>
                </div>
                <div className="rounded-[1.45rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] px-4 py-4 shadow-sm">
                  <p className="ps-eyebrow">
                    {t('compare.decisionSnapshot.analystEyebrow', 'Analyst balance')}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ps-text)]">{analystSnapshotLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--ps-text-muted)]">{analystSnapshotBody}</p>
                </div>
                <div className="rounded-[1.45rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] px-4 py-4 shadow-sm">
                  <p className="ps-eyebrow">
                    {t('compare.decisionSnapshot.nextEyebrow', 'Staged next move')}
                  </p>
                  <p className="mt-2 text-sm font-semibold text-[color:var(--ps-text)]">{workflowSnapshotLabel}</p>
                  <p className="mt-2 text-sm leading-6 text-[color:var(--ps-text-muted)]">{workflowSnapshotBody}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 px-4 pb-4 md:grid-cols-2 xl:grid-cols-3">
              {requestedModels.map((model) => {
                const response = turn.responses[model];
                const status = response
                  ? getMessageDeliveryStatus(response)
                  : DELIVERY_STATUS.PENDING;
                const statusLabel = getStatusLabel(status, t);
                const diagnostics = buildDiagnosticRows(response?.data, t);
                const timeline = buildCompareRunTimeline(status, response?.data);
                const body =
                  response?.text ||
                  (status === DELIVERY_STATUS.ERROR
                    ? t(
                        'compare.errorFallback',
                        'Prompt delivery failed before a response was received.'
                      )
                    : t('compare.pendingFallback', 'Waiting for the model to respond...'));

                return (
                  <article
                    key={`${turn.id}-${model}`}
                    className="rounded-[1.6rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-4 shadow-sm"
                    data-testid={`compare-card-${turnIndex}-${model}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex items-center gap-3">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.06)] text-[color:var(--ps-text)] shadow-sm">
                        {getModelIcon(model, 'h-5 w-5')}
                      </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[color:var(--ps-text)]">{model}</p>
                          <span
                            className={`mt-1 inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium ${statusClassNames[status]}`}
                          >
                            {statusLabel}
                          </span>
                        </div>
                      </div>

                    <div className="flex items-center gap-2">
                        {status === DELIVERY_STATUS.ERROR && (
                          <button
                            type="button"
                            className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] p-2 text-[color:var(--ps-text-muted)] transition-colors hover:border-[rgba(255,123,134,0.28)] hover:text-[color:var(--ps-danger)]"
                            aria-label={t('compare.retryModel', 'Retry this model')}
                            title={t('compare.retryModel', 'Retry this model')}
                            onClick={() => {
                              void retryTurnForModels(turn.id, [model]);
                            }}
                          >
                            <Repeat2 size={14} />
                          </button>
                        )}
                        <button
                          type="button"
                          className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] p-2 text-[color:var(--ps-text-muted)] transition-colors hover:border-[rgba(255,255,255,0.16)] hover:text-[color:var(--ps-text)]"
                          aria-label={t('compare.copy', 'Copy response')}
                          title={t('compare.copy', 'Copy response')}
                          onClick={() => {
                            void copyToClipboard(body);
                          }}
                        >
                          <Copy size={14} />
                        </button>
                        <button
                          type="button"
                          className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] p-2 text-[color:var(--ps-text-muted)] transition-colors hover:border-[rgba(255,255,255,0.16)] hover:text-[color:var(--ps-text)]"
                          aria-label={t('compare.open', 'Open model site')}
                          title={t('compare.open', 'Open model site')}
                          onClick={() =>
                            window.open(
                              getModelConfig(model).openUrl,
                              '_blank',
                              'noopener,noreferrer'
                            )
                          }
                        >
                          <ExternalLink size={14} />
                        </button>
                        {body.trim().length > 0 && status === DELIVERY_STATUS.COMPLETE && (
                          <button
                            type="button"
                            className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] p-2 text-[color:var(--ps-text-muted)] transition-colors hover:border-[rgba(138,155,255,0.28)] hover:text-[color:var(--ps-focus)]"
                            aria-label={t('compare.continue', 'Use response as next-round seed')}
                            title={t('compare.continue', 'Use response as next-round seed')}
                            onClick={() => {
                              setInput(body);
                            }}
                          >
                            <ArrowUpRight size={14} />
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="mt-4 min-h-[9rem] rounded-[1.35rem] border border-[color:var(--ps-border)] bg-[rgba(7,8,10,0.5)] px-4 py-3 whitespace-pre-wrap text-sm leading-6 text-[color:var(--ps-text-soft)] shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]">
                      {body}
                    </div>

                    <div className="mt-4 rounded-[1.2rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] px-3 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ps-text-muted)]">
                          {t('compare.timeline.title', 'Run timeline')}
                        </p>
                        <span className="text-xs font-medium text-[color:var(--ps-text-muted)]">{timeline.summary}</span>
                      </div>
                      <div className="mt-3 grid gap-2">
                        {timeline.steps.map((step) => (
                          <div
                            key={`${turn.id}-${model}-${step.id}`}
                            className="flex items-center justify-between gap-3"
                          >
                            <span className="text-xs font-medium text-[color:var(--ps-text-muted)]">{step.label}</span>
                            <span
                              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium ${timelineStateClassNames[step.tone]}`}
                            >
                              {step.tone === 'done'
                                ? t('compare.timeline.stateComplete', 'Done')
                                : step.tone === 'current'
                                  ? t('compare.timeline.stateCurrent', 'Current')
                                  : step.tone === 'blocked'
                                    ? t('compare.timeline.stateFailed', 'Blocked')
                                    : t('compare.timeline.stateUpcoming', 'Upcoming')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {diagnostics.length > 0 && (
                      <details
                        className={`mt-3 rounded-[1.2rem] border px-3 py-3 text-xs ${
                          status === DELIVERY_STATUS.ERROR
                            ? 'border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.08)] text-[color:var(--ps-text)]'
                            : 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] text-[color:var(--ps-text)]'
                        }`}
                      >
                        <summary className="cursor-pointer list-none text-[11px] font-semibold uppercase tracking-[0.14em] text-[color:var(--ps-text-muted)]">
                          {t('compare.timeline.diagnostics', 'Diagnostics details')}
                        </summary>
                        <dl className="mt-3 grid gap-2">
                          {diagnostics.map((row) => (
                            <div
                              key={`${turn.id}-${model}-${row.label}`}
                              className="flex items-center justify-between gap-3"
                            >
                              <dt
                                className={`font-medium ${
                                  status === DELIVERY_STATUS.ERROR ? 'text-[color:var(--ps-danger)]' : 'text-[color:var(--ps-text-muted)]'
                                }`}
                              >
                                {row.label}
                              </dt>
                              <dd
                                className={`truncate rounded-full bg-white px-2.5 py-1 font-medium ${
                                  status === DELIVERY_STATUS.ERROR
                                    ? 'border border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.12)] text-[color:var(--ps-text)]'
                                    : 'border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] text-[color:var(--ps-text-soft)]'
                                }`}
                                title={row.value}
                              >
                                {row.value}
                              </dd>
                            </div>
                          ))}
                        </dl>
                      </details>
                    )}
                  </article>
                );
              })}
            </div>

            <div className="border-t border-[color:var(--ps-border)] bg-[linear-gradient(180deg,rgba(255,255,255,0.02),rgba(255,255,255,0.04))] px-4 py-4">
              <div className="rounded-[1.5rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] px-4 py-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
                      {t('compare.decisionLane.eyebrow', 'Decision lane')}
                    </p>
                    <h3 className="mt-1 text-sm font-semibold text-[color:var(--ps-text)]">
                      {t('compare.decisionLane.title', 'Stage the next move after you review the answers')}
                    </h3>
                    <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--ps-text-muted)]">
                      {t(
                        'compare.decisionLane.body',
                        'Workflow, analyst guidance, and quick seed actions stay available here, but they no longer outrank the result board itself.'
                      )}
                    </p>
                  </div>
                  <span className="rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-3 py-1.5 text-[11px] font-medium text-[color:var(--ps-text-muted)]">
                    {t('compare.decisionLane.followUpTargets', 'Follow-up targets')}:{' '}
                    {followUpModels.join(', ')}
                  </span>
                </div>

                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                  <WorkflowPanel
                    turnId={turn.id}
                    status={
                      workflowState?.status ??
                      (insight.completeCount >= 2 ? 'runnable' : 'idle')
                    }
                    currentStepId={workflowState?.currentStepId}
                    waitingFor={workflowState?.waitingFor}
                    nextActionLabel={workflowState?.nextActionLabel}
                    nextActionSummary={workflowState?.nextActionSummary}
                    emittedActionCommand={workflowState?.emittedActionCommand}
                    emittedActionStepId={workflowState?.emittedActionStepId}
                    targetModels={workflowState?.targetModels ?? followUpModels}
                    seedPrompt={workflowState?.seedPrompt}
                    errorMessage={
                      workflowState?.errorMessage ??
                      (insight.completeCount < 2
                        ? t(
                            'workflow.body.completeMoreAnswers',
                            'Finish at least two answers before Prompt Switchboard can stage the next move.'
                          )
                        : undefined)
                    }
                    hasAnalystResult={analysisState?.status === 'success'}
                    onRunWorkflow={() => {
                      void stageWorkflowFromNextQuestion(turn.id, followUpModels);
                    }}
                    onUseSeed={() => {
                      applyWorkflowSeedToComposer(turn.id);
                    }}
                    onRunNextCompare={() => {
                      void runWorkflowSeedCompare(turn.id);
                    }}
                  />

                  <CompareAnalystPanel
                    turnId={turn.id}
                    requestedModels={requestedModels}
                    responses={turn.responses}
                    followUpModels={followUpModels}
                  />
                </div>

                {disagreement.reasons.length > 0 && (
                  <div className="mt-4 rounded-[1.4rem] border border-slate-200/90 bg-slate-50/80 px-4 py-4 shadow-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-700">
                        {t('compare.orchestration.title', 'Quick seed lane')}
                      </span>
                      <span className="text-xs font-medium text-slate-500">
                        {t(
                          'compare.orchestration.summary',
                          'Use these manual seed shortcuts when you already know the next move. For the staged product path, use the workflow panel first.'
                        )}
                      </span>
                    </div>

                    <p className="mt-3 text-xs leading-6 text-slate-500">
                      {t(
                        'compare.orchestration.manualHint',
                        'Use the workflow panel for staged next steps. The quick actions here stay manual.'
                      )}
                    </p>

                    <ul className="mt-3 space-y-2 text-sm text-slate-700">
                      {disagreement.reasons.map((reason) => (
                        <li
                          key={`${turn.id}-${reason}`}
                          className="rounded-2xl border border-slate-200/80 bg-slate-50/70 px-3 py-2"
                        >
                          {reason}
                        </li>
                      ))}
                    </ul>

                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-medium">
                      {disagreement.completedModels.length > 0 && (
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                          {t('compare.orchestration.completed', 'Completed')}:&nbsp;
                          {disagreement.completedModels.join(', ')}
                        </span>
                      )}
                      {disagreement.failedModels.length > 0 && (
                        <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                          {t('compare.orchestration.failed', 'Failed')}:&nbsp;
                          {disagreement.failedModels.join(', ')}
                        </span>
                      )}
                      {disagreement.pendingModels.length > 0 && (
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-amber-700">
                          {t('compare.orchestration.pending', 'Pending')}:&nbsp;
                          {disagreement.pendingModels.join(', ')}
                        </span>
                      )}
                    </div>

                    <p className="mt-3 text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                      {t('compare.orchestration.recommended', 'Current cue')}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">
                      {disagreement.recommendedAction === 'retry_failed'
                        ? t(
                            'compare.orchestration.actionRetry',
                            'Retry the failed models first, then compare the refreshed turn.'
                          )
                        : disagreement.recommendedAction === 'judge'
                          ? t(
                              'compare.orchestration.actionJudge',
                              'Draft a tighter follow-up review prompt when this turn still needs another compare round.'
                            )
                          : disagreement.recommendedAction === 'wait'
                            ? t(
                                'compare.orchestration.actionWait',
                                'Wait for the remaining models before deciding which answer to continue from.'
                              )
                            : t(
                                'compare.orchestration.actionContinue',
                                'Keep the strongest answer in view, then seed the next compare from that card or continue in the original tab yourself.'
                              )}
                    </p>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {insight.completeCount >= 2 && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-violet-200 bg-white px-3 py-2 text-xs font-medium text-violet-700 transition-colors hover:bg-violet-50"
                          title={t('compare.orchestration.followUp', 'Draft seed from this turn')}
                          onClick={() => {
                            setSelectedModelsForCurrentSession(followUpModels);
                            setInput(
                              buildJudgePrompt(
                                turn.userMessage?.text ?? 'Legacy prompt',
                                turn.responses,
                                (key, defaultValue) => t(key, defaultValue)
                              )
                            );
                          }}
                        >
                          <Gavel size={14} />
                          <span>{t('compare.orchestration.followUp', 'Draft seed from this turn')}</span>
                        </button>
                      )}
                      {disagreement.suggestedSeedModel &&
                        turn.responses[disagreement.suggestedSeedModel]?.text.trim() && (
                          <button
                            type="button"
                            className="inline-flex items-center gap-2 rounded-full border border-sky-200 bg-white px-3 py-2 text-xs font-medium text-sky-700 transition-colors hover:bg-sky-50"
                            title={`${t('compare.orchestration.continueFrom', 'Manual seed from')} ${disagreement.suggestedSeedModel}`}
                            onClick={() => {
                              const nextText =
                                turn.responses[disagreement.suggestedSeedModel!]?.text ?? '';
                              setSelectedModelsForCurrentSession([disagreement.suggestedSeedModel!]);
                              setInput(nextText);
                            }}
                          >
                            <ArrowUpRight size={14} />
                            <span>
                              {t('compare.orchestration.continueFrom', 'Manual seed from')}{' '}
                              {disagreement.suggestedSeedModel}
                            </span>
                          </button>
                        )}
                      {insight.failedModels.length > 0 && (
                        <button
                          type="button"
                          className="inline-flex items-center gap-2 rounded-full border border-rose-200 bg-white px-3 py-2 text-xs font-medium text-rose-700 transition-colors hover:bg-rose-50"
                          onClick={() => {
                            void retryTurnForModels(turn.id, insight.failedModels);
                          }}
                        >
                          <Repeat2 size={14} />
                          <span>{t('compare.orchestration.retryNow', 'Recover failed models')}</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
};
