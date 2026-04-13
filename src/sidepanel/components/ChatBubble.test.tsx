import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { ChatBubble } from './ChatBubble';
import { MESSAGE_ROLES } from '../../utils/types';

describe('ChatBubble', () => {
  it('renders user message without model label', () => {
    const { queryByText, getByText } = render(<ChatBubble role={MESSAGE_ROLES.USER} text="Hi" />);

    expect(getByText('Hi')).toBeInTheDocument();
    expect(queryByText('ChatGPT')).toBeNull();
  });

  it('renders assistant message with model label', () => {
    const { getByText } = render(
      <ChatBubble role={MESSAGE_ROLES.ASSISTANT} text="Hello" model="ChatGPT" />
    );

    expect(getByText('Hello')).toBeInTheDocument();
    expect(getByText('ChatGPT')).toBeInTheDocument();
  });

  it('renders system message centered', () => {
    const { getByText } = render(<ChatBubble role={MESSAGE_ROLES.SYSTEM} text="System" />);

    const text = getByText('System');
    expect(text).toBeInTheDocument();
    expect(text.parentElement?.className).toContain('ps-system-bubble');
  });

  it('renders assistant message without model icon label', () => {
    const { getByText, queryByText } = render(
      <ChatBubble role={MESSAGE_ROLES.ASSISTANT} text="No model" />
    );

    expect(getByText('No model')).toBeInTheDocument();
    expect(queryByText('ChatGPT')).toBeNull();
  });

  it('renders assistant message with non-default model label', () => {
    const { getAllByText } = render(
      <ChatBubble role={MESSAGE_ROLES.ASSISTANT} text="Gemini" model="Gemini" />
    );

    expect(getAllByText('Gemini').length).toBeGreaterThan(0);
  });

  it('announces streaming assistant messages', () => {
    const { getByText } = render(
      <ChatBubble role={MESSAGE_ROLES.ASSISTANT} text="Streaming" model="ChatGPT" isStreaming />
    );

    expect(getByText('Streaming')).toHaveAttribute('aria-live', 'polite');
  });

  it('renders delivery badges for assistant statuses', () => {
    const { getAllByText, getByText, rerender } = render(
      <ChatBubble
        role={MESSAGE_ROLES.ASSISTANT}
        text="Pending"
        model="Perplexity"
        deliveryStatus="pending"
      />
    );

    expect(getAllByText('Pending').length).toBeGreaterThan(0);
    expect(getByText('Perplexity')).toBeInTheDocument();

    rerender(
      <ChatBubble
        role={MESSAGE_ROLES.ASSISTANT}
        text="Errored"
        model="Grok"
        deliveryStatus="error"
      />
    );

    expect(getByText('Failed')).toBeInTheDocument();
    expect(getByText('Grok')).toBeInTheDocument();
  });

  it('does not announce user or system bubbles even when streaming is true', () => {
    const { getByText, rerender } = render(
      <ChatBubble role={MESSAGE_ROLES.USER} text="User streaming" isStreaming />
    );

    expect(getByText('User streaming')).not.toHaveAttribute('aria-live');

    rerender(<ChatBubble role={MESSAGE_ROLES.SYSTEM} text="System streaming" isStreaming />);
    expect(getByText('System streaming')).not.toHaveAttribute('aria-live');
  });
});
