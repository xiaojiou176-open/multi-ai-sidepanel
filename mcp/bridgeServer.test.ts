// @vitest-environment node

import { afterEach, describe, expect, it } from 'vitest';
import { request as httpRequest } from 'node:http';
import { createServer } from 'node:net';
import {
  BRIDGE_HEADER_EXTENSION_ID,
  BRIDGE_HEADER_KEY,
  type BridgeCommandResult,
  createBridgeBaseUrl,
} from '../src/bridge/protocol';
import { PromptSwitchboardBridgeServer } from './bridgeServer';

const httpJson = async (
  url: string,
  options: {
    method?: string;
    headers?: Record<string, string>;
    body?: unknown;
  } = {}
) =>
  new Promise<{ status: number; json: unknown }>((resolve, reject) => {
    const target = new URL(url);
    const payload =
      options.body === undefined ? null : Buffer.from(JSON.stringify(options.body), 'utf8');

    const request = httpRequest(
      {
        hostname: target.hostname,
        port: target.port,
        path: `${target.pathname}${target.search}`,
        method: options.method ?? 'GET',
        headers: {
          ...(options.headers ?? {}),
          ...(payload
            ? {
                'Content-Type': 'application/json',
                'Content-Length': String(payload.byteLength),
              }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            status: response.statusCode ?? 0,
            json: text ? JSON.parse(text) : {},
          });
        });
      }
    );

    request.on('error', reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });

const getFreePort = async () =>
  new Promise<number>((resolve, reject) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('bridge_test_port_unavailable'));
        return;
      }
      const port = address.port;
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(port);
      });
    });
  });

const activeServers: PromptSwitchboardBridgeServer[] = [];

afterEach(async () => {
  while (activeServers.length > 0) {
    const server = activeServers.pop();
    if (server) {
      await server.close();
    }
  }
});

describe('PromptSwitchboardBridgeServer', () => {
  it('serves unauthenticated health checks for doctor flows', async () => {
    const port = await getFreePort();
    const bridge = new PromptSwitchboardBridgeServer(port);
    activeServers.push(bridge);
    await bridge.start();

    const baseUrl = createBridgeBaseUrl('127.0.0.1', port);
    const healthResponse = await httpJson(`${baseUrl}/health`);

    expect(healthResponse.status).toBe(200);
    expect(healthResponse.json).toEqual({
      ok: true,
      connected: false,
      extensionId: null,
      lastSeenAt: null,
    });
  });

  it('completes bootstrap, pull, and result delivery', async () => {
    const port = await getFreePort();
    const bridge = new PromptSwitchboardBridgeServer(port);
    activeServers.push(bridge);
    await bridge.start();

    const baseUrl = createBridgeBaseUrl('127.0.0.1', port);
    const bootstrapResponse = await httpJson(`${baseUrl}/v1/bridge/bootstrap`, {
      method: 'POST',
      body: {
        extensionId: 'extension-test-id',
        extensionVersion: '0.2.2',
      },
    });
    expect(bootstrapResponse.status).toBe(200);
    const bootstrapPayload = bootstrapResponse.json as { bridgeKey: string };

    const pending = bridge.dispatchCommand('check_readiness', {
      models: ['ChatGPT'],
    });

    const pullResponse = await httpJson(`${baseUrl}/v1/bridge/pull`, {
      headers: {
        [BRIDGE_HEADER_EXTENSION_ID]: 'extension-test-id',
        [BRIDGE_HEADER_KEY]: bootstrapPayload.bridgeKey,
      },
    });
    expect(pullResponse.status).toBe(200);
    const envelope = pullResponse.json as { id: string; command: string };
    expect(envelope.command).toBe('check_readiness');

    const resultPayload: BridgeCommandResult = {
      id: envelope.id,
      ok: true,
      result: {
        reports: [{ model: 'ChatGPT', ready: true }],
      },
    };

    const resultResponse = await httpJson(`${baseUrl}/v1/bridge/results`, {
      method: 'POST',
      headers: {
        [BRIDGE_HEADER_EXTENSION_ID]: 'extension-test-id',
        [BRIDGE_HEADER_KEY]: bootstrapPayload.bridgeKey,
      },
      body: resultPayload,
    });
    expect(resultResponse.status).toBe(200);

    await expect(pending).resolves.toEqual(resultPayload);
  });
});
