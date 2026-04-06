import { render } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useMessageListener } from './useMessageListener';
import { MSG_TYPES, type StreamResponsePayload } from '../../utils/types';

const Wrapper = ({ onUpdate }: { onUpdate: (payload: StreamResponsePayload) => void }) => {
  useMessageListener({ updateLastMessage: onUpdate });
  return <div>hook</div>;
};

describe('useMessageListener', () => {
  const listeners: Array<(message: { type: string; payload?: unknown }) => void> = [];

  beforeEach(() => {
    listeners.length = 0;
    chrome.runtime.onMessage.addListener = vi.fn((cb) => {
      listeners.push(cb);
    });
    chrome.runtime.onMessage.removeListener = vi.fn();
  });

  it('dispatches updateLastMessage on response update', () => {
    const onUpdate = vi.fn();
    render(<Wrapper onUpdate={onUpdate} />);

    expect(listeners.length).toBe(1);
    listeners[0]({
      type: MSG_TYPES.ON_RESPONSE_UPDATE,
      payload: {
        model: 'ChatGPT',
        text: 'Hello',
        isComplete: true,
        requestId: 'req-1',
        turnId: 'turn-1',
      },
    });

    expect(onUpdate).toHaveBeenCalledWith({
      model: 'ChatGPT',
      text: 'Hello',
      isComplete: true,
      requestId: 'req-1',
      turnId: 'turn-1',
    });
  });

  it('ignores unrelated message types', () => {
    const onUpdate = vi.fn();
    render(<Wrapper onUpdate={onUpdate} />);

    listeners[0]({ type: 'PING' });

    expect(onUpdate).not.toHaveBeenCalled();
  });
});
