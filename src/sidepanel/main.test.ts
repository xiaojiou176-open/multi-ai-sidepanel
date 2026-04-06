import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../services/mockChrome', () => ({
  initMockChrome: vi.fn(),
}));

vi.mock('../i18n', () => ({}));

vi.mock('./App.tsx', () => ({
  default: () => null,
}));

const createRootMock = vi.fn((root: Element | DocumentFragment) => {
  void root;
  return { render: vi.fn() };
});

vi.mock('react-dom/client', () => ({
  createRoot: (root: Element | DocumentFragment) => createRootMock(root),
}));

describe('sidepanel main', () => {
  beforeEach(() => {
    vi.resetModules();
    createRootMock.mockClear();
    document.body.innerHTML = '<div id="root"></div>';
  });

  it('initializes chrome mock and renders app', async () => {
    const { initMockChrome } = await import('../services/mockChrome');

    await import('./main');

    expect(initMockChrome).toHaveBeenCalled();
    expect(createRootMock).toHaveBeenCalled();
  });
});
