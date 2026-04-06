import { z } from 'zod';
import type { Session, ModelName, StreamResponsePayload } from '../utils/types';
import { DELIVERY_STATUS, MESSAGE_ROLES, SEND_ERROR_CODES } from '../utils/types';
import { Logger, toErrorMessage } from '../utils/logger';
import { normalizeSessionMessages } from '../utils/messages';
import type { WorkflowRunState } from '../substrate/workflow';
import {
  ANALYSIS_PROVIDER_IDS,
  LEGACY_ANALYSIS_PROVIDER_IDS,
  type AnalysisProviderId,
} from './analysis/types';

interface WorkflowRunRecord {
  runId: string;
  run: WorkflowRunState;
}

// --- Zod Schemas ---

const ModelNameSchema = z.enum(['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok']);

const MessageSchema = z.object({
  id: z.string(),
  role: z.enum([MESSAGE_ROLES.USER, MESSAGE_ROLES.ASSISTANT, MESSAGE_ROLES.SYSTEM]),
  text: z.string(),
  timestamp: z.number(),
  model: z.enum(['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok']).optional(),
  turnId: z.string().optional(),
  requestId: z.string().optional(),
  requestedModels: z.array(ModelNameSchema).optional(),
  isStreaming: z.boolean().optional().default(false),
  deliveryStatus: z
    .enum([
      DELIVERY_STATUS.PENDING,
      DELIVERY_STATUS.STREAMING,
      DELIVERY_STATUS.COMPLETE,
      DELIVERY_STATUS.ERROR,
    ])
    .optional(),
  deliveryErrorCode: z
    .enum([
      SEND_ERROR_CODES.TIMEOUT,
      SEND_ERROR_CODES.RUNTIME,
      SEND_ERROR_CODES.HANDSHAKE,
      SEND_ERROR_CODES.REJECTED,
    ])
    .optional(),
  completedAt: z.number().optional(),
  data: z
    .object({
      stage: z.string().optional(),
      hostname: z.string().optional(),
      selectorSource: z.enum(['default', 'cached']).optional(),
      remoteConfigConfigured: z.boolean().optional(),
      failureClass: z
        .enum([
          'handshake_mismatch',
          'selector_drift_suspect',
          'transient_delivery_or_runtime',
          'tab_unavailable',
        ])
        .optional(),
      readinessStatus: z
        .enum([
          'ready',
          'tab_missing',
          'tab_loading',
          'content_unavailable',
          'model_mismatch',
          'selector_drift_suspect',
        ])
        .optional(),
      inputReady: z.boolean().optional(),
      submitReady: z.boolean().optional(),
      lastCheckedAt: z.number().optional(),
    })
    .optional(),
});

const SelectedModelsSchema = z.array(ModelNameSchema).default(['ChatGPT']);

const PromptRecipeSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  prompt: z.string().min(1),
  models: SelectedModelsSchema,
});

const AnalysisProviderSettingSchema = z.preprocess(
  (value) =>
    value === LEGACY_ANALYSIS_PROVIDER_IDS.GEMINI_BYOK
      ? ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME
      : value,
  z.enum([ANALYSIS_PROVIDER_IDS.BROWSER_SESSION, ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME])
);

const AnalysisSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  provider: AnalysisProviderSettingSchema.default(
    ANALYSIS_PROVIDER_IDS.BROWSER_SESSION
  ) as z.ZodType<AnalysisProviderId>,
  model: ModelNameSchema.default('ChatGPT'),
});

export const SessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  messages: z.array(MessageSchema),
  createdAt: z.number(),
  updatedAt: z.number(),
  selectedModels: SelectedModelsSchema,
});

export const SettingsSchema = z.object({
  language: z.string().default('en'),
  theme: z.enum(['light', 'dark', 'system']).default('system'),
  enterToSend: z.boolean().default(true),
  doubleClickToEdit: z.boolean().default(true),
  pinnedSessionIds: z.array(z.string()).default([]),
  recipes: z.array(PromptRecipeSchema).default([]),
  shortcuts: z.record(z.string(), z.string()).default({}),
  analysis: AnalysisSettingsSchema.default(() => AnalysisSettingsSchema.parse({})),
});

