import { Buffer } from 'node:buffer';
import WebSocket from 'ws';

interface DevtoolsPageTarget {
  id?: string;
  targetId?: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl?: string;
}

interface RuntimeEvaluateResult<T> {
  result: {
    description?: string;
    type?: string;
    value?: T;
  };
  exceptionDetails?: {
    text?: string;
    exception?: {
      description?: string;
    };
  };
}

const buildJsonListUrl = (cdpUrl: string) => new URL('/json/list', cdpUrl).toString();
const buildJsonVersionUrl = (cdpUrl: string) => new URL('/json/version', cdpUrl).toString();

const isExtensionSurfaceTarget = (target: DevtoolsPageTarget, extensionId: string) =>
  target.type === 'page' &&
  target.url.startsWith(`chrome-extension://${extensionId}/`) &&
  typeof target.webSocketDebuggerUrl === 'string' &&
  target.webSocketDebuggerUrl.length > 0;

export const listDevtoolsTargets = async (cdpUrl: string): Promise<DevtoolsPageTarget[]> => {
  const response = await fetch(buildJsonListUrl(cdpUrl));
  if (!response.ok) {
    throw new Error(
      `Prompt Switchboard could not read DevTools targets from ${buildJsonListUrl(cdpUrl)} (${response.status}).`
    );
  }

  return (await response.json()) as DevtoolsPageTarget[];
};

export const findExistingExtensionPageTarget = async (cdpUrl: string, extensionId: string) => {
  const targets = await listDevtoolsTargets(cdpUrl);
  return targets.find((target) => isExtensionSurfaceTarget(target, extensionId)) ?? null;
};

const findExistingExtensionPageTargets = async (cdpUrl: string, extensionId: string) => {
  const targets = await listDevtoolsTargets(cdpUrl);
  return targets.filter((target) => isExtensionSurfaceTarget(target, extensionId));
};

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Prompt Switchboard could not read DevTools metadata from ${url} (${response.status}).`);
  }
  return (await response.json()) as T;
};

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const createBrowserTarget = async (browserWsUrl: string, url: string) => {
  const ws = new WebSocket(browserWsUrl);
  await new Promise<void>((resolve, reject) => {
    ws.once('open', () => resolve());
    ws.once('error', (error) => reject(error));
  });

  try {
    await new Promise<void>((resolve, reject) => {
      ws.once('message', (payload) => {
        try {
          const message = JSON.parse(payload.toString()) as {
            error?: { message?: string };
          };
          if (message.error) {
            reject(new Error(message.error.message || 'Target.createTarget failed.'));
            return;
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      });
      ws.send(
        JSON.stringify({
          id: 1,
          method: 'Target.createTarget',
          params: { url },
        }),
        (error) => {
          if (error) {
            reject(error);
          }
        }
      );
    });
  } finally {
    if (ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  }
};

const ensureExtensionPageTarget = async (cdpUrl: string, extensionId: string) => {
  const versionPayload = await fetchJson<{ webSocketDebuggerUrl?: string }>(buildJsonVersionUrl(cdpUrl));
  const browserWsUrl = versionPayload.webSocketDebuggerUrl;
  if (!browserWsUrl) {
    return;
  }

  const targetUrl = `chrome-extension://${extensionId}/index.html`;
  await createBrowserTarget(browserWsUrl, targetUrl);

  for (let attempt = 0; attempt < 20; attempt += 1) {
    const targets = await findExistingExtensionPageTargets(cdpUrl, extensionId);
    if (targets.length > 0) {
      return;
    }
    await wait(200);
  }
};

type PendingCommand = {
  reject: (error: Error) => void;
  resolve: (value: unknown) => void;
};

export class ExistingExtensionTargetClient {
  private readonly ws: WebSocket;
  private nextId = 0;
  private readonly pending = new Map<number, PendingCommand>();

  private constructor(ws: WebSocket) {
    this.ws = ws;
    this.ws.on('message', (payload) => {
      const message = JSON.parse(payload.toString()) as {
        error?: { message?: string };
        id?: number;
        result?: unknown;
      };
      if (typeof message.id !== 'number') {
        return;
      }

      const command = this.pending.get(message.id);
      if (!command) {
        return;
      }
      this.pending.delete(message.id);

      if (message.error) {
        command.reject(new Error(message.error.message || 'Unknown DevTools protocol error.'));
        return;
      }

      command.resolve(message.result);
    });

    const rejectPending = (error: Error) => {
      for (const [, command] of this.pending) {
        command.reject(error);
      }
      this.pending.clear();
    };

    this.ws.on('close', () => {
      rejectPending(new Error('Prompt Switchboard extension target connection closed.'));
    });
    this.ws.on('error', (error) => {
      rejectPending(error instanceof Error ? error : new Error(String(error)));
    });
  }

