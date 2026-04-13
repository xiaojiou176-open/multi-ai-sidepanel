import React, { useEffect, useState, useRef } from 'react';
import {
  StorageService,
  type Settings,
  validateSessions,
  validateSettings,
  CURRENT_SCHEMA_VERSION,
  DEFAULT_SETTINGS,
} from '../../services/storage';
import { Logger, toErrorMessage } from '../../utils/logger';
import {
  X,
  Bot,
  Globe,
  Moon,
  Sun,
  Monitor,
  Keyboard,
  Save,
  Download,
  Upload,
  Database,
  Activity,
  RefreshCcw,
  ShieldAlert,
  Sparkles,
  ArrowUpRight,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useStore } from '../store';
import { MODEL_ORDER } from '../../utils/modelConfig';
import { isSwitchyardRuntimeSupportedModel } from '../../services/analysis/providers/switchyardRuntime';
import {
  formatFailureClass,
  formatReadinessStatus,
  formatSelectorSource,
} from '../utils/runtimeLabels';
import {
  BUILDER_GUIDE_LINKS,
  ESSENTIAL_GUIDE_LINKS,
  buildPublicDocUrl,
} from '../utils/publicDocs';

interface SettingsProps {
  onClose: () => void;
}

const ESSENTIAL_GUIDE_BUTTONS = ESSENTIAL_GUIDE_LINKS.map((link) => ({
  ...link,
  href: buildPublicDocUrl(link.path),
}));

const BUILDER_GUIDE_BUTTONS = BUILDER_GUIDE_LINKS.map((link) => ({
  ...link,
  href: buildPublicDocUrl(link.path),
}));