export type Settings = z.infer<typeof SettingsSchema>;
export type PromptRecipe = z.infer<typeof PromptRecipeSchema>;
export type AnalysisSettings = z.infer<typeof AnalysisSettingsSchema>;
export const DEFAULT_SETTINGS: Settings = SettingsSchema.parse({});

interface ParsedSessionsResult {
  sessions: Session[];
  droppedCount: number;
  hadErrors: boolean;
}

const BufferedStreamUpdateSchema = z.object({
  model: ModelNameSchema,
  requestId: z.string().optional(),
  turnId: z.string().optional(),
  text: z.string(),
  isComplete: z.boolean().optional(),
  deliveryStatus: z
    .enum([
      DELIVERY_STATUS.PENDING,
      DELIVERY_STATUS.STREAMING,
      DELIVERY_STATUS.COMPLETE,
      DELIVERY_STATUS.ERROR,
    ])
    .optional(),
  errorCode: z
    .enum([
      SEND_ERROR_CODES.TIMEOUT,
      SEND_ERROR_CODES.RUNTIME,
      SEND_ERROR_CODES.HANDSHAKE,
      SEND_ERROR_CODES.REJECTED,
    ])
    .optional(),
  completedAt: z.number().optional(),
  data: MessageSchema.shape.data,
});

// ==================== Schema Versioning ====================
export const CURRENT_SCHEMA_VERSION = 3;
const DEFAULT_SELECTED_MODELS: ModelName[] = ['ChatGPT'];

let migrationPromise: Promise<void> | null = null;

const normalizeSessionRecord = (session: Session): { session: Session; changed: boolean } => {
  const selectedModels =
    session.selectedModels?.length && session.selectedModels.length > 0
      ? session.selectedModels
      : DEFAULT_SELECTED_MODELS;

  const messages = normalizeSessionMessages(session.messages, selectedModels);
  const changed =
    selectedModels !== session.selectedModels ||
    messages.some(
      (message, index) => JSON.stringify(message) !== JSON.stringify(session.messages[index])
    );

  if (selectedModels !== session.selectedModels) {
    // already tracked in the aggregate comparison above
  }

  return {
    session: {
      ...session,
      selectedModels,
      messages,
    },
    changed,
  };
};

const parseSessions = (data: unknown): ParsedSessionsResult => {
  const parsed = z.array(SessionSchema).safeParse(data);
  if (parsed.success) {
    const normalizedSessions = parsed.data.map(
      (session) => normalizeSessionRecord(session).session
    );
    return {
      sessions: normalizedSessions as Session[],
      droppedCount: 0,
      hadErrors: false,
    };
  }

  if (!Array.isArray(data)) {
    return { sessions: [], droppedCount: 0, hadErrors: true };
  }

  const validSessions: Session[] = [];
  let invalidCount = 0;

  data.forEach((item) => {
    const result = SessionSchema.safeParse(item);
    if (result.success) {
      validSessions.push(normalizeSessionRecord(result.data as Session).session);
    } else {
      invalidCount += 1;
    }
  });

  return {
    sessions: validSessions,
    droppedCount: invalidCount,
    hadErrors: true,
  };
};

export const validateSessions = (data: unknown): ParsedSessionsResult => parseSessions(data);

export const validateSettings = (data: unknown): Settings | null => {
  const parsed = SettingsSchema.safeParse(data);
  return parsed.success ? parsed.data : null;
};

// --- Storage Keys ---

const KEYS = {
  SESSIONS: 'sessions',
  CURRENT_SESSION_ID: 'currentSessionId',
  SELECTED_MODELS: 'selectedModels',
  SETTINGS: 'settings',
  SCHEMA_VERSION: 'schemaVersion',
  SELECTORS: 'selectors',
  TABS: 'tabs',
  PROMPT_SWITCHBOARD_GROUP_ID: 'promptSwitchboardGroupId',
  BUFFERED_STREAM_UPDATES: 'bufferedStreamUpdates',
  WORKFLOW_RUN_SNAPSHOTS: 'workflowRunSnapshots',
};

