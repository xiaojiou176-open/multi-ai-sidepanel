import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSettings } from './useSettings';
import { DEFAULT_SETTINGS, type Settings } from '../../services/storage';

const testGlobal = globalThis as typeof globalThis & { chrome?: typeof chrome };

vi.mock('../../services/storage', () => ({
  StorageService: {
    getSettings: vi.fn(),
  },
  DEFAULT_SETTINGS: {
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
  },
}));

const setupOnChanged = () => {
  const listeners: Array<
    (changes: Record<string, chrome.storage.StorageChange>, areaName: string) => void
  > = [];
  chrome.storage.onChanged.addListener = vi.fn((cb) => listeners.push(cb));
  chrome.storage.onChanged.removeListener = vi.fn();
  return listeners;
};

describe('useSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('loads settings from storage and listens for updates', async () => {
    const { StorageService } = await import('../../services/storage');
    const getSettingsMock = StorageService.getSettings as unknown as {
      mockResolvedValue: (value: Settings) => void;
    };
    getSettingsMock.mockResolvedValue({
      language: 'en',
      theme: 'dark',
      enterToSend: false,
      doubleClickToEdit: false,
      pinnedSessionIds: [],
      recipes: [],
      shortcuts: {},
      analysis: {
        enabled: true,
        provider: 'browser_session',
        model: 'Gemini',
      },
    });

    const listeners = setupOnChanged();
    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current.theme).toBe('dark');

    act(() => {
      listeners[0](
        {
          settings: {
            newValue: {
              language: 'zh',
              theme: 'light',
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
            },
          },
        },
        'local'
      );
    });

    expect(result.current.language).toBe('zh');
    expect(result.current.theme).toBe('light');
  });

  it('ignores non-local storage changes', async () => {
    const listeners = setupOnChanged();
    const { StorageService } = await import('../../services/storage');
    const getSettingsMock = StorageService.getSettings as unknown as {
      mockResolvedValue: (value: Settings) => void;
    };
    getSettingsMock.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      listeners[0]({ settings: { newValue: { theme: 'dark' } } }, 'sync');
    });

    expect(result.current).toEqual(DEFAULT_SETTINGS);
  });

  it('falls back to default settings on load error', async () => {
    const { StorageService } = await import('../../services/storage');
    const getSettingsMock = StorageService.getSettings as unknown as {
      mockRejectedValue: (value: unknown) => void;
    };
    getSettingsMock.mockRejectedValue(new Error('boom'));

    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await Promise.resolve();
    });

    expect(result.current).toEqual(DEFAULT_SETTINGS);
  });

  it('does not register listeners when onChanged is missing', async () => {
    const originalStorage = chrome.storage;
    Object.defineProperty(chrome, 'storage', {
      configurable: true,
      value: {
        ...originalStorage,
        onChanged: undefined,
      },
    });

    const { StorageService } = await import('../../services/storage');
    const getSettingsMock = StorageService.getSettings as unknown as {
      mockResolvedValue: (value: Settings) => void;
    };
    getSettingsMock.mockResolvedValue(DEFAULT_SETTINGS);

    const { unmount } = renderHook(() => useSettings());

    expect(chrome.storage.onChanged).toBeUndefined();
    unmount();
    // restore
    Object.defineProperty(chrome, 'storage', {
      configurable: true,
      value: originalStorage,
    });
  });

  it('ignores changes without settings payload and cleans up listener', async () => {
    const listeners = setupOnChanged();
    const { StorageService } = await import('../../services/storage');
    const getSettingsMock = StorageService.getSettings as unknown as {
      mockResolvedValue: (value: Settings) => void;
    };
    getSettingsMock.mockResolvedValue(DEFAULT_SETTINGS);

    const { result, unmount } = renderHook(() => useSettings());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      listeners[0]({}, 'local');
    });

    expect(result.current).toEqual(DEFAULT_SETTINGS);

    unmount();
    expect(chrome.storage.onChanged.removeListener).toHaveBeenCalled();
  });

  it('returns defaults when chrome is unavailable', async () => {
    const originalChrome = testGlobal.chrome;
    Reflect.deleteProperty(testGlobal, 'chrome');

    const { StorageService } = await import('../../services/storage');
    const getSettingsMock = StorageService.getSettings as unknown as {
      mockResolvedValue: (value: Settings) => void;
    };
    getSettingsMock.mockResolvedValue(DEFAULT_SETTINGS);

    const { result } = renderHook(() => useSettings());

    expect(result.current).toEqual(DEFAULT_SETTINGS);

    if (originalChrome) {
      testGlobal.chrome = originalChrome;
    }
  });

  it('merges partial local settings updates with defaults', async () => {
    const listeners = setupOnChanged();
    const { StorageService } = await import('../../services/storage');
    const getSettingsMock = StorageService.getSettings as unknown as {
      mockResolvedValue: (value: Settings) => void;
    };
    getSettingsMock.mockResolvedValue(DEFAULT_SETTINGS);
    const { result } = renderHook(() => useSettings());

    await act(async () => {
      await Promise.resolve();
    });

    act(() => {
      listeners[0]({ settings: { newValue: { theme: 'dark' } } }, 'local');
    });

    expect(result.current.theme).toBe('dark');
    expect(result.current.enterToSend).toBe(true);
  });

  it('does not update state after the hook has unmounted', async () => {
    let resolveSettings: ((value: Settings) => void) | null = null;
    const pendingSettings = new Promise<Settings>((resolve) => {
      resolveSettings = resolve;
    });

    const { StorageService } = await import('../../services/storage');
    const getSettingsMock = StorageService.getSettings as unknown as {
      mockReturnValue: (value: Promise<Settings>) => void;
    };
    getSettingsMock.mockReturnValue(pendingSettings);

    const { result, unmount } = renderHook(() => useSettings());
    expect(result.current).toEqual(DEFAULT_SETTINGS);

    unmount();

    await act(async () => {
      resolveSettings?.({
        language: 'zh',
        theme: 'dark',
        enterToSend: false,
        doubleClickToEdit: false,
        pinnedSessionIds: [],
        recipes: [],
        shortcuts: {},
        analysis: {
          enabled: false,
          provider: 'switchyard_runtime',
          model: 'ChatGPT',
        },
      });
      await pendingSettings;
    });

    expect(result.current).toEqual(DEFAULT_SETTINGS);
  });
});