export const SettingsPanel: React.FC<SettingsProps> = ({ onClose }) => {
  const { t, i18n } = useTranslation();
  const currentLanguage = i18n.language;
  const changeLanguage = i18n.changeLanguage;
  const sessions = useStore((state) => state.sessions);
  const currentSessionId = useStore((state) => state.currentSessionId);
  const importSessions = useStore((state) => state.importSessions);
  const selectedModels = useStore((state) => state.selectedModels);
  const modelReadiness = useStore((state) => state.modelReadiness ?? {});
  const refreshModelReadiness =
    useStore((state) => state.refreshModelReadiness) ?? (async () => []);
  const isCheckingReadiness = useStore((state) => state.isCheckingReadiness ?? false);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);
  const [recipeName, setRecipeName] = useState('');
  const [recipePrompt, setRecipePrompt] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const themeOptions: Array<{
    id: Settings['theme'];
    icon: typeof Sun;
    label: string;
  }> = [
    { id: 'light', icon: Sun, label: t('settings.theme.light', 'Light') },
    { id: 'dark', icon: Moon, label: t('settings.theme.dark', 'Dark') },
    { id: 'system', icon: Monitor, label: t('settings.theme.system', 'System') },
  ];
  const usingRuntimeLane = settings.analysis.provider === 'switchyard_runtime';

  useEffect(() => {
    const loadSettings = async () => {
      const saved = await StorageService.getSettings();
      setSettings({ ...DEFAULT_SETTINGS, ...saved });
      // Sync i18n instance
      if (saved.language !== currentLanguage) {
        changeLanguage(saved.language);
      }
    };
    loadSettings();
  }, [changeLanguage, currentLanguage]);

  const handleSave = async () => {
    setIsSaving(true);
    await StorageService.saveSettings(settings);

    // Apply settings
    if (settings.language !== currentLanguage) {
      changeLanguage(settings.language);
    }

    setTimeout(() => {
      setIsSaving(false);
      onClose();
    }, 500);
  };

  const handleExport = () => {
    try {
      const payload = {
        schemaVersion: CURRENT_SCHEMA_VERSION,
        version: 1,
        exportDate: new Date().toISOString(),
        settings,
        sessions,
        currentSessionId,
      };
      const data = JSON.stringify(payload, null, 2);
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `prompt-switchboard-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      Logger.error('settings_export_failed', {
        surface: 'sidepanel',
        code: 'settings_export_failed',
        error: toErrorMessage(error),
      });
      alert(t('settings.data.exportError', 'Export failed'));
    }
  };

  const handleImport = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);

        const sessionsInput = Array.isArray(data) ? data : data.sessions;
        const settingsInput = Array.isArray(data) ? null : data.settings;
        const currentId = Array.isArray(data) ? null : data.currentSessionId;
        const schemaVersion = Array.isArray(data) ? null : data.schemaVersion;

        if (schemaVersion && schemaVersion > CURRENT_SCHEMA_VERSION) {
          Logger.warn('settings_import_newer_schema_version', {
            surface: 'sidepanel',
            code: 'settings_import_newer_schema_version',
            schemaVersion,
            currentSchemaVersion: CURRENT_SCHEMA_VERSION,
          });
        }

        const sessionResult = validateSessions(sessionsInput);
        if (sessionResult.sessions.length === 0) {
          throw new Error('No valid sessions in import payload');
        }

        if (sessionResult.droppedCount > 0) {
          Logger.warn('settings_import_dropped_invalid_sessions', {
            surface: 'sidepanel',
            code: 'settings_import_dropped_invalid_sessions',
            droppedCount: sessionResult.droppedCount,
          });
        }

        await importSessions(sessionResult.sessions, currentId ?? null);

        if (settingsInput) {
          const validatedSettings = validateSettings(settingsInput);
          if (validatedSettings) {
            setSettings(validatedSettings);
            await StorageService.saveSettings(validatedSettings);
            if (validatedSettings.language !== currentLanguage) {
              changeLanguage(validatedSettings.language);
            }
          } else {
            Logger.warn('settings_import_invalid_settings_payload', {
              surface: 'sidepanel',
              code: 'settings_import_invalid_settings_payload',
            });
          }
        }

        alert(t('settings.data.importSuccess', 'Import completed successfully.'));
      } catch (error) {
        Logger.error('settings_import_failed', {
          surface: 'sidepanel',
          code: 'settings_import_failed',
          error: toErrorMessage(error),
        });
        alert(t('settings.data.importError', 'Import failed'));
      } finally {
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    };
    reader.readAsText(file);
  };

  return (
    <div
      data-testid="settings-panel"
      className="absolute inset-0 z-50 flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200 bg-[rgba(7,8,10,0.94)] backdrop-blur-xl text-[color:var(--ps-text)]"
    >
      {/* Header */}
      <div className="flex items-center justify-between border-b border-[color:var(--ps-border)] px-6 py-4">
        <h2 className="text-xl font-bold text-[color:var(--ps-text)]">{t('settings.title', 'Settings')}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('settings.close', 'Close settings')}
          title={t('settings.close', 'Close settings')}
          className="ps-action-secondary rounded-full p-2 transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
        >
          <X size={20} className="text-[color:var(--ps-text-muted)]" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 space-y-8 overflow-y-auto p-6">
        {/* Language */}
        <section>
          <div className="mb-4 flex items-center gap-2 text-[color:var(--ps-accent)]">
            <Globe size={20} />
            <h3 className="font-semibold">{t('settings.language', 'Language')}</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setSettings((s) => ({ ...s, language: 'zh' }))}
              className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                settings.language === 'zh'
                  ? 'border-[rgba(255,138,91,0.32)] bg-[rgba(255,138,91,0.14)] text-[color:var(--ps-accent)]'
                  : 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.18)] text-[color:var(--ps-text-muted)]'
              }`}
            >
              {t('settings.language.zh', 'Chinese')}
            </button>
            <button
              onClick={() => setSettings((s) => ({ ...s, language: 'en' }))}
              className={`p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                settings.language === 'en'
                  ? 'border-[rgba(255,138,91,0.32)] bg-[rgba(255,138,91,0.14)] text-[color:var(--ps-accent)]'
                  : 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.18)] text-[color:var(--ps-text-muted)]'
              }`}
            >
              {t('settings.language.en', 'English')}
            </button>
          </div>
        </section>

        {/* Theme */}
        <section>
          <div className="mb-4 flex items-center gap-2 text-[color:var(--ps-accent)]">
            <Sun size={20} />
            <h3 className="font-semibold">{t('settings.theme', 'Theme')}</h3>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {themeOptions.map((item) => (
              <button
                key={item.id}
                onClick={() => setSettings((s) => ({ ...s, theme: item.id }))}
                className={`flex flex-col items-center gap-2 p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                  settings.theme === item.id
                    ? 'border-[rgba(138,155,255,0.32)] bg-[rgba(138,155,255,0.14)] text-[color:var(--ps-focus)]'
                    : 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.18)] text-[color:var(--ps-text-muted)]'
                }`}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </section>

        {/* Input Behavior */}
        <section>
          <div className="mb-4 flex items-center gap-2 text-[color:var(--ps-accent)]">
            <Keyboard size={20} />
            <h3 className="font-semibold">{t('settings.input', 'Input')}</h3>
          </div>
          <div className="space-y-3">
            <button
              onClick={() => setSettings((s) => ({ ...s, enterToSend: !s.enterToSend }))}
              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                settings.enterToSend
                  ? 'border-[rgba(138,155,255,0.32)] bg-[rgba(138,155,255,0.14)] text-[color:var(--ps-focus)]'
                  : 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.18)] text-[color:var(--ps-text-muted)]'
              }`}
              aria-pressed={settings.enterToSend}
            >
              <span>{t('settings.input.enterToSend', 'Press Enter to send')}</span>
              <span className="text-xs opacity-70">
                {settings.enterToSend ? t('common.on', 'On') : t('common.off', 'Off')}
              </span>
            </button>
            <button
              onClick={() =>
                setSettings((s) => ({ ...s, doubleClickToEdit: !s.doubleClickToEdit }))
              }
              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                settings.doubleClickToEdit
                  ? 'border-[rgba(138,155,255,0.32)] bg-[rgba(138,155,255,0.14)] text-[color:var(--ps-focus)]'
                  : 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.18)] text-[color:var(--ps-text-muted)]'
              }`}
              aria-pressed={settings.doubleClickToEdit}
            >
              <span>{t('settings.input.doubleClickToEdit', 'Double-click to rename chats')}</span>
              <span className="text-xs opacity-70">
                {settings.doubleClickToEdit ? t('common.on', 'On') : t('common.off', 'Off')}
              </span>
            </button>
          </div>
        </section>

        {/* Data Management */}
        <section>
          <div className="mb-4 flex items-center gap-2 text-[color:var(--ps-accent)]">
            <Database size={20} />
            <h3 className="font-semibold">{t('settings.data', 'Data')}</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={handleExport}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-3 text-[color:var(--ps-text-muted)] transition-all hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
            >
              <Download size={18} />
              <span className="font-medium">{t('settings.data.export', 'Export chats')}</span>
            </button>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center justify-center gap-2 rounded-xl border-2 border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-3 text-[color:var(--ps-text-muted)] transition-all hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
            >
              <Upload size={18} />
              <span className="font-medium">{t('settings.data.import', 'Import chats')}</span>
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImport}
              accept=".json"
              className="hidden"
            />
          </div>
          <div className="mt-3 rounded-2xl border border-[rgba(243,192,107,0.24)] bg-[rgba(243,192,107,0.12)] px-4 py-3 text-sm text-[color:var(--ps-warning)]">
            <p className="font-semibold">{t('settings.data.compareExport', 'Compare exports')}</p>
            <p className="mt-1 text-sm text-[color:var(--ps-warning)]">
              {t(
                'settings.data.compareExportHint',
                'Readable compare exports now live inside each compare turn so backup JSON can stay focused on migration and restore.'
              )}
            </p>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2 text-[color:var(--ps-accent)]">
            <Save size={20} />
            <h3 className="font-semibold">{t('settings.recipes', 'Prompt recipes')}</h3>
          </div>
          <div className="mb-3 rounded-2xl border border-[rgba(138,155,255,0.24)] bg-[rgba(138,155,255,0.12)] px-4 py-3 text-sm text-[color:var(--ps-focus)]">
            <p className="font-semibold">{t('settings.packsLibrary', 'Prompt packs library')}</p>
            <p className="mt-1 text-sm text-[color:var(--ps-focus)]">
              {t(
                'settings.packsLibraryHint',
                'Built-in packs now live in the compare workspace. Keep this panel focused on your own saved recipes.'
              )}
            </p>
          </div>
          <div className="space-y-3 rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] p-4">
            <input
              type="text"
              value={recipeName}
              onChange={(event) => setRecipeName(event.target.value)}
              placeholder={t('settings.recipesName', 'Recipe name')}
              className="w-full rounded-xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[color:var(--ps-text)] placeholder:text-[color:var(--ps-text-muted)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[rgba(138,155,255,0.24)]"
            />
            <textarea
              value={recipePrompt}
              onChange={(event) => setRecipePrompt(event.target.value)}
              placeholder={t('settings.recipesPrompt', 'Prompt template')}
              className="min-h-[92px] w-full rounded-xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] px-3 py-2 text-sm text-[color:var(--ps-text)] placeholder:text-[color:var(--ps-text-muted)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[rgba(138,155,255,0.24)]"
            />
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-[color:var(--ps-text-muted)]">
                {t(
                  'settings.recipesHint',
                  'Recipes use the models currently selected in the side panel.'
                )}
              </p>
              <button
                type="button"
                className="inline-flex items-center rounded-full border border-[rgba(255,138,91,0.24)] bg-[rgba(255,138,91,0.12)] px-3 py-1.5 text-xs font-medium text-[color:var(--ps-accent)] transition-colors hover:bg-[rgba(255,138,91,0.18)]"
                onClick={() => {
                  if (!recipeName.trim() || !recipePrompt.trim()) return;
                  setSettings((current) => ({
                    ...current,
                    recipes: [
                      ...(current.recipes ?? []),
                      {
                        id: crypto.randomUUID(),
                        name: recipeName.trim(),
                        prompt: recipePrompt.trim(),
                        models: selectedModels.length > 0 ? selectedModels : MODEL_ORDER.slice(0, 1),
                      },
                    ],
                  }));
                  setRecipeName('');
                  setRecipePrompt('');
                }}
              >
                {t('settings.recipesAdd', 'Save recipe')}
              </button>
            </div>

            <div className="space-y-2">
              {(settings.recipes ?? []).length === 0 ? (
                <p className="text-sm text-[color:var(--ps-text-muted)]">
                  {t('settings.recipesEmpty', 'No saved recipes yet.')}
                </p>
              ) : (
                (settings.recipes ?? []).map((recipe) => (
                  <div
                    key={recipe.id}
                    className="flex flex-col gap-2 rounded-xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-3 py-3 text-sm text-[color:var(--ps-text-soft)] md:flex-row md:items-center md:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="font-medium text-[color:var(--ps-text)]">{recipe.name}</p>
                      <p className="truncate text-xs text-[color:var(--ps-text-muted)]">{recipe.prompt}</p>
                      <p className="mt-1 text-[11px] text-[color:var(--ps-text-muted)]">
                        {recipe.models.join(', ')}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="self-start rounded-full border border-[rgba(255,123,134,0.24)] bg-[rgba(255,123,134,0.12)] px-3 py-1.5 text-xs font-medium text-[color:var(--ps-danger)] transition-colors hover:bg-[rgba(255,123,134,0.18)]"
                      onClick={() => {
                        setSettings((current) => ({
                          ...current,
                          recipes: current.recipes.filter((entry) => entry.id !== recipe.id),
                        }));
                      }}
                    >
                      {t('settings.recipesDelete', 'Delete recipe')}
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center gap-2 text-[color:var(--ps-accent)]">
            <Bot size={20} />
            <h3 className="font-semibold">{t('settings.analysis', 'AI Compare Analyst')}</h3>
          </div>
          <div className="space-y-4 rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] p-4">
            <button
              type="button"
              onClick={() =>
                setSettings((current) => ({
                  ...current,
                  analysis: {
                    ...current.analysis,
                    enabled: !current.analysis.enabled,
                  },
                }))
              }
              className={`w-full flex items-center justify-between p-3 rounded-xl border-2 text-sm font-medium transition-all ${
                settings.analysis.enabled
                  ? 'border-[rgba(138,155,255,0.32)] bg-[rgba(138,155,255,0.14)] text-[color:var(--ps-focus)]'
                  : 'border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] hover:border-[rgba(255,255,255,0.18)] text-[color:var(--ps-text-muted)]'
              }`}
              aria-pressed={settings.analysis.enabled}
            >
              <span>
                {t(
                  'settings.analysis.enable',
                  'Turn on AI Compare Analyst for follow-up summaries and next-question suggestions'
                )}
              </span>
              <span className="text-xs opacity-70">
                {settings.analysis.enabled ? t('common.on', 'On') : t('common.off', 'Off')}
              </span>
            </button>

            <div className="grid gap-3 md:grid-cols-2">
              <button
                type="button"
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    analysis: {
                      ...current.analysis,
                      provider: 'browser_session',
                    },
                  }))
                }
                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                  settings.analysis.provider === 'browser_session'
                    ? 'border-purple-500 bg-purple-50/80 shadow-sm'
                    : 'border-gray-200 bg-white hover:border-purple-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {t('settings.analysis.browserSessionTitle', 'Browser-session analyst')}
                  </p>
                  <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                    {t('settings.analysis.available', 'Available')}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {t(
                    'settings.analysis.browserSessionBody',
                    'Run one structured analysis prompt through a supported tab you already keep signed in.'
                  )}
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-sky-200 bg-sky-50 px-3 py-1.5 text-[11px] font-medium text-sky-800">
                  <Sparkles size={14} />
                  <span>{t('settings.analysis.browserTabSurface', 'Browser tab lane')}</span>
                </div>
              </button>

              <button
                type="button"
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    analysis: {
                      ...current.analysis,
                      provider: 'switchyard_runtime',
                    },
                  }))
                }
                className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                  settings.analysis.provider === 'switchyard_runtime'
                    ? 'border-amber-400 bg-amber-50/80 shadow-sm'
                    : 'border-amber-200 bg-white hover:border-amber-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {t('settings.analysis.byokTitle', 'Local Switchyard runtime')}
                  </p>
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                    {t('settings.analysis.partial', 'Partial')}
                  </span>
                </div>
                <p className="mt-2 text-sm text-slate-600">
                  {t(
                    'settings.analysis.byokBody',
                    'Use one local Switchyard service for the analysis lane while Prompt Switchboard keeps compare, tabs, and workflow orchestration in the browser.'
                  )}
                </p>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-800">
                  <ShieldAlert size={14} />
                  <span>
                    {t(
                      'settings.analysis.byokNote',
                      'Requires a local Switchyard service on http://127.0.0.1:4317 and a compatible runtime-backed provider session.'
                    )}
                  </span>
                </div>
                <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-[11px] font-medium text-slate-700">
                  <Bot size={14} />
                  <span>
                    {t('settings.analysis.futureRuntimeSurface', 'Local runtime-backed analyst lane')}
                  </span>
                </div>
              </button>
            </div>

            <div className="rounded-2xl border border-white bg-white px-4 py-4">
              <p className="text-sm font-semibold text-slate-900">
                {t('settings.analysis.model', 'Preferred analyst model')}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {usingRuntimeLane
                  ? t(
                      'settings.analysis.modelHintRuntime',
                      'Runtime-backed analysis currently supports ChatGPT, Gemini, Qwen, and Grok. Perplexity stays on the browser-tab lane only for now.'
                    )
                  : t(
                      'settings.analysis.modelHint',
                      'Prompt Switchboard tries this tab first, then falls back to another ready model if needed.'
                    )}
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                {MODEL_ORDER.map((model) => (
                  <button
                    key={model}
                    type="button"
                    disabled={usingRuntimeLane && !isSwitchyardRuntimeSupportedModel(model)}
                    onClick={() =>
                      setSettings((current) => ({
                        ...current,
                        analysis: {
                          ...current.analysis,
                          model,
                        },
                      }))
                    }
                    className={`rounded-xl border px-3 py-2 text-sm font-medium transition-all ${
                      settings.analysis.model === model &&
                      (!usingRuntimeLane || isSwitchyardRuntimeSupportedModel(model))
                        ? usingRuntimeLane
                          ? 'border-amber-400 bg-amber-50 text-amber-800'
                          : 'border-purple-500 bg-purple-50 text-purple-700'
                        : usingRuntimeLane && !isSwitchyardRuntimeSupportedModel(model)
                          ? 'border-slate-200 bg-slate-50 text-slate-400'
                          : 'border-gray-200 bg-white text-gray-600 hover:border-purple-200'
                    } ${usingRuntimeLane && !isSwitchyardRuntimeSupportedModel(model) ? 'cursor-not-allowed opacity-70' : ''}`}
                    title={
                      usingRuntimeLane && !isSwitchyardRuntimeSupportedModel(model)
                        ? t(
                            'settings.analysis.modelUnsupported',
                            'This runtime-backed lane does not ship a Perplexity mapping yet.'
                          )
                        : undefined
                    }
                  >
                    {model}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-sky-100 bg-sky-50/70 px-4 py-4 text-sm text-sky-900">
              <div className="flex items-center gap-2">
                <Sparkles size={16} />
                <p className="font-semibold">
                  {t('settings.analysis.boundaryTitle', 'Trust boundary')}
                </p>
              </div>
              <p className="mt-2 text-sm text-sky-800">
                {usingRuntimeLane
                  ? t(
                      'settings.analysis.boundaryRuntime',
                      'Core compare stays local-first and browser-native. The runtime lane only powers analyst execution; it does not take over tabs, compare fan-out, or the sidepanel workflow shell.'
                    )
                  : t(
                      'settings.analysis.boundary',
                      'Core compare stays local-first. AI Compare Analyst reuses a browser tab you already trust and sends one visible analysis prompt there.'
                    )}
              </p>
            </div>
          </div>
        </section>

        <section>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[color:var(--ps-accent)]">
              <Activity size={20} />
              <h3 className="font-semibold">{t('settings.health', 'Model health')}</h3>
            </div>
            <button
              type="button"
              onClick={() => {
                void refreshModelReadiness(MODEL_ORDER);
              }}
              className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
            >
              <RefreshCcw size={14} className={isCheckingReadiness ? 'animate-spin' : ''} />
              <span>{t('readiness.refresh', 'Refresh')}</span>
            </button>
          </div>

          <div className="space-y-2 rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] p-4">
            {MODEL_ORDER.map((model) => {
              const report = modelReadiness[model];
              return (
                <div
                  key={model}
                  className="flex flex-col gap-2 rounded-xl border border-white bg-white/80 px-3 py-3 text-sm md:flex-row md:items-center md:justify-between"
                >
                  <div>
                    <p className="font-medium text-gray-800">{model}</p>
                    <p className="text-xs text-gray-500">
                      {report?.hostname || t('readiness.unchecked', 'No live tab checked yet')}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full border border-gray-200 bg-gray-50 px-2.5 py-1 font-medium text-gray-700">
                      {report
                        ? report.ready
                          ? t('readiness.ready', 'Ready')
                          : formatReadinessStatus(report.status, (key, defaultValue) =>
                              t(key, defaultValue)
                            )
                        : t('readiness.checking', 'Checking')}
                    </span>
                    {report?.selectorSource && (
                      <span className="rounded-full border border-gray-200 bg-white px-2.5 py-1 text-gray-600">
                        {t('compare.label.selectors', 'Selectors')}:{' '}
                        {formatSelectorSource(report.selectorSource, (key, defaultValue) =>
                          t(key, defaultValue)
                        )}
                      </span>
                    )}
                    {report?.failureClass && (
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-rose-700">
                        {formatFailureClass(report.failureClass, (key, defaultValue) =>
                          t(key, defaultValue)
                        )}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pt-3">
          <div className="mb-4 flex items-center gap-2 border-t border-dashed border-[color:var(--ps-border)] pt-5 text-[color:var(--ps-accent)]">
            <ShieldAlert size={20} />
            <h3 className="font-semibold">{t('settings.guides', 'Guides')}</h3>
          </div>
          <div className="space-y-3 rounded-2xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
              {t('settings.guidesModeLabel', 'Help center')}
            </p>
            <p className="text-sm text-[color:var(--ps-text-muted)]">
              {t(
                'settings.guidesBody',
                'Open the strongest setup and support guides when you need the install path, supported sites, first compare repair map, or FAQ answers. MCP starter kits and agent guides stay available when you are ready for the builder lane.'
              )}
            </p>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
              {t('settings.guidesEssentialTitle', 'Compare-first essentials')}
            </p>
            <div className="flex flex-wrap gap-2">
              {ESSENTIAL_GUIDE_BUTTONS.map((link) => (
                <button
                  key={link.id}
                  type="button"
                  onClick={() => window.open(link.href, '_blank', 'noopener,noreferrer')}
                  className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                >
                  <ArrowUpRight size={14} />
                  <span>{t(`settings.guidesLink.${link.id}`, link.fallbackLabel)}</span>
                </button>
              ))}
            </div>
            <div className="rounded-2xl border border-dashed border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.04)] p-3">
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[color:var(--ps-text-muted)]">
                {t('settings.guidesBuilderTitle', 'Builder lane (Optional)')}
              </p>
              <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.12em] text-[color:var(--ps-text-muted)]">
                {t('settings.guidesBuilderKickoff', 'After compare-first is healthy')}
              </p>
              <p className="mt-2 text-sm text-[color:var(--ps-text-muted)]">
                {t(
                  'settings.guidesBuilderBody',
                  'Open these only after the first compare path is healthy. They are for host setup, MCP wiring, and agent-side integration.'
                )}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {BUILDER_GUIDE_BUTTONS.map((link) => (
                  <button
                    key={link.id}
                    type="button"
                    onClick={() => window.open(link.href, '_blank', 'noopener,noreferrer')}
                    className="ps-action-secondary inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-medium transition-colors hover:border-[rgba(255,255,255,0.18)] hover:bg-[rgba(255,255,255,0.08)] hover:text-[color:var(--ps-text)]"
                  >
                    <ArrowUpRight size={14} />
                    <span>{t(`settings.guidesLink.${link.id}`, link.fallbackLabel)}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Shortcuts (Read-only for now) */}
        <section>
          <div className="mb-4 flex items-center gap-2 text-[color:var(--ps-accent)]">
            <Keyboard size={20} />
            <h3 className="font-semibold">{t('settings.shortcuts')}</h3>
          </div>
          <div className="space-y-2 rounded-xl border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] p-4">
            <div className="flex justify-between items-center">
              <span className="text-sm text-[color:var(--ps-text-muted)]">
                {t('settings.shortcuts.send', 'Send message')}
              </span>
              <kbd className="rounded border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2 py-1 text-xs font-mono text-[color:var(--ps-text-soft)] shadow-sm">
                {settings.enterToSend ? 'Enter' : 'Ctrl/Cmd + Enter'}
              </kbd>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[color:var(--ps-text-muted)]">
                {t('settings.shortcuts.newChat', 'New chat')}
              </span>
              <kbd className="rounded border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2 py-1 text-xs font-mono text-[color:var(--ps-text-soft)] shadow-sm">
                Ctrl/Cmd + N
              </kbd>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-[color:var(--ps-text-muted)]">
                {t('settings.shortcuts.newLine', 'New line')}
              </span>
              <kbd className="rounded border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] px-2 py-1 text-xs font-mono text-[color:var(--ps-text-soft)]">
                Shift + Enter
              </kbd>
            </div>
          </div>
        </section>
      </div>

      {/* Footer */}
      <div className="border-t border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.03)] p-6">
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="ps-action-primary flex w-full items-center justify-center gap-2 rounded-xl py-3 font-semibold transition-all hover:shadow-[0_20px_40px_rgba(201,100,66,0.32)] active:scale-[0.98]"
        >
          {isSaving ? (
            <span>{t('common.saving', 'Saving...')}</span>
          ) : (
            <>
              <Save size={18} />
              <span>{t('common.save', 'Save settings')}</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
