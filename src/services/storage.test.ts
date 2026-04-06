import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StorageService,
  DEFAULT_SETTINGS,
  validateSessions,
  validateSettings,
  type Settings,
  CURRENT_SCHEMA_VERSION,
} from './storage';
import { DELIVERY_STATUS, type Session } from '../utils/types';
import { createCompareAnalyzeFollowUpWorkflow, createWorkflowRunState } from '../substrate/workflow';

const testGlobal = globalThis as typeof globalThis & { chrome?: typeof chrome };

type StorageGetMock = {
  mockResolvedValue: (value: unknown) => StorageGetMock;
  mockResolvedValueOnce: (value: unknown) => StorageGetMock;
  mockRejectedValue: (value: unknown) => StorageGetMock;
  mockRejectedValueOnce: (value: unknown) => StorageGetMock;
};

type StorageSetMock = {
  mockRejectedValue: (value: unknown) => StorageSetMock;
  mockRejectedValueOnce: (value: unknown) => StorageSetMock;
};

const localGetMock = () => chrome.storage.local.get as unknown as StorageGetMock;
const localSetMock = () => chrome.storage.local.set as unknown as StorageSetMock;
const sessionGetMock = () => chrome.storage.session.get as unknown as StorageGetMock;
const sessionSetMock = () => chrome.storage.session.set as unknown as StorageSetMock;

const setupChromeStorage = () => {
  const local = {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  };
  const session = {
    get: vi.fn(),
    set: vi.fn(),
    remove: vi.fn(),
    clear: vi.fn(),
  };

  testGlobal.chrome = {
    storage: {
      local,
      session,
    },
  } as unknown as typeof chrome;

  return { local, session };
};