  static async connect(cdpUrl: string, extensionId: string) {
    let targets = await findExistingExtensionPageTargets(cdpUrl, extensionId);
    if (targets.length === 0) {
      await ensureExtensionPageTarget(cdpUrl, extensionId).catch(() => undefined);
      targets = await findExistingExtensionPageTargets(cdpUrl, extensionId);
      if (targets.length === 0) {
        throw new Error(
          `Prompt Switchboard could not find an existing extension page target for chrome-extension://${extensionId}/ on ${cdpUrl}.`
        );
      }
    }

    const rejectedTargets: Array<{
      targetId?: string;
      href?: string;
      storageType?: string;
      localType?: string;
      hasCompareEmptyState?: boolean;
    }> = [];
    let bestClient: ExistingExtensionTargetClient | null = null;
    let bestScore = Number.NEGATIVE_INFINITY;

    for (const target of targets) {
      if (!target.webSocketDebuggerUrl) {
        continue;
      }

      const ws = new WebSocket(target.webSocketDebuggerUrl);
      await new Promise<void>((resolve, reject) => {
        ws.once('open', () => resolve());
        ws.once('error', (error) => reject(error));
      });
      const client = new ExistingExtensionTargetClient(ws);

      try {
        const snapshot = await client.evaluate<{
          href?: string;
          storageType?: string;
          localType?: string;
          hasCompareEmptyState?: boolean;
        }>(
          `({
            href: location.href,
            storageType: typeof chrome?.storage,
            localType: typeof chrome?.storage?.local,
            hasCompareEmptyState: Boolean(document.querySelector('[data-testid="compare-empty-state"]'))
          })`
        );
        if (
          snapshot.href?.startsWith(`chrome-extension://${extensionId}/`) &&
          snapshot.localType === 'object'
        ) {
          const score =
            (snapshot.hasCompareEmptyState ? 10 : 0) +
            (snapshot.href?.endsWith('/index.html') ? 5 : 0) +
            (snapshot.href?.endsWith('/settings.html') ? 1 : 0);
          if (score > bestScore) {
            await bestClient?.close().catch(() => undefined);
            bestClient = client;
            bestScore = score;
            continue;
          }
          await client.close();
          continue;
        }
        rejectedTargets.push({
          targetId: target.targetId || target.id,
          href: snapshot.href,
          storageType: snapshot.storageType,
          localType: snapshot.localType,
          hasCompareEmptyState: snapshot.hasCompareEmptyState,
        });
      } catch {
        // Try the next candidate target.
      }

      await client.close();
    }

    if (bestClient) {
      return bestClient;
    }

    throw new Error(
      `Prompt Switchboard found extension page targets on ${cdpUrl}, but none exposed a real extension runtime context. This usually means Chrome replaced direct extension-tab navigation with a blocked chrome-error page instead of a live side-panel/options surface. Rejected targets: ${JSON.stringify(
        rejectedTargets
      )}`
    );
  }

  async close() {
    if (this.ws.readyState === WebSocket.CLOSED || this.ws.readyState === WebSocket.CLOSING) {
      return;
    }

    await new Promise<void>((resolve) => {
      this.ws.once('close', () => resolve());
      this.ws.close();
    });
  }

  async send<T>(method: string, params: Record<string, unknown> = {}) {
    const id = ++this.nextId;

    const result = await new Promise<T>((resolve, reject) => {
      this.pending.set(id, { resolve: (value) => resolve(value as T), reject });
      this.ws.send(JSON.stringify({ id, method, params }), (error) => {
        if (!error) {
          return;
        }
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      });
    });

    return result;
  }

  async evaluate<T>(expression: string) {
    const runtimeResult = await this.send<RuntimeEvaluateResult<T>>('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });

    if (runtimeResult.exceptionDetails) {
      throw new Error(
        runtimeResult.exceptionDetails.exception?.description ||
          runtimeResult.exceptionDetails.text ||
          runtimeResult.result.description ||
          'Prompt Switchboard extension target evaluation failed.'
      );
    }

    return runtimeResult.result.value as T;
  }

  async reload() {
    await this.send('Page.enable');
    await this.send('Page.reload');
  }

  async captureScreenshotPng() {
    await this.send('Page.enable');
    const result = await this.send<{ data: string }>('Page.captureScreenshot', {
      format: 'png',
    });
    return Buffer.from(result.data, 'base64');
  }

  async waitForValue<T>(
    expression: string,
    predicate: (value: T) => boolean,
    timeoutMs = 15_000,
    intervalMs = 250
  ) {
    const startedAt = Date.now();

    while (Date.now() - startedAt < timeoutMs) {
      const value = await this.evaluate<T>(expression);
      if (predicate(value)) {
        return value;
      }

      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new Error(`Prompt Switchboard timed out waiting for extension target condition: ${expression}`);
  }
}

export const withExistingExtensionTarget = async <T>(
  cdpUrl: string,
  extensionId: string,
  fn: (client: ExistingExtensionTargetClient) => Promise<T>
) => {
  const client = await ExistingExtensionTargetClient.connect(cdpUrl, extensionId);
  try {
    return await fn(client);
  } finally {
    await client.close();
  }
};
