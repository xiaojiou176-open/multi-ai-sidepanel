import { describe, it, expect, vi, beforeEach } from 'vitest';
import { initMockChrome } from './mockChrome';

const testGlobal = globalThis as typeof globalThis & { chrome?: typeof chrome };

describe('initMockChrome', () => {
  beforeEach(() => {
    Reflect.deleteProperty(testGlobal, 'chrome');
    localStorage.clear();
  });

  it('should initialize chrome mock when missing', () => {
    initMockChrome();

    expect(chrome.storage.local).toBeDefined();
    expect(chrome.runtime.sendMessage).toBeDefined();

    const listener = vi.fn();
    chrome.runtime.onMessage.addListener(listener);
    const onMessage = chrome.runtime.onMessage as unknown as {
      dispatch: (message: unknown) => void;
    };
    onMessage.dispatch({ type: 'PING' });
    expect(listener).toHaveBeenCalled();
  });

  it('should not override existing chrome storage', () => {
    testGlobal.chrome = {
      storage: {
        local: {
          get: vi.fn(),
        },
      },
    } as unknown as typeof chrome;

    const existing = chrome.storage.local;
    initMockChrome();

    expect(chrome.storage.local).toBe(existing);
  });

  it('supports local storage get/set/remove/clear', async () => {
    initMockChrome();

    await chrome.storage.local.set({ foo: 'bar', count: 1 });
    const result = await chrome.storage.local.get(['foo', 'count']);
    expect(result).toEqual({ foo: 'bar', count: 1 });

    await chrome.storage.local.remove('foo');
    const afterRemove = await chrome.storage.local.get('foo');
    expect(afterRemove).toEqual({});

    await chrome.storage.local.clear();
    const afterClear = await chrome.storage.local.get(null);
    expect(afterClear).toEqual({});
  });

  it('initializes when chrome exists but storage missing', () => {
    testGlobal.chrome = { runtime: {} } as unknown as typeof chrome;

    initMockChrome();

    expect(chrome.storage.local).toBeDefined();
    expect(chrome.storage.session).toBeDefined();
  });

  it('get supports null and array keys with prefix isolation', async () => {
    initMockChrome();

    await chrome.storage.local.set({ alpha: 'a', beta: 'b' });
    await chrome.storage.session.set({ alpha: 'session-a' });

    const allLocal = await chrome.storage.local.get(null);
    expect(allLocal).toEqual({ alpha: 'a', beta: 'b' });

    const partial = await chrome.storage.local.get(['alpha']);
    expect(partial).toEqual({ alpha: 'a' });

    const sessionOnly = await chrome.storage.session.get('alpha');
    expect(sessionOnly).toEqual({ alpha: 'session-a' });

    await chrome.storage.local.remove(['alpha', 'beta']);
    const afterRemove = await chrome.storage.local.get(null);
    expect(afterRemove).toEqual({});
  });
});
