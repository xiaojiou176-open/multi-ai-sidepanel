import { useEffect, useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ModelSelector } from './components/ModelSelector';
import { InputArea } from './components/InputArea';
import { SessionList } from './components/SessionList';
import { SettingsPanel } from './components/SettingsPanel';
import { VirtualizedMessageList } from './components/VirtualizedMessageList';
import { CompareView } from './components/CompareView';
import { ReadinessPanel } from './components/ReadinessPanel';
import { useStore } from './store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useMessageListener } from './hooks/useMessageListener';
import {
  SETTINGS_OPEN_EVENT,
  SETTINGS_VISIBILITY_HOOK,
  SETTINGS_WINDOW_HOOK,
  shouldOpenSettingsFromUrl,
} from './utils/shouldOpenSettingsFromUrl';
import { getModelOpenUrls } from '../utils/modelConfig';
import { MESSAGE_ROLES, MSG_TYPES, type Session, type StreamResponsePayload } from '../utils/types';

type DiagnosticPresentationState = {
  analysisByTurn?: ReturnType<typeof useStore.getState>['analysisByTurn'];
  workflowByTurn?: ReturnType<typeof useStore.getState>['workflowByTurn'];
  input?: string;
  selectedModels?: ReturnType<typeof useStore.getState>['selectedModels'];
};

