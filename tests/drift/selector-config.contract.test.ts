import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../src/services/storage', () => ({
  StorageService: {
    saveSelectors: vi.fn(),
    getSelectors: vi.fn(),
  },
}));

const fixturePath = (...parts: string[]) =>
  path.resolve(process.cwd(), 'tests', 'drift', 'fixtures', ...parts);

describe('selector config contract', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    vi.stubEnv('VITE_SELECTOR_CONFIG_URL', 'https://example.com/selectors.json');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('accepts the canonical valid selector fixture', async () => {
    const { StorageService } = await import('../../src/services/storage');
    const validConfig = JSON.parse(readFileSync(fixturePath('selectors.valid.json'), 'utf8'));

    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => validConfig }));

    const { SelectorService } = await import('../../src/services/selectorService');
    await SelectorService.fetchAndCacheSelectors();

    expect(StorageService.saveSelectors).toHaveBeenCalledWith(validConfig);
  });

  it('rejects an invalid selector fixture and preserves fallback safety', async () => {
    const { StorageService } = await import('../../src/services/storage');
    const invalidConfig = JSON.parse(readFileSync(fixturePath('selectors.invalid.json'), 'utf8'));

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => invalidConfig })
    );

    const { SelectorService } = await import('../../src/services/selectorService');
    await SelectorService.fetchAndCacheSelectors();

    expect(StorageService.saveSelectors).not.toHaveBeenCalled();
    await expect(SelectorService.getSelectors('ChatGPT')).resolves.toEqual(
      expect.objectContaining({
        input: '#prompt-textarea',
      })
    );
  });
});