describe('StorageService', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    setupChromeStorage();
    // Default to current schema version to avoid triggering migration in unrelated tests
    (
      chrome.storage.local.get as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue({
      schemaVersion: CURRENT_SCHEMA_VERSION,
    });
    await StorageService.clearAll();
  });

  it('should save and get sessions', async () => {
    const mockSessions: Session[] = [
      {
        id: '1',
        title: 'Test Session',
        messages: [],
        createdAt: 123,
        updatedAt: 123,
        selectedModels: ['ChatGPT'],
      },
    ];

    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ sessions: mockSessions });

    await StorageService.saveSessions(mockSessions);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ sessions: mockSessions });

    const sessions = await StorageService.getSessions();
    expect(sessions).toEqual(mockSessions);
  });

  it('should return empty array if no sessions found', async () => {
    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({});
    const sessions = await StorageService.getSessions();
    expect(sessions).toEqual([]);
  });

  it('should salvage valid sessions when some are invalid', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const invalidSessions = [
      { id: 123 },
      {
        id: 'ok',
        title: 'Valid',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        selectedModels: ['ChatGPT'],
      },
    ];
    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ sessions: invalidSessions });

    const sessions = await StorageService.getSessions();
    expect(sessions).toEqual([
      {
        id: 'ok',
        title: 'Valid',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        selectedModels: ['ChatGPT'],
      },
    ]);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('should save and get current session ID', async () => {
    const sessionId = '123';

    await StorageService.saveCurrentSessionId(sessionId);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ currentSessionId: sessionId });

    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ currentSessionId: sessionId });
    const retrieved = await StorageService.getCurrentSessionId();
    expect(retrieved).toBe(sessionId);
  });

  it('returns null for invalid current session ids and swallows current session storage errors', async () => {
    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ currentSessionId: 123 });
    await expect(StorageService.getCurrentSessionId()).resolves.toBeNull();

    localGetMock().mockRejectedValueOnce(new Error('boom'));
    await expect(StorageService.getCurrentSessionId()).resolves.toBeNull();

    localSetMock().mockRejectedValueOnce(new Error('boom'));
    await expect(StorageService.saveCurrentSessionId('broken')).resolves.toBeUndefined();
  });

  it('returns null for invalid current session ids and swallows get/save failures', async () => {
    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ currentSessionId: 123 });
    await expect(StorageService.getCurrentSessionId()).resolves.toBeNull();

    localGetMock().mockRejectedValueOnce(new Error('boom'));
    await expect(StorageService.getCurrentSessionId()).resolves.toBeNull();

    localSetMock().mockRejectedValueOnce(new Error('save failed'));
    await expect(StorageService.saveCurrentSessionId('broken')).resolves.toBeUndefined();
  });

  it('should return default selected models when missing or invalid', async () => {
    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({});
    await expect(StorageService.getSelectedModels()).resolves.toEqual(['ChatGPT']);

    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ selectedModels: ['Unknown'] });
    await expect(StorageService.getSelectedModels()).resolves.toEqual(['ChatGPT']);
  });

  it('returns default selected models when local storage lookup throws', async () => {
    localGetMock().mockRejectedValueOnce(new Error('boom'));
    await expect(StorageService.getSelectedModels()).resolves.toEqual(['ChatGPT']);
  });

  it('should return default settings when missing or invalid', async () => {
    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({});
    await expect(StorageService.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);

    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ settings: { theme: 123 } });
    await expect(StorageService.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('returns default settings when local storage lookup throws', async () => {
    localGetMock().mockRejectedValueOnce(new Error('boom'));
    await expect(StorageService.getSettings()).resolves.toEqual(DEFAULT_SETTINGS);
  });

  it('should clear both local and session storage', async () => {
    await StorageService.clearAll();
    expect(chrome.storage.local.clear).toHaveBeenCalled();
    expect(chrome.storage.session.clear).toHaveBeenCalled();
  });

  it('clearAll swallows storage clear errors', async () => {
    (chrome.storage.local.clear as unknown as StorageSetMock).mockRejectedValue(new Error('boom'));
    await expect(StorageService.clearAll()).resolves.toBeUndefined();
  });

  it('should get and save tabs', async () => {
    sessionGetMock().mockResolvedValue({ tabs: { ChatGPT: 1 } });

    const tabs = await StorageService.getTabs();
    expect(tabs).toEqual({ ChatGPT: 1 });

    await StorageService.saveTabs({ Gemini: 2 });
    expect(chrome.storage.session.set).toHaveBeenCalledWith({ tabs: { Gemini: 2 } });
  });

  it('should get and save promptSwitchboardGroupId', async () => {
    sessionGetMock().mockResolvedValue({ promptSwitchboardGroupId: 99 });
    const id = await StorageService.getPromptSwitchboardGroupId();
    expect(id).toBe(99);

    await StorageService.savePromptSwitchboardGroupId(100);
    expect(chrome.storage.session.set).toHaveBeenCalledWith({ promptSwitchboardGroupId: 100 });

    sessionGetMock().mockResolvedValue({ promptSwitchboardGroupId: 'bad' });
    const invalid = await StorageService.getPromptSwitchboardGroupId();
    expect(invalid).toBeNull();
  });

  it('stores workflow run snapshots in session storage instead of local durable storage', async () => {
    const workflow = createCompareAnalyzeFollowUpWorkflow();
    const record = {
      runId: 'run-1',
      run: createWorkflowRunState(workflow, {
        prompt: 'What should we ask next?',
        sessionId: 'session-1',
        turnId: 'turn-1',
      }),
    };

    sessionGetMock().mockResolvedValueOnce({});
    await StorageService.saveWorkflowRun(record);

    expect(chrome.storage.session.set).toHaveBeenCalledWith({
      workflowRunSnapshots: [record],
    });
    expect(chrome.storage.local.set).not.toHaveBeenCalledWith(
      expect.objectContaining({
        workflowRuns: expect.anything(),
      })
    );

    sessionGetMock().mockResolvedValueOnce({
      workflowRunSnapshots: [record],
    });
    await expect(StorageService.getWorkflowRun('run-1')).resolves.toEqual(record);
  });

  it('handles storage errors gracefully', async () => {
    localGetMock().mockRejectedValue(new Error('boom'));
    await expect(StorageService.getSessions()).resolves.toEqual([]);

    localSetMock().mockRejectedValue(new Error('boom'));
    await expect(StorageService.saveSessions([])).resolves.toBeUndefined();
  });

  it('handles selector storage errors', async () => {
    localGetMock().mockRejectedValue(new Error('boom'));
    await expect(StorageService.getSelectors()).resolves.toBeNull();

    localSetMock().mockRejectedValue(new Error('boom'));
    await expect(StorageService.saveSelectors({})).resolves.toBeUndefined();
  });

  it('validateSessions handles non-array input', () => {
    const result = validateSessions({ foo: 'bar' });
    expect(result.sessions).toEqual([]);
    expect(result.hadErrors).toBe(true);
  });

  it('validateSettings returns null for invalid input', () => {
    expect(validateSettings({ theme: 'invalid' })).toBeNull();
  });

  it('should get session by id or return null', async () => {
    const mockSessions: Session[] = [
      {
        id: 's1',
        title: 'A',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        selectedModels: ['ChatGPT'],
      },
    ];
    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ sessions: mockSessions });

    const found = await StorageService.getSession('s1');
    expect(found?.id).toBe('s1');

    const missing = await StorageService.getSession('missing');
    expect(missing).toBeNull();
  });

  it('should update existing session and add new session', async () => {
    const initial: Session[] = [
      {
        id: 's1',
        title: 'Old',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        selectedModels: ['ChatGPT'],
      },
    ];

    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ sessions: initial });

    await StorageService.saveSession({ ...initial[0], title: 'Updated' });
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      sessions: [{ ...initial[0], title: 'Updated' }],
    });

    localGetMock().mockResolvedValueOnce({ sessions: initial });

    const newSession: Session = {
      id: 's2',
      title: 'New',
      messages: [],
      createdAt: 2,
      updatedAt: 2,
      selectedModels: ['ChatGPT'],
    };

    await StorageService.saveSession(newSession);
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      sessions: [...initial, newSession],
    });
  });

  it('should delete session by id', async () => {
    const sessions: Session[] = [
      {
        id: 's1',
        title: 'A',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        selectedModels: ['ChatGPT'],
      },
      {
        id: 's2',
        title: 'B',
        messages: [],
        createdAt: 2,
        updatedAt: 2,
        selectedModels: ['ChatGPT'],
      },
    ];
    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ sessions });

    await StorageService.deleteSession('s1');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({
      sessions: [sessions[1]],
    });
  });

  it('should return valid selected models and handle save errors', async () => {
    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ selectedModels: ['Gemini'] });
    await expect(StorageService.getSelectedModels()).resolves.toEqual(['Gemini']);

    localSetMock().mockRejectedValue(new Error('boom'));
    await expect(StorageService.saveSelectedModels(['ChatGPT'])).resolves.toBeUndefined();
  });

  it('should return valid settings and handle save errors', async () => {
    const validSettings: Settings = {
      language: 'en',
      theme: 'dark',
      enterToSend: false,
      doubleClickToEdit: true,
      pinnedSessionIds: [],
      recipes: [],
      shortcuts: {},
      analysis: {
        enabled: true,
        provider: 'browser_session',
        model: 'ChatGPT',
      },
    };
    localGetMock()
      .mockResolvedValueOnce({ schemaVersion: CURRENT_SCHEMA_VERSION })
      .mockResolvedValueOnce({ settings: validSettings });
    await expect(StorageService.getSettings()).resolves.toEqual(validSettings);

    localSetMock().mockRejectedValue(new Error('boom'));
    await expect(StorageService.saveSettings(validSettings)).resolves.toBeUndefined();
  });

  it('should handle invalid tabs and promptSwitchboardGroupId values', async () => {
    sessionGetMock().mockResolvedValue({ tabs: 'bad' });
    await expect(StorageService.getTabs()).resolves.toEqual({});

    sessionGetMock().mockResolvedValue({});
    await expect(StorageService.getPromptSwitchboardGroupId()).resolves.toBeNull();
  });

  it('should persist transient session storage values and recover from session storage errors', async () => {
    sessionGetMock().mockResolvedValueOnce({ tabs: { ChatGPT: 123 } });
    await expect(StorageService.getTabs()).resolves.toEqual({ ChatGPT: 123 });

    sessionGetMock().mockResolvedValueOnce({ promptSwitchboardGroupId: 42 });
    await expect(StorageService.getPromptSwitchboardGroupId()).resolves.toBe(42);

    await expect(StorageService.saveTabs({ Gemini: 456 })).resolves.toBeUndefined();
    await expect(StorageService.savePromptSwitchboardGroupId(7)).resolves.toBeUndefined();

    sessionGetMock().mockRejectedValueOnce(new Error('boom'));
    await expect(StorageService.getPromptSwitchboardGroupId()).resolves.toBeNull();

    sessionSetMock().mockRejectedValueOnce(new Error('boom'));
    await expect(StorageService.savePromptSwitchboardGroupId(9)).resolves.toBeUndefined();
  });

  it('swallows tab cache write failures from session storage', async () => {
    sessionSetMock().mockRejectedValueOnce(new Error('boom'));
    await expect(StorageService.saveTabs({ ChatGPT: 456 })).resolves.toBeUndefined();
  });

  it('returns safe defaults when transient tab storage operations fail', async () => {
    sessionGetMock().mockRejectedValueOnce(new Error('tabs broken'));
    await expect(StorageService.getTabs()).resolves.toEqual({});

    sessionSetMock().mockRejectedValueOnce(new Error('tabs save failed'));
    await expect(StorageService.saveTabs({ ChatGPT: 1 })).resolves.toBeUndefined();
  });

  it('saves, reads, and consumes buffered stream updates', async () => {
    sessionGetMock().mockResolvedValueOnce({});
    await StorageService.saveBufferedStreamUpdate({
      model: 'ChatGPT',
      requestId: 'req-1',
      turnId: 'turn-1',
      text: 'partial',
      deliveryStatus: DELIVERY_STATUS.STREAMING,
    });

    expect(chrome.storage.session.set).toHaveBeenCalledWith({
      bufferedStreamUpdates: {
        'turn-1:ChatGPT': expect.objectContaining({
          model: 'ChatGPT',
          turnId: 'turn-1',
          requestId: 'req-1',
          text: 'partial',
        }),
      },
    });

    sessionGetMock().mockResolvedValueOnce({
      bufferedStreamUpdates: {
        'turn-1:ChatGPT': {
          model: 'ChatGPT',
          requestId: 'req-1',
          turnId: 'turn-1',
          text: 'partial',
          deliveryStatus: DELIVERY_STATUS.STREAMING,
        },
      },
    });
    await expect(StorageService.getBufferedStreamUpdates()).resolves.toEqual([
      expect.objectContaining({
        model: 'ChatGPT',
        turnId: 'turn-1',
      }),
    ]);

    sessionGetMock().mockResolvedValueOnce({
      bufferedStreamUpdates: {
        'turn-1:ChatGPT': {
          model: 'ChatGPT',
          requestId: 'req-1',
          turnId: 'turn-1',
          text: 'partial',
          deliveryStatus: DELIVERY_STATUS.STREAMING,
        },
      },
    });
    await expect(StorageService.consumeBufferedStreamUpdates()).resolves.toEqual([
      expect.objectContaining({
        model: 'ChatGPT',
      }),
    ]);
    expect(chrome.storage.session.remove).toHaveBeenCalledWith('bufferedStreamUpdates');
  });

  it('returns empty buffered updates when schema is invalid and swallows consume errors', async () => {
    sessionGetMock().mockResolvedValueOnce({
      bufferedStreamUpdates: {
        broken: {
          model: 'Unknown',
        },
      },
    });
    await expect(StorageService.getBufferedStreamUpdates()).resolves.toEqual([]);

    sessionGetMock().mockRejectedValueOnce(new Error('boom'));
    await expect(StorageService.consumeBufferedStreamUpdates()).resolves.toEqual([]);
  });

  it('swallows buffered update save failures', async () => {
    sessionGetMock().mockResolvedValueOnce({});
    sessionSetMock().mockRejectedValueOnce(new Error('buffer save failed'));

    await expect(
      StorageService.saveBufferedStreamUpdate({
        model: 'ChatGPT',
        requestId: 'req-save-fail',
        turnId: 'turn-save-fail',
        text: 'partial',
        deliveryStatus: DELIVERY_STATUS.STREAMING,
      })
    ).resolves.toBeUndefined();
  });

  it('replaces buffered updates for the same turn/model and falls back to an unknown key when turnId is missing', async () => {
    sessionGetMock().mockResolvedValueOnce({
      bufferedStreamUpdates: {
        'turn-1:ChatGPT': {
          model: 'ChatGPT',
          requestId: 'req-1',
          turnId: 'turn-1',
          text: 'stale',
          deliveryStatus: DELIVERY_STATUS.STREAMING,
        },
      },
    });

    await StorageService.saveBufferedStreamUpdate({
      model: 'ChatGPT',
      requestId: 'req-2',
      turnId: 'turn-1',
      text: 'fresh',
      deliveryStatus: DELIVERY_STATUS.COMPLETE,
    });

    expect(chrome.storage.session.set).toHaveBeenLastCalledWith({
      bufferedStreamUpdates: {
        'turn-1:ChatGPT': expect.objectContaining({
          requestId: 'req-2',
          text: 'fresh',
          deliveryStatus: DELIVERY_STATUS.COMPLETE,
        }),
      },
    });

    sessionGetMock().mockResolvedValueOnce({});
    await StorageService.saveBufferedStreamUpdate({
      model: 'Gemini',
      requestId: 'req-3',
      text: 'missing turn',
      deliveryStatus: DELIVERY_STATUS.STREAMING,
    });

    expect(chrome.storage.session.set).toHaveBeenLastCalledWith({
      bufferedStreamUpdates: {
        'unknown:Gemini': expect.objectContaining({
          model: 'Gemini',
          requestId: 'req-3',
          text: 'missing turn',
        }),
      },
    });
  });

  it('overwrites buffered updates with the same turn/model key', async () => {
    sessionGetMock().mockResolvedValueOnce({
      bufferedStreamUpdates: {
        'turn-1:ChatGPT': {
          model: 'ChatGPT',
          requestId: 'req-old',
          turnId: 'turn-1',
          text: 'old',
          deliveryStatus: DELIVERY_STATUS.STREAMING,
        },
      },
    });

    await StorageService.saveBufferedStreamUpdate({
      model: 'ChatGPT',
      requestId: 'req-new',
      turnId: 'turn-1',
      text: 'new',
      deliveryStatus: DELIVERY_STATUS.COMPLETE,
    });

    expect(chrome.storage.session.set).toHaveBeenCalledWith({
      bufferedStreamUpdates: {
        'turn-1:ChatGPT': expect.objectContaining({
          requestId: 'req-new',
          text: 'new',
          deliveryStatus: DELIVERY_STATUS.COMPLETE,
        }),
      },
    });
  });

  it('swallows buffered update removal failures after reading replay data', async () => {
    sessionGetMock().mockResolvedValueOnce({
      bufferedStreamUpdates: {
        'turn-2:ChatGPT': {
          model: 'ChatGPT',
          requestId: 'req-2',
          turnId: 'turn-2',
          text: 'done',
          deliveryStatus: DELIVERY_STATUS.COMPLETE,
        },
      },
    });
    (
      chrome.storage.session.remove as unknown as { mockRejectedValueOnce: (v: unknown) => void }
    ).mockRejectedValueOnce(new Error('remove failed'));

    await expect(StorageService.consumeBufferedStreamUpdates()).resolves.toEqual([]);
  });

  it('clears local and session storage for debug reset', async () => {
    await expect(StorageService.clearAll()).resolves.toBeUndefined();

    expect(chrome.storage.local.clear).toHaveBeenCalled();
    expect(chrome.storage.session.clear).toHaveBeenCalled();
  });

  it('migrates legacy schema and stamps version', async () => {
    const legacySessions: Session[] = [
      {
        id: 'legacy-1',
        title: 'Legacy',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        selectedModels: ['ChatGPT'],
      },
    ];

    localGetMock()
      .mockResolvedValueOnce({
        schemaVersion: 0,
        sessions: legacySessions,
        selectedModels: ['Unknown'],
        settings: { theme: 123 },
        currentSessionId: 123,
      })
      .mockResolvedValueOnce({ sessions: legacySessions });

    const sessions = await StorageService.getSessions();
    expect(sessions).toEqual(legacySessions);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({ schemaVersion: CURRENT_SCHEMA_VERSION })
    );
  });

  it('normalizes schema-v1 sessions that are missing selected models', async () => {
    localGetMock()
      .mockResolvedValueOnce({
        schemaVersion: 1,
        sessions: [
          {
            id: 'legacy-2',
            title: 'Needs normalization',
            messages: [],
            createdAt: 1,
            updatedAt: 1,
            selectedModels: [],
          },
        ],
      })
      .mockResolvedValueOnce({
        sessions: [
          {
            id: 'legacy-2',
            title: 'Needs normalization',
            messages: [],
            createdAt: 1,
            updatedAt: 1,
            selectedModels: ['ChatGPT'],
          },
        ],
      });

    const sessions = await StorageService.getSessions();

    expect(sessions[0].selectedModels).toEqual(['ChatGPT']);
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: CURRENT_SCHEMA_VERSION,
      })
    );
  });

  it('removes legacy local workflow runs during schema-v3 migration', async () => {
    localGetMock()
      .mockResolvedValueOnce({
        schemaVersion: 2,
      })
      .mockResolvedValueOnce({});

    await expect(StorageService.getSessions()).resolves.toEqual([]);

    expect(chrome.storage.local.remove).toHaveBeenCalledWith('workflowRuns');
    expect(chrome.storage.local.set).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaVersion: CURRENT_SCHEMA_VERSION,
      })
    );
  });
});
