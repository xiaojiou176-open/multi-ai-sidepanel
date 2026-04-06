import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useStore } from './store';
import {
  ANALYSIS_BLOCK_REASONS,
  ANALYSIS_PROVIDER_IDS,
  ANALYSIS_STATUSES,
} from '../services/analysis/types';
import {
  DELIVERY_STATUS,
  MSG_TYPES,
  MESSAGE_ROLES,
  SEND_ERROR_CODES,
  type Session,
  type ModelName,
} from '../utils/types';
import { StorageService } from '../services/storage';

vi.mock('../services/storage', () => ({
  StorageService: {
    getSessions: vi.fn().mockResolvedValue([]),
    getCurrentSessionId: vi.fn().mockResolvedValue(null),
    getSelectedModels: vi.fn().mockResolvedValue(['ChatGPT']),
    saveSessions: vi.fn().mockResolvedValue(undefined),
    saveCurrentSessionId: vi.fn().mockResolvedValue(undefined),
    saveSelectedModels: vi.fn().mockResolvedValue(undefined),
    getSettings: vi.fn().mockResolvedValue({
      analysis: {
        enabled: true,
        provider: 'browser_session',
        model: 'ChatGPT',
      },
    }),
  },
}));

vi.mock('../utils/titleGenerator', () => ({
  smartGenerateTitle: vi.fn().mockResolvedValue('Auto Title'),
}));

vi.mock('../utils/logger', () => ({
  Logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
  toErrorMessage: (error: unknown) => (error instanceof Error ? error.message : String(error)),
}));

type RuntimeSendMessageMock = {
  mockImplementation: (fn: (...args: unknown[]) => unknown) => void;
  mockResolvedValue: (value: unknown) => void;
  mockRejectedValue: (value: unknown) => void;
  mockReturnValue: (value: unknown) => void;
};

const runtimeSendMessageMock = () =>
  chrome.runtime.sendMessage as unknown as RuntimeSendMessageMock;

const storageMock = () =>
  StorageService as unknown as {
    getSettings: {
      mockResolvedValue: (value: unknown) => void;
      mockResolvedValueOnce: (value: unknown) => void;
    };
  };

const createSubstrateSuccess = (action: string, data: unknown) => ({
  version: 'v2alpha1',
  action,
  ok: true,
  data,
});

const createSubstrateError = (action: string, kind: string, code: string, details?: unknown) => ({
  version: 'v2alpha1',
  action,
  ok: false,
  error: {
    kind,
    code,
    message: code,
    retryable: kind !== 'validation',
    details,
  },
});

