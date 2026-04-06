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
import {
  SETTINGS_OPEN_EVENT,
  SETTINGS_VISIBILITY_HOOK,
  SETTINGS_WINDOW_HOOK,
  shouldOpenSettingsFromUrl,
} from './utils/shouldOpenSettingsFromUrl';
import { getModelOpenUrls } from '../utils/modelConfig';
import {
  MESSAGE_ROLES,
  MSG_TYPES,
  type Session,
  type MessagePayload,
  type StreamResponsePayload,
} from '../utils/types';

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
  const refreshModelReadiness = useStore((state) => state.refreshModelReadiness);

  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [showSettings, setShowSettings] = useState(() => shouldOpenSettingsFromUrl());
  const [viewMode, setViewMode] = useState<'compare' | 'transcript'>('compare');

  useKeyboardShortcuts({ createNewSession });

  const currentMessages = useMemo(
    () => sessions.find((session) => session.id === currentSessionId)?.messages || [],
    [sessions, currentSessionId]
  );
  const currentPromptCount = useMemo(
    () => currentMessages.filter((message) => message.role === MESSAGE_ROLES.USER).length,
    [currentMessages]
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
    if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
      const listener = (message: MessagePayload) => {
        if (message.type === MSG_TYPES.ON_RESPONSE_UPDATE) {
          const payload = message.payload as StreamResponsePayload;
          updateLastMessage(payload);
        }
      };

      chrome.runtime.onMessage.addListener(listener);
      return () => chrome.runtime.onMessage.removeListener(listener);
    }
  }, [updateLastMessage]);

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
      <div
        className={`
          fixed inset-y-0 left-0 z-40 transform transition-transform duration-300 ease-in-out
          ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          md:relative md:translate-x-0
          ${isSidebarOpen ? 'w-72' : 'w-0'}
        `}
      >
        <div className="h-full w-72">
          <SessionList />
        </div>
      </div>

      <div className="relative flex h-full min-w-0 flex-1 flex-col bg-white/80 backdrop-blur-xl">
        <header className="z-10 flex min-h-20 items-center justify-between border-b border-rose-100/80 bg-white/70 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="rounded-2xl border border-rose-100 bg-white/80 p-2 text-slate-600 transition-colors hover:bg-rose-50"
              title={isSidebarOpen ? t('common.closeSidebar') : t('common.openSidebar')}
            >
              {isSidebarOpen ? <PanelLeftClose size={20} /> : <PanelLeftOpen size={20} />}
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="bg-gradient-to-r from-fuchsia-700 via-rose-600 to-amber-500 bg-clip-text text-lg font-semibold tracking-tight text-transparent">
                  Prompt Switchboard
                </h1>
                <span className="hidden rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-emerald-700 md:inline-flex">
                  {t('app.trust', 'Local-first')}
                </span>
              </div>
              <p className="hidden text-sm text-slate-500 md:block">
                {t(
                  'app.subtitle',
                  'Ask once, compare multiple AI chats side by side from one browser workspace.'
                )}
              </p>
            </div>
            <div className="hidden rounded-full border border-rose-100 bg-white/80 p-1 shadow-sm md:flex">
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

          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-700 md:flex">
              <Sparkles size={14} />
              <span>
                {currentPromptCount}{' '}
                {currentPromptCount === 1
                  ? t('app.turnSingular', 'comparison')
                  : t('app.turnPlural', 'comparisons')}
              </span>
            </div>
            <button
              onClick={() => {
                getModelOpenUrls().forEach((url) => window.open(url, '_blank'));
              }}
              className="inline-flex items-center gap-2 rounded-2xl border border-rose-100 bg-white/90 px-3 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-rose-50"
              title={t('app.openAllTitle', 'Open supported AI tabs')}
            >
              <ShieldCheck size={14} />
              <span className="hidden md:inline">{t('app.openAll', 'Open model tabs')}</span>
              <span className="md:hidden">{t('app.openAllShort', 'Open')}</span>
            </button>
            <ModelSelector />
            <button
              onClick={() => setShowSettings(true)}
              className="rounded-2xl border border-rose-100 bg-white/90 p-2 text-slate-600 transition-colors hover:bg-rose-50"
              title={t('settings.title')}
              aria-label={t('settings.title')}
            >
              <Settings size={20} />
            </button>
          </div>
        </header>

        <ReadinessPanel models={selectedModels} onOpenSettings={() => setShowSettings(true)} />

        <div className="relative flex-1 overflow-hidden">
          {viewMode === 'compare' ? (
            <CompareView messages={currentMessages} />
          ) : (
            <VirtualizedMessageList messages={currentMessages} />
          )}
        </div>

        <div className="border-t border-rose-100/80 bg-white/75 p-4 backdrop-blur-sm">
          <InputArea />
        </div>

        {showSettings && <SettingsPanel onClose={() => setShowSettings(false)} />}
      </div>
    </div>
  );
}

export default App;
