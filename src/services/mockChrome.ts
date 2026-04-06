/**
 * Mock Chrome API for local development
 * This file should only be imported in development mode or when running outside an extension context
 */

import { Logger } from '../utils/logger';

// Define types for Chrome API mocks
interface MockStorageArea {
  get: (keys?: string | string[] | null) => Promise<{ [key: string]: unknown }>;
  set: (items: { [key: string]: unknown }) => Promise<void>;
  remove: (keys: string | string[]) => Promise<void>;
  clear: () => Promise<void>;
}

type MessageCallback = (
  message: unknown,
  sender: unknown,
  sendResponse: (response?: unknown) => void
) => void;

interface MockChromeShape {
  storage?: {
    local?: MockStorageArea;
    session?: MockStorageArea;
    sync?: MockStorageArea;
  };
  runtime?: {
    id?: string;
    getManifest?: () => { name: string; version: string };
    sendMessage?: (message: unknown) => Promise<{ response: string }>;
    onMessage?: {
      addListener: (callback: MessageCallback) => void;
      removeListener: (callback: MessageCallback) => void;
      dispatch?: (
        message: unknown,
        sender?: unknown,
        sendResponse?: (response?: unknown) => void
      ) => void;
    };
  };
}

// Helper to simulate async storage operations using localStorage
class LocalStorageMock implements MockStorageArea {
  private prefix: string;

  constructor(prefix: string) {
    this.prefix = prefix;
  }

  get(keys?: string | string[] | null): Promise<{ [key: string]: unknown }> {
    return new Promise((resolve) => {
      const result: { [key: string]: unknown } = {};

      if (keys === null || keys === undefined) {
        // Get all
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith(this.prefix)) {
            const cleanKey = key.slice(this.prefix.length);
            try {
              result[cleanKey] = JSON.parse(localStorage.getItem(key) || 'null');
            } catch {
              result[cleanKey] = localStorage.getItem(key);
            }
          }
        }
      } else if (typeof keys === 'string') {
        const value = localStorage.getItem(this.prefix + keys);
        if (value !== null) {
          try {
            result[keys] = JSON.parse(value);
          } catch {
            result[keys] = value;
          }
        }
      } else if (Array.isArray(keys)) {
        keys.forEach((key) => {
          const value = localStorage.getItem(this.prefix + key);
          if (value !== null) {
            try {
              result[key] = JSON.parse(value);
            } catch {
              result[key] = value;
            }
          }
        });
      }

      resolve(result);
    });
  }

  set(items: { [key: string]: unknown }): Promise<void> {
    return new Promise((resolve) => {
      Object.entries(items).forEach(([key, value]) => {
        localStorage.setItem(this.prefix + key, JSON.stringify(value));
      });
      resolve();
    });
  }

  remove(keys: string | string[]): Promise<void> {
    return new Promise((resolve) => {
      const keyList = Array.isArray(keys) ? keys : [keys];
      keyList.forEach((key) => {
        localStorage.removeItem(this.prefix + key);
      });
      resolve();
    });
  }

  clear(): Promise<void> {
    return new Promise((resolve) => {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith(this.prefix)) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach((key) => localStorage.removeItem(key));
      resolve();
    });
  }
}

// Initialize mocks if chrome is not defined
export const initMockChrome = () => {
  if (typeof chrome === 'undefined' || !chrome.storage) {
    Logger.info('mock_chrome_initialized', {
      surface: 'sidepanel',
      code: 'mock_chrome_initialized',
    });

    const globalWindow = window as Window & typeof globalThis & { chrome?: MockChromeShape };
    const globalChrome: MockChromeShape = globalWindow.chrome || {};

    // Mock Storage
    globalChrome.storage = {
      local: new LocalStorageMock('local_'),
      session: new LocalStorageMock('session_'),
      sync: new LocalStorageMock('sync_'),
    };

    // Mock Runtime
    const messageListeners: Set<MessageCallback> = new Set();

    globalChrome.runtime = {
      id: 'mock-extension-id',
      getManifest: () => ({ name: 'Mock Extension', version: '1.0.0' }),
      sendMessage: (message: unknown) => {
        Logger.debug('mock_chrome_send_message', {
          surface: 'sidepanel',
          code: 'mock_chrome_send_message',
          message,
        });
        return Promise.resolve({ response: 'mock response' });
      },
      onMessage: {
        addListener: (callback: MessageCallback) => {
          messageListeners.add(callback);
        },
        removeListener: (callback: MessageCallback) => {
          messageListeners.delete(callback);
        },
        // Helper to trigger listeners manually
        dispatch: (
          message: unknown,
          sender: unknown = {},
          sendResponse: (response?: unknown) => void = () => {}
        ) => {
          messageListeners.forEach((listener) => listener(message, sender, sendResponse));
        },
      },
    };

    globalWindow.chrome = globalChrome as unknown as typeof chrome;
  }
};