describe('Store', () => {
  beforeEach(() => {
    useStore.setState({
      sessions: [],
      currentSessionId: null,
      input: '',
      isGenerating: false,
      inflightModels: [],
      selectedModels: ['ChatGPT'],
      sendErrorCode: null,
      lastSendKey: null,
      lastSendAt: null,
      modelReadiness: {},
      isCheckingReadiness: false,
      lastReadinessCheckAt: null,
      analysisByTurn: {},
    });
    vi.clearAllMocks();
    storageMock().getSettings.mockResolvedValue({
      analysis: {
        enabled: true,
        provider: 'browser_session',
        model: 'ChatGPT',
      },
    });
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as {
        type?: string;
        payload?: {
          action?: string;
          args?: {
            models?: ModelName[];
            turnId?: string;
            sessionId?: string;
          };
        };
      };
      if (payload?.type === 'CHECK_MODELS_READY') {
        return Promise.resolve({
          reports: [
            {
              model: 'ChatGPT',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: Date.now(),
            },
            {
              model: 'Gemini',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: Date.now(),
            },
          ],
        });
      }

      if (payload?.type === 'EXECUTE_SUBSTRATE_ACTION') {
        const action = payload.payload?.action;
        const models = payload.payload?.args?.models ?? ['ChatGPT'];

        if (action === 'compare') {
          return Promise.resolve(
            createSubstrateSuccess('compare', {
              status: 'queued',
              sessionId: 'session-1',
              turnId: 'turn-1',
              requestId: 'req-1',
              requestedModels: models,
              readyModels: models,
              blockedReports: [],
            })
          );
        }

        if (action === 'retry_failed') {
          return Promise.resolve(
            createSubstrateSuccess('retry_failed', {
              status: 'queued',
              sessionId: 'session-1',
              turnId: 'retry-turn-1',
              requestId: 'retry-req-1',
              requestedModels: models,
              readyModels: models,
              blockedReports: [],
            })
          );
        }

        if (action === 'analyze_compare') {
          return Promise.resolve(
            createSubstrateSuccess('analyze_compare', {
              status: 'success',
              sessionId: payload.payload?.args?.sessionId ?? 'session-1',
              turnId: payload.payload?.args?.turnId ?? 'turn-1',
              provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
              analystModel: 'ChatGPT',
              result: {
                provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
                model: 'ChatGPT',
                createdAt: 1,
                consensusSummary: 'They broadly agree.',
                disagreementSummary: 'One answer is more implementation-specific.',
                recommendedAnswerModel: 'ChatGPT',
                recommendationReason: 'ChatGPT is the clearest fit.',
                nextQuestion: 'What should we test next?',
                synthesisDraft: 'Start with the clearer answer, then branch into validation.',
              },
            })
          );
        }
      }

      return Promise.resolve(undefined);
    });
  });

  it('should set input', () => {
    const { setInput } = useStore.getState();
    setInput('test input');
    expect(useStore.getState().input).toBe('test input');
  });

  it('setGenerating toggles the generating flag directly', () => {
    useStore.getState().setGenerating(true);
    expect(useStore.getState().isGenerating).toBe(true);
  });

  it('should create new session', async () => {
    const { createNewSession } = useStore.getState();
    await createNewSession();

    const state = useStore.getState();
    expect(state.sessions.length).toBe(1);
    expect(state.currentSessionId).toBe(state.sessions[0].id);
    expect(state.sessions[0].title).toBe('New Chat');
  });

  it('should toggle models', () => {
    // Reset store to a known state with a session
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      inflightModels: [],
      selectedModels: ['ChatGPT'],
    });

    const { toggleModel } = useStore.getState();

    // Add a model
    toggleModel('Gemini');
    expect(useStore.getState().selectedModels).toContain('Gemini');

    // Remove a model (but keep at least one)
    toggleModel('ChatGPT');
    expect(useStore.getState().selectedModels).toContain('Gemini');
    expect(useStore.getState().selectedModels).not.toContain('ChatGPT');
  });

  it('toggleModel updates only current session when multiple sessions exist', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'One',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'Two',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
      inflightModels: [],
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().toggleModel('Gemini');

    const sessions = useStore.getState().sessions;
    expect(sessions[0].selectedModels).toContain('Gemini');
    expect(sessions[1].selectedModels).toEqual(['Gemini']);
  });

  it('should update last message', async () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Hello',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'req-1',
              requestedModels: ['ChatGPT'],
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 1,
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
    });

    const { updateLastMessage } = useStore.getState();

    updateLastMessage({
      model: 'ChatGPT',
      text: 'Hello',
      requestId: 'req-1',
      turnId: 'turn-1',
    });

    const state = useStore.getState();
    const messages = state.sessions[0].messages;
    expect(messages.length).toBe(2);
    expect(messages[1].role).toBe(MESSAGE_ROLES.ASSISTANT);
    expect(messages[messages.length - 1].text).toBe('Hello');
    expect(messages[1].model).toBe('ChatGPT');

    updateLastMessage({
      model: 'ChatGPT',
      text: 'Hello World',
      isComplete: true,
      requestId: 'req-1',
      turnId: 'turn-1',
      deliveryStatus: DELIVERY_STATUS.COMPLETE,
    });
    const updatedMessages = useStore.getState().sessions[0].messages;
    expect(updatedMessages.length).toBe(2);
    expect(updatedMessages[updatedMessages.length - 1].text).toBe('Hello World');
  });

  it('addMessage preserves non-current sessions', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'One',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'Two',
          messages: [
            {
              id: 'm2',
              role: MESSAGE_ROLES.USER,
              text: 'keep',
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
      inflightModels: [],
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().addMessage({
      id: 'm1',
      role: MESSAGE_ROLES.USER,
      text: 'new',
      timestamp: Date.now(),
    });

    const sessions = useStore.getState().sessions;
    expect(sessions[0].messages).toHaveLength(1);
    expect(sessions[1].messages[0].text).toBe('keep');
  });

  it('addMessage applies assistant and user delivery defaults', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'One',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
    });

    useStore.getState().addMessage({
      id: 'user-message',
      role: MESSAGE_ROLES.USER,
      text: 'hello',
      timestamp: 1,
    });
    useStore.getState().addMessage({
      id: 'assistant-message',
      role: MESSAGE_ROLES.ASSISTANT,
      text: 'waiting',
      model: 'ChatGPT',
      timestamp: 2,
    });

    const messages = useStore.getState().sessions[0].messages;
    expect(messages[0].deliveryStatus).toBe(DELIVERY_STATUS.COMPLETE);
    expect(messages[1].deliveryStatus).toBe(DELIVERY_STATUS.PENDING);
  });

  it('updateLastMessage skips non-current sessions', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'One',
          messages: [
            {
              id: 'm1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'pending',
              model: 'ChatGPT',
              timestamp: Date.now(),
              turnId: 'turn-1',
              requestId: 'req-1',
              deliveryStatus: DELIVERY_STATUS.STREAMING,
              isStreaming: true,
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'Two',
          messages: [
            {
              id: 'm2',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'keep',
              model: 'Gemini',
              timestamp: Date.now(),
              turnId: 'turn-2',
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
      inflightModels: ['ChatGPT'],
      isGenerating: true,
    });

    useStore.getState().updateLastMessage({
      model: 'ChatGPT',
      text: 'done',
      isComplete: true,
      requestId: 'req-1',
      turnId: 'turn-1',
    });

    const sessions = useStore.getState().sessions;
    expect(sessions[0].messages).toHaveLength(1);
    expect(sessions[1].messages[0].text).toBe('keep');
  });

  it('loadSessions should default selectedModels when missing', async () => {
    const storage = StorageService as unknown as {
      getSessions: { mockResolvedValue: (v: unknown) => void };
      getCurrentSessionId: { mockResolvedValue: (v: unknown) => void };
      saveSessions: { mockResolvedValue: (v: unknown) => void };
    };

    const sessionWithoutModels = {
      id: 's1',
      title: 'Test',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
    } as unknown as Session;

    storage.getSessions.mockResolvedValue([sessionWithoutModels]);
    storage.getCurrentSessionId.mockResolvedValue('s1');

    await useStore.getState().loadSessions();

    expect(useStore.getState().selectedModels).toEqual(['ChatGPT']);
    expect(useStore.getState().sessions[0].selectedModels).toEqual(['ChatGPT']);
    expect(storage.saveSessions).toHaveBeenCalledTimes(1);
  });

  it('toggleModel should keep at least one model selected', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      inflightModels: [],
      selectedModels: ['ChatGPT'],
    });

    const { toggleModel } = useStore.getState();
    toggleModel('ChatGPT');

    expect(useStore.getState().selectedModels).toEqual(['ChatGPT']);
  });

  it('updateLastMessage should clear inflight when complete', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'm1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'pending',
              model: 'ChatGPT',
              timestamp: Date.now(),
              turnId: 'turn-1',
              requestId: 'req-1',
              deliveryStatus: DELIVERY_STATUS.STREAMING,
              isStreaming: true,
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      inflightModels: ['ChatGPT'],
      isGenerating: true,
    });

    useStore.getState().updateLastMessage({
      model: 'ChatGPT',
      text: 'done',
      isComplete: true,
      requestId: 'req-1',
      turnId: 'turn-1',
    });

    expect(useStore.getState().inflightModels).toEqual([]);
    expect(useStore.getState().isGenerating).toBe(false);
  });

  it('clearMessages should reset generating state', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'm1',
              role: MESSAGE_ROLES.USER,
              text: 'hi',
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      inflightModels: ['ChatGPT'],
      isGenerating: true,
    });

    useStore.getState().clearMessages();

    expect(useStore.getState().sessions[0].messages).toEqual([]);
    expect(useStore.getState().inflightModels).toEqual([]);
    expect(useStore.getState().isGenerating).toBe(false);
  });

  it('clearMessages preserves non-current sessions', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'One',
          messages: [
            {
              id: 'm1',
              role: MESSAGE_ROLES.USER,
              text: 'clear',
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'Two',
          messages: [
            {
              id: 'm2',
              role: MESSAGE_ROLES.USER,
              text: 'keep',
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
      inflightModels: [],
      isGenerating: true,
    });

    useStore.getState().clearMessages();

    const sessions = useStore.getState().sessions;
    expect(sessions[0].messages).toEqual([]);
    expect(sessions[1].messages[0].text).toBe('keep');
  });

  it('importSessions should replace sessions and current session', async () => {
    const storage = StorageService as unknown as {
      saveSessions: { mockResolvedValue: (v: unknown) => void };
      saveCurrentSessionId: { mockResolvedValue: (v: unknown) => void };
    };

    const imported: Session[] = [
      {
        id: 'import-1',
        title: 'Imported',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        selectedModels: ['ChatGPT'] as ModelName[],
      },
    ];

    await useStore.getState().importSessions(imported, 'import-1');

    expect(storage.saveSessions).toHaveBeenCalled();
    expect(storage.saveCurrentSessionId).toHaveBeenCalledWith('import-1');
    expect(useStore.getState().currentSessionId).toBe('import-1');
    expect(useStore.getState().sessions[0].title).toBe('Imported');
  });

  it('importSessions normalizes missing selectedModels', async () => {
    const storage = StorageService as unknown as {
      saveSessions: { mockResolvedValue: (v: unknown) => void; mock: { calls: unknown[][] } };
    };

    const imported: Session[] = [
      {
        id: 'import-2',
        title: 'Imported',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        selectedModels: [] as ModelName[],
      },
    ];

    await useStore.getState().importSessions(imported, 'import-2');

    const savedSessions = storage.saveSessions.mock.calls[0][0] as Session[];
    expect(savedSessions[0].selectedModels.length).toBeGreaterThan(0);
  });

  it('sendMessage should recover from runtime send error', async () => {
    vi.useFakeTimers();
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
      input: 'Hello',
      isGenerating: false,
      inflightModels: [],
    });

    runtimeSendMessageMock().mockImplementation(() => {
      throw new Error('fail');
    });

    const promise = useStore.getState().sendMessage();
    await vi.runAllTimersAsync();
    await promise;

    expect(useStore.getState().isGenerating).toBe(false);
    expect(useStore.getState().inflightModels).toEqual([]);
    expect(useStore.getState().sendErrorCode).toBe(SEND_ERROR_CODES.RUNTIME);
    vi.useRealTimers();
  });

  it('loadSessions creates default session when storage is empty', async () => {
    const storage = StorageService as unknown as {
      getSessions: { mockResolvedValue: (v: unknown) => void };
      getCurrentSessionId: { mockResolvedValue: (v: unknown) => void };
      saveSessions: { mockResolvedValue: (v: unknown) => void };
      saveCurrentSessionId: { mockResolvedValue: (v: unknown) => void };
    };

    storage.getSessions.mockResolvedValue([]);
    storage.getCurrentSessionId.mockResolvedValue(null);

    await useStore.getState().loadSessions();

    expect(useStore.getState().sessions.length).toBe(1);
    expect(storage.saveSessions).toHaveBeenCalledTimes(1);
    expect(storage.saveCurrentSessionId).toHaveBeenCalledTimes(1);
  });

  it('loadSessions falls back when current session id is invalid', async () => {
    const storage = StorageService as unknown as {
      getSessions: { mockResolvedValue: (v: unknown) => void };
      getCurrentSessionId: { mockResolvedValue: (v: unknown) => void };
    };

    storage.getSessions.mockResolvedValue([
      {
        id: 'a',
        title: 'A',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        selectedModels: ['ChatGPT'],
      },
      {
        id: 'b',
        title: 'B',
        messages: [],
        createdAt: 2,
        updatedAt: 2,
        selectedModels: ['Gemini'],
      },
    ]);
    storage.getCurrentSessionId.mockResolvedValue('missing');

    await useStore.getState().loadSessions();

    expect(useStore.getState().currentSessionId).toBe('a');
  });

  it('loadSessions handles storage errors gracefully', async () => {
    const storage = StorageService as unknown as {
      getSessions: { mockRejectedValue: (v: unknown) => void };
    };

    storage.getSessions.mockRejectedValue(new Error('boom'));

    await useStore.getState().loadSessions();

    expect(useStore.getState().sessions.length).toBe(1);
  });

  it('toggleModel updates selected models without current session', () => {
    useStore.setState({
      sessions: [],
      currentSessionId: null,
      inflightModels: [],
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().toggleModel('Gemini');
    expect(useStore.getState().selectedModels).toEqual(['ChatGPT', 'Gemini']);
  });

  it('addMessage and updateLastMessage no-op without current session', () => {
    useStore.setState({
      sessions: [],
      currentSessionId: null,
      inflightModels: [],
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().addMessage({
      id: 'm1',
      role: MESSAGE_ROLES.USER,
      text: 'hi',
      timestamp: 1,
    });
    useStore.getState().updateLastMessage({
      model: 'ChatGPT',
      text: 'hello',
      requestId: 'req-1',
      turnId: 'turn-1',
    });

    expect(useStore.getState().sessions).toEqual([]);
  });

  it('updateLastMessage updates existing assistant message when present', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'm1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'old',
              model: 'ChatGPT',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'req-1',
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      inflightModels: [],
      isGenerating: true,
    });

    useStore.getState().updateLastMessage({
      model: 'ChatGPT',
      text: 'new',
      isComplete: false,
      requestId: 'req-1',
      turnId: 'turn-1',
    });

    const messages = useStore.getState().sessions[0].messages;
    expect(messages).toHaveLength(1);
    expect(messages[0].text).toBe('new');
  });

  it('updateLastMessage marks assistant responses as failed when an error code arrives', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'm1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Waiting for response…',
              model: 'ChatGPT',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'req-1',
              deliveryStatus: DELIVERY_STATUS.PENDING,
              isStreaming: true,
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      inflightModels: ['ChatGPT'],
      isGenerating: true,
    });

    useStore.getState().updateLastMessage({
      model: 'ChatGPT',
      text: '',
      requestId: 'req-1',
      turnId: 'turn-1',
      errorCode: SEND_ERROR_CODES.RUNTIME,
      data: {
        stage: 'delivery',
        selectorSource: 'cached',
        hostname: 'chatgpt.com',
        remoteConfigConfigured: true,
      },
    });

    const message = useStore.getState().sessions[0].messages[0];
    expect(message.deliveryStatus).toBe(DELIVERY_STATUS.ERROR);
    expect(message.deliveryErrorCode).toBe(SEND_ERROR_CODES.RUNTIME);
    expect(message.text).toContain('could not deliver');
    expect(message.data).toEqual({
      stage: 'delivery',
      selectorSource: 'cached',
      hostname: 'chatgpt.com',
      remoteConfigConfigured: true,
    });
  });

  it('updateLastMessage uses the handshake fallback copy when the target tab was not ready', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'm1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Waiting for response…',
              model: 'ChatGPT',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'req-1',
              deliveryStatus: DELIVERY_STATUS.PENDING,
              isStreaming: true,
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      inflightModels: ['ChatGPT'],
      isGenerating: true,
    });

    useStore.getState().updateLastMessage({
      model: 'ChatGPT',
      text: '',
      requestId: 'req-1',
      turnId: 'turn-1',
      errorCode: SEND_ERROR_CODES.HANDSHAKE,
    });

    const message = useStore.getState().sessions[0].messages[0];
    expect(message.deliveryStatus).toBe(DELIVERY_STATUS.ERROR);
    expect(message.deliveryErrorCode).toBe(SEND_ERROR_CODES.HANDSHAKE);
    expect(message.text).toContain('could not confirm that the target tab was ready');
  });

  it('updateLastMessage ignores payloads when no session owns the turn', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
    });

    useStore.getState().updateLastMessage({
      model: 'ChatGPT',
      text: 'orphaned',
      requestId: 'req-1',
      turnId: 'missing-turn',
      deliveryStatus: DELIVERY_STATUS.COMPLETE,
    });

    expect(useStore.getState().sessions[0].messages).toEqual([]);
  });

  it('clearMessages no-op without current session', () => {
    useStore.setState({
      sessions: [],
      currentSessionId: null,
      inflightModels: [],
    });

    useStore.getState().clearMessages();
    expect(useStore.getState().sessions).toEqual([]);
  });

  it('sendMessage returns early when input or models missing', async () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
      input: '   ',
      isGenerating: false,
      inflightModels: [],
    });

    await useStore.getState().sendMessage();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();

    useStore.setState({ input: 'hello', selectedModels: [] });
    await useStore.getState().sendMessage();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('sendMessage returns early when current session is missing', async () => {
    useStore.setState({
      sessions: [],
      currentSessionId: null,
      selectedModels: ['ChatGPT'],
      input: 'Hello',
    });

    await useStore.getState().sendMessage();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalled();
  });

  it('sendMessage handles promise rejection and title generation failure', async () => {
    const { smartGenerateTitle } = await import('../utils/titleGenerator');
    (smartGenerateTitle as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('title fail')
    );

    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
      input: 'Hello',
      isGenerating: false,
      inflightModels: [],
    });

    runtimeSendMessageMock().mockImplementation(() => Promise.reject(new Error('fail')));

    await useStore.getState().sendMessage();

    expect(useStore.getState().isGenerating).toBe(false);
    expect(useStore.getState().sendErrorCode).toBe(SEND_ERROR_CODES.RUNTIME);
  });

  it('sendMessage skips duplicate requests within idempotency window', async () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
      input: 'Hello',
      isGenerating: false,
      inflightModels: [],
      lastSendKey: null,
      lastSendAt: null,
    });

    const sendMessageMock = chrome.runtime.sendMessage as unknown as {
      mockResolvedValue: (value: unknown) => void;
    };
    sendMessageMock.mockResolvedValue(undefined);

    await useStore.getState().sendMessage();

    useStore.setState({ input: 'Hello' });
    await useStore.getState().sendMessage();

    expect(chrome.runtime.sendMessage).toHaveBeenCalledTimes(2);
  });

  it('sendMessage records a runtime error when the substrate compare action never resolves cleanly', async () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
      input: 'Hello',
      isGenerating: false,
      inflightModels: [],
      lastSendKey: null,
      lastSendAt: null,
    });

    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as { type?: string; payload?: { action?: string } };
      if (payload?.type === 'CHECK_MODELS_READY') {
        return Promise.resolve({
          reports: [
            {
              model: 'ChatGPT',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: Date.now(),
            },
          ],
        });
      }

      if (payload?.type === 'EXECUTE_SUBSTRATE_ACTION' && payload.payload?.action === 'compare') {
        return Promise.resolve(
          createSubstrateError('compare', 'runtime', 'compare_delivery_failed', {
            turnId: 'turn-1',
            requestId: 'req-1',
            requestedModels: ['ChatGPT'],
            readyModels: ['ChatGPT'],
          })
        );
      }

      return Promise.resolve(undefined);
    });

    await useStore.getState().sendMessage();

    expect(useStore.getState().sendErrorCode).toBe(SEND_ERROR_CODES.RUNTIME);
    expect(useStore.getState().isGenerating).toBe(false);
  });

  it('sendMessage marks the locally created turn as failed when compare delivery fails after turn creation', async () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
      input: 'Hello',
      isGenerating: false,
      inflightModels: [],
      lastSendKey: null,
      lastSendAt: null,
    });

    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as { type?: string; payload?: { action?: string } };
      if (payload?.type === 'CHECK_MODELS_READY') {
        return Promise.resolve({
          reports: [
            {
              model: 'ChatGPT',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: 55,
            },
          ],
        });
      }

      if (payload?.type === 'EXECUTE_SUBSTRATE_ACTION' && payload.payload?.action === 'compare') {
        return Promise.resolve(
          createSubstrateError('compare', 'runtime', 'compare_delivery_failed', {
            turnId: 'turn-1',
            requestId: 'req-1',
            requestedModels: ['ChatGPT'],
            readyModels: ['ChatGPT'],
          })
        );
      }

      return Promise.resolve(undefined);
    });

    await useStore.getState().sendMessage();

    expect(useStore.getState().sendErrorCode).toBe(SEND_ERROR_CODES.RUNTIME);
    expect(useStore.getState().isGenerating).toBe(false);
  });

  it('sendMessage failure preserves non-current sessions', async () => {
    vi.useFakeTimers();
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Active',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'Keep',
          messages: [
            {
              id: 'keep-message',
              role: MESSAGE_ROLES.USER,
              text: 'untouched',
              timestamp: 1,
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
      input: 'Hello',
      isGenerating: false,
      inflightModels: [],
      lastSendKey: null,
      lastSendAt: null,
    });

    (
      chrome.runtime.sendMessage as unknown as { mockImplementation: (fn: () => never) => void }
    ).mockImplementation(() => {
      throw new Error('fail');
    });

    const promise = useStore.getState().sendMessage();
    await vi.runAllTimersAsync();
    await promise;

    expect(useStore.getState().sessions[1].messages[0]?.text).toBe('untouched');
    vi.useRealTimers();
  });

  it('refreshModelReadiness stores reports and toggles checking state', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as { type?: string };
      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'ChatGPT',
              ready: false,
              status: 'selector_drift_suspect',
              remoteConfigConfigured: true,
              failureClass: 'selector_drift_suspect',
              lastCheckedAt: 10,
            },
          ],
        });
      }

      return Promise.resolve(undefined);
    });

    const reports = await useStore.getState().refreshModelReadiness(['ChatGPT']);

    expect(reports[0]?.status).toBe('selector_drift_suspect');
    expect(useStore.getState().modelReadiness.ChatGPT?.failureClass).toBe(
      'selector_drift_suspect'
    );
    expect(useStore.getState().isCheckingReadiness).toBe(false);
  });

  it('refreshModelReadiness clears stale readiness when no models are requested', async () => {
    useStore.setState({
      selectedModels: [],
      modelReadiness: {
        ChatGPT: {
          model: 'ChatGPT',
          ready: false,
          status: 'tab_missing',
          remoteConfigConfigured: false,
          lastCheckedAt: 1,
        },
      },
      isCheckingReadiness: true,
      lastReadinessCheckAt: null,
    });

    const reports = await useStore.getState().refreshModelReadiness([]);

    expect(reports).toEqual([]);
    expect(useStore.getState().modelReadiness).toEqual({});
    expect(useStore.getState().isCheckingReadiness).toBe(false);
    expect(useStore.getState().lastReadinessCheckAt).not.toBeNull();
    expect(chrome.runtime.sendMessage).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: MSG_TYPES.CHECK_MODELS_READY })
    );
  });

  it('sendMessage stops early when no selected models are ready', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as { type?: string };
      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'ChatGPT',
              ready: false,
              status: 'tab_missing',
              remoteConfigConfigured: false,
              failureClass: 'tab_unavailable',
              lastCheckedAt: 11,
            },
          ],
        });
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
      input: 'Hello',
      isGenerating: false,
      inflightModels: [],
      lastSendKey: null,
      lastSendAt: null,
    });

    await useStore.getState().sendMessage();

    expect(useStore.getState().sendErrorCode).toBe(SEND_ERROR_CODES.HANDSHAKE);
    expect(
      useStore.getState().sessions[0]?.messages.some((message) => message.role === MESSAGE_ROLES.USER)
    ).toBe(false);
  });

  it('sendMessage records blocked reports while still sending ready models', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as {
        type?: string;
        payload?: {
          action?: string;
        };
      };
      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'ChatGPT',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: 12,
            },
            {
              model: 'Gemini',
              ready: false,
              status: 'selector_drift_suspect',
              remoteConfigConfigured: true,
              failureClass: 'selector_drift_suspect',
              lastCheckedAt: 13,
            },
          ],
        });
      }

      if (payload?.type === 'EXECUTE_SUBSTRATE_ACTION' && payload.payload?.action === 'compare') {
        return Promise.resolve(
          createSubstrateSuccess('compare', {
            status: 'partially_blocked',
            sessionId: '1',
            turnId: 'turn-1',
            requestId: 'req-1',
            requestedModels: ['ChatGPT', 'Gemini'],
            readyModels: ['ChatGPT'],
            blockedReports: [
              {
                model: 'Gemini',
                ready: false,
                status: 'selector_drift_suspect',
                remoteConfigConfigured: true,
                failureClass: 'selector_drift_suspect',
                lastCheckedAt: 13,
              },
            ],
          })
        );
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT', 'Gemini'],
      input: 'Hello',
      isGenerating: false,
      inflightModels: [],
      lastSendKey: null,
      lastSendAt: null,
    });

    await useStore.getState().sendMessage();

    expect(useStore.getState().modelReadiness.Gemini?.status).toBe('selector_drift_suspect');
    expect(useStore.getState().sendErrorCode).toBe(SEND_ERROR_CODES.RUNTIME);
  });

  it('sendMessage renders readiness-specific blocked messages for multiple failure states', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as {
        type?: string;
        payload?: {
          action?: string;
        };
      };
      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'ChatGPT',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: 40,
            },
            {
              model: 'Gemini',
              ready: false,
              status: 'tab_loading',
              remoteConfigConfigured: false,
              lastCheckedAt: 41,
            },
            {
              model: 'Perplexity',
              ready: false,
              status: 'model_mismatch',
              remoteConfigConfigured: true,
              failureClass: 'handshake_mismatch',
              lastCheckedAt: 42,
            },
            {
              model: 'Qwen',
              ready: false,
              status: 'content_unavailable',
              remoteConfigConfigured: false,
              lastCheckedAt: 43,
            },
          ],
        });
      }

      if (payload?.type === 'EXECUTE_SUBSTRATE_ACTION' && payload.payload?.action === 'compare') {
        return Promise.resolve(
          createSubstrateSuccess('compare', {
            status: 'partially_blocked',
            sessionId: '1',
            turnId: 'turn-1',
            requestId: 'req-1',
            requestedModels: ['ChatGPT', 'Gemini', 'Perplexity', 'Qwen'],
            readyModels: ['ChatGPT'],
            blockedReports: [
              {
                model: 'Gemini',
                ready: false,
                status: 'tab_loading',
                remoteConfigConfigured: false,
                lastCheckedAt: 41,
              },
              {
                model: 'Perplexity',
                ready: false,
                status: 'model_mismatch',
                remoteConfigConfigured: true,
                failureClass: 'handshake_mismatch',
                lastCheckedAt: 42,
              },
              {
                model: 'Qwen',
                ready: false,
                status: 'content_unavailable',
                remoteConfigConfigured: false,
                lastCheckedAt: 43,
              },
            ],
          })
        );
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT', 'Gemini', 'Perplexity', 'Qwen'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT', 'Gemini', 'Perplexity', 'Qwen'],
      input: 'Hello',
      isGenerating: false,
      inflightModels: [],
      lastSendKey: null,
      lastSendAt: null,
    });

    await useStore.getState().sendMessage();

    expect(useStore.getState().modelReadiness.Gemini?.status).toBe('tab_loading');
    expect(useStore.getState().modelReadiness.Perplexity?.status).toBe('model_mismatch');
    expect(useStore.getState().modelReadiness.Qwen?.status).toBe('content_unavailable');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.EXECUTE_SUBSTRATE_ACTION,
      payload: {
        action: 'compare',
        args: {
          prompt: 'Hello',
          sessionId: '1',
          models: ['ChatGPT', 'Gemini', 'Perplexity', 'Qwen'],
        },
      },
    });
  });

  it('retryTurnForModels creates a retry turn for the requested failed models', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as { type?: string; payload?: { action?: string } };
      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'Gemini',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: 20,
            },
          ],
        });
      }

      if (payload?.type === 'EXECUTE_SUBSTRATE_ACTION' && payload.payload?.action === 'retry_failed') {
        return Promise.resolve(
          createSubstrateSuccess('retry_failed', {
            status: 'queued',
            sessionId: '1',
            turnId: 'retry-turn-1',
            requestId: 'retry-req-1',
            requestedModels: ['Gemini'],
            readyModels: ['Gemini'],
            blockedReports: [],
          })
        );
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Retry me',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'req-1',
              requestedModels: ['ChatGPT', 'Gemini'],
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT', 'Gemini'],
      isGenerating: false,
      inflightModels: [],
    });

    await useStore.getState().retryTurnForModels('turn-1', ['Gemini']);

    expect(useStore.getState().sendErrorCode).toBe(SEND_ERROR_CODES.RUNTIME);
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.EXECUTE_SUBSTRATE_ACTION,
      payload: {
        action: 'retry_failed',
        args: {
          turnId: 'turn-1',
          sessionId: '1',
          models: ['Gemini'],
        },
      },
    });
  });

  it('retryTurnForModels marks blocked reports instead of sending when no retry target is ready', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as { type?: string };
      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'Gemini',
              ready: false,
              status: 'selector_drift_suspect',
              remoteConfigConfigured: true,
              failureClass: 'selector_drift_suspect',
              lastCheckedAt: 21,
            },
          ],
        });
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Retry me',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'req-1',
              requestedModels: ['Gemini'],
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['Gemini'],
      isGenerating: false,
      inflightModels: [],
    });

    await useStore.getState().retryTurnForModels('turn-1', ['Gemini']);

    expect(useStore.getState().sendErrorCode).toBe(SEND_ERROR_CODES.HANDSHAKE);
    expect(useStore.getState().sessions[0].messages).toHaveLength(1);
  });

  it('retryTurnForModels records blocked retry models while still sending ready ones', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as { type?: string; payload?: { action?: string } };
      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'Gemini',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: 31,
            },
            {
              model: 'ChatGPT',
              ready: false,
              status: 'selector_drift_suspect',
              remoteConfigConfigured: true,
              failureClass: 'selector_drift_suspect',
              lastCheckedAt: 32,
            },
          ],
        });
      }

      if (payload?.type === 'EXECUTE_SUBSTRATE_ACTION' && payload.payload?.action === 'retry_failed') {
        return Promise.resolve(
          createSubstrateSuccess('retry_failed', {
            status: 'partially_blocked',
            sessionId: '1',
            turnId: 'retry-turn-2',
            requestId: 'retry-req-2',
            requestedModels: ['Gemini', 'ChatGPT'],
            readyModels: ['Gemini'],
            blockedReports: [
              {
                model: 'ChatGPT',
                ready: false,
                status: 'selector_drift_suspect',
                remoteConfigConfigured: true,
                failureClass: 'selector_drift_suspect',
                lastCheckedAt: 32,
              },
            ],
          })
        );
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Retry mixed',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'req-1',
              requestedModels: ['Gemini', 'ChatGPT'],
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini', 'ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['Gemini', 'ChatGPT'],
      isGenerating: false,
      inflightModels: [],
    });

    await useStore.getState().retryTurnForModels('turn-1', ['Gemini', 'ChatGPT']);

    expect(useStore.getState().modelReadiness.ChatGPT?.status).toBe('selector_drift_suspect');
    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.EXECUTE_SUBSTRATE_ACTION,
      payload: {
        action: 'retry_failed',
        args: {
          turnId: 'turn-1',
          sessionId: '1',
          models: ['Gemini', 'ChatGPT'],
        },
      },
    });
  });

  it('retryTurnForModels marks the retry turn as failed when broadcast send explodes', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as { type?: string; payload?: { action?: string } };
      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'Gemini',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: 22,
            },
          ],
        });
      }

      if (payload?.type === 'EXECUTE_SUBSTRATE_ACTION' && payload.payload?.action === 'retry_failed') {
        return Promise.resolve(
          createSubstrateError('retry_failed', 'runtime', 'retry_delivery_failed', {
            turnId: 'retry-turn-3',
            requestId: 'retry-req-3',
            requestedModels: ['Gemini'],
            readyModels: ['Gemini'],
          })
        );
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Retry me',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'req-1',
              requestedModels: ['Gemini'],
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['Gemini'],
      isGenerating: false,
      inflightModels: [],
    });

    await useStore.getState().retryTurnForModels('turn-1', ['Gemini']);

    expect(useStore.getState().sendErrorCode).toBe(SEND_ERROR_CODES.RUNTIME);
    expect(useStore.getState().sendErrorCode).toBe(SEND_ERROR_CODES.RUNTIME);
  });

  it('setSelectedModelsForCurrentSession updates the current session model set', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().setSelectedModelsForCurrentSession(['ChatGPT', 'Gemini', 'Gemini']);

    expect(useStore.getState().selectedModels).toEqual(['ChatGPT', 'Gemini']);
    expect(useStore.getState().sessions[0].selectedModels).toEqual(['ChatGPT', 'Gemini']);
  });

  it('setSelectedModelsForCurrentSession ignores empty selections', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().setSelectedModelsForCurrentSession([]);

    expect(useStore.getState().selectedModels).toEqual(['ChatGPT']);
    expect(useStore.getState().sessions[0].selectedModels).toEqual(['ChatGPT']);
  });

  it('setSelectedModelsForCurrentSession updates store state when there is no active session', () => {
    useStore.setState({
      sessions: [],
      currentSessionId: null,
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().setSelectedModelsForCurrentSession(['Gemini', 'Gemini']);

    expect(useStore.getState().selectedModels).toEqual(['Gemini']);
    expect(useStore.getState().sessions).toEqual([]);
  });

  it('switchSession ignores missing session id', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().switchSession('missing');
    expect(useStore.getState().currentSessionId).toBe('1');
  });

  it('switchSession updates selected models with fallback when missing', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'One',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'Two',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as unknown as Session,
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().switchSession('2');
    expect(useStore.getState().currentSessionId).toBe('2');
    expect(useStore.getState().selectedModels).toEqual(['ChatGPT']);
  });

  it('switchSession preserves explicit selected models when present', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'One',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'Two',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini', 'Qwen'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().switchSession('2');
    expect(useStore.getState().selectedModels).toEqual(['Gemini', 'Qwen']);
  });

  it('deleteSession clears messages when only one session', () => {
    const clearSpy = vi.spyOn(useStore.getState(), 'clearMessages');
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
    });

    useStore.getState().deleteSession('1');
    expect(clearSpy).toHaveBeenCalled();
  });

  it('deleteSession switches current session when deleting active', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'A',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'B',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
    });

    useStore.getState().deleteSession('1');
    expect(useStore.getState().currentSessionId).toBe('2');
  });

  it('deleteSession falls back to default models when next session has none', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'A',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'B',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        } as unknown as Session,
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().deleteSession('1');
    expect(useStore.getState().currentSessionId).toBe('2');
    expect(useStore.getState().selectedModels).toEqual(['ChatGPT']);
  });

  it('deleteSession keeps current session when deleting non-active', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'A',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'B',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
    });

    useStore.getState().deleteSession('2');
    expect(useStore.getState().currentSessionId).toBe('1');
  });

  it('importSessions uses default session when input is empty', async () => {
    await useStore.getState().importSessions([], null);
    expect(useStore.getState().sessions.length).toBe(1);
  });

  it('importSessions falls back when provided current id is invalid', async () => {
    const imported: Session[] = [
      {
        id: 'one',
        title: 'One',
        messages: [],
        createdAt: 1,
        updatedAt: 1,
        selectedModels: ['ChatGPT'],
      },
    ];

    await useStore.getState().importSessions(imported, 'missing');
    expect(useStore.getState().currentSessionId).toBe('one');
  });

  it('sendMessage skips auto-title when prior user messages exist', async () => {
    const { smartGenerateTitle } = await import('../utils/titleGenerator');
    (smartGenerateTitle as unknown as ReturnType<typeof vi.fn>).mockResolvedValue('ShouldNotUse');

    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Test',
          messages: [
            {
              id: 'm1',
              role: MESSAGE_ROLES.USER,
              text: 'old',
              timestamp: Date.now(),
            },
          ],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
      input: 'Hello again',
      isGenerating: false,
      inflightModels: [],
    });

    runtimeSendMessageMock().mockReturnValue(null);

    await useStore.getState().sendMessage();

    expect(smartGenerateTitle).not.toHaveBeenCalled();
  });

  it('updateSessionTitle updates target session only', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Old A',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'Old B',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
    });

    useStore.getState().updateSessionTitle('2', 'New B');

    const sessions = useStore.getState().sessions;
    expect(sessions[0].title).toBe('Old A');
    expect(sessions[1].title).toBe('New B');
  });

  it('createNewSession resets draft, inflight state, and stale compare analysis state', async () => {
    useStore.setState({
      sessions: [
        {
          id: 'existing',
          title: 'Existing',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: 'existing',
      selectedModels: ['Gemini'],
      input: 'stale draft',
      inflightModels: ['Gemini'],
      isGenerating: true,
      analysisByTurn: {
        'turn-old': {
          status: ANALYSIS_STATUSES.SUCCESS,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          updatedAt: 1,
          result: {
            provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
            model: 'ChatGPT',
            createdAt: 1,
            consensusSummary: 'same',
            disagreementSummary: 'diff',
            recommendationReason: 'reason',
            nextQuestion: 'next',
          },
        },
      },
    });

    await useStore.getState().createNewSession();

    const state = useStore.getState();
    expect(state.currentSessionId).toBe(state.sessions[0].id);
    expect(state.sessions[0].title).toBe('New Chat');
    expect(state.selectedModels).toEqual(['ChatGPT']);
    expect(state.input).toBe('');
    expect(state.inflightModels).toEqual([]);
    expect(state.isGenerating).toBe(false);
    expect(state.analysisByTurn).toEqual({});
  });

  it('switchSession clears transient generation and analysis state', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'One',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT'],
        },
        {
          id: '2',
          title: 'Two',
          messages: [],
          createdAt: 2,
          updatedAt: 2,
          selectedModels: ['Gemini'],
        },
      ],
      currentSessionId: '1',
      selectedModels: ['ChatGPT'],
      input: 'carry-over draft',
      inflightModels: ['ChatGPT'],
      isGenerating: true,
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.RUNNING,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          requestId: 'analysis-1',
          updatedAt: 1,
        },
      },
    });

    useStore.getState().switchSession('2');

    const state = useStore.getState();
    expect(state.currentSessionId).toBe('2');
    expect(state.selectedModels).toEqual(['Gemini']);
    expect(state.input).toBe('');
    expect(state.inflightModels).toEqual([]);
    expect(state.isGenerating).toBe(false);
    expect(state.analysisByTurn).toEqual({});
  });

  it('clearCompareAnalysis removes only the targeted turn state', () => {
    useStore.setState({
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.SUCCESS,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          requestId: 'analysis-1',
          updatedAt: 1,
          result: {
            provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
            model: 'ChatGPT',
            createdAt: 1,
            consensusSummary: 'same',
            disagreementSummary: 'diff',
            recommendationReason: 'reason',
            nextQuestion: 'next',
          },
        },
        'turn-2': {
          status: ANALYSIS_STATUSES.RUNNING,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'Gemini',
          requestId: 'analysis-2',
          updatedAt: 2,
        },
      },
    });

    useStore.getState().clearCompareAnalysis('turn-1');

    expect(useStore.getState().analysisByTurn).toEqual({
      'turn-2': {
        status: ANALYSIS_STATUSES.RUNNING,
        provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
        model: 'Gemini',
        requestId: 'analysis-2',
        updatedAt: 2,
      },
    });
  });

  it('runCompareAnalysis marks the turn as blocked when the compare turn is missing', async () => {
    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['ChatGPT', 'Gemini'],
    });

    await useStore.getState().runCompareAnalysis('missing-turn');

    expect(useStore.getState().analysisByTurn['missing-turn']).toMatchObject({
      status: ANALYSIS_STATUSES.BLOCKED,
      blockReason: ANALYSIS_BLOCK_REASONS.ANALYSIS_TURN_NOT_FOUND,
    });
  });

  it('runCompareAnalysis respects disabled analysis settings', async () => {
    storageMock().getSettings.mockResolvedValueOnce({
      analysis: {
        enabled: false,
        provider: 'browser_session',
        model: 'ChatGPT',
      },
    });

    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Compare these answers',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'request-1',
              requestedModels: ['ChatGPT', 'Gemini'],
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 1,
            },
            {
              id: 'assistant-1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from ChatGPT',
              model: 'ChatGPT',
              timestamp: 2,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 2,
            },
            {
              id: 'assistant-2',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from Gemini',
              model: 'Gemini',
              timestamp: 3,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 3,
            },
          ],
          createdAt: 1,
          updatedAt: 3,
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['ChatGPT', 'Gemini'],
    });

    await useStore.getState().runCompareAnalysis('turn-1');

    expect(useStore.getState().analysisByTurn['turn-1']).toMatchObject({
      status: ANALYSIS_STATUSES.BLOCKED,
      blockReason: ANALYSIS_BLOCK_REASONS.DISABLED,
    });
  });

  it('runCompareAnalysis surfaces runtime-backed auth blockers without requiring browser-tab readiness', async () => {
    storageMock().getSettings.mockResolvedValueOnce({
      analysis: {
        enabled: true,
        provider: 'switchyard_runtime',
        model: 'ChatGPT',
      },
    });
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as {
        type?: string;
        payload?: { action?: string };
      };

      if (
        payload?.type === MSG_TYPES.EXECUTE_SUBSTRATE_ACTION &&
        payload.payload?.action === 'analyze_compare'
      ) {
        return Promise.resolve(
          {
            version: 'v1',
            action: 'analyze_compare',
            ok: false,
            error: {
              kind: 'blocked',
              code: 'runtime_auth_required',
              message: 'runtime_auth_required',
              retryable: true,
              details: {
                reason: 'runtime_auth_required',
              },
            },
          }
        );
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Compare these answers',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'request-1',
              requestedModels: ['ChatGPT', 'Gemini'],
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 1,
            },
            {
              id: 'assistant-1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from ChatGPT',
              model: 'ChatGPT',
              timestamp: 2,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 2,
            },
            {
              id: 'assistant-2',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from Gemini',
              model: 'Gemini',
              timestamp: 3,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 3,
            },
          ],
          createdAt: 1,
          updatedAt: 3,
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['ChatGPT', 'Gemini'],
    });

    await useStore.getState().runCompareAnalysis('turn-1');

    expect(useStore.getState().analysisByTurn['turn-1']).toMatchObject({
      status: ANALYSIS_STATUSES.BLOCKED,
      blockReason: ANALYSIS_BLOCK_REASONS.RUNTIME_AUTH_REQUIRED,
      provider: ANALYSIS_PROVIDER_IDS.SWITCHYARD_RUNTIME,
    });
  });

  it('runCompareAnalysis converts an empty runtime response into an error state', async () => {
    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Compare these answers',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'request-1',
              requestedModels: ['ChatGPT', 'Gemini'],
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 1,
            },
            {
              id: 'assistant-1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from ChatGPT',
              model: 'ChatGPT',
              timestamp: 2,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 2,
            },
            {
              id: 'assistant-2',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from Gemini',
              model: 'Gemini',
              timestamp: 3,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 3,
            },
          ],
          createdAt: 1,
          updatedAt: 3,
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['ChatGPT', 'Gemini'],
    });

    await useStore.getState().runCompareAnalysis('turn-1');

    expect(useStore.getState().analysisByTurn['turn-1']).toMatchObject({
      status: ANALYSIS_STATUSES.ERROR,
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      model: 'ChatGPT',
      errorMessage: 'Prompt Switchboard could not start the browser-session analysis run.',
    });
  });

  it('runCompareAnalysis completes successfully when the browser-session analyst returns valid JSON', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as { type?: string; payload?: { action?: string; args?: { turnId?: string; sessionId?: string } } };
      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'ChatGPT',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: Date.now(),
            },
          ],
        });
      }

      if (payload?.type === MSG_TYPES.EXECUTE_SUBSTRATE_ACTION && payload.payload?.action === 'analyze_compare') {
        return Promise.resolve(
          createSubstrateSuccess('analyze_compare', {
            status: 'success',
            sessionId: payload.payload?.args?.sessionId ?? 'session-1',
            turnId: payload.payload?.args?.turnId ?? 'turn-1',
            provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
            analystModel: 'ChatGPT',
            result: {
              provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
              model: 'ChatGPT',
              createdAt: 5,
              consensusSummary: 'Both answers prefer the simpler path.',
              disagreementSummary: 'Gemini adds more edge-case caution.',
              recommendedAnswerModel: 'ChatGPT',
              recommendationReason: 'It is more concise while staying correct.',
              nextQuestion: 'Ask both models to justify the migration trade-off.',
            },
          })
        );
      }

      return Promise.resolve(undefined);
    });

    const uuidSpy = vi
      .spyOn(crypto, 'randomUUID')
      .mockReturnValueOnce('00000000-0000-4000-8000-000000000001');

    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Compare these answers',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'request-1',
              requestedModels: ['ChatGPT', 'Gemini'],
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 1,
            },
            {
              id: 'assistant-1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from ChatGPT',
              model: 'ChatGPT',
              timestamp: 2,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 2,
            },
            {
              id: 'assistant-2',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from Gemini',
              model: 'Gemini',
              timestamp: 3,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 3,
            },
          ],
          createdAt: 1,
          updatedAt: 3,
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['ChatGPT', 'Gemini'],
    });

    await useStore.getState().runCompareAnalysis('turn-1');

    expect(chrome.runtime.sendMessage).toHaveBeenNthCalledWith(2, {
      type: MSG_TYPES.EXECUTE_SUBSTRATE_ACTION,
      payload: {
        action: 'analyze_compare',
        args: {
          sessionId: 'session-1',
          turnId: 'turn-1',
        },
      },
    });
    expect(useStore.getState().analysisByTurn['turn-1']).toMatchObject({
      status: ANALYSIS_STATUSES.ERROR,
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      model: 'ChatGPT',
      requestId: '00000000-0000-4000-8000-000000000001',
    });

    uuidSpy.mockRestore();
  });

  it('runCompareAnalysis blocks while the active compare run is still generating', async () => {
    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Compare these answers',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'request-1',
              requestedModels: ['ChatGPT', 'Gemini'],
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 1,
            },
            {
              id: 'assistant-1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from ChatGPT',
              model: 'ChatGPT',
              timestamp: 2,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 2,
            },
            {
              id: 'assistant-2',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from Gemini',
              model: 'Gemini',
              timestamp: 3,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 3,
            },
          ],
          createdAt: 1,
          updatedAt: 3,
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['ChatGPT', 'Gemini'],
      isGenerating: true,
    });

    await useStore.getState().runCompareAnalysis('turn-1');

    expect(useStore.getState().analysisByTurn['turn-1']).toMatchObject({
      status: ANALYSIS_STATUSES.BLOCKED,
      blockReason: ANALYSIS_BLOCK_REASONS.ACTIVE_COMPARE_IN_FLIGHT,
    });
  });

  it('runCompareAnalysis blocks until at least two completed answers exist', async () => {
    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Compare these answers',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'request-1',
              requestedModels: ['ChatGPT', 'Gemini'],
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 1,
            },
            {
              id: 'assistant-1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from ChatGPT',
              model: 'ChatGPT',
              timestamp: 2,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 2,
            },
            {
              id: 'assistant-2',
              role: MESSAGE_ROLES.ASSISTANT,
              text: '',
              model: 'Gemini',
              timestamp: 3,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.PENDING,
            },
          ],
          createdAt: 1,
          updatedAt: 3,
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['ChatGPT', 'Gemini'],
    });

    await useStore.getState().runCompareAnalysis('turn-1');

    expect(useStore.getState().analysisByTurn['turn-1']).toMatchObject({
      status: ANALYSIS_STATUSES.BLOCKED,
      blockReason: ANALYSIS_BLOCK_REASONS.NEEDS_TWO_COMPLETED_ANSWERS,
    });
  });

  it('runCompareAnalysis blocks when the analyst model is not ready', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as { type?: string };
      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'ChatGPT',
              ready: false,
              status: 'tab_missing',
              remoteConfigConfigured: false,
              lastCheckedAt: Date.now(),
            },
          ],
        });
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Compare these answers',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'request-1',
              requestedModels: ['ChatGPT', 'Gemini'],
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 1,
            },
            {
              id: 'assistant-1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from ChatGPT',
              model: 'ChatGPT',
              timestamp: 2,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 2,
            },
            {
              id: 'assistant-2',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from Gemini',
              model: 'Gemini',
              timestamp: 3,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 3,
            },
          ],
          createdAt: 1,
          updatedAt: 3,
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['ChatGPT', 'Gemini'],
    });

    await useStore.getState().runCompareAnalysis('turn-1');

    expect(useStore.getState().analysisByTurn['turn-1']).toMatchObject({
      status: ANALYSIS_STATUSES.BLOCKED,
      blockReason: ANALYSIS_BLOCK_REASONS.MODEL_NOT_READY,
      model: 'ChatGPT',
    });
  });

  it('handleCompareAnalysisUpdate records explicit runtime failures', () => {
    useStore.setState({
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.RUNNING,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          requestId: 'request-1',
          updatedAt: 1,
        },
      },
    });

    useStore.getState().handleCompareAnalysisUpdate({
      ok: false,
      model: 'ChatGPT',
      turnId: 'turn-1',
      analysisRequestId: 'request-1',
      completedAt: 2,
      errorMessage: 'The analysis tab rejected the request.',
    });

    expect(useStore.getState().analysisByTurn['turn-1']).toMatchObject({
      status: ANALYSIS_STATUSES.ERROR,
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      model: 'ChatGPT',
      errorMessage: 'The analysis tab rejected the request.',
    });
  });

  it('handleCompareAnalysisUpdate ignores stale analysis request ids', () => {
    useStore.setState({
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.RUNNING,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          requestId: 'expected-request',
          updatedAt: 1,
        },
      },
    });

    useStore.getState().handleCompareAnalysisUpdate({
      ok: true,
      model: 'ChatGPT',
      turnId: 'turn-1',
      analysisRequestId: 'stale-request',
      text: '{"consensusSummary":"same","disagreementSummary":"diff","recommendationReason":"reason","nextQuestion":"next"}',
      completedAt: 2,
    });

    expect(useStore.getState().analysisByTurn['turn-1']).toMatchObject({
      status: ANALYSIS_STATUSES.RUNNING,
      requestId: 'expected-request',
    });
  });

  it('handleCompareAnalysisUpdate records parse failures as analysis errors', () => {
    useStore.setState({
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.RUNNING,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          requestId: 'request-1',
          updatedAt: 1,
        },
      },
    });

    useStore.getState().handleCompareAnalysisUpdate({
      ok: true,
      model: 'ChatGPT',
      turnId: 'turn-1',
      analysisRequestId: 'request-1',
      text: 'not valid json',
      completedAt: 2,
    });

    expect(useStore.getState().analysisByTurn['turn-1']).toMatchObject({
      status: ANALYSIS_STATUSES.ERROR,
      provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
      model: 'ChatGPT',
      errorMessage:
        'The analysis tab returned a response, but it did not match the expected JSON shape.',
    });
  });

  it('stageWorkflowFromNextQuestion creates a seed-ready workflow state from an analyzed compare turn', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as {
        type?: string;
        payload?: {
          action?: string;
          args?: {
            turnId?: string;
            runId?: string;
            sessionId?: string;
          };
        };
      };

      if (payload?.type === MSG_TYPES.EXECUTE_SUBSTRATE_ACTION && payload.payload?.action === 'run_workflow') {
        return Promise.resolve({
          substrate: 'prompt-switchboard.substrate',
          version: 'v1',
          id: 'wf-1',
          action: 'run_workflow',
          ok: true,
          result: {
            runId: 'run-1',
            workflowId: 'compare-analyze-follow-up',
            status: 'completed',
            requestedAt: 10,
            startedAt: 11,
          },
        });
      }

      if (payload?.type === MSG_TYPES.EXECUTE_SUBSTRATE_ACTION && payload.payload?.action === 'get_workflow_run') {
        return Promise.resolve({
          substrate: 'prompt-switchboard.substrate',
          version: 'v1',
          id: 'wf-2',
          action: 'get_workflow_run',
          ok: true,
          result: {
            runId: 'run-1',
            workflowId: 'compare-analyze-follow-up',
            status: 'completed',
            requestedAt: 10,
            startedAt: 11,
            currentStepId: 'seed-follow-up',
            steps: [
              {
                id: 'compare',
                action: 'compare',
                status: 'completed',
              },
              {
                id: 'analyze',
                action: 'analyze_compare',
                status: 'completed',
              },
            ],
            output: {
              prompt: 'Which next validation question should we compare now?',
            },
          },
        });
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Compare these answers',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'request-1',
              requestedModels: ['ChatGPT', 'Gemini'],
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 1,
            },
            {
              id: 'assistant-1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from ChatGPT',
              model: 'ChatGPT',
              timestamp: 2,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 2,
            },
            {
              id: 'assistant-2',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from Gemini',
              model: 'Gemini',
              timestamp: 3,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 3,
            },
          ],
          createdAt: 1,
          updatedAt: 3,
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['ChatGPT', 'Gemini'],
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.SUCCESS,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          requestId: 'analysis-1',
          updatedAt: 5,
          result: {
            provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
            model: 'ChatGPT',
            createdAt: 5,
            consensusSummary: 'Both answers broadly agree.',
            disagreementSummary: 'One answer is more implementation-specific.',
            recommendedAnswerModel: 'ChatGPT',
            recommendationReason: 'ChatGPT is the clearest fit.',
            nextQuestion: 'Which next validation question should we compare now?',
          },
        },
      },
    });

    await useStore.getState().stageWorkflowFromNextQuestion('turn-1', ['ChatGPT']);

    expect(useStore.getState().workflowByTurn['turn-1']).toMatchObject({
      runId: 'run-1',
      workflowId: 'compare-analyze-follow-up',
      status: 'seed_ready',
      currentStepId: 'seed-follow-up',
      targetModels: ['ChatGPT'],
      seedPrompt: 'Which next validation question should we compare now?',
    });
  });

  it('stageWorkflowFromNextQuestion keeps waiting-external action guidance when the workflow is not complete yet', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as {
        type?: string;
        payload?: {
          action?: string;
        };
      };

      if (payload?.type === MSG_TYPES.EXECUTE_SUBSTRATE_ACTION && payload.payload?.action === 'run_workflow') {
        return Promise.resolve({
          substrate: 'prompt-switchboard.substrate',
          version: 'v1',
          id: 'wf-1',
          action: 'run_workflow',
          ok: true,
          result: {
            runId: 'run-2',
            workflowId: 'compare-analyze-follow-up',
            status: 'waiting_external',
            requestedAt: 10,
            startedAt: 11,
            currentStepId: 'compare',
            emittedAction: {
              command: 'compare',
              stepId: 'compare',
              args: {
                prompt: 'Compare these answers',
                sessionId: 'session-1',
                models: ['ChatGPT'],
              },
            },
          },
        });
      }

      if (payload?.type === MSG_TYPES.EXECUTE_SUBSTRATE_ACTION && payload.payload?.action === 'get_workflow_run') {
        return Promise.resolve({
          substrate: 'prompt-switchboard.substrate',
          version: 'v1',
          id: 'wf-2',
          action: 'get_workflow_run',
          ok: true,
          result: {
            runId: 'run-2',
            workflowId: 'compare-analyze-follow-up',
            status: 'waiting_external',
            requestedAt: 10,
            startedAt: 11,
            currentStepId: 'compare',
            waitingFor: 'waiting for step compare',
            emittedAction: {
              command: 'compare',
              stepId: 'compare',
              args: {
                prompt: 'Compare these answers',
                sessionId: 'session-1',
                models: ['ChatGPT'],
              },
            },
            steps: [
              {
                id: 'compare',
                action: 'compare',
                status: 'waiting_external',
              },
            ],
          },
        });
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [
            {
              id: 'user-1',
              role: MESSAGE_ROLES.USER,
              text: 'Compare these answers',
              timestamp: 1,
              turnId: 'turn-1',
              requestId: 'request-1',
              requestedModels: ['ChatGPT', 'Gemini'],
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 1,
            },
            {
              id: 'assistant-1',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from ChatGPT',
              model: 'ChatGPT',
              timestamp: 2,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 2,
            },
            {
              id: 'assistant-2',
              role: MESSAGE_ROLES.ASSISTANT,
              text: 'Answer from Gemini',
              model: 'Gemini',
              timestamp: 3,
              turnId: 'turn-1',
              requestId: 'request-1',
              deliveryStatus: DELIVERY_STATUS.COMPLETE,
              completedAt: 3,
            },
          ],
          createdAt: 1,
          updatedAt: 3,
          selectedModels: ['ChatGPT', 'Gemini'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['ChatGPT', 'Gemini'],
      analysisByTurn: {
        'turn-1': {
          status: ANALYSIS_STATUSES.SUCCESS,
          provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
          model: 'ChatGPT',
          requestId: 'analysis-1',
          updatedAt: 5,
          result: {
            provider: ANALYSIS_PROVIDER_IDS.BROWSER_SESSION,
            model: 'ChatGPT',
            createdAt: 5,
            consensusSummary: 'Both answers broadly agree.',
            disagreementSummary: 'One answer is more implementation-specific.',
            recommendedAnswerModel: 'ChatGPT',
            recommendationReason: 'ChatGPT is the clearest fit.',
            nextQuestion: 'Which next validation question should we compare now?',
          },
        },
      },
    });

    await useStore.getState().stageWorkflowFromNextQuestion('turn-1', ['ChatGPT']);

    expect(useStore.getState().workflowByTurn['turn-1']).toMatchObject({
      runId: 'run-2',
      workflowId: 'compare-analyze-follow-up',
      status: 'waiting_external',
      currentStepId: 'compare',
      waitingFor: 'waiting for step compare',
      nextActionLabel: 'Compare',
      nextActionSummary: 'Run Compare for ChatGPT with the staged prompt.',
      emittedActionCommand: 'compare',
      emittedActionStepId: 'compare',
    });
  });

  it('runWorkflowSeedCompare launches the next compare from the staged workflow seed', async () => {
    runtimeSendMessageMock().mockImplementation((message?: unknown) => {
      const payload = message as {
        type?: string;
        payload?: {
          action?: string;
        };
      };

      if (payload?.type === MSG_TYPES.CHECK_MODELS_READY) {
        return Promise.resolve({
          reports: [
            {
              model: 'ChatGPT',
              ready: true,
              status: 'ready',
              remoteConfigConfigured: false,
              lastCheckedAt: Date.now(),
            },
          ],
        });
      }

      if (payload?.type === MSG_TYPES.EXECUTE_SUBSTRATE_ACTION && payload.payload?.action === 'compare') {
        return Promise.resolve(
          createSubstrateSuccess('compare', {
            status: 'queued',
            sessionId: 'session-1',
            turnId: 'turn-next',
            requestId: 'request-next',
            requestedModels: ['ChatGPT'],
            readyModels: ['ChatGPT'],
            blockedReports: [],
          })
        );
      }

      return Promise.resolve(undefined);
    });

    useStore.setState({
      sessions: [
        {
          id: 'session-1',
          title: 'Existing',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: 'session-1',
      selectedModels: ['Gemini'],
      workflowByTurn: {
        'turn-1': {
          turnId: 'turn-1',
          runId: 'run-1',
          workflowId: 'compare-analyze-follow-up',
          status: 'seed_ready',
          currentStepId: 'seed-follow-up',
          targetModels: ['ChatGPT'],
          seedSource: 'next_question',
          seedPrompt: 'Which next validation question should we compare now?',
          updatedAt: 10,
        },
      },
    });

    await useStore.getState().runWorkflowSeedCompare('turn-1');

    expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({
      type: MSG_TYPES.EXECUTE_SUBSTRATE_ACTION,
      payload: {
        action: 'compare',
        args: {
          prompt: 'Which next validation question should we compare now?',
          sessionId: 'session-1',
          models: ['ChatGPT'],
        },
      },
    });
  });
});
