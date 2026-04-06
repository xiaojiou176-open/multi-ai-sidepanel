import { describe, it, expect, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useScrollLogic } from './useScrollLogic';

const createScrollableDiv = () => {
  const div = document.createElement('div');
  Object.defineProperty(div, 'scrollHeight', { value: 1000, configurable: true });
  Object.defineProperty(div, 'clientHeight', { value: 400, configurable: true });
  div.scrollTop = 0;
  return div;
};

describe('useScrollLogic', () => {
  it('shows scroll button when user is not near bottom', () => {
    const container = createScrollableDiv();
    const end = document.createElement('div');
    const scrollIntoView = vi.fn();
    end.scrollIntoView = scrollIntoView;

    const { result } = renderHook(() =>
      useScrollLogic({
        messagesLength: 1,
        useVirtualization: false,
        messagesContainerRef: { current: container },
        messagesEndRef: { current: end },
      })
    );

    act(() => {
      container.scrollTop = 0;
      container.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.showScrollButton).toBe(true);

    act(() => {
      container.scrollTop = 650;
      container.dispatchEvent(new Event('scroll'));
    });

    expect(result.current.showScrollButton).toBe(false);
  });

  it('scrollToBottom triggers scrollIntoView when not virtualized', () => {
    const container = createScrollableDiv();
    const end = document.createElement('div');
    const scrollIntoView = vi.fn();
    end.scrollIntoView = scrollIntoView;

    const { result } = renderHook(() =>
      useScrollLogic({
        messagesLength: 1,
        useVirtualization: false,
        messagesContainerRef: { current: container },
        messagesEndRef: { current: end },
      })
    );

    act(() => {
      result.current.scrollToBottom();
    });

    expect(scrollIntoView).toHaveBeenCalled();
  });

  it('does not call scrollIntoView when virtualization is enabled', () => {
    const container = createScrollableDiv();
    const end = document.createElement('div');
    const scrollIntoView = vi.fn();
    end.scrollIntoView = scrollIntoView;

    const { result } = renderHook(() =>
      useScrollLogic({
        messagesLength: 1,
        useVirtualization: true,
        messagesContainerRef: { current: container },
        messagesEndRef: { current: end },
      })
    );

    act(() => {
      result.current.scrollToBottom();
    });

    expect(scrollIntoView).not.toHaveBeenCalled();
  });

  it('does nothing when the messages container is missing', () => {
    const { result } = renderHook(() =>
      useScrollLogic({
        messagesLength: 1,
        useVirtualization: false,
        messagesContainerRef: { current: null },
        messagesEndRef: { current: null },
      })
    );

    act(() => {
      result.current.scrollToBottom();
    });

    expect(result.current.showScrollButton).toBe(false);
  });

  it('does not crash when scrolling to bottom without a trailing element', () => {
    const container = createScrollableDiv();

    const { result, rerender } = renderHook(
      ({ messagesLength }) =>
        useScrollLogic({
          messagesLength,
          useVirtualization: false,
          messagesContainerRef: { current: container },
          messagesEndRef: { current: null },
        }),
      {
        initialProps: { messagesLength: 1 },
      }
    );

    act(() => {
      container.scrollTop = 650;
      container.dispatchEvent(new Event('scroll'));
    });

    rerender({ messagesLength: 2 });

    expect(result.current.showScrollButton).toBe(false);
  });
});
