import { render, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import App from './App';
import { useStore } from './store';
import { MODEL_ORDER } from '../utils/modelConfig';
import { MSG_TYPES } from '../utils/types';
import { shouldOpenSettingsFromUrl } from './utils/shouldOpenSettingsFromUrl';

const testGlobal = globalThis as typeof globalThis & { chrome?: typeof chrome };

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

vi.mock('./hooks/useKeyboardShortcuts', () => ({
  useKeyboardShortcuts: () => undefined,
}));

vi.mock('./components/ModelSelector', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}));

vi.mock('./components/VirtualizedMessageList', () => ({
  VirtualizedMessageList: () => <div data-testid="message-list" />,
}));

vi.mock('./components/CompareView', () => ({
  CompareView: () => <div data-testid="compare-view" />,
}));

vi.mock('./components/InputArea', () => ({
  InputArea: () => <div data-testid="input-area" />,
}));

vi.mock('./components/SessionList', () => ({
  SessionList: () => <div data-testid="session-list" />,
}));

vi.mock('./components/SettingsPanel', () => ({
  SettingsPanel: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="settings-panel">
      <button onClick={onClose}>close</button>
    </div>
  ),
}));

vi.mock('./components/ReadinessPanel', () => ({
  ReadinessPanel: () => <div data-testid="readiness-panel" />,
}));

