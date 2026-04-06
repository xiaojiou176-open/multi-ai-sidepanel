import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  waitForElement,
  simulateInput,
  simulateContentEditableInput,
  simulatePasteInput,
} from './dom';

const testGlobal = globalThis as typeof globalThis & {
  DataTransfer?: typeof DataTransfer;
  ClipboardEvent?: typeof ClipboardEvent;
};

describe('dom utils', () => {
  const OriginalClipboardEvent = globalThis.ClipboardEvent;
  const OriginalDataTransfer = globalThis.DataTransfer;

  beforeEach(() => {
    document.body.innerHTML = '';
    vi.useFakeTimers();

    class MockDataTransfer {
      private data: Record<string, string> = {};
      setData(type: string, value: string) {
        this.data[type] = value;
      }
      getData(type: string) {
        return this.data[type] || '';
      }
    }

    // Minimal ClipboardEvent polyfill for happy-dom
    testGlobal.DataTransfer = MockDataTransfer as unknown as typeof DataTransfer;
    testGlobal.ClipboardEvent = class extends Event {
      clipboardData?: DataTransfer;
      constructor(type: string, init?: ClipboardEventInit) {
        super(type, init);
        this.clipboardData = init?.clipboardData as DataTransfer | undefined;
      }
    } as typeof ClipboardEvent;
  });

  afterEach(() => {
    vi.useRealTimers();
    globalThis.ClipboardEvent = OriginalClipboardEvent;
    globalThis.DataTransfer = OriginalDataTransfer;
  });

  it('waitForElement resolves immediately if element exists', async () => {
    document.body.innerHTML = '<div id="target"></div>';
    const element = await waitForElement('#target', 1000);
    expect(element).not.toBeNull();
  });

  it('waitForElement resolves after element is added', async () => {
    const promise = waitForElement('#late', 1000);

    setTimeout(() => {
      const div = document.createElement('div');
      div.id = 'late';
      document.body.appendChild(div);
    }, 10);

    vi.advanceTimersByTime(20);
    const element = await promise;
    expect(element).not.toBeNull();
  });

  it('waitForElement rejects on timeout', async () => {
    const promise = waitForElement('#missing', 10);
    vi.advanceTimersByTime(20);
    await expect(promise).rejects.toThrow('not found');
  });

  it('simulateInput sets value and dispatches events', () => {
    const textarea = document.createElement('textarea');
    const onInput = vi.fn();
    const onChange = vi.fn();
    textarea.addEventListener('input', onInput);
    textarea.addEventListener('change', onChange);
    document.body.appendChild(textarea);

    simulateInput(textarea, 'hello');

    expect(textarea.value).toBe('hello');
    expect(onInput).toHaveBeenCalled();
    expect(onChange).toHaveBeenCalled();
  });

  it('simulateInput works with input element', () => {
    const input = document.createElement('input');
    const onInput = vi.fn();
    input.addEventListener('input', onInput);
    document.body.appendChild(input);

    simulateInput(input, 'hello');

    expect(input.value).toBe('hello');
    expect(onInput).toHaveBeenCalled();
  });

  it('simulateContentEditableInput sets text via fallback', () => {
    // Force fallback path
    document.execCommand = vi.fn(() => false) as unknown as typeof document.execCommand;

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const p = document.createElement('p');
    p.textContent = 'old';
    editable.appendChild(p);
    document.body.appendChild(editable);

    simulateContentEditableInput(editable, 'new value');
    vi.advanceTimersByTime(60);

    expect(p.textContent).toBe('new value');
  });

  it('simulatePasteInput dispatches paste event', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    const p = document.createElement('p');
    p.appendChild(document.createElement('br'));
    editable.appendChild(p);
    document.body.appendChild(editable);

    const onPaste = vi.fn();
    editable.addEventListener('paste', onPaste);

    simulatePasteInput(editable, 'pasted');
    vi.advanceTimersByTime(60);

    expect(onPaste).toHaveBeenCalled();
  });

  it('simulateContentEditableInput uses execCommand success path', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);

    document.execCommand = vi.fn((_command, _ui, value) => {
      editable.textContent = String(value);
      return true;
    }) as unknown as typeof document.execCommand;

    const onInput = vi.fn();
    editable.addEventListener('input', onInput);

    simulateContentEditableInput(editable, 'ok');
    vi.advanceTimersByTime(60);

    expect(editable.textContent).toBe('ok');
    expect(onInput).toHaveBeenCalled();
  });

  it('simulatePasteInput works without paragraph tag', () => {
    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    document.body.appendChild(editable);

    const onPaste = vi.fn();
    editable.addEventListener('paste', onPaste);

    simulatePasteInput(editable, 'plain');
    vi.advanceTimersByTime(60);

    expect(onPaste).toHaveBeenCalled();
  });
});
