import { render, fireEvent } from '@testing-library/react';
import { describe, it, expect, beforeEach } from 'vitest';
import { ModelSelector } from './ModelSelector';
import { useStore } from '../store';
import { MODEL_ORDER } from '../../utils/modelConfig';

const setupStore = () => {
  useStore.setState({
    selectedModels: ['ChatGPT'],
    toggleModel: useStore.getState().toggleModel,
  });
};

describe('ModelSelector', () => {
  beforeEach(() => {
    setupStore();
  });

  it('renders model buttons and toggles selection', () => {
    const { getByRole } = render(<ModelSelector />);

    MODEL_ORDER.forEach((model) => {
      expect(getByRole('button', { name: model })).toBeInTheDocument();
    });

    fireEvent.click(getByRole('button', { name: 'Gemini' }));
    expect(useStore.getState().selectedModels).toContain('Gemini');

    fireEvent.click(getByRole('button', { name: 'ChatGPT' }));
    expect(useStore.getState().selectedModels).not.toContain('ChatGPT');
  });
});
