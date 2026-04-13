import { useEffect, useMemo, useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Settings, ShieldCheck } from 'lucide-react';
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
  const showPreflightChecklist =
    selectedModels.length === 0 || currentPromptCount === 0 || readinessSummary.blockedCount > 0;

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
    <div className="flex h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(255,138,91,0.08),_transparent_24%),radial-gradient(circle_at_top_right,_rgba(138,155,255,0.12),_transparent_24%),linear-gradient(180deg,_rgba(7,8,10,1)_0%,_rgba(10,12,18,1)_100%)] font-sans text-[color:var(--ps-text)]">
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
          ${isSidebarOpen ? 'translate-x-0 shadow-[0_30px_80px_rgba(0,0,0,0.45)]' : '-translate-x-full'}
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

      <div className="relative flex h-full min-w-0 flex-1 flex-col">
        <header className="z-10 border-b border-[color:var(--ps-border)] bg-[rgba(7,8,10,0.82)] px-4 py-4 backdrop-blur-xl">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsSidebarOpen((open) => !open)}
                  className="ps-action-secondary rounded-2xl p-2 transition-colors hover:border-[rgba(255,255,255,0.16)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                  title={isSidebarOpen ? t('common.closeSidebar') : t('common.openSidebar')}
                  aria-label={isSidebarOpen ? t('common.closeSidebar') : t('common.openSidebar')}
                  aria-expanded={isSidebarOpen}
                  aria-controls="session-workspace-drawer"
                >
                  {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
                </button>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h1 className="bg-gradient-to-r from-[color:var(--ps-text)] via-[color:var(--ps-text)] to-[color:var(--ps-accent)] bg-clip-text text-lg font-semibold tracking-tight text-transparent">
                      Prompt Switchboard
                    </h1>
                    <span className="inline-flex rounded-full border border-[rgba(83,196,143,0.28)] bg-[rgba(83,196,143,0.12)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[color:var(--ps-success)]">
                      {t('app.trust', 'Local-first')}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[color:var(--ps-text-muted)]">
                    {t(
                      'app.subtitle',
                      'Ask once, compare multiple AI chats side by side from one browser workspace.'
                    )}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <div className="hidden rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:flex">
                <button
                  type="button"
                  onClick={() => setViewMode('compare')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'compare'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-[color:var(--ps-text-muted)] hover:text-[color:var(--ps-text)]'
                  }`}
                >
                  {t('compare.view.compare', 'Compare')}
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('transcript')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'transcript'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-[color:var(--ps-text-muted)] hover:text-[color:var(--ps-text)]'
                  }`}
                >
                  {t('compare.view.transcript', 'Transcript')}
                </button>
              </div>
              <button
                onClick={() => {
                  getModelOpenUrls().forEach((url) => window.open(url, '_blank'));
                }}
                className="ps-action-secondary inline-flex items-center gap-2 rounded-2xl px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                title={t('app.openAllTitle', 'Open supported AI tabs')}
              >
                <ShieldCheck size={14} />
                <span className="hidden sm:inline">{t('app.openAll', 'Open model tabs')}</span>
                <span className="sm:hidden">{t('app.openAllShort', 'Open')}</span>
              </button>
              <button
                onClick={() => setShowSettings(true)}
                className="ps-action-secondary rounded-2xl p-2 transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                title={t('settings.title')}
                aria-label={t('settings.title')}
              >
                <Settings size={20} />
              </button>
            </div>
          </div>

          <div className="ps-shell-panel-strong mt-4 rounded-[1.8rem] px-4 py-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 max-w-2xl">
                <p className="ps-eyebrow">
                  {t('app.modelRail', 'Model rail')}
                </p>
                <p className="mt-2 text-sm font-semibold text-[color:var(--ps-text)]">
                  {workspacePulse.label}
                </p>
                <p className="mt-2 text-sm leading-6 text-[color:var(--ps-text-muted)]">
                  {workspacePulse.body}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <div className="ps-metric-card rounded-full px-3 py-2 text-xs">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
                    {t('app.workspacePulse.selectedEyebrow', 'Selected tabs')}
                  </span>
                  <p className="mt-1 font-semibold text-[color:var(--ps-text)]">{selectedModels.length}</p>
                </div>
                <div className="ps-metric-card rounded-full px-3 py-2 text-xs">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
                    {t('app.workspacePulse.readinessEyebrow', 'Ready now')}
                  </span>
                  <p className="mt-1 font-semibold text-[color:var(--ps-text)]">{readinessSummary.readyCount}</p>
                </div>
                <div className="ps-metric-card rounded-full px-3 py-2 text-xs">
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
                    {t('readiness.workspacePulse.blockedEyebrow', 'Needs repair')}
                  </span>
                  <p className="mt-1 font-semibold text-[color:var(--ps-text)]">{readinessSummary.blockedCount}</p>
                </div>
                <div
                  className="ps-metric-card rounded-full px-3 py-2 text-xs"
                  data-testid="turn-count-card"
                  aria-label={`${currentPromptCount} ${
                    currentPromptCount === 1
                      ? t('app.turnSingular', 'comparison')
                      : t('app.turnPlural', 'comparisons')
                  }`}
                >
                  <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
                    {currentPromptCount === 1
                      ? t('app.turnSingular', 'comparison')
                      : t('app.turnPlural', 'comparisons')}
                  </span>
                  <p className="mt-1 font-semibold text-[color:var(--ps-text)]">{currentPromptCount}</p>
                </div>
                <div className="flex rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] sm:hidden">
                  <button
                    type="button"
                    onClick={() => setViewMode('compare')}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      viewMode === 'compare'
                        ? 'bg-white text-slate-900 shadow-sm'
                        : 'text-[color:var(--ps-text-muted)] hover:text-[color:var(--ps-text)]'
                    }`}
                  >
                    {t('compare.view.compare', 'Compare')}
                  </button>
                  <button
                  type="button"
                  onClick={() => setViewMode('transcript')}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === 'transcript'
                      ? 'bg-white text-slate-900 shadow-sm'
                      : 'text-[color:var(--ps-text-muted)] hover:text-[color:var(--ps-text)]'
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

            {showPreflightChecklist ? (
              <div className="mt-4 grid gap-3 lg:grid-cols-3">
                {firstSuccessRail.map((item) => (
                  <article
                    key={item.step}
                    className={
                      item.active
                        ? 'rounded-[1.3rem] border border-[rgba(255,138,91,0.32)] bg-[linear-gradient(135deg,rgba(255,138,91,0.18),rgba(138,155,255,0.16))] px-4 py-4 text-white shadow-[0_20px_40px_rgba(0,0,0,0.22)]'
                        : 'rounded-[1.3rem] border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] px-4 py-4 text-[color:var(--ps-text)]'
                    }
                  >
                    <p
                      className={
                        item.active
                          ? 'text-[11px] font-semibold uppercase tracking-[0.16em] text-white/70'
                          : 'text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]'
                      }
                    >
                      {item.step}. {item.title}
                    </p>
                    <p
                      className={
                        item.active
                          ? 'mt-3 text-sm leading-6 text-white/85'
                          : 'mt-3 text-sm leading-6 text-[color:var(--ps-text-muted)]'
                      }
                    >
                      {item.body}
                    </p>
                  </article>
                ))}
              </div>
            ) : null}
          </div>
        </header>

        <ReadinessPanel
          models={selectedModels}
          onOpenSettings={() => setShowSettings(true)}
          compact={currentPromptCount > 0}
        />

        <main
          id="compare-main-content"
          tabIndex={-1}
          className="relative flex-1 overflow-hidden bg-[rgba(7,8,10,0.4)] focus:outline-none"
        >
          {viewMode === 'compare' ? (
            <CompareView messages={currentMessages} />
          ) : (
            <VirtualizedMessageList messages={currentMessages} />
          )}
        </main>

        <div className="border-t border-[color:var(--ps-border)] bg-[rgba(7,8,10,0.88)] p-4 backdrop-blur-xl">
          <InputArea />
        </div>

        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  );
}

export default App;
