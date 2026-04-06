import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SelectorService } from './selectorService';
import { StorageService } from './storage';

vi.mock('./storage', () => ({
  StorageService: {
    getSelectors: vi.fn(),
    saveSelectors: vi.fn(),
  },
}));

describe('SelectorService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('should return cached selectors when available', async () => {
    const getSelectorsMock = StorageService.getSelectors as unknown as {
      mockResolvedValue: (value: unknown) => void;
    };
    getSelectorsMock.mockResolvedValue({
      ChatGPT: { input: 'x', submit: 'y', message: 'z' },
    });

    const selectors = await SelectorService.getSelectors('ChatGPT');
    expect(selectors.input).toBe('x');
  });

  it('should fall back to defaults when cache missing', async () => {
    const getSelectorsMock = StorageService.getSelectors as unknown as {
      mockResolvedValue: (value: unknown) => void;
    };
    getSelectorsMock.mockResolvedValue(null);

    const selectors = await SelectorService.getSelectors('ChatGPT');
    expect(selectors.input).toBe('#prompt-textarea');
  });

  it('reports selector diagnostics for cached and default sources', async () => {
    const getSelectorsMock = StorageService.getSelectors as unknown as {
      mockResolvedValueOnce: (value: unknown) => unknown;
      mockResolvedValue: (value: unknown) => void;
    };
    getSelectorsMock.mockResolvedValueOnce({
      ChatGPT: { input: 'x', submit: 'y', message: 'z' },
    });
    getSelectorsMock.mockResolvedValue(null);

    await expect(SelectorService.getSelectorDiagnostics('ChatGPT')).resolves.toEqual(
      expect.objectContaining({
        source: 'cached',
        remoteConfigConfigured: false,
      })
    );
    await expect(SelectorService.getSelectorDiagnostics('ChatGPT')).resolves.toEqual(
      expect.objectContaining({
        source: 'default',
        remoteConfigConfigured: false,
      })
    );
  });

  it('treats a missing submit control as selector drift even when the input exists', async () => {
    const getSelectorsMock = StorageService.getSelectors as unknown as {
      mockResolvedValue: (value: unknown) => void;
    };
    getSelectorsMock.mockResolvedValue(null);

    document.body.innerHTML = '<div id="prompt-textarea"></div>';

    await expect(SelectorService.getSelectorDiagnostics('ChatGPT')).resolves.toEqual(
      expect.objectContaining({
        readinessStatus: 'selector_drift_suspect',
        failureClass: 'selector_drift_suspect',
        inputReady: true,
        submitReady: false,
      })
    );
  });

  it('should skip remote fetch when env not set', async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);

    await SelectorService.fetchAndCacheSelectors();
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