function App() {
  const { t } = useTranslation();
  const sessions = useStore((state) => state.sessions);
  const currentSessionId = useStore((state) => state.currentSessionId);
  const updateLastMessage = useStore((state) => state.updateLastMessage);
  const loadSessions = useStore((state) => state.loadSessions);
  const createNewSession = useStore((state) => state.createNewSession);
  const importSessions = useStore((state) => state.importSessions);
  const selectedModels = useStore((state) => state.selectedModels);
  const modelReadiness = useStore((state) => state.modelReadiness);
  const refreshModelReadiness = useStore((state) => state.refreshModelReadiness);

  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(() => shouldOpenSettingsFromUrl());
  const [viewMode, setViewMode] = useState<'compare' | 'transcript'>('compare');

  useKeyboardShortcuts({ createNewSession });
  useMessageListener({ updateLastMessage });

  const currentMessages = useMemo(
    () => sessions.find((session) => session.id === currentSessionId)?.messages || [],
    [sessions, currentSessionId]
  );
  const currentPromptCount = useMemo(
    () => currentMessages.filter((message) => message.role === MESSAGE_ROLES.USER).length,
    [currentMessages]
  );
  const readinessSummary = useMemo(
    () =>
      selectedModels.reduce(
        (summary, model) => {
          const report = modelReadiness[model];
          if (!report) {
            summary.checkingCount += 1;
            return summary;
          }

          if (report.ready) {
            summary.readyCount += 1;
            return summary;
          }

          if (report.status === 'tab_loading') {
            summary.loadingCount += 1;
            return summary;
          }

          summary.blockedCount += 1;
          return summary;
        },
        {
          readyCount: 0,
          loadingCount: 0,
          blockedCount: 0,
          checkingCount: 0,
        }
      ),
    [modelReadiness, selectedModels]
  );
  const workspacePulse = useMemo(() => {
    if (selectedModels.length === 0) {
      return {
        tone: 'border-slate-200 bg-slate-50/85 text-slate-700',
        label: t('app.workspacePulse.selectModelsLabel', 'Select the compare lane'),
        body: t(
          'app.workspacePulse.selectModelsBody',
          'Pick the tabs you want in this run first, then let readiness decide whether you should compare now or repair first.'
        ),
      };
    }

    if (readinessSummary.blockedCount > 0) {
      return {
        tone: 'border-rose-200 bg-rose-50/85 text-rose-800',
        label: t('app.workspacePulse.repairLabel', 'Repair before you ask'),
        body: t(
          'app.workspacePulse.repairBody',
          'Some selected tabs still need attention. Fix the blocked models first so the result board stays analyst-ready instead of half-empty.'
        ),
      };
    }

    if (readinessSummary.readyCount > 0) {
      return {
        tone: 'border-emerald-200 bg-emerald-50/85 text-emerald-800',
        label: t('app.workspacePulse.compareLabel', 'Compare lane is ready'),
        body:
          currentPromptCount > 0
            ? t(
                'app.workspacePulse.reviewBody',
                'Your compare workspace already has completed turns. Review the result board first, then use the analyst or workflow lane only for the next move.'
              )
            : t(
                'app.workspacePulse.compareBody',
                'At least one selected tab is ready. Ask once from the composer, then use the result board to decide whether to retry, export, or stage a follow-up.'
              ),
      };
    }

    return {
      tone: 'border-amber-200 bg-amber-50/85 text-amber-800',
      label: t('app.workspacePulse.waitLabel', 'Readiness is still settling'),
      body: t(
        'app.workspacePulse.waitBody',
        'Prompt Switchboard is still checking or waiting for model tabs to finish loading. Re-check once the pages settle.'
      ),
    };
  }, [currentPromptCount, readinessSummary, selectedModels.length, t]);
  const firstSuccessRail = useMemo(
    () => [
      {
        step: '1',
        title: t('app.firstSuccess.selectTitle', 'Select the tabs that belong in this compare'),
        body: t(
          'app.firstSuccess.selectBody',
          'Keep the first run narrow. Pick only the models you actually want to compare before you open any analyst or workflow lane.'
        ),
        active: selectedModels.length === 0,
      },
      {
        step: '2',
        title: t('app.firstSuccess.readyTitle', 'Wait for one clean readiness signal'),
        body:
          readinessSummary.blockedCount > 0
            ? t(
                'app.firstSuccess.readyBlockedBody',
                'A blocked model is still pulling the first run sideways. Repair that tab before you ask.'
              )
            : t(
                'app.firstSuccess.readyBody',
                'You only need one honest ready tab to start the first compare. Everything else can stay secondary.'
              ),
        active:
          selectedModels.length > 0 &&
          (readinessSummary.blockedCount > 0 || readinessSummary.readyCount === 0),
      },
      {
        step: '3',
        title: t('app.firstSuccess.askTitle', 'Ask once, then read the compare board'),
        body:
          currentPromptCount > 0
            ? t(
                'app.firstSuccess.reviewBody',
                'The first answer already exists. Stay on the compare board and decide whether to retry, export, or stage a follow-up.'
              )
            : t(
                'app.firstSuccess.askBody',
                'Treat the first prompt like a calibration run. Get one readable answer board before you touch the workflow lane.'
              ),
        active:
          selectedModels.length > 0 &&
          readinessSummary.readyCount > 0 &&
          readinessSummary.blockedCount === 0,
      },
    ],
    [currentPromptCount, readinessSummary.blockedCount, readinessSummary.readyCount, selectedModels.length, t]
  );

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    void refreshModelReadiness(selectedModels);
  }, [refreshModelReadiness, selectedModels]);

  useEffect(() => {
    const onHashChange = () => {
      if (shouldOpenSettingsFromUrl()) {
        setShowSettings(true);
      }
    };

    const onOpenSettingsEvent = () => {
      setShowSettings(true);
    };

    const onMessage = (event: MessageEvent) => {
      if (event?.data?.type === SETTINGS_OPEN_EVENT) {
        setShowSettings(true);
      }
    };

    window.addEventListener('hashchange', onHashChange);
    window.addEventListener(SETTINGS_OPEN_EVENT, onOpenSettingsEvent as EventListener);
    window.addEventListener('message', onMessage);

    if (typeof window !== 'undefined') {
      const api = {
        openSettings: () => setShowSettings(true),
        replaceSessions: async (nextSessions: Session[], nextCurrentSessionId?: string | null) => {
          await importSessions(nextSessions, nextCurrentSessionId ?? null);
        },
        seedPresentationState: (payload: DiagnosticPresentationState) => {
          useStore.setState((state) => ({
            analysisByTurn: payload.analysisByTurn ?? state.analysisByTurn,
            workflowByTurn: payload.workflowByTurn ?? state.workflowByTurn,
            input: payload.input ?? state.input,
            selectedModels: payload.selectedModels ?? state.selectedModels,
          }));
        },
        setViewMode: (nextViewMode: 'compare' | 'transcript') => setViewMode(nextViewMode),
      };
      (window as unknown as { [SETTINGS_WINDOW_HOOK]?: typeof api })[SETTINGS_WINDOW_HOOK] = api;
    }

    return () => {
      window.removeEventListener('hashchange', onHashChange);
      window.removeEventListener(SETTINGS_OPEN_EVENT, onOpenSettingsEvent as EventListener);
      window.removeEventListener('message', onMessage);
      if (typeof window !== 'undefined') {
        const target = window as unknown as {
          [SETTINGS_WINDOW_HOOK]?: { openSettings: () => void };
        };
        if (target[SETTINGS_WINDOW_HOOK]?.openSettings) {
          delete target[SETTINGS_WINDOW_HOOK];
        }
      }
    };
  }, [importSessions]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as unknown as { [SETTINGS_VISIBILITY_HOOK]?: boolean })[SETTINGS_VISIBILITY_HOOK] =
        showSettings;
    }
  }, [showSettings]);

  useEffect(() => {
    const restoreBufferedUpdates = async () => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return;

      const response = (await chrome.runtime.sendMessage({
        type: MSG_TYPES.GET_BUFFERED_UPDATES,
      })) as { updates?: StreamResponsePayload[] } | undefined;

      const updates = Array.isArray(response?.updates) ? response.updates : [];
      updates.forEach((payload) => updateLastMessage(payload));
    };

    void restoreBufferedUpdates();
  }, [updateLastMessage]);

  return (
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(253,230,255,0.9),_transparent_28%),linear-gradient(180deg,_#fff8fc_0%,_#ffffff_40%,_#fffaf2_100%)] font-sans text-slate-900">
      <a
        href="#compare-main-content"
        className="sr-only z-50 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        {t('app.skipToResults', 'Skip to compare results')}
      </a>

      {isSidebarOpen && (
        <button
          type="button"
          className="absolute inset-0 z-30 bg-slate-900/18 backdrop-blur-[1px] sm:hidden"
          aria-label={t('common.closeSidebar', 'Close sidebar')}
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      <div
        id="session-workspace-drawer"
        className={`
          fixed inset-y-0 left-0 z-40 w-72 transform transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0 shadow-[0_18px_48px_rgba(15,23,42,0.18)]' : '-translate-x-full'}
        `}
        aria-hidden={!isSidebarOpen}
      >
        {isSidebarOpen ? (
          <div className="h-full w-72">
            <SessionList
              onClose={() => setIsSidebarOpen(false)}
              onSessionSelected={() => setIsSidebarOpen(false)}
            />
          </div>
        ) : null}
      </div>

      <div className="relative flex h-full min-w-0 flex-1 flex-col bg-white/80 backdrop-blur-xl">
        <header className="z-10 border-b border-rose-100/80 bg-white/78 px-4 py-3 backdrop-blur-md">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSidebarOpen((open) => !open)}
                  className="rounded-2xl border border-rose-100 bg-white/85 p-2 text-slate-600 transition-colors hover:bg-rose-50"
                  title={isSidebarOpen ? t('common.closeSidebar') : t('common.openSidebar')}
                  aria-label={isSidebarOpen ? t('common.closeSidebar') : t('common.openSidebar')}
                  aria-expanded={isSidebarOpen}
                  aria-controls="session-workspace-drawer"
                >
                  {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="bg-gradient-to-r from-fuchsia-700 via-rose-600 to-amber-500 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
                      Prompt Switchboard
                    </h1>
                    <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700">
                      {t('app.trust', 'Local-first')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    {t(
                      'app.subtitle',
                      'Ask once, compare multiple AI chats side by side from one browser workspace.'
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden rounded-full border border-rose-100 bg-white/85 p-1 shadow-sm sm:flex">
                <button
                  type="button"
                  onClick={() => setViewMode('compare')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'compare'
                      ? 'bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t('compare.view.compare', 'Compare')}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('transcript')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'transcript'
                      ? 'bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow-sm'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  {t('compare.view.transcript', 'Transcript')}
                </button>
              </div>
              <button
                onClick={() => {
                  getModelOpenUrls().forEach((url) => window.open(url, '_blank'));
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-rose-100 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-rose-50"
                title={t('app.openAllTitle', 'Open supported AI tabs')}
              >
                <ShieldCheck size={14} />
                <span className="hidden sm:inline">{t('app.openAll', 'Open model tabs')}</span>
                <span className="sm:hidden">{t('app.openAllShort', 'Open')}</span>
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="rounded-2xl border border-rose-100 bg-white/90 p-2 text-slate-600 transition-colors hover:bg-rose-50"
                title={t('settings.title')}
                aria-label={t('settings.title')}
              >
                <Settings size={20} />
              </button>
            </div>
          </div>

          <div className="mt-3 rounded-[1.6rem] border border-rose-100/80 bg-white/78 px-3 py-3 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-fuchsia-600">
                  {t('app.modelRail', 'Model rail')}
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  {t(
                    'app.modelRailHint',
                    'Choose the sites you want in this compare run, then review the result board before taking the next step.'
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700">
                  <Sparkles size={14} />
                  <span>
                    {currentPromptCount}{' '}
                    {currentPromptCount === 1
                      ? t('app.turnSingular', 'comparison')
                      : t('app.turnPlural', 'comparisons')}
                  </span>
                </div>
                <div className="flex rounded-full border border-rose-100 bg-white/85 p-1 shadow-sm sm:hidden">
                  <button
                    type="button"
                    onClick={() => setViewMode('compare')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      viewMode === 'compare'
                        ? 'bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t('compare.view.compare', 'Compare')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewMode('transcript')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      viewMode === 'transcript'
                        ? 'bg-gradient-to-r from-fuchsia-600 to-rose-500 text-white shadow-sm'
                        : 'text-slate-500 hover:text-slate-800'
                    }`}
                  >
                    {t('compare.view.transcript', 'Transcript')}
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-3">
              <ModelSelector />
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_repeat(3,minmax(0,1fr))]">
              <div className={`rounded-[1.45rem] border px-4 py-3 shadow-sm ${workspacePulse.tone}`}>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em]">
                  {t('app.workspacePulse.eyebrow', 'Workspace pulse')}
                </p>
                <p className="mt-2 text-sm font-semibold">{workspacePulse.label}</p>
                <p className="mt-2 text-sm leading-6 text-current/80">{workspacePulse.body}</p>
              </div>

              <div className="rounded-[1.45rem] border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {t('app.workspacePulse.selectedEyebrow', 'Selected tabs')}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{selectedModels.length}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {selectedModels.length > 0
                    ? t(
                        'app.workspacePulse.selectedBody',
                        'Keep this set tight so the compare board stays readable and the analyst lane has a clear target.'
                      )
                    : t(
                        'app.workspacePulse.selectedEmpty',
                        'Choose at least one model to start the compare lane.'
                      )}
                </p>
              </div>

              <div className="rounded-[1.45rem] border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {t('app.workspacePulse.readinessEyebrow', 'Ready now')}
                </p>
                <p className="mt-2 text-2xl font-semibold text-slate-900">{readinessSummary.readyCount}</p>
                <p className="mt-1 text-sm text-slate-600">
                  {readinessSummary.blockedCount > 0
                    ? t(
                        'app.workspacePulse.readinessBodyBlocked',
                        '{{count}} blocked model still needs repair before you trust the analyst lane.',
                        { count: readinessSummary.blockedCount }
                      )
                    : t(
                        'app.workspacePulse.readinessBody',
                        '{{count}} loading or checking model is still settling in the background.',
                        {
                          count:
                            readinessSummary.loadingCount + readinessSummary.checkingCount,
                        }
                      )}
                </p>
              </div>

              <div className="rounded-[1.45rem] border border-slate-200 bg-white/90 px-4 py-3 shadow-sm">
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {t('app.workspacePulse.nextEyebrow', 'Next step')}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {readinessSummary.blockedCount > 0
                    ? t('app.workspacePulse.nextRepair', 'Use Repair Center')
                    : currentPromptCount > 0
                      ? t('app.workspacePulse.nextReview', 'Review result board')
                      : t('app.workspacePulse.nextAsk', 'Ask once from the composer')}
                </p>
                <p className="mt-2 text-sm text-slate-600">
                  {readinessSummary.blockedCount > 0
                    ? t(
                        'app.workspacePulse.nextRepairBody',
                        'Fix blocked tabs first so compare and analyst flows stay balanced.'
                      )
                    : currentPromptCount > 0
                      ? t(
                          'app.workspacePulse.nextReviewBody',
                          'Keep the answers in view, then decide whether to retry failures, export, or stage a follow-up.'
                        )
                      : t(
                          'app.workspacePulse.nextAskBody',
                          'Your first clean compare should create one readable board, not a noisy recovery session.'
                        )}
                </p>
              </div>
            </div>
          </div>
        </header>

        <section className="px-4 pb-4">
          <div className="rounded-[1.6rem] border border-slate-200 bg-white/90 px-4 py-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {t('app.firstSuccess.eyebrow', 'First compare path')}
                </p>
                <p className="mt-2 text-sm font-semibold text-slate-900">
                  {t(
                    'app.firstSuccess.title',
                    'Keep the first success path small: select, verify, ask once.'
                  )}
                </p>
              </div>
              <span className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-700">
                {currentPromptCount > 0
                  ? t('app.firstSuccess.stageReview', 'review')
                  : readinessSummary.readyCount > 0 && readinessSummary.blockedCount === 0
                    ? t('app.firstSuccess.stageAsk', 'ask once')
                    : selectedModels.length > 0
                      ? t('app.firstSuccess.stageReady', 'ready check')
                      : t('app.firstSuccess.stageSelect', 'select tabs')}
              </span>
            </div>

            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              {firstSuccessRail.map((item) => (
                <article
                  key={item.step}
                  className={
                    item.active
                      ? 'rounded-[1.2rem] border border-slate-900 bg-slate-900 px-4 py-4 text-white'
                      : 'rounded-[1.2rem] border border-slate-200 bg-slate-50/80 px-4 py-4 text-slate-900'
                  }
                >
                  <p
                    className={
                      item.active
                        ? 'text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70'
                        : 'text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500'
                    }
                  >
                    {item.step}. {item.title}
                  </p>
                  <p className={item.active ? 'mt-3 text-sm leading-6 text-white/85' : 'mt-3 text-sm leading-6 text-slate-600'}>
                    {item.body}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <ReadinessPanel models={selectedModels} onOpenSettings={() => setShowSettings(true)} />

        <main
          id="compare-main-content"
          tabIndex={-1}
          className="relative flex-1 overflow-hidden focus:outline-none"
        >
          {viewMode === 'compare' ? (
            <CompareView messages={currentMessages} />
          ) : (
            <VirtualizedMessageList messages={currentMessages} />
          )}
        </main>

        <div className="border-t border-rose-100/80 bg-white/75 p-4 backdrop-blur-sm">
          <InputArea />
        </div>

        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  );
}

export default App;
