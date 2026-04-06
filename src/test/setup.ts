import '@testing-library/jest-dom/vitest';
import { vi } from 'vitest';

if (!globalThis.crypto?.randomUUID) {
  Object.defineProperty(globalThis, 'crypto', {
    configurable: true,
    value: {
      ...(globalThis.crypto || {}),
      randomUUID: () => 'test-uuid',
    },
  });
}

if (!globalThis.ResizeObserver) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

const happyDomSettings = (
  globalThis as typeof globalThis & {
    happyDOM?: {
      settings?: {
        fetch?: {
          interceptor?: unknown;
        };
      };
    };
  }
).happyDOM?.settings;

if (happyDomSettings?.fetch) {
  const shouldBypassLocalhost3000 = (url: string) =>
    url.startsWith('http://localhost:3000/') ||
    url.startsWith('http://127.0.0.1:3000/') ||
    url.startsWith('http://[::1]:3000/');

  happyDomSettings.fetch.interceptor = {
    async beforeAsyncRequest(context: {
      request: { url: string };
      window: {
        Response: typeof Response;
      };
    }) {
      if (!shouldBypassLocalhost3000(context.request.url)) {
        return;
      }

      return new context.window.Response('', {
        status: 204,
      });
    },
    beforeSyncRequest(context: {
      request: { url: string };
      window: {
        Headers: typeof Headers;
      };
    }) {
      if (!shouldBypassLocalhost3000(context.request.url)) {
        return;
      }

      return {
        status: 204,
        statusText: 'No Content',
        ok: true,
        url: context.request.url,
        redirected: false,
        headers: new context.window.Headers(),
        body: null,
      };
    },
  };
}

// Mock Chrome API
Object.defineProperty(globalThis, 'fetch', {
  configurable: true,
  writable: true,
  value: vi.fn(),
});

const chromeMock = {
  runtime: {
    sendMessage: vi.fn(),
    onMessage: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  storage: {
    local: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
    onChanged: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
    session: {
      get: vi.fn(),
      set: vi.fn(),
      remove: vi.fn(),
      clear: vi.fn(),
    },
  },
  tabs: {
    query: vi.fn(),
    sendMessage: vi.fn(),
    create: vi.fn(),
    get: vi.fn(),
    onUpdated: {
      addListener: vi.fn(),
      removeListener: vi.fn(),
    },
  },
  sidePanel: {
    setPanelBehavior: vi.fn(),
  },
} as unknown as typeof chrome;

Object.defineProperty(globalThis, 'chrome', {
  configurable: true,
  writable: true,
  value: chromeMock,
});