describe('App', () => {
  beforeEach(() => {
    window.localStorage.clear();
    window.history.pushState({}, '', '/');
    window.location.hash = '';
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'New Chat',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      updateLastMessage: vi.fn(),
      loadSessions: vi.fn(),
      createNewSession: vi.fn(),
    });
  });

  it('opens all model urls and toggles settings panel', () => {
    const openSpy = vi.fn();
    const originalOpen = window.open;
    window.open = openSpy as unknown as typeof window.open;

    const { getByText, getByTitle, queryByTestId } = render(<App />);

    expect(useStore.getState().loadSessions).toHaveBeenCalled();

    fireEvent.click(getByText('Open model tabs'));
    expect(openSpy).toHaveBeenCalledTimes(MODEL_ORDER.length);

    fireEvent.click(getByTitle('settings.title'));
    expect(queryByTestId('settings-panel')).toBeInTheDocument();

    fireEvent.click(getByText('close'));
    expect(queryByTestId('settings-panel')).toBeNull();

    window.open = originalOpen;
  });

  it('respects openSettings query param on first render', () => {
    window.history.pushState({}, '', '?openSettings=1');

    const { queryByTestId } = render(<App />);

    expect(queryByTestId('settings-panel')).toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });

  it('subscribes to runtime messages and forwards updates', () => {
    const updateLastMessage = vi.fn();
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'New Chat',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      updateLastMessage,
      loadSessions: vi.fn(),
      createNewSession: vi.fn(),
    });

    const listeners: Array<(message: unknown) => void> = [];
    chrome.runtime.onMessage.addListener = vi.fn((cb) => listeners.push(cb));
    chrome.runtime.onMessage.removeListener = vi.fn();

    const { unmount } = render(<App />);

    listeners[0]?.({
      type: MSG_TYPES.ON_RESPONSE_UPDATE,
      payload: {
        model: 'ChatGPT',
        text: 'hi',
        isComplete: true,
        requestId: 'req-1',
        turnId: 'turn-1',
      },
    });

    expect(updateLastMessage).toHaveBeenCalledWith({
      model: 'ChatGPT',
      text: 'hi',
      isComplete: true,
      requestId: 'req-1',
      turnId: 'turn-1',
    });

    unmount();
    expect(chrome.runtime.onMessage.removeListener).toHaveBeenCalled();
  });

  it('ignores unrelated runtime update messages', () => {
    const updateLastMessage = vi.fn();
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'New Chat',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      updateLastMessage,
      loadSessions: vi.fn(),
      createNewSession: vi.fn(),
    });

    const listeners: Array<(message: unknown) => void> = [];
    chrome.runtime.onMessage.addListener = vi.fn((cb) => listeners.push(cb));

    render(<App />);

    listeners[0]?.({
      type: 'UNRELATED',
      payload: { ignored: true },
    });

    expect(updateLastMessage).not.toHaveBeenCalled();
  });

  it('toggles sidebar visibility', () => {
    const { getByTitle, container } = render(<App />);

    const toggle = getByTitle('common.closeSidebar');
    const sidebar = container.querySelector('div.fixed');
    expect(sidebar?.className).toContain('translate-x-0');

    fireEvent.click(toggle);
    expect(sidebar?.className).toContain('-translate-x-full');
  });

  it('does not crash when chrome runtime is unavailable', () => {
    const originalChrome = testGlobal.chrome;
    Reflect.deleteProperty(testGlobal, 'chrome');

    expect(() => render(<App />)).not.toThrow();

    if (originalChrome) {
      testGlobal.chrome = originalChrome;
    }
  });

  it('opens settings from localStorage flags and clears them', () => {
    window.localStorage.setItem('prompt-switchboard.openSettings', '1');
    window.localStorage.setItem('prompt-switchboard.e2e', '1');

    const { queryByTestId } = render(<App />);

    expect(queryByTestId('settings-panel')).toBeInTheDocument();
    expect(window.localStorage.getItem('prompt-switchboard.openSettings')).toBeNull();
    expect(window.localStorage.getItem('prompt-switchboard.e2e')).toBeNull();
  });

  it('exposes and cleans up the window settings hook', () => {
    const { queryByTestId, unmount } = render(<App />);

    const target = window as unknown as {
      __promptSwitchboard?: { openSettings: () => void };
    };
    expect(target.__promptSwitchboard?.openSettings).toBeTypeOf('function');

    act(() => {
      target.__promptSwitchboard?.openSettings();
    });
    expect(target.__promptSwitchboard?.openSettings).toBeTypeOf('function');

    return waitFor(() => {
      expect(queryByTestId('settings-panel')).toBeInTheDocument();
    }).then(() => {
      unmount();
      expect(target.__promptSwitchboard).toBeUndefined();
    });
  });

  it('window settings hook can replace sessions and switch compare view mode', async () => {
    const importSessions = vi.fn().mockResolvedValue(undefined);
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'New Chat',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      updateLastMessage: vi.fn(),
      loadSessions: vi.fn(),
      createNewSession: vi.fn(),
      importSessions,
    });

    const { queryByTestId } = render(<App />);
    const target = window as unknown as {
      __promptSwitchboard?: {
        replaceSessions: (sessions: unknown[], currentId?: string | null) => Promise<void>;
        setViewMode: (mode: 'compare' | 'transcript') => void;
      };
    };

    await act(async () => {
      await target.__promptSwitchboard?.replaceSessions(
        [
          {
            id: 'next',
            title: 'Imported',
            messages: [],
            createdAt: 1,
            updatedAt: 1,
            selectedModels: ['Gemini'],
          },
        ],
        'next'
      );
    });
    expect(importSessions).toHaveBeenCalled();

    act(() => {
      target.__promptSwitchboard?.setViewMode('transcript');
    });
    expect(queryByTestId('message-list')).toBeInTheDocument();
  });

  it('tracks settings visibility on the window hook', async () => {
    const { getByTitle, getByText, queryByTestId } = render(<App />);

    const target = window as unknown as {
      __promptSwitchboardShowSettings?: boolean;
    };

    expect(target.__promptSwitchboardShowSettings).toBe(false);

    fireEvent.click(getByTitle('settings.title'));
    expect(target.__promptSwitchboardShowSettings).toBe(true);
    expect(queryByTestId('settings-panel')).toBeInTheDocument();

    fireEvent.click(getByText('close'));
    expect(target.__promptSwitchboardShowSettings).toBe(false);
  });

  it('opens settings from hashchange, custom events, and postMessage', async () => {
    const { queryByTestId } = render(<App />);

    expect(queryByTestId('settings-panel')).toBeNull();

    window.location.hash = '#settings';
    act(() => {
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });
    await waitFor(() => expect(queryByTestId('settings-panel')).toBeInTheDocument());

    fireEvent.click(document.querySelector('[data-testid="settings-panel"] button')!);
    expect(queryByTestId('settings-panel')).toBeNull();

    act(() => {
      window.dispatchEvent(new Event('prompt-switchboard:open-settings'));
    });
    await waitFor(() => expect(queryByTestId('settings-panel')).toBeInTheDocument());

    fireEvent.click(document.querySelector('[data-testid="settings-panel"] button')!);
    expect(queryByTestId('settings-panel')).toBeNull();

    act(() => {
      window.dispatchEvent(
        new MessageEvent('message', { data: { type: 'prompt-switchboard:open-settings' } })
      );
    });
    await waitFor(() => expect(queryByTestId('settings-panel')).toBeInTheDocument());
  });

  it('ignores unrelated postMessage settings events', () => {
    const { queryByTestId } = render(<App />);

    act(() => {
      window.dispatchEvent(new MessageEvent('message', { data: { type: 'ignored:event' } }));
    });

    expect(queryByTestId('settings-panel')).toBeNull();
  });

  it('detects all supported settings-open URL signals', () => {
    window.history.pushState({}, '', '?e2e=1');
    expect(shouldOpenSettingsFromUrl()).toBe(true);

    window.history.pushState({}, '', '/');
    window.location.hash = '#settings';
    expect(shouldOpenSettingsFromUrl()).toBe(true);

    window.location.hash = '';
    window.localStorage.setItem('prompt-switchboard.openSettings', '1');
    expect(shouldOpenSettingsFromUrl()).toBe(true);
    expect(window.localStorage.getItem('prompt-switchboard.openSettings')).toBeNull();

    window.localStorage.setItem('prompt-switchboard.e2e', '1');
    expect(shouldOpenSettingsFromUrl()).toBe(true);
    expect(window.localStorage.getItem('prompt-switchboard.e2e')).toBeNull();
  });

  it('returns false when no settings-open signal is present', () => {
    expect(shouldOpenSettingsFromUrl()).toBe(false);
  });

  it('returns false when window is unavailable', () => {
    const originalWindow = globalThis.window;

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: undefined,
    });

    expect(shouldOpenSettingsFromUrl()).toBe(false);

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: originalWindow,
    });
  });

  it('detects settings-open hints from the full href even without a query param', () => {
    window.history.pushState({}, '', '/openSettings=1');

    expect(shouldOpenSettingsFromUrl()).toBe(true);
  });

  it('renders compare view by default and switches back to transcript', () => {
    const { getByText, getByTestId, queryByTestId } = render(<App />);

    expect(getByTestId('compare-view')).toBeInTheDocument();
    expect(queryByTestId('message-list')).toBeNull();

    fireEvent.click(getByText('Transcript'));
    expect(getByTestId('message-list')).toBeInTheDocument();

    fireEvent.click(getByText('Compare'));
    expect(getByTestId('compare-view')).toBeInTheDocument();
  });

  it('shows pluralized turn count and handles missing current session messages', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Chat',
          messages: [
            {
              id: 'u1',
              role: 'user',
              text: 'one',
              timestamp: 1,
            },
            {
              id: 'u2',
              role: 'user',
              text: 'two',
              timestamp: 2,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: 'missing',
      loadSessions: vi.fn(),
      createNewSession: vi.fn(),
    });

    const { getByTestId, queryByText } = render(<App />);

    expect(getByTestId('compare-view')).toBeInTheDocument();
    expect(queryByText('2 turns')).toBeNull();
  });

  it('shows pluralized turn count for multiple user prompts', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Chat',
          messages: [
            {
              id: 'u1',
              role: 'user',
              text: 'one',
              timestamp: 1,
            },
            {
              id: 'u2',
              role: 'user',
              text: 'two',
              timestamp: 2,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      loadSessions: vi.fn(),
      createNewSession: vi.fn(),
    });

    const { getByText } = render(<App />);
    expect(getByText('2 comparisons')).toBeInTheDocument();
  });

  it('shows singular turn count for one user prompt', () => {
    useStore.setState({
      sessions: [
        {
          id: '1',
          title: 'Chat',
          messages: [
            {
              id: 'u1',
              role: 'user',
              text: 'one',
              timestamp: 1,
            },
          ],
          createdAt: 1,
          updatedAt: 1,
          selectedModels: ['ChatGPT'],
        },
      ],
      currentSessionId: '1',
      loadSessions: vi.fn(),
      createNewSession: vi.fn(),
    });

    const { getByText } = render(<App />);
    expect(getByText('1 comparison')).toBeInTheDocument();
  });
});
