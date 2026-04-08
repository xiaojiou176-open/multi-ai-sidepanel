import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import {
  BRIDGE_HEADER_EXTENSION_ID,
  BRIDGE_HEADER_KEY,
  BridgeBootstrapRequestSchema,
  BridgeCommandEnvelopeSchema,
  BridgeCommandResultSchema,
  PROMPT_SWITCHBOARD_BRIDGE_VERSION,
  resolveBridgeHost,
  resolveBridgePort,
} from '../src/bridge/protocol.js';
import type {
  BridgeCommandArgsMap,
  BridgeCommandEnvelope,
  BridgeCommandName,
  BridgeCommandResult,
  BridgeStateSnapshot,
} from '../src/bridge/protocol.js';

type PendingCommand = {
  envelope: BridgeCommandEnvelope;
  resolve: (result: BridgeCommandResult) => void;
  reject: (error: Error) => void;
  timeoutId: ReturnType<typeof setTimeout>;
};

const readJsonBody = async (request: IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {};
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
};

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.statusCode = statusCode;
  response.setHeader('content-type', 'application/json; charset=utf-8');
  response.end(JSON.stringify(payload));
};

const sendEmpty = (response: ServerResponse, statusCode = 204) => {
  response.statusCode = statusCode;
  response.end();
};

export class PromptSwitchboardBridgeServer {
  private readonly host: string;
  private readonly port: number;
  private readonly pendingCommands = new Map<string, PendingCommand>();
  private readonly queuedCommands: BridgeCommandEnvelope[] = [];
  private readonly pullWaiters: Array<(command: BridgeCommandEnvelope | null) => void> = [];
  private server = createServer(this.handleRequest.bind(this));
  private bridgeKey: string | null = null;
  private extensionId: string | null = null;
  private latestState: BridgeStateSnapshot = {
    currentSessionId: null,
    currentSession: null,
    sessions: [],
    readiness: {},
  };

  constructor(port = resolveBridgePort(process.env), host = resolveBridgeHost(process.env)) {
    this.host = host;
    this.port = port;
  }

  async start() {
    await new Promise<void>((resolve, reject) => {
      this.server.once('error', reject);
      this.server.listen(this.port, this.host, () => {
        this.server.off('error', reject);
        resolve();
      });
    });
  }

  async close() {
    for (const pending of this.pendingCommands.values()) {
      clearTimeout(pending.timeoutId);
      pending.reject(new Error('bridge_server_closed'));
    }
    this.pendingCommands.clear();

    await new Promise<void>((resolve, reject) => {
      this.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });
  }

  getState() {
    return this.latestState;
  }

  getPort() {
    return this.port;
  }

  getHost() {
    return this.host;
  }