const LEGACY_LOCAL_WORKFLOW_RUNS_KEY = 'workflowRuns';

// ==================== Migration Helpers ====================
const coerceSchemaVersion = (value: unknown): number => {
  if (typeof value !== 'number' || Number.isNaN(value)) return 0;
  return value;
};

const normalizeSelectedModels = (value: unknown): ModelName[] | null => {
  if (value === undefined || value === null) return null;
  const parsed = SelectedModelsSchema.safeParse(value);
  if (parsed.success && parsed.data.length > 0) return parsed.data as ModelName[];
  return [...DEFAULT_SELECTED_MODELS];
};

const migrateStorageToLatest = async (): Promise<void> => {
  try {
    const snapshot = await chrome.storage.local.get([
      KEYS.SCHEMA_VERSION,
      KEYS.SESSIONS,
      KEYS.SELECTED_MODELS,
      KEYS.SETTINGS,
      KEYS.CURRENT_SESSION_ID,
    ]);

    const storedVersion = coerceSchemaVersion(snapshot[KEYS.SCHEMA_VERSION]);
    if (storedVersion >= CURRENT_SCHEMA_VERSION) return;

    const updates: Record<string, unknown> = {
      [KEYS.SCHEMA_VERSION]: CURRENT_SCHEMA_VERSION,
    };

    let didChange = false;

    if (storedVersion < 1) {
      const sessionsInput = snapshot[KEYS.SESSIONS];
      if (sessionsInput !== undefined) {
        const { sessions: normalizedSessions, droppedCount } = parseSessions(sessionsInput);
        if (!Array.isArray(sessionsInput) || droppedCount > 0) {
          didChange = true;
        }
        if (Array.isArray(sessionsInput) && normalizedSessions.length !== sessionsInput.length) {
          didChange = true;
        }
        if (didChange) {
          updates[KEYS.SESSIONS] = normalizedSessions;
          if (droppedCount > 0) {
            Logger.warn('storage_migration_sessions_dropped', {
              droppedCount,
              from: storedVersion,
              to: CURRENT_SCHEMA_VERSION,
            });
          }
        }
      }

      const normalizedSelectedModels = normalizeSelectedModels(snapshot[KEYS.SELECTED_MODELS]);
      if (normalizedSelectedModels) {
        updates[KEYS.SELECTED_MODELS] = normalizedSelectedModels;
        didChange = true;
      }

      if (snapshot[KEYS.SETTINGS] !== undefined) {
        const validatedSettings = validateSettings(snapshot[KEYS.SETTINGS]);
        updates[KEYS.SETTINGS] = validatedSettings ?? DEFAULT_SETTINGS;
        didChange = true;
      }

      const currentSessionId = snapshot[KEYS.CURRENT_SESSION_ID];
      if (currentSessionId !== undefined && typeof currentSessionId !== 'string') {
        updates[KEYS.CURRENT_SESSION_ID] = null;
        didChange = true;
      }
    }

    if (storedVersion < 2) {
      const sessionsInput = updates[KEYS.SESSIONS] ?? snapshot[KEYS.SESSIONS];
      if (sessionsInput !== undefined) {
        const { sessions: parsedSessions } = parseSessions(sessionsInput);
        const normalizedSessions = parsedSessions.map((session) => normalizeSessionRecord(session));
        const changedSessions = normalizedSessions.some((entry) => entry.changed);
        if (changedSessions) {
          updates[KEYS.SESSIONS] = normalizedSessions.map((entry) => entry.session);
          didChange = true;
        }
      }
    }

    if (storedVersion < 3) {
      await chrome.storage.local.remove(LEGACY_LOCAL_WORKFLOW_RUNS_KEY);
      didChange = true;
    }

    await chrome.storage.local.set(updates);
    Logger.info('storage_migration_applied', {
      from: storedVersion,
      to: CURRENT_SCHEMA_VERSION,
      changed: didChange,
    });
  } catch (error) {
    Logger.error('storage_migration_failed', {
      error: toErrorMessage(error),
    });
    migrationPromise = null;
  }
};

const ensureMigrated = async (): Promise<void> => {
  if (!migrationPromise) {
    migrationPromise = migrateStorageToLatest();
  }
  await migrationPromise;
};

