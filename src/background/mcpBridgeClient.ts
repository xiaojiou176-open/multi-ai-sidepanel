import {
  BRIDGE_HEADER_EXTENSION_ID,
  BRIDGE_HEADER_KEY,
  BridgeBootstrapRequestSchema,
  BridgeBootstrapResponseSchema,
  BridgeCommandEnvelopeSchema,
  BridgeCommandResultSchema,
  createBridgeBaseUrl,
  PROMPT_SWITCHBOARD_BRIDGE_VERSION,
  type BridgeCommandEnvelope,
} from '../bridge/protocol';
import { Logger, toErrorMessage } from '../utils/logger';
import { captureBridgeStateSnapshot } from './productActions';

export interface BridgeCommandExecutor {
  (command: Omit<BridgeCommandEnvelope, 'id'>): Promise<unknown>;
}

interface StartBridgeClientOptions {
  executeCommand: BridgeCommandExecutor;
  baseUrl?: string;
}

let bridgeClientStarted = false;

export const startMcpBridgeClient = ({
  executeCommand,
  baseUrl = createBridgeBaseUrl(),
}: StartBridgeClientOptions) => {
  if (
    bridgeClientStarted ||
    typeof fetch !== 'function' ||
    typeof chrome === 'undefined' ||
    !chrome.runtime?.id ||
    typeof chrome.runtime.getManifest !== 'function'
  ) {
    return;
  }

  bridgeClientStarted = true;
  const bootstrapUrl = `${baseUrl}/v1/bridge/bootstrap`;
  const pullUrl = `${baseUrl}/v1/bridge/pull`;
  const resultsUrl = `${baseUrl}/v1/bridge/results`;
  const stateUrl = `${baseUrl}/v1/bridge/state`;
  const clientId = chrome.runtime.id;
  const extensionVersion = chrome.runtime.getManifest().version;

  let bridgeKey = '';
  let bootstrapped = false;

  const scheduleNextPoll = (delayMs: number) => {
    setTimeout(() => {
      void poll();
    }, delayMs);
  };

  const postState = async () => {
    try {
      await fetch(stateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [BRIDGE_HEADER_EXTENSION_ID]: clientId,
          [BRIDGE_HEADER_KEY]: bridgeKey,
        },
        body: JSON.stringify({
          ...(await captureBridgeStateSnapshot()),
          bridgeVersion: PROMPT_SWITCHBOARD_BRIDGE_VERSION,
        }),
      });
    } catch {
      // ignore state sync failures; next poll will retry
    }
  };

  const bootstrap = async () => {
    const response = await fetch(bootstrapUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        BridgeBootstrapRequestSchema.parse({
          extensionId: clientId,
          extensionVersion,
        })
      ),
    });

    if (!response.ok) {
      throw new Error(`bridge_bootstrap_failed:${response.status}`);
    }

    const payload = BridgeBootstrapResponseSchema.parse(await response.json());
    bridgeKey = payload.bridgeKey;
    bootstrapped = true;
    await postState();
  };

  const poll = async () => {
    try {
      if (!bridgeKey) {
        await bootstrap();
      }

      const response = await fetch(pullUrl, {
        method: 'GET',
        headers: {
          [BRIDGE_HEADER_EXTENSION_ID]: clientId,
          [BRIDGE_HEADER_KEY]: bridgeKey,
        },
      });

      if (response.status === 204) {
        await postState();
        scheduleNextPoll(1_000);
        return;
      }

      if (!response.ok) {
        scheduleNextPoll(2_500);
        return;
      }

      const payload = BridgeCommandEnvelopeSchema.parse(await response.json());

      try {
        const result = await executeCommand({
          command: payload.command,
          args: payload.args,
        });
        await fetch(resultsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [BRIDGE_HEADER_EXTENSION_ID]: clientId,
            [BRIDGE_HEADER_KEY]: bridgeKey,
          },
          body: JSON.stringify(
            BridgeCommandResultSchema.parse({
              id: payload.id,
              ok: true,
              result,
            })
          ),
        });
      } catch (error) {
        await fetch(resultsUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            [BRIDGE_HEADER_EXTENSION_ID]: clientId,
            [BRIDGE_HEADER_KEY]: bridgeKey,
          },
          body: JSON.stringify(
            BridgeCommandResultSchema.parse({
              id: payload.id,
              ok: false,
              error: {
                code: 'bridge_command_failed',
                message: toErrorMessage(error),
              },
            })
          ),
        });
      }

      await postState();
      scheduleNextPoll(0);
    } catch (error) {
      Logger.warn('background_mcp_bridge_poll_failed', {
        surface: 'background',
        code: 'background_mcp_bridge_poll_failed',
        error: toErrorMessage(error),
      });
      if (bootstrapped) {
        scheduleNextPoll(2_500);
      }
    }
  };

  void poll();
};
