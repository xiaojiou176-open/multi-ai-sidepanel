import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InputArea } from './InputArea';
import { useStore } from '../store';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (_key: string, fallback?: string) => fallback ?? _key,
  }),
}));

const settingsState = {
  enterToSend: true,
  doubleClickToEdit: true,
  recipes: [] as Array<{
    id: string;
    name: string;
    prompt: string;
    models: string[];
  }>,
};

vi.mock('../hooks/useSettings', () => ({
  useSettings: () => settingsState,
}));

const setupStore = (override?: Partial<ReturnType<typeof useStore.getState>>) => {
  useStore.setState({
    input: '',
    isGenerating: false,
    setInput: vi.fn((text: string) => useStore.setState({ input: text })),
    setSelectedModelsForCurrentSession: vi.fn(),
    sendMessage: vi.fn(),
    ...override,
  });
};

describe('InputArea', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupStore();
  });

  it('sends message on Enter when enabled', () => {
    settingsState.enterToSend = true;
    setupStore({ input: 'Hello' });
    const { getByRole } = render(<InputArea />);

    const textarea = getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(useStore.getState().sendMessage).toHaveBeenCalled();
  });

  it('does not send when generating', () => {
    settingsState.enterToSend = true;
    setupStore({ input: 'Hello', isGenerating: true });
    const { getByRole } = render(<InputArea />);

    const textarea = getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter' });

    expect(useStore.getState().sendMessage).not.toHaveBeenCalled();
  });

  it('disables send button when input is empty', () => {
    settingsState.enterToSend = true;
    setupStore({ input: '' });
    const { getByRole } = render(<InputArea />);

    const button = getByRole('button', { name: 'Send compare prompt' });
    expect(button).toBeDisabled();
  });

  it('exposes an accessible label for the send button', () => {
    settingsState.enterToSend = true;
    setupStore({ input: 'Hello' });
    const { getByRole } = render(<InputArea />);

    expect(getByRole('button', { name: 'Send compare prompt' })).toBeEnabled();
  });

  it('exposes an accessible label for the compare prompt textbox', () => {
    settingsState.enterToSend = true;
    setupStore({ input: '' });
    const { getByRole } = render(<InputArea />);

    expect(getByRole('textbox', { name: 'Compare prompt input' })).toBeInTheDocument();
  });

  it('requires Ctrl/Cmd+Enter when enterToSend is disabled', () => {
    settingsState.enterToSend = false;
    setupStore({ input: 'Hello' });
    const { getByRole } = render(<InputArea />);

    const textarea = getByRole('textbox');
    fireEvent.keyDown(textarea, { key: 'Enter' });
    expect(useStore.getState().sendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(textarea, { key: 'Enter', ctrlKey: true });
    expect(useStore.getState().sendMessage).toHaveBeenCalledTimes(1);
  });

  it('updates input state on change', () => {
    setupStore({ input: '' });
    const { getByRole } = render(<InputArea />);

    const textarea = getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'New value' } });

    expect(useStore.getState().setInput).toHaveBeenCalledWith('New value');
  });

  it('applies a saved recipe to the input and selected models', () => {
    settingsState.recipes = [
      {
        id: 'recipe-1',
        name: 'Release recap',
        prompt: 'Summarize the latest release changes.',
        models: ['ChatGPT', 'Gemini'],
      },
    ];
    setupStore({ input: '' });
    const { getByRole } = render(<InputArea />);

    fireEvent.click(getByRole('button', { name: 'Release recap' }));

    expect(useStore.getState().setInput).toHaveBeenCalledWith(
      'Summarize the latest release changes.'
    );
    expect(useStore.getState().setSelectedModelsForCurrentSession).toHaveBeenCalledWith([
      'ChatGPT',
      'Gemini',
    ]);

    settingsState.recipes = [];
  });

  it('shows starter prompts when no saved recipes exist and the composer is empty', () => {
    settingsState.recipes = [];
    setupStore({ input: '' });

    const { getByRole } = render(<InputArea />);

    fireEvent.click(
      getByRole('button', {
        name: 'Rewrite this paragraph in a clearer, friendlier tone for a GitHub README.',
      })
    );

    expect(useStore.getState().setInput).toHaveBeenCalledWith(
      'Rewrite this paragraph in a clearer, friendlier tone for a GitHub README.'
    );
  });

  it('loads a built-in prompt pack when the composer is empty', () => {
    settingsState.recipes = [];
    setupStore({ input: '' });

    const { getByRole } = render(<InputArea />);

    fireEvent.click(getByRole('button', { name: 'Writing Pack' }));

    expect(useStore.getState().setSelectedModelsForCurrentSession).toHaveBeenCalledWith([
      'ChatGPT',
      'Gemini',
      'Perplexity',
    ]);
    expect(useStore.getState().setInput).toHaveBeenCalledWith(
      'Rewrite this paragraph in a clearer, friendlier tone for a GitHub README.'
    );
  });
});
