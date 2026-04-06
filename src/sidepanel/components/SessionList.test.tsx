import { render, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SessionList } from './SessionList';
import { useStore } from '../store';
import { MESSAGE_ROLES, type ModelName } from '../../utils/types';
import { StorageService } from '../../services/storage';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

const settingsState = { doubleClickToEdit: true, pinnedSessionIds: [] as string[] };
vi.mock('../hooks/useSettings', () => ({
  useSettings: () => settingsState,
}));

const buildSession = (id: string, title: string) => ({
  id,
  title,
  messages: [
    {
      id: `${id}-m`,
      role: MESSAGE_ROLES.USER,
      text: `Hello ${id}`,
      timestamp: Date.now(),
    },
  ],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  selectedModels: ['ChatGPT'] as ModelName[],
});

describe('SessionList', () => {
  beforeEach(() => {
    settingsState.doubleClickToEdit = true;
    settingsState.pinnedSessionIds = [];
    vi.spyOn(StorageService, 'saveSettings').mockResolvedValue(undefined);
    useStore.setState({
      sessions: [buildSession('1', 'Alpha'), buildSession('2', 'Beta')],
      currentSessionId: '1',
      switchSession: vi.fn(),
      createNewSession: vi.fn(),
      deleteSession: vi.fn(),
      updateSessionTitle: vi.fn(),
    });
  });

  it('creates new session and switches session', () => {
    const { getByRole } = render(<SessionList />);

    fireEvent.click(getByRole('button', { name: 'session.new' }));
    expect(useStore.getState().createNewSession).toHaveBeenCalled();

    fireEvent.click(getByRole('heading', { name: 'Beta' }));
    expect(useStore.getState().switchSession).toHaveBeenCalledWith('2');
  });

  it('filters sessions by search query', () => {
    vi.useFakeTimers();
    const { getByPlaceholderText, queryByText } = render(<SessionList />);

    fireEvent.change(getByPlaceholderText('session.search'), { target: { value: 'Alpha' } });

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(queryByText('Alpha')).toBeInTheDocument();
    expect(queryByText('Beta')).toBeNull();
    vi.useRealTimers();
  });

  it('supports inline rename on double click', () => {
    settingsState.doubleClickToEdit = true;
    const { getByText, getByDisplayValue } = render(<SessionList />);

    fireEvent.doubleClick(getByText('Alpha'));

    const input = getByDisplayValue('Alpha');
    fireEvent.change(input, { target: { value: 'Alpha Updated' } });
    fireEvent.keyDown(input, { key: 'Enter' });

    expect(useStore.getState().updateSessionTitle).toHaveBeenCalledWith('1', 'Alpha Updated');
  });

  it('does not enter edit mode when double click is disabled', () => {
    settingsState.doubleClickToEdit = false;
    const { getByText, queryByDisplayValue } = render(<SessionList />);

    fireEvent.doubleClick(getByText('Alpha'));
    expect(queryByDisplayValue('Alpha')).toBeNull();
  });

  it('allows canceling edit with Escape', () => {
    settingsState.doubleClickToEdit = true;
    const { getByText, getByDisplayValue, queryByDisplayValue } = render(<SessionList />);

    fireEvent.doubleClick(getByText('Alpha'));
    const input = getByDisplayValue('Alpha');
    fireEvent.keyDown(input, { key: 'Escape' });

    expect(queryByDisplayValue('Alpha')).toBeNull();
  });

  it('shows empty and no-results states', () => {
    vi.useFakeTimers();
    act(() => {
      useStore.setState({
        sessions: [],
        currentSessionId: null,
        switchSession: vi.fn(),
        createNewSession: vi.fn(),
        deleteSession: vi.fn(),
        updateSessionTitle: vi.fn(),
      });
    });

    const { getByText, rerender, getByPlaceholderText } = render(<SessionList />);
    expect(getByText('session.empty')).toBeInTheDocument();

    act(() => {
      useStore.setState({
        sessions: [buildSession('1', 'Alpha')],
        currentSessionId: '1',
        switchSession: vi.fn(),
        createNewSession: vi.fn(),
        deleteSession: vi.fn(),
        updateSessionTitle: vi.fn(),
      });
    });
    act(() => {
      rerender(<SessionList />);
    });

    fireEvent.change(getByPlaceholderText('session.search'), {
      target: { value: 'zzz' },
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(getByText('session.noResults')).toBeInTheDocument();
    vi.useRealTimers();
  });

  it('clears search via reset button', () => {
    vi.useFakeTimers();
    const { container, getByPlaceholderText } = render(<SessionList />);
    const input = getByPlaceholderText('session.search') as HTMLInputElement;

    fireEvent.change(input, { target: { value: 'Alpha' } });
    const searchWrapper = container.querySelector('div.relative') as HTMLDivElement;
    const clearButton = searchWrapper.querySelector('button') as HTMLButtonElement;
    fireEvent.click(clearButton);

    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(input.value).toBe('');
    vi.useRealTimers();
  });

  it('hides delete button when only one session exists', () => {
    act(() => {
      useStore.setState({
        sessions: [buildSession('1', 'Alpha')],
        currentSessionId: '1',
        switchSession: vi.fn(),
        createNewSession: vi.fn(),
        deleteSession: vi.fn(),
        updateSessionTitle: vi.fn(),
      });
    });

    const { queryByTitle } = render(<SessionList />);
    expect(queryByTitle('session.delete')).toBeNull();
  });

  it('formats time labels across ranges', () => {
    const now = new Date('2025-01-08T00:00:00Z');
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const sessions = [
      buildSession('1', 'Now'),
      buildSession('2', 'Minutes'),
      buildSession('3', 'Hours'),
      buildSession('4', 'Yesterday'),
      buildSession('5', 'Days'),
      buildSession('6', 'Date'),
      {
        id: '7',
        title: 'Empty',
        messages: [],
        createdAt: now.getTime(),
        updatedAt: now.getTime(),
        selectedModels: ['ChatGPT'] as ModelName[],
      },
    ];

    sessions[0].updatedAt = now.getTime() - 30 * 1000;
    sessions[1].updatedAt = now.getTime() - 5 * 60 * 1000;
    sessions[2].updatedAt = now.getTime() - 2 * 60 * 60 * 1000;
    sessions[3].updatedAt = now.getTime() - 24 * 60 * 60 * 1000;
    sessions[4].updatedAt = now.getTime() - 3 * 24 * 60 * 60 * 1000;
    sessions[5].updatedAt = now.getTime() - 10 * 24 * 60 * 60 * 1000;

    act(() => {
      useStore.setState({
        sessions,
        currentSessionId: '1',
        switchSession: vi.fn(),
        createNewSession: vi.fn(),
        deleteSession: vi.fn(),
        updateSessionTitle: vi.fn(),
      });
    });

    const { getAllByText, getByText } = render(<SessionList />);

    expect(getAllByText('time.justNow').length).toBeGreaterThan(0);
    expect(getAllByText('time.minutesAgo').length).toBeGreaterThan(0);
    expect(getAllByText('time.hoursAgo').length).toBeGreaterThan(0);
    expect(getAllByText('time.yesterday').length).toBeGreaterThan(0);
    expect(getAllByText('time.daysAgo').length).toBeGreaterThan(0);

    const dateLabel = new Date(sessions[5].updatedAt).toLocaleDateString();
    expect(getByText(dateLabel)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('confirms deletion via dialog', () => {
    const { getAllByTitle, getByText } = render(<SessionList />);

    fireEvent.click(getAllByTitle('session.delete')[0]);
    fireEvent.click(getByText('common.confirm'));

    expect(useStore.getState().deleteSession).toHaveBeenCalled();
  });

  it('pins a session through settings storage', async () => {
    const { getAllByTitle } = render(<SessionList />);

    await act(async () => {
      fireEvent.click(getAllByTitle('session.pin')[0]);
      await Promise.resolve();
    });

    expect(StorageService.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        pinnedSessionIds: ['1'],
      })
    );
  });

  it('unpins an already pinned session and supports rename button flow', async () => {
    settingsState.pinnedSessionIds = ['1'];
    const { getAllByTitle, getByDisplayValue } = render(<SessionList />);

    await act(async () => {
      fireEvent.click(getAllByTitle('session.pin')[0]);
      await Promise.resolve();
    });
    expect(StorageService.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({
        pinnedSessionIds: [],
      })
    );

    fireEvent.click(getAllByTitle('session.rename')[0]);
    expect(getByDisplayValue('Alpha')).toBeInTheDocument();
    settingsState.pinnedSessionIds = [];
  });
});
