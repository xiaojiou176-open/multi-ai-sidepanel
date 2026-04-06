import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { StorageService } from '../services/storage';

vi.mock('../services/storage', () => ({
  StorageService: {
    getTabs: vi.fn(),
    saveTabs: vi.fn(),
  },
}));

const testGlobal = globalThis as typeof globalThis & { chrome?: typeof chrome };

const setupChromeTabs = () => {
  testGlobal.chrome = {
    tabs: {
      get: vi.fn(),
      query: vi.fn().mockResolvedValue([]),
      create: vi.fn(),
      onUpdated: {
        addListener: vi.fn(),
        removeListener: vi.fn(),
      },
    },
  } as unknown as typeof chrome;
};

describe('TabManager', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    setupChromeTabs();
  });

  it('should reuse cached tab when it exists', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({ ChatGPT: 11 });

    (chrome.tabs.get as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      id: 11,
      url: 'https://chatgpt.com/c/keep',
      status: 'complete',
    });

    const { tabManager } = await import('./tabManager');
    const tabId = await tabManager.getTabId('ChatGPT');

    expect(tabId).toBe(11);
    expect(chrome.tabs.create).not.toHaveBeenCalled();
  });

  it('should recreate tab when cached tab is missing', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({ ChatGPT: 11 });

    (chrome.tabs.get as unknown as { mockRejectedValue: (v: unknown) => void }).mockRejectedValue(
      new Error('not found')
    );
    (
      chrome.tabs.create as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue({
      id: 22,
    });

    const { tabManager } = await import('./tabManager');
    const tabId = await tabManager.getTabId('ChatGPT');

    expect(tabId).toBe(22);
    expect(chrome.tabs.create).toHaveBeenCalled();
  });

  it('creates a fresh tab when loading cached tabs fails', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockRejectedValue: (v: unknown) => void };
    getTabsMock.mockRejectedValue(new Error('load failed'));

    (
      chrome.tabs.create as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue({
      id: 29,
    });

    const { tabManager } = await import('./tabManager');
    const tabId = await tabManager.getTabId('ChatGPT');

    expect(tabId).toBe(29);
    expect(chrome.tabs.create).toHaveBeenCalledTimes(1);
  });

  it('recreates tab when cached id returns null tab', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({ ChatGPT: 11 });

    (chrome.tabs.get as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue(
      null
    );
    (
      chrome.tabs.create as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue({
      id: 33,
    });

    const { tabManager } = await import('./tabManager');
    const tabId = await tabManager.getTabId('ChatGPT');

    expect(tabId).toBe(33);
    expect(chrome.tabs.create).toHaveBeenCalled();
  });

  it('finds an existing tab through chrome.tabs.query and persists the recovered mapping', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    (
      chrome.tabs.query as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue([
      { id: 77, url: 'https://chatgpt.com/c/123' },
      { id: 88, url: 'https://example.com' },
    ]);

    const { tabManager } = await import('./tabManager');
    const tabId = await tabManager.getExistingTabId('ChatGPT');

    expect(tabId).toBe(77);
    expect(storage.saveTabs).toHaveBeenCalledWith({ ChatGPT: 77 });
  });

  it('drops a cached tab when it no longer matches the requested model host', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({ ChatGPT: 11 });

    (chrome.tabs.get as unknown as { mockResolvedValue: (v: unknown) => void }).mockResolvedValue({
      id: 11,
      url: 'https://example.com',
      status: 'complete',
    });
    (
      chrome.tabs.query as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue([
      { id: 77, url: 'https://chatgpt.com/c/123', active: false, lastAccessed: 10 },
    ]);

    const { tabManager } = await import('./tabManager');
    const tabId = await tabManager.getExistingTabId('ChatGPT');

    expect(tabId).toBe(77);
    expect(storage.saveTabs).toHaveBeenLastCalledWith({ ChatGPT: 77 });
  });

  it('prefers the most recently active matching tab when multiple candidates exist', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    (
      chrome.tabs.query as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue([
      { id: 11, url: 'https://chatgpt.com/c/older', active: false, lastAccessed: 1000, index: 4 },
      { id: 22, url: 'https://chatgpt.com/c/current', active: true, lastAccessed: 2000, index: 6 },
      { id: 33, url: 'https://chatgpt.com/c/recent', active: false, lastAccessed: 3000, index: 2 },
    ]);

    const { tabManager } = await import('./tabManager');
    const tabId = await tabManager.getExistingTabId('ChatGPT');

    expect(tabId).toBe(22);
    expect(storage.saveTabs).toHaveBeenCalledWith({ ChatGPT: 22 });
  });

  it('returns candidate tab ids in the same priority order and can persist a preferred tab id', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    (
      chrome.tabs.query as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue([
      { id: 11, url: 'https://chatgpt.com/c/older', active: false, lastAccessed: 1000, index: 4 },
      { id: 22, url: 'https://chatgpt.com/c/current', active: true, lastAccessed: 2000, index: 6 },
      { id: 33, url: 'https://chatgpt.com/c/recent', active: false, lastAccessed: 3000, index: 2 },
    ]);

    const { tabManager } = await import('./tabManager');

    await expect(tabManager.getCandidateTabIds('ChatGPT')).resolves.toEqual([22, 33, 11]);
    await expect(tabManager.rememberTabId('ChatGPT', 33)).resolves.toBeUndefined();
    expect(storage.saveTabs).toHaveBeenLastCalledWith({ ChatGPT: 33 });
  });

  it('ignores invalid queried urls and returns null when no matching tab exists', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    (
      chrome.tabs.query as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue([
      { id: 11, url: 'not a url' },
      { id: 12 },
      { id: 13, url: 'https://example.com' },
    ]);

    const { tabManager } = await import('./tabManager');
    await expect(tabManager.getExistingTabId('ChatGPT')).resolves.toBeNull();
  });

  it('returns null when query support is unavailable or query fails', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    const originalQuery = chrome.tabs.query;
    Reflect.deleteProperty(chrome.tabs, 'query');

    const { tabManager } = await import('./tabManager');
    await expect(tabManager.getExistingTabId('Gemini')).resolves.toBeNull();

    (chrome.tabs as typeof chrome.tabs & { query?: typeof originalQuery }).query = vi
      .fn()
      .mockRejectedValue(new Error('query failed'));

    await expect(tabManager.getExistingTabId('Gemini')).resolves.toBeNull();

    (chrome.tabs as typeof chrome.tabs & { query?: typeof originalQuery }).query = originalQuery;
  });

  it('throws when a new tab is created without an id', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    (
      chrome.tabs.create as unknown as { mockResolvedValue: (v: unknown) => void }
    ).mockResolvedValue({});

    const { tabManager } = await import('./tabManager');

    await expect(tabManager.getTabId('ChatGPT')).rejects.toThrow(
      'Failed to create tab for ChatGPT'
    );
  });

  it('ensureTabReady resolves when tab is complete', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    const tabs = chrome.tabs as unknown as {
      get: (_id: number, cb: (tab: { status: string; url: string }) => void) => void;
    };
    tabs.get = vi.fn((_id: number, cb: (tab: { status: string; url: string }) => void) => {
      cb({ status: 'complete', url: 'https://example.com' });
    });

    const { tabManager } = await import('./tabManager');
    await expect(tabManager.ensureTabReady(1)).resolves.toBeUndefined();
  });

  it('ensureTabReady resolves for chrome:// tabs immediately', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    const tabs = chrome.tabs as unknown as {
      get: (_id: number, cb: (tab: { status: string; url: string }) => void) => void;
    };
    tabs.get = vi.fn((_id: number, cb: (tab: { status: string; url: string }) => void) => {
      cb({ status: 'loading', url: 'chrome://newtab' });
    });

    const { tabManager } = await import('./tabManager');
    await expect(tabManager.ensureTabReady(1)).resolves.toBeUndefined();
  });

  it('ensureTabReady resolves when tab is missing or throws', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    const tabs = chrome.tabs as unknown as {
      get: (_id: number, cb: (tab: unknown) => void) => void;
    };
    tabs.get = vi.fn((_id: number, cb: (tab: unknown) => void) => {
      cb(null);
    });

    const { tabManager } = await import('./tabManager');
    await expect(tabManager.ensureTabReady(99)).resolves.toBeUndefined();

    (chrome.tabs.get as unknown as () => void) = vi.fn(() => {
      throw new Error('boom');
    });
    await expect(tabManager.ensureTabReady(99)).resolves.toBeUndefined();
  });

  it('ensureTabReady waits for onUpdated', async () => {
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    const listeners: Array<(id: number, changeInfo: { status?: string }) => void> = [];
    chrome.tabs.onUpdated.addListener = vi.fn((cb) => listeners.push(cb));
    chrome.tabs.onUpdated.removeListener = vi.fn();

    const tabs = chrome.tabs as unknown as {
      get: (_id: number, cb: (tab: { status: string; url: string }) => void) => void;
    };
    tabs.get = vi.fn((_id: number, cb: (tab: { status: string; url: string }) => void) => {
      cb({ status: 'loading', url: 'https://example.com' });
    });

    const { tabManager } = await import('./tabManager');
    const promise = tabManager.ensureTabReady(1);

    listeners[0](99, { status: 'complete' });
    listeners[0](1, { status: 'loading' });
    listeners[0](1, { status: 'complete' });
    await expect(promise).resolves.toBeUndefined();
  });

  it('ensureTabReady resolves after timeout when tab stays loading', async () => {
    vi.useFakeTimers();
    const storage = (await import('../services/storage')).StorageService as typeof StorageService;
    const getTabsMock = storage.getTabs as unknown as { mockResolvedValue: (v: unknown) => void };
    getTabsMock.mockResolvedValue({});

    const listeners: Array<(id: number, changeInfo: { status?: string }) => void> = [];
    chrome.tabs.onUpdated.addListener = vi.fn((cb) => listeners.push(cb));
    chrome.tabs.onUpdated.removeListener = vi.fn();

    const tabs = chrome.tabs as unknown as {
      get: (_id: number, cb: (tab: { status: string; url: string }) => void) => void;
    };
    tabs.get = vi.fn((_id: number, cb: (tab: { status: string; url: string }) => void) => {
      cb({ status: 'loading', url: 'https://example.com' });
    });

    const { tabManager } = await import('./tabManager');
    const promise = tabManager.ensureTabReady(1, 500);

    await vi.advanceTimersByTimeAsync(500);
    await expect(promise).resolves.toBeUndefined();
    expect(chrome.tabs.onUpdated.removeListener).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
