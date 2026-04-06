import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('./storage', () => ({
  StorageService: {
    saveSelectors: vi.fn(),
    getSelectors: vi.fn(),
  },
}));

const validConfig = {
  ChatGPT: { input: '#a', submit: '#b', message: '#c', stop: '#d' },
  Gemini: { input: '#a', submit: '#b', message: '#c', stop: '#d' },
  Perplexity: { input: '#a', submit: '#b', message: '#c', stop: '#d' },
  Qwen: { input: '#a', submit: '#b', message: '#c', stop: '#d' },
  Grok: { input: '#a', submit: '#b', message: '#c', stop: '#d' },
};

describe('SelectorService remote', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_SELECTOR_CONFIG_URL', 'https://example.com/selectors.json');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it('fetches and caches valid remote config', async () => {
    const { StorageService } = await import('./storage');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => validConfig,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { SelectorService } = await import('./selectorService');
    await SelectorService.fetchAndCacheSelectors();

    expect(fetchMock).toHaveBeenCalled();
    expect(StorageService.saveSelectors).toHaveBeenCalledWith(validConfig);
  });

  it('skips caching when remote config is invalid', async () => {
    const { StorageService } = await import('./storage');
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ChatGPT: { input: '', submit: '', message: '' } }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { SelectorService } = await import('./selectorService');
    await SelectorService.fetchAndCacheSelectors();

    expect(StorageService.saveSelectors).not.toHaveBeenCalled();
  });

  it('handles fetch failures', async () => {
    const { StorageService } = await import('./storage');
    const fetchMock = vi.fn().mockResolvedValue({ ok: false });
    vi.stubGlobal('fetch', fetchMock);

    const { SelectorService } = await import('./selectorService');
    await SelectorService.fetchAndCacheSelectors();

    expect(StorageService.saveSelectors).not.toHaveBeenCalled();
  });
});
