import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createRootMock = vi.fn((root: Element | DocumentFragment) => {
  void root;
  return { render: vi.fn() };
});

vi.mock('react-dom/client', () => ({
  createRoot: (root: Element | DocumentFragment) => createRootMock(root),
}));

describe('settingsEntry', () => {
  const i18nMock = {
    default: {
      t: (_key: string, defaultValue?: string) => defaultValue ?? '',
    },
  };

  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    createRootMock.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('initializes mock chrome when real extension chrome is unavailable', async () => {
    const initMockChrome = vi.fn();

    vi.doMock('../services/mockChrome', () => ({
      initMockChrome,
    }));
    vi.doMock('../i18n', () => i18nMock);
    vi.doMock('./components/SettingsPanel', () => ({
      SettingsPanel: () => <div>settings panel</div>,
    }));

    const { SettingsApp } = await import('./settingsEntry');

    expect(initMockChrome).toHaveBeenCalled();
    expect(createRootMock).toHaveBeenCalled();

    render(<SettingsApp />);
    expect(screen.getByText('settings panel')).toBeInTheDocument();
  });

  it('skips mock initialization when extension chrome APIs are available', async () => {
    const initMockChrome = vi.fn();

    vi.doMock('../services/mockChrome', () => ({
      initMockChrome,
    }));
    vi.doMock('../i18n', () => i18nMock);
    vi.doMock('./components/SettingsPanel', () => ({
      SettingsPanel: () => <div>settings panel</div>,
    }));

    vi.stubGlobal('chrome', {
      runtime: { getURL: vi.fn() },
      storage: { local: {} },
    });

    await import('./settingsEntry');

    expect(initMockChrome).not.toHaveBeenCalled();
    expect(createRootMock).toHaveBeenCalled();
  });

  it('renders the error boundary fallback when the settings panel crashes', async () => {
    const initMockChrome = vi.fn();

    vi.doMock('../services/mockChrome', () => ({
      initMockChrome,
    }));
    vi.doMock('../i18n', () => i18nMock);
    vi.doMock('./components/SettingsPanel', () => ({
      SettingsPanel: () => {
        throw new Error('boom');
      },
    }));

    const { SettingsApp } = await import('./settingsEntry');

    render(<SettingsApp />);

    expect(screen.getByText('Settings crashed.')).toBeInTheDocument();
  });
});