// --- Storage Service ---

export const StorageService = {
  // Sessions
  async getSessions(): Promise<Session[]> {
    try {
      await ensureMigrated();
      const result = await chrome.storage.local.get(KEYS.SESSIONS);
      const data = result[KEYS.SESSIONS];
      if (!data) return [];

      // Validate with Zod
      const parseResult = z.array(SessionSchema).safeParse(data);
      if (parseResult.success) {
        return parseResult.data.map(
          (session) => normalizeSessionRecord(session).session
        ) as Session[];
      }

      Logger.error('storage_sessions_validation_failed', {
        surface: 'storage',
        code: 'storage_sessions_validation_failed',
        error: parseResult.error.format(),
      });

      const { sessions, droppedCount } = parseSessions(data);
      if (droppedCount > 0) {
        Logger.warn('storage_sessions_dropped_invalid', {
          surface: 'storage',
          code: 'storage_sessions_dropped_invalid',
          droppedCount,
        });
      }

      return sessions;
    } catch (e) {
      Logger.error('storage_get_sessions_failed', {
        surface: 'storage',
        code: 'storage_get_sessions_failed',
        error: toErrorMessage(e),
      });
      return [];
    }
  },

  async saveSessions(sessions: Session[]): Promise<void> {
    try {
      await chrome.storage.local.set({ [KEYS.SESSIONS]: sessions });
    } catch (error) {
      Logger.error('storage_save_sessions_failed', {
        surface: 'storage',
        code: 'storage_save_sessions_failed',
        error: toErrorMessage(error),
      });
    }
  },

  async getSession(id: string): Promise<Session | null> {
    const sessions = await this.getSessions();
    return sessions.find((s) => s.id === id) || null;
  },

  async saveSession(session: Session): Promise<void> {
    const sessions = await this.getSessions();
    const index = sessions.findIndex((s) => s.id === session.id);

    if (index !== -1) {
      sessions[index] = session;
    } else {
      sessions.push(session);
    }

    await this.saveSessions(sessions);
  },

  async deleteSession(id: string): Promise<void> {
    const sessions = await this.getSessions();
    const newSessions = sessions.filter((s) => s.id !== id);
    await this.saveSessions(newSessions);
  },

  // Current Session ID
  async getCurrentSessionId(): Promise<string | null> {
    try {
      await ensureMigrated();
      const result = await chrome.storage.local.get(KEYS.CURRENT_SESSION_ID);
      const id = result[KEYS.CURRENT_SESSION_ID];
      return typeof id === 'string' ? id : null;
    } catch (error) {
      Logger.error('storage_get_current_session_id_failed', {
        surface: 'storage',
        code: 'storage_get_current_session_id_failed',
        error: toErrorMessage(error),
      });
      return null;
    }
  },

  async saveCurrentSessionId(id: string | null): Promise<void> {
    try {
      await chrome.storage.local.set({ [KEYS.CURRENT_SESSION_ID]: id });
    } catch (error) {
      Logger.error('storage_save_current_session_id_failed', {
        surface: 'storage',
        code: 'storage_save_current_session_id_failed',
        error: toErrorMessage(error),
      });
    }
  },

  // Selected Models
  async getSelectedModels(): Promise<ModelName[]> {
    try {
      await ensureMigrated();
      const result = await chrome.storage.local.get(KEYS.SELECTED_MODELS);
      const raw = result[KEYS.SELECTED_MODELS];
      if (!raw) return [...DEFAULT_SELECTED_MODELS];

      const parsed = z.array(ModelNameSchema).safeParse(raw);
      return parsed.success ? (parsed.data as ModelName[]) : [...DEFAULT_SELECTED_MODELS];
    } catch (error) {
      Logger.error('storage_get_selected_models_failed', {
        surface: 'storage',
        code: 'storage_get_selected_models_failed',
        error: toErrorMessage(error),
      });
      return [...DEFAULT_SELECTED_MODELS];
    }
  },

  async saveSelectedModels(models: ModelName[]): Promise<void> {
    try {
      await chrome.storage.local.set({ [KEYS.SELECTED_MODELS]: models });
    } catch (error) {
      Logger.error('storage_save_selected_models_failed', {
        surface: 'storage',
        code: 'storage_save_selected_models_failed',
        error: toErrorMessage(error),
      });
    }
  },

  // Settings
  async getSettings(): Promise<Settings> {
    try {
      await ensureMigrated();
      const result = await chrome.storage.local.get(KEYS.SETTINGS);
      const raw = result[KEYS.SETTINGS];
      if (!raw) return DEFAULT_SETTINGS; // Return defaults

      const parsed = SettingsSchema.safeParse(raw);
      return parsed.success ? parsed.data : DEFAULT_SETTINGS;
    } catch (error) {
      Logger.error('storage_get_settings_failed', {
        surface: 'storage',
        code: 'storage_get_settings_failed',
        error: toErrorMessage(error),
      });
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: Settings): Promise<void> {
    try {
      await chrome.storage.local.set({ [KEYS.SETTINGS]: settings });
    } catch (error) {
      Logger.error('storage_save_settings_failed', {
        surface: 'storage',
        code: 'storage_save_settings_failed',
        error: toErrorMessage(error),
      });
    }
  },

  // Workflow run snapshots are transient runtime envelopes, not a second durable product ledger.
  async getWorkflowRuns(): Promise<WorkflowRunRecord[]> {
    try {
      await ensureMigrated();
      const result = await chrome.storage.session.get(KEYS.WORKFLOW_RUN_SNAPSHOTS);
      const raw = result[KEYS.WORKFLOW_RUN_SNAPSHOTS];
      if (!raw) return [];
      return Array.isArray(raw) ? (raw as WorkflowRunRecord[]) : [];
    } catch (error) {
      Logger.error('storage_get_workflow_runs_failed', {
        surface: 'storage',
        code: 'storage_get_workflow_runs_failed',
        error: toErrorMessage(error),
      });
      return [];
    }
  },

  async saveWorkflowRuns(runs: WorkflowRunRecord[]): Promise<void> {
    try {
      await chrome.storage.session.set({ [KEYS.WORKFLOW_RUN_SNAPSHOTS]: runs });
    } catch (error) {
      Logger.error('storage_save_workflow_runs_failed', {
        surface: 'storage',
        code: 'storage_save_workflow_runs_failed',
        error: toErrorMessage(error),
      });
    }
  },

  async getWorkflowRun(runId: string): Promise<WorkflowRunRecord | null> {
    const runs = await this.getWorkflowRuns();
    return runs.find((entry) => entry.runId === runId) ?? null;
  },

  async saveWorkflowRun(record: WorkflowRunRecord): Promise<void> {
    const runs = await this.getWorkflowRuns();
    const existingIndex = runs.findIndex((entry) => entry.runId === record.runId);
    const nextRuns =
      existingIndex >= 0
        ? runs.map((entry, index) => (index === existingIndex ? record : entry))
        : [record, ...runs];
    await this.saveWorkflowRuns(nextRuns);
  },

  async getSelectors(): Promise<Record<string, unknown> | null> {
    try {
      const storage = chrome.storage.local as unknown as {
        get: (key: string) => Promise<Record<string, Record<string, unknown> | undefined>>;
      };
      const result = await storage.get(KEYS.SELECTORS);
      return result[KEYS.SELECTORS] || null;
    } catch (error) {
      Logger.error('storage_get_selectors_failed', {
        surface: 'storage',
        code: 'storage_get_selectors_failed',
        error: toErrorMessage(error),
      });
      return null;
    }
  },

  async saveSelectors(selectors: Record<string, unknown>): Promise<void> {
    try {
      await chrome.storage.local.set({ [KEYS.SELECTORS]: selectors });
    } catch (error) {
      Logger.error('storage_save_selectors_failed', {
        surface: 'storage',
        code: 'storage_save_selectors_failed',
        error: toErrorMessage(error),
      });
    }
  },

  // Clear all data (debug/reset)
  async clearAll(): Promise<void> {
    try {
      await chrome.storage.local.clear();
      await chrome.storage.session.clear();
      migrationPromise = null;
    } catch (error) {
      Logger.error('storage_clear_all_failed', {
        surface: 'storage',
        code: 'storage_clear_all_failed',
        error: toErrorMessage(error),
      });
    }
  },

  // --- Session Storage (Transient) ---

  async getTabs(): Promise<Record<string, number>> {
    try {
      const result = await chrome.storage.session.get(KEYS.TABS);
      const raw = result[KEYS.TABS];
      if (!raw) return {};

      const parsed = z.record(z.string(), z.number()).safeParse(raw);
      return parsed.success ? parsed.data : {};
    } catch (error) {
      Logger.error('storage_get_tabs_failed', {
        surface: 'storage',
        code: 'storage_get_tabs_failed',
        error: toErrorMessage(error),
      });
      return {};
    }
  },

  async saveTabs(tabs: Record<string, number>): Promise<void> {
    try {
      await chrome.storage.session.set({ [KEYS.TABS]: tabs });
    } catch (error) {
      Logger.error('storage_save_tabs_failed', {
        surface: 'storage',
        code: 'storage_save_tabs_failed',
        error: toErrorMessage(error),
      });
    }
  },

  async getPromptSwitchboardGroupId(): Promise<number | null> {
    try {
      const result = await chrome.storage.session.get(KEYS.PROMPT_SWITCHBOARD_GROUP_ID);
      const raw = result[KEYS.PROMPT_SWITCHBOARD_GROUP_ID];
      if (raw === undefined || raw === null) return null;

      const parsed = z.number().safeParse(raw);
      return parsed.success ? parsed.data : null;
    } catch (error) {
      Logger.error('storage_get_group_id_failed', {
        surface: 'storage',
        code: 'storage_get_group_id_failed',
        error: toErrorMessage(error),
      });
      return null;
    }
  },

  async savePromptSwitchboardGroupId(id: number | null): Promise<void> {
    try {
      await chrome.storage.session.set({ [KEYS.PROMPT_SWITCHBOARD_GROUP_ID]: id });
    } catch (error) {
      Logger.error('storage_save_group_id_failed', {
        surface: 'storage',
        code: 'storage_save_group_id_failed',
        error: toErrorMessage(error),
      });
    }
  },

  async getBufferedStreamUpdates(): Promise<StreamResponsePayload[]> {
    try {
      const result = await chrome.storage.session.get(KEYS.BUFFERED_STREAM_UPDATES);
      const raw = result[KEYS.BUFFERED_STREAM_UPDATES];
      if (!raw) return [];

      const parsed = z.record(z.string(), BufferedStreamUpdateSchema).safeParse(raw);
      return parsed.success ? (Object.values(parsed.data) as StreamResponsePayload[]) : [];
    } catch (error) {
      Logger.error('storage_get_buffered_updates_failed', {
        surface: 'storage',
        code: 'storage_get_buffered_updates_failed',
        error: toErrorMessage(error),
      });
      return [];
    }
  },

  async saveBufferedStreamUpdate(payload: StreamResponsePayload): Promise<void> {
    try {
      const existing = await this.getBufferedStreamUpdates();
      const updates = Object.fromEntries(
        existing
          .filter(
            (entry) => !(entry.turnId === payload.turnId && entry.model === payload.model)
          )
          .concat(payload)
          .map((entry) => [`${entry.turnId ?? 'unknown'}:${entry.model}`, entry])
      );
      await chrome.storage.session.set({ [KEYS.BUFFERED_STREAM_UPDATES]: updates });
    } catch (error) {
      Logger.error('storage_save_buffered_update_failed', {
        surface: 'storage',
        code: 'storage_save_buffered_update_failed',
        error: toErrorMessage(error),
      });
    }
  },

  async consumeBufferedStreamUpdates(): Promise<StreamResponsePayload[]> {
    try {
      const updates = await this.getBufferedStreamUpdates();
      await chrome.storage.session.remove(KEYS.BUFFERED_STREAM_UPDATES);
      return updates;
    } catch (error) {
      Logger.error('storage_consume_buffered_updates_failed', {
        surface: 'storage',
        code: 'storage_consume_buffered_updates_failed',
        error: toErrorMessage(error),
      });
      return [];
    }
  },
};