  async dispatchCommand<TCommand extends BridgeCommandName>(
    command: TCommand,
    args: BridgeCommandArgsMap[TCommand],
    timeoutMs = 45_000
  ): Promise<BridgeCommandResult> {
    if (!this.bridgeKey || !this.extensionId) {
      throw new Error(
        'Prompt Switchboard bridge is not connected yet. Open the extension so it can bootstrap the local bridge.'
      );
    }

    const envelope = BridgeCommandEnvelopeSchema.parse({
      id: randomUUID(),
      command,
      args,
    });

    return new Promise<BridgeCommandResult>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        this.pendingCommands.delete(envelope.id);
        reject(new Error(`bridge_command_timeout:${envelope.command}`));
      }, timeoutMs);

      this.pendingCommands.set(envelope.id, {
        envelope,
        resolve,
        reject,
        timeoutId,
      });

      const waiter = this.pullWaiters.shift();
      if (waiter) {
        waiter(envelope);
        return;
      }

      this.queuedCommands.push(envelope);
    });
  }

  private async handleRequest(request: IncomingMessage, response: ServerResponse) {
    try {
      if (request.method === 'POST' && request.url === '/v1/bridge/bootstrap') {
        const parsed = BridgeBootstrapRequestSchema.parse(await readJsonBody(request));
        if (!this.extensionId) {
          this.extensionId = parsed.extensionId;
          this.bridgeKey = randomUUID();
        }

        if (parsed.extensionId !== this.extensionId || !this.bridgeKey) {
          sendJson(response, 403, {
            ok: false,
            error: 'bridge_extension_id_mismatch',
          });
          return;
        }

        this.latestState = {
          ...this.latestState,
          extensionId: this.extensionId,
          lastSeenAt: Date.now(),
        };

        sendJson(response, 200, {
          ok: true,
          bridgeKey: this.bridgeKey,
          pollIntervalMs: 30_000,
          bridgeVersion: PROMPT_SWITCHBOARD_BRIDGE_VERSION,
        });
        return;
      }

      if (request.method === 'GET' && request.url === '/health') {
        sendJson(response, 200, {
          ok: true,
          connected: Boolean(this.bridgeKey && this.extensionId),
          extensionId: this.extensionId,
          lastSeenAt: this.latestState.lastSeenAt ?? null,
        });
        return;
      }

      if (!this.isAuthorized(request)) {
        sendJson(response, 401, {
          ok: false,
          error: 'bridge_unauthorized',
        });
        return;
      }

      this.latestState = {
        ...this.latestState,
        lastSeenAt: Date.now(),
      };

      if (request.method === 'GET' && request.url?.startsWith('/v1/bridge/pull')) {
        if (this.queuedCommands.length > 0) {
          sendJson(response, 200, this.queuedCommands.shift());
          return;
        }

        const waitMs = 25_000;
        const result = await new Promise<BridgeCommandEnvelope | null>((resolve) => {
          let wrappedResolve: (command: BridgeCommandEnvelope | null) => void = () => undefined;
          const timeoutId = setTimeout(() => {
            const index = this.pullWaiters.indexOf(wrappedResolve);
            if (index >= 0) {
              this.pullWaiters.splice(index, 1);
            }
            resolve(null);
          }, waitMs);

          wrappedResolve = (command: BridgeCommandEnvelope | null) => {
            clearTimeout(timeoutId);
            resolve(command);
          };

          this.pullWaiters.push(wrappedResolve);
        });

        if (!result) {
          sendEmpty(response, 204);
          return;
        }

        sendJson(response, 200, result);
        return;
      }

      if (request.method === 'POST' && request.url === '/v1/bridge/results') {
        const parsed = BridgeCommandResultSchema.parse(await readJsonBody(request));
        const pending = this.pendingCommands.get(parsed.id);
        if (!pending) {
          sendJson(response, 404, {
            ok: false,
            error: 'bridge_command_not_found',
          });
          return;
        }

        clearTimeout(pending.timeoutId);
        this.pendingCommands.delete(parsed.id);
        pending.resolve(parsed);
        sendJson(response, 200, { ok: true });
        return;
      }

      if (request.method === 'POST' && request.url === '/v1/bridge/state') {
        this.latestState = {
          ...this.latestState,
          ...((await readJsonBody(request)) as BridgeStateSnapshot),
          extensionId: this.extensionId ?? undefined,
          lastSeenAt: Date.now(),
        };
        sendJson(response, 200, { ok: true });
        return;
      }

      sendJson(response, 404, { ok: false, error: 'bridge_route_not_found' });
    } catch (error) {
      sendJson(response, 500, {
        ok: false,
        error: error instanceof Error ? error.message : 'bridge_internal_error',
      });
    }
  }

  private isAuthorized(request: IncomingMessage) {
    const extensionId = request.headers[BRIDGE_HEADER_EXTENSION_ID] as string | undefined;
    const bridgeKey = request.headers[BRIDGE_HEADER_KEY] as string | undefined;

    return Boolean(
      this.extensionId &&
      this.bridgeKey &&
      extensionId === this.extensionId &&
      bridgeKey === this.bridgeKey
    );
  }
}
