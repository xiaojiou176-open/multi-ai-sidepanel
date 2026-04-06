import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SettingsPanel } from './SettingsPanel';
import { MODEL_ORDER } from '../../utils/modelConfig';

const changeLanguage = vi.fn();
const importSessionsMock = vi.fn();
const refreshModelReadinessMock = vi.fn().mockResolvedValue([]);
const storeState = {
  sessions: [
    {
      id: 's1',
      title: 'Imported',
      messages: [],
      createdAt: 1,
      updatedAt: 1,
      selectedModels: ['ChatGPT'],
    },
  ],
  currentSessionId: 's1',
  importSessions: importSessionsMock,
  selectedModels: ['ChatGPT'],
  modelReadiness: {} as Record<string, unknown>,
  refreshModelReadiness: refreshModelReadinessMock,
  isCheckingReadiness: false,
};

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: {
      language: 'en',
      changeLanguage,
    },
  }),
}));

vi.mock('../../services/storage', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../services/storage')>();
  return {
    ...actual,
    StorageService: {
      getSettings: vi.fn().mockResolvedValue({
        language: 'en',
        theme: 'system',
        enterToSend: true,
        doubleClickToEdit: true,
        pinnedSessionIds: [],
        recipes: [],
        shortcuts: {},
        analysis: {
          enabled: true,
          provider: 'browser_session',
          model: 'ChatGPT',
        },
      }),
      saveSettings: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('../store', () => ({
  useStore: (selector?: (state: unknown) => unknown) => {
    return selector ? selector(storeState) : storeState;
  },
}));

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    changeLanguage.mockClear();
    importSessionsMock.mockClear();
    refreshModelReadinessMock.mockClear();
    storeState.modelReadiness = {};
    storeState.isCheckingReadiness = false;
    vi.stubGlobal('alert', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('loads settings, updates toggles, and saves', async () => {
    const onClose = vi.fn();
    const { getByText, getByRole } = render(<SettingsPanel onClose={onClose} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByRole('button', { name: 'Close settings' })).toBeInTheDocument();
    fireEvent.click(getByText('Chinese'));
    fireEvent.click(getByText('Light'));
    fireEvent.click(getByText('Press Enter to send'));

    await act(async () => {
      fireEvent.click(getByRole('button', { name: 'Save settings' }));
      await vi.advanceTimersByTimeAsync(600);
    });

    const { StorageService } = await import('../../services/storage');
    expect(StorageService.saveSettings).toHaveBeenCalled();
    expect(changeLanguage).toHaveBeenCalled();
    expect(onClose).toHaveBeenCalled();
  });

  it('saves browser-session analysis settings', async () => {
    const onClose = vi.fn();
    const { getAllByText, getByText, getByRole } = render(<SettingsPanel onClose={onClose} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(
      getByText('Turn on AI Compare Analyst for follow-up summaries and next-question suggestions')
    );
    fireEvent.click(getAllByText('Gemini')[0]!);
    fireEvent.click(getByRole('button', { name: 'Save settings' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(600);
    });

    const { StorageService } = await import('../../services/storage');
    expect(StorageService.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        analysis: expect.objectContaining({
          enabled: false,
          provider: 'browser_session',
          model: 'Gemini',
        }),
      })
    );
  });

  it('can switch to the local Switchyard runtime lane without exposing a key field', async () => {
    const onClose = vi.fn();
    const { getByText, queryByText } = render(<SettingsPanel onClose={onClose} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(getByText('Local Switchyard runtime'));

    expect(
      getByText(
        'Requires a local Switchyard service on http://127.0.0.1:4317 and a compatible runtime-backed provider session.'
      )
    ).toBeInTheDocument();
    expect(queryByText('API key')).not.toBeInTheDocument();
  });

  it('opens guide links for setup help', async () => {
    const onClose = vi.fn();
    const openSpy = vi.fn();
    vi.stubGlobal('open', openSpy);
    const { getByText } = render(<SettingsPanel onClose={onClose} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByText('Install guide')).toBeInTheDocument();
    expect(getByText('First compare guide')).toBeInTheDocument();
    expect(getByText('Supported sites')).toBeInTheDocument();
    expect(getByText('Compare-first essentials')).toBeInTheDocument();
    expect(getByText('Builder lane (Optional)')).toBeInTheDocument();
    expect(getByText('Public distribution matrix')).toBeInTheDocument();
    fireEvent.click(getByText('MCP starter kits'));
    expect(openSpy).toHaveBeenCalledWith(
      'https://xiaojiou176-open.github.io/multi-ai-sidepanel/mcp-starter-kits.html',
      '_blank',
      'noopener,noreferrer'
    );

    fireEvent.click(getByText('Public distribution matrix'));
    expect(openSpy).toHaveBeenCalledWith(
      'https://xiaojiou176-open.github.io/multi-ai-sidepanel/public-distribution-matrix.html',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('exports settings and sessions', async () => {
    const onClose = vi.fn();
    const createObjectUrl = vi.fn(() => 'blob:mock');
    const revokeObjectUrl = vi.fn();
    vi.stubGlobal('URL', {
      createObjectURL: createObjectUrl,
      revokeObjectURL: revokeObjectUrl,
    });

    const originalCreateElement = document.createElement.bind(document);
    const clickSpy = vi.fn();
    vi.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
      if (tagName === 'a') {
        const el = originalCreateElement(tagName);
        el.click = clickSpy;
        return el;
      }
      return originalCreateElement(tagName);
    });

    const { getByText } = render(<SettingsPanel onClose={onClose} />);

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(getByText('Export chats'));

    expect(createObjectUrl).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
  });

  it('imports sessions and settings from file', async () => {
    const { StorageService } = await import('../../services/storage');
    const onClose = vi.fn();
    const payload = {
      version: 1,
      exportDate: new Date().toISOString(),
      settings: {
        language: 'zh',
        theme: 'dark',
        enterToSend: false,
        doubleClickToEdit: true,
        pinnedSessionIds: [],
        recipes: [],
        shortcuts: {},
        analysis: {
          enabled: true,
          provider: 'browser_session',
          model: 'Gemini',
        },
      },
      sessions: [
        {
          id: 's2',
          title: 'Imported',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: 's2',
    };

    const readerMock = {
      onload: null as null | ((event: { target: { result: string } }) => void),
      readAsText: vi.fn(),
    };

    vi.stubGlobal('FileReader', function FileReaderMock() {
      return readerMock;
    } as unknown as typeof FileReader);

    const { container, getByText } = render(<SettingsPanel onClose={onClose} />);

    await act(async () => {
      await Promise.resolve();
    });

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([JSON.stringify(payload)], 'import.json', { type: 'application/json' });

    fireEvent.click(getByText('Import chats'));
    fireEvent.change(fileInput, { target: { files: [file] } });

    await act(async () => {
      readerMock.onload?.({ target: { result: JSON.stringify(payload) } });
      await Promise.resolve();
    });

    expect(importSessionsMock).toHaveBeenCalledWith(payload.sessions, 's2');
    expect(StorageService.saveSettings).toHaveBeenCalled();
    expect(changeLanguage).toHaveBeenCalled();
  });

  it('refreshes model health across the full model order and renders diagnostics', async () => {
    storeState.modelReadiness = {
      Gemini: {
        model: 'Gemini',
        ready: false,
        status: 'selector_drift_suspect',
        hostname: 'gemini.google.com',
        selectorSource: 'cached',
        failureClass: 'selector_drift_suspect',
        remoteConfigConfigured: true,
        lastCheckedAt: 1,
      },
    };

    const onClose = vi.fn();
    const { getAllByText, getByText, getByRole } = render(<SettingsPanel onClose={onClose} />);

    await act(async () => {
      await Promise.resolve();
    });

    expect(getByText('gemini.google.com')).toBeInTheDocument();
    expect(getAllByText('Selector drift').length).toBeGreaterThan(0);
    expect(
      getByText((content) => content.includes('Remote selector cache'))
    ).toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: 'Refresh' }));
    expect(refreshModelReadinessMock).toHaveBeenCalledWith(MODEL_ORDER);
  });

  it('adds and deletes a saved recipe', async () => {
    const onClose = vi.fn();
    const { getByPlaceholderText, getByRole, getByText, queryByText } = render(
      <SettingsPanel onClose={onClose} />
    );

    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.change(getByPlaceholderText('Recipe name'), {
      target: { value: 'Release note recap' },
    });
    fireEvent.change(getByPlaceholderText('Prompt template'), {
      target: { value: 'Summarize the last release in three bullets.' },
    });
    fireEvent.click(getByRole('button', { name: 'Save recipe' }));

    expect(getByText('Release note recap')).toBeInTheDocument();
    expect(getByText('Summarize the last release in three bullets.')).toBeInTheDocument();

    fireEvent.click(getByRole('button', { name: 'Delete recipe' }));
    expect(queryByText('Release note recap')).not.toBeInTheDocument();
  });
});
