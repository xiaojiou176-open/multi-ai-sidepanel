import { render } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useKeyboardShortcuts } from './useKeyboardShortcuts';

const Wrapper = ({ onNew }: { onNew: () => void }) => {
  useKeyboardShortcuts({ createNewSession: onNew });
  return <div>hook</div>;
};

describe('useKeyboardShortcuts', () => {
  it('triggers createNewSession on Ctrl/Cmd+N', () => {
    const onNew = vi.fn();
    render(<Wrapper onNew={onNew} />);

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'n',
        ctrlKey: true,
      })
    );

    expect(onNew).toHaveBeenCalledTimes(1);

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'n',
        metaKey: true,
      })
    );

    expect(onNew).toHaveBeenCalledTimes(2);
  });

  it('ignores other shortcuts', () => {
    const onNew = vi.fn();
    render(<Wrapper onNew={onNew} />);

    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 'x',
        ctrlKey: true,
      })
    );

    expect(onNew).not.toHaveBeenCalled();
  });
});
