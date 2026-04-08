import path from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  createBridgeBaseUrl,
  resolveBridgeHost,
  resolveBridgePort,
} from '../src/bridge/protocol.js';

type BridgeHealth = {
  reachable: boolean;
  statusCode: number | null;
  connected: boolean;
  extensionId: string | null;
  lastSeenAt: number | null;
  nextAction: string;
  error?: string;
};

type DoctorContext = {
  bridgeBaseUrl: string;
};

type DoctorRunOptions = {
  bridgeBaseUrl?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
  stdout?: Pick<NodeJS.WriteStream, 'write'>;
};

export const resolveDoctorContext = (env: NodeJS.ProcessEnv = process.env): DoctorContext => {
  const configuredHost = resolveBridgeHost(env);
  const configuredPort = resolveBridgePort(env);
  return {
    bridgeBaseUrl: createBridgeBaseUrl(configuredHost, configuredPort),
  };
};

export const probeBridgeHealth = async ({
  bridgeBaseUrl,
  env = process.env,
  fetchImpl = fetch,
}: {
  bridgeBaseUrl?: string;
  env?: NodeJS.ProcessEnv;
  fetchImpl?: typeof fetch;
} = {}): Promise<BridgeHealth> => {
  const resolvedBridgeBaseUrl = bridgeBaseUrl ?? resolveDoctorContext(env).bridgeBaseUrl;

  try {
    const response = await fetchImpl(`${resolvedBridgeBaseUrl}/health`);
    if (!response.ok) {
      return {
        reachable: false,
        statusCode: response.status,
        connected: false,
        extensionId: null,
        lastSeenAt: null,
        nextAction: 'Start npm run mcp:server, then reload the unpacked extension runtime.',
      };
    }

    const payload = (await response.json()) as {
      ok?: boolean;
      connected?: boolean;
      extensionId?: string | null;
      lastSeenAt?: number | null;
    };

    return {
      reachable: true,
      statusCode: response.status,
      connected: Boolean(payload.connected),
      extensionId: payload.extensionId ?? null,
      lastSeenAt: payload.lastSeenAt ?? null,
      nextAction: payload.connected
        ? 'Bridge is live. Open the side panel or call the MCP tools from a client.'
        : 'Bridge is running, but the extension has not bootstrapped yet. Open or reload the unpacked extension in Chromium.',
    };
  } catch (error) {
    return {
      reachable: false,
      statusCode: null,
      connected: false,
      extensionId: null,
      lastSeenAt: null,
      nextAction:
        'Bridge is not reachable yet. Start npm run mcp:server before expecting the extension runtime to attach.',
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

export const createDoctorMessage = (bridgeBaseUrl: string, health: BridgeHealth) => ({
  operatorHelperScript:
    'npm run mcp:operator -- <doctor|status|server|smoke|live-probe|live-diagnose|live-support-bundle|switchyard-runtime-probe|bridge-status|support-matrix|readiness|workflow-run|workflow-resume|workflow-list|workflow-get>',
  mcpServerScript: 'npm run mcp:server',
  bridgeBaseUrl,
  bridgeHealth: health,
  operatorSurface: {
    executableCommands: [
      'npm run mcp:operator -- doctor',
      'npm run mcp:operator -- server',
      'npm run mcp:operator -- smoke',
    ],
    governedToolTemplates: [
      'npm run mcp:operator -- bridge-status',
      'npm run mcp:operator -- support-matrix',
      'npm run mcp:operator -- readiness --models ChatGPT,Gemini',
      'npm run mcp:operator -- workflow-run --session-id <session> --turn-id <turn> --prompt "..." --models ChatGPT,Gemini',
      `npm run mcp:operator -- workflow-resume --run-id <run-id> --external-update-json '{"stepId":"compare","status":"completed","output":{...}}'`,
      'npm run mcp:operator -- workflow-list',
      'npm run mcp:operator -- workflow-get --run-id <run-id>',
      'npm run mcp:operator -- live-support-bundle',
    ],
    note: 'The local operator helper stays inside the governed MCP surface. It does not add a second public CLI protocol or HTTP API.',
  },
  nativeMessaging: {
    shippedInCurrentRelease: false,
    reason:
      'The current runtime ships the loopback bridge so repo-side verification stays runnable without host registration or OS-level install steps.',
    scaffoldDocs: 'mcp/native-messaging/README.md',
    scaffoldHelper: 'scripts/mcp/native-messaging-manifest.mjs',
  },
  extensionRequirement:
    'Load Prompt Switchboard in Chromium with the unpacked extension enabled so the background bridge client can connect.',
  currentModel:
    'The MCP server uses stdio for external agents and a localhost loopback HTTP bridge for the extension runtime.',
  workflowTruth:
    'Workflow run snapshots are session-scoped runtime cache. They are useful for current-session inspection, not a durable cold-start ledger.',
  startupOrder: [
    'npm run mcp:operator -- server',
    'load or reload the unpacked Prompt Switchboard extension in Chromium',
    'open the side panel or settings page so the background bridge client can bootstrap',
  ],
});

export const runDoctor = async ({
  bridgeBaseUrl,
  env = process.env,
  fetchImpl = fetch,
  stdout = process.stdout,
}: DoctorRunOptions = {}) => {
  const resolvedBridgeBaseUrl = bridgeBaseUrl ?? resolveDoctorContext(env).bridgeBaseUrl;
  const health = await probeBridgeHealth({
    bridgeBaseUrl: resolvedBridgeBaseUrl,
    env,
    fetchImpl,
  });
  stdout.write(`${JSON.stringify(createDoctorMessage(resolvedBridgeBaseUrl, health), null, 2)}\n`);
};

export const main = async () => {
  await runDoctor();
};

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  await main();
}
