import type React from 'react';
import { render, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { VirtualizedMessageList } from './VirtualizedMessageList';
import { MESSAGE_ROLES } from '../../utils/types';

const scrollToRowMock = vi.fn();

vi.mock('react-window', () => ({
  List: ({
    rowCount,
    rowComponent: Row,
    rowProps,
    style,
  }: {
    rowCount: number;
    rowComponent: React.ComponentType<{
      index: number;
      style: React.CSSProperties;
      ariaAttributes: Record<string, string>;
      messages: unknown[];
      rowHeight: { setRowHeight: (index: number, height: number) => void };
    }>;
    rowProps: {
      messages: unknown[];
      rowHeight: { setRowHeight: (index: number, height: number) => void };
    };
    style: React.CSSProperties;
  }) => (
    <div data-testid="virtual-list" style={style}>
      {Array.from({ length: rowCount }).map((_, index) => (
        <Row
          key={index}
          index={index}
          style={{}}
          ariaAttributes={{}}
          messages={rowProps.messages}
          rowHeight={rowProps.rowHeight}
        />
      ))}
    </div>
  ),
  useDynamicRowHeight: () => ({
    setRowHeight: vi.fn(),
  }),
  useListRef: () => ({
    current: {
      scrollToRow: scrollToRowMock,
    },
  }),
}));

describe('VirtualizedMessageList', () => {
  let originalResizeObserver: typeof globalThis.ResizeObserver;
  let disconnectMock = vi.fn();

  beforeEach(() => {
    scrollToRowMock.mockClear();
    disconnectMock = vi.fn();
    originalResizeObserver = globalThis.ResizeObserver;
    globalThis.ResizeObserver = class {
      private callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe(target: Element) {
        const entry = {
          target,
          contentRect: {
            width: 400,
            height: 300,
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 400,
            bottom: 300,
            toJSON: () => ({}),
          } as DOMRectReadOnly,
          borderBoxSize: [{ inlineSize: 400, blockSize: 300 }],
          contentBoxSize: [{ inlineSize: 400, blockSize: 300 }],
          devicePixelContentBoxSize: [{ inlineSize: 400, blockSize: 300 }],
        } as ResizeObserverEntry;
        this.callback([entry], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {
        disconnectMock();
      }
    };
  });

  afterEach(() => {
    globalThis.ResizeObserver = originalResizeObserver;
  });

  it('renders messages and updates on new message', () => {
    const { getByText, rerender } = render(
      <VirtualizedMessageList
        messages={[{ id: '1', role: MESSAGE_ROLES.USER, text: 'Hello', timestamp: Date.now() }]}
      />
    );

    expect(getByText('Hello')).toBeInTheDocument();

    act(() => {
      rerender(
        <VirtualizedMessageList
          messages={[
            { id: '1', role: MESSAGE_ROLES.USER, text: 'Hello', timestamp: Date.now() },
            { id: '2', role: MESSAGE_ROLES.ASSISTANT, text: 'World', timestamp: Date.now() },
          ]}
        />
      );
    });

    expect(getByText('World')).toBeInTheDocument();
    expect(scrollToRowMock).toHaveBeenCalled();
  });

  it('renders via fallback sizing when ResizeObserver is unavailable', () => {
    const originalHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight');
    const originalWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
    Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
      configurable: true,
      value: 240,
    });
    Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
      configurable: true,
      value: 320,
    });

    globalThis.ResizeObserver = undefined as unknown as typeof ResizeObserver;

    const { getByTestId, getByText } = render(
      <VirtualizedMessageList
        messages={[{ id: '1', role: MESSAGE_ROLES.USER, text: 'Fallback', timestamp: Date.now() }]}
      />
    );

    expect(getByTestId('virtual-list')).toBeInTheDocument();
    expect(getByText('Fallback')).toBeInTheDocument();

    if (originalHeight) {
      Object.defineProperty(HTMLElement.prototype, 'clientHeight', originalHeight);
    }
    if (originalWidth) {
      Object.defineProperty(HTMLElement.prototype, 'clientWidth', originalWidth);
    }
  });

  it('does not render list when size is zero', () => {
    globalThis.ResizeObserver = class {
      constructor() {}
      observe() {}
      unobserve() {}
      disconnect() {}
    };

    const { queryByTestId } = render(
      <VirtualizedMessageList
        messages={[{ id: '1', role: MESSAGE_ROLES.USER, text: 'Hidden', timestamp: Date.now() }]}
      />
    );

    expect(queryByTestId('virtual-list')).toBeNull();
  });

  it('does not try to auto-scroll when there are no messages', () => {
    const { getByTestId } = render(<VirtualizedMessageList messages={[]} />);

    expect(getByTestId('virtual-list')).toBeInTheDocument();
    expect(scrollToRowMock).not.toHaveBeenCalled();
  });

  it('disconnects the resize observer on unmount', () => {
    const { unmount } = render(
      <VirtualizedMessageList
        messages={[{ id: '1', role: MESSAGE_ROLES.USER, text: 'Unmount', timestamp: Date.now() }]}
      />
    );

    unmount();

    expect(disconnectMock).toHaveBeenCalled();
  });

  it('ignores resize callbacks without an entry', () => {
    globalThis.ResizeObserver = class {
      private callback: ResizeObserverCallback;
      constructor(callback: ResizeObserverCallback) {
        this.callback = callback;
      }
      observe() {
        this.callback([], this as unknown as ResizeObserver);
      }
      unobserve() {}
      disconnect() {
        disconnectMock();
      }
    };

    const { queryByTestId } = render(
      <VirtualizedMessageList
        messages={[{ id: '1', role: MESSAGE_ROLES.USER, text: 'No entry', timestamp: Date.now() }]}
      />
    );

    expect(queryByTestId('virtual-list')).toBeNull();
  });
});
