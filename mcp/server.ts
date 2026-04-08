import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { BRIDGE_COMMAND_NAMES, type BridgeStateSnapshot } from '../src/bridge/protocol.js';
import { WorkflowExternalUpdateSchema } from '../src/substrate/api/index.js';
import { SITE_CAPABILITY_MATRIX } from '../src/utils/siteCapabilityMatrix.js';
import { MCP_ANALYSIS_PROVIDER_CATALOG } from './analysisCatalog.js';
import { PromptSwitchboardBridgeServer } from './bridgeServer.js';
import { MCP_MODEL_CATALOG } from './modelCatalog.js';
import { MCP_WORKFLOW_TEMPLATE_CATALOG } from './workflowCatalog.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
) as { version: string };
const builderSupportMatrix = JSON.parse(
  readFileSync(path.resolve(__dirname, './integration-kits/support-matrix.json'), 'utf8')
) as Record<string, unknown>;
const publicDistributionMatrix = JSON.parse(
  readFileSync(
    path.resolve(__dirname, './integration-kits/public-distribution-matrix.json'),
    'utf8'
  )
) as Record<string, unknown>;

const BridgeToolEnvelopeSchema = z.object({
  id: z.string(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string(),
      message: z.string(),
      details: z.unknown().optional(),
    })
    .optional(),
});

const BridgeStatusSchema = z.object({
  connected: z.boolean(),
  extensionId: z.string().nullable(),
  lastSeenAt: z.number().nullable(),
  port: z.number().int().positive(),
});

const asToolResult = (label: string, payload: Record<string, unknown>) => ({
  content: [
    {
      type: 'text' as const,
      text: `${label}\n\n${JSON.stringify(payload, null, 2)}`,
    },
  ],
  structuredContent: payload,
});

type RegisterableMcpServer = Pick<McpServer, 'registerResource' | 'registerTool'>;
type BridgeRuntime = Pick<
  PromptSwitchboardBridgeServer,
  'dispatchCommand' | 'getPort' | 'getState' | 'start' | 'close'
>;
type ServerLifecycleBridge = Pick<
  PromptSwitchboardBridgeServer,
  'getHost' | 'getPort' | 'start' | 'close'
>;
type ConnectableMcpServer = Pick<McpServer, 'connect'>;
type ServerRunOptions = {
  createTransport?: () => unknown;
  currentBridgeServer?: ServerLifecycleBridge;
  currentMcpServer?: ConnectableMcpServer;
  exit?: (code: number) => void;
  writeError?: (...args: unknown[]) => void;
};

export const registerPromptSwitchboardMcpSurface = (
  mcpServer: RegisterableMcpServer,
  bridgeServer: BridgeRuntime
) => {
  const requireState = (): BridgeStateSnapshot => bridgeServer.getState();

  const callBridge = async (
    label: string,
    command: Parameters<typeof bridgeServer.dispatchCommand>[0],
    args: Record<string, unknown>
  ) =>
    asToolResult(
      label,
      (await bridgeServer.dispatchCommand(command, args as never)) as unknown as Record<
        string,
        unknown
      >
    );

  mcpServer.registerResource(
    'prompt-switchboard-current-session',
    'prompt-switchboard://sessions/current',
    {
      title: 'Current Prompt Switchboard session',
      description: 'Latest cached snapshot of the current Prompt Switchboard session.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt-switchboard://sessions/current',
          mimeType: 'application/json',
          text: JSON.stringify(requireState().currentSession, null, 2),
        },
      ],
    })
  );

  mcpServer.registerResource(
    'prompt-switchboard-readiness',
    'prompt-switchboard://models/readiness',
    {
      title: 'Prompt Switchboard readiness snapshot',
      description: 'Latest cached per-model readiness snapshot from the extension bridge.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt-switchboard://models/readiness',
          mimeType: 'application/json',
          text: JSON.stringify(requireState().readiness, null, 2),
        },
      ],
    })
  );

  mcpServer.registerResource(
    'prompt-switchboard-model-catalog',
    'prompt-switchboard://models/catalog',
    {
      title: 'Prompt Switchboard model catalog',
      description: 'Supported model names, labels, hostnames, and open URLs.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt-switchboard://models/catalog',
          mimeType: 'application/json',
          text: JSON.stringify(MCP_MODEL_CATALOG, null, 2),
        },
      ],
    })
  );

  mcpServer.registerResource(
    'prompt-switchboard-analysis-providers',
    'prompt-switchboard://analysis/providers',
    {
      title: 'Prompt Switchboard analysis provider catalog',
      description:
        'Structured analysis-lane truth for browser-session and local Switchyard runtime execution surfaces.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt-switchboard://analysis/providers',
          mimeType: 'application/json',
          text: JSON.stringify(MCP_ANALYSIS_PROVIDER_CATALOG, null, 2),
        },
      ],
    })
  );

  mcpServer.registerResource(
    'prompt-switchboard-workflow-templates',
    'prompt-switchboard://workflows/templates',
    {
      title: 'Prompt Switchboard workflow template catalog',
      description:
        'Structured builder-facing catalog for the built-in Prompt Switchboard workflow templates and their durability boundaries.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt-switchboard://workflows/templates',
          mimeType: 'application/json',
          text: JSON.stringify(MCP_WORKFLOW_TEMPLATE_CATALOG, null, 2),
        },
      ],
    })
  );

  mcpServer.registerResource(
    'prompt-switchboard-builder-support-matrix',
    'prompt-switchboard://builder/support-matrix',
    {
      title: 'Prompt Switchboard builder support matrix',
      description:
        'Machine-readable truth for current supported, partial, public-bundle-ready, and planned Prompt Switchboard builder and consumer bindings.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt-switchboard://builder/support-matrix',
          mimeType: 'application/json',
          text: JSON.stringify(builderSupportMatrix, null, 2),
        },
      ],
    })
  );

  mcpServer.registerResource(
    'prompt-switchboard-public-distribution-matrix',
    'prompt-switchboard://builder/public-distribution',
    {
      title: 'Prompt Switchboard public distribution matrix',
      description:
        'Machine-readable truth for public builder bundles, official host surfaces, and current marketplace or registry claim boundaries.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt-switchboard://builder/public-distribution',
          mimeType: 'application/json',
          text: JSON.stringify(publicDistributionMatrix, null, 2),
        },
      ],
    })
  );

  mcpServer.registerResource(
    'prompt-switchboard-site-capabilities',
    'prompt-switchboard://sites/capabilities',
    {
      title: 'Prompt Switchboard site capability matrix',
      description:
        'Machine-readable per-site DOM, readiness, compare-path, and private-API-boundary notes for supported Prompt Switchboard sites.',
      mimeType: 'application/json',
    },
    async () => ({
      contents: [
        {
          uri: 'prompt-switchboard://sites/capabilities',
          mimeType: 'application/json',
          text: JSON.stringify(SITE_CAPABILITY_MATRIX, null, 2),
        },
      ],
    })
  );

  mcpServer.registerTool(
    'prompt_switchboard.check_readiness',
    {
      description: 'Check readiness for selected Prompt Switchboard model tabs.',
      inputSchema: {
        models: z.array(z.enum(['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok'])).optional(),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ models }) =>
      callBridge(
        'Prompt Switchboard readiness check result',
        BRIDGE_COMMAND_NAMES.CHECK_READINESS,
        { models }
      )
  );

  mcpServer.registerTool(
    'prompt_switchboard.open_model_tabs',
    {
      description: 'Open or reuse supported model tabs inside Prompt Switchboard.',
      inputSchema: {
        models: z.array(z.enum(['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok'])).optional(),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ models }) =>
      callBridge(
        'Prompt Switchboard opened the requested model tabs',
        BRIDGE_COMMAND_NAMES.OPEN_MODEL_TABS,
        { models }
      )
  );

  mcpServer.registerTool(
    'prompt_switchboard.compare',
    {
      description:
        'Run one Prompt Switchboard compare turn, persist it into session history, and fan the prompt out to ready model tabs.',
      inputSchema: {
        prompt: z.string().min(1),
        sessionId: z.string().optional(),
        models: z.array(z.enum(['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok'])).optional(),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ prompt, sessionId, models }) =>
      callBridge('Prompt Switchboard compare run queued', BRIDGE_COMMAND_NAMES.COMPARE, {
        prompt,
        sessionId,
        models,
      })
  );

  mcpServer.registerTool(
    'prompt_switchboard.retry_failed',
    {
      description:
        'Retry failed models from an existing Prompt Switchboard compare turn without replaying successful ones.',
      inputSchema: {
        turnId: z.string().min(1),
        sessionId: z.string().optional(),
        models: z.array(z.enum(['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok'])).optional(),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ turnId, sessionId, models }) =>
      callBridge('Prompt Switchboard retry run queued', BRIDGE_COMMAND_NAMES.RETRY_FAILED, {
        turnId,
        sessionId,
        models,
      })
  );

  mcpServer.registerTool(
    'prompt_switchboard.get_session',
    {
      description:
        'Fetch a persisted Prompt Switchboard session snapshot, including compare turns and current model statuses.',
      inputSchema: {
        sessionId: z.string().optional(),
        includeMessages: z.boolean().optional(),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ sessionId, includeMessages }) =>
      callBridge('Prompt Switchboard session snapshot', BRIDGE_COMMAND_NAMES.GET_SESSION, {
        sessionId,
        includeMessages,
      })
  );

  mcpServer.registerTool(
    'prompt_switchboard.list_sessions',
    {
      description: 'List recent Prompt Switchboard sessions from local extension storage.',
      inputSchema: {
        limit: z.number().int().positive().max(50).optional(),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ limit }) =>
      callBridge('Prompt Switchboard session list', BRIDGE_COMMAND_NAMES.LIST_SESSIONS, {
        limit,
      })
  );

  mcpServer.registerTool(
    'prompt_switchboard.export_compare',
    {
      description: 'Export one compare turn as Markdown or as a compact local-first share summary.',
      inputSchema: {
        turnId: z.string().optional(),
        sessionId: z.string().optional(),
        format: z.enum(['markdown', 'summary']).default('markdown'),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ turnId, sessionId, format }) =>
      callBridge('Prompt Switchboard compare export', BRIDGE_COMMAND_NAMES.EXPORT_COMPARE, {
        turnId,
        sessionId,
        format,
      })
  );

  mcpServer.registerTool(
    'prompt_switchboard.analyze_compare',
    {
      description:
        'Run the current AI Compare Analyst lane for the latest or requested compare turn.',
      inputSchema: {
        turnId: z.string().optional(),
        sessionId: z.string().optional(),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ turnId, sessionId }) =>
      callBridge('Prompt Switchboard AI compare analysis', BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE, {
        turnId,
        sessionId,
      })
  );

  mcpServer.registerTool(
    'prompt_switchboard.run_workflow',
    {
      description:
        'Start the built-in linear Prompt Switchboard workflow template (`compare-analyze-follow-up`) inside the governed local substrate.',
      inputSchema: {
        workflowId: z.string().min(1),
        sessionId: z.string().optional(),
        turnId: z.string().optional(),
        input: z.record(z.string(), z.unknown()).optional(),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ workflowId, sessionId, turnId, input }) =>
      callBridge('Prompt Switchboard workflow run result', BRIDGE_COMMAND_NAMES.RUN_WORKFLOW, {
        workflowId,
        sessionId,
        turnId,
        input,
      })
  );

  mcpServer.registerTool(
    'prompt_switchboard.list_workflow_runs',
    {
      description:
        'List recent session-scoped Prompt Switchboard workflow snapshots for builder-side recovery or inspection.',
      inputSchema: {
        limit: z.number().int().positive().max(50).optional(),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ limit }) =>
      callBridge('Prompt Switchboard workflow run list', BRIDGE_COMMAND_NAMES.LIST_WORKFLOW_RUNS, {
        limit,
      })
  );

  mcpServer.registerTool(
    'prompt_switchboard.get_workflow_run',
    {
      description:
        'Fetch the latest session-scoped snapshot for one Prompt Switchboard workflow run.',
      inputSchema: {
        runId: z.string().min(1),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ runId }) =>
      callBridge(
        'Prompt Switchboard workflow run snapshot',
        BRIDGE_COMMAND_NAMES.GET_WORKFLOW_RUN,
        { runId }
      )
  );

  mcpServer.registerTool(
    'prompt_switchboard.resume_workflow',
    {
      description:
        'Resume one session-scoped Prompt Switchboard workflow run after supplying the external step result it was waiting for.',
      inputSchema: {
        runId: z.string().min(1),
        externalUpdate: WorkflowExternalUpdateSchema.optional(),
      },
      outputSchema: BridgeToolEnvelopeSchema,
    },
    async ({ runId, externalUpdate }) =>
      callBridge(
        'Prompt Switchboard workflow resume result',
        BRIDGE_COMMAND_NAMES.RESUME_WORKFLOW,
        {
          runId,
          externalUpdate,
        }
      )
  );

  mcpServer.registerTool(
    'prompt_switchboard.bridge_status',
    {
      description:
        'Report whether the local Prompt Switchboard extension bridge is connected to this MCP sidecar.',
      inputSchema: {},
      outputSchema: BridgeStatusSchema,
    },
    async () =>
      asToolResult('Prompt Switchboard bridge status', {
        connected: Boolean(requireState().extensionId),
        extensionId: requireState().extensionId ?? null,
        lastSeenAt: requireState().lastSeenAt ?? null,
        port: bridgeServer.getPort(),
      })
  );
};

export const createPromptSwitchboardMcpRuntime = () => {
  const bridgeServer = new PromptSwitchboardBridgeServer();
  const mcpServer = new McpServer({
    name: 'prompt-switchboard',
    version: packageJson.version,
  });

  registerPromptSwitchboardMcpSurface(mcpServer, bridgeServer);

  return {
    bridgeServer,
    mcpServer,
  };
};

const resolveServerRuntime = (options: ServerRunOptions = {}) => {
  if (options.currentBridgeServer && options.currentMcpServer) {
    return {
      bridgeServer: options.currentBridgeServer,
      mcpServer: options.currentMcpServer,
    };
  }

  return createPromptSwitchboardMcpRuntime();
};

export async function runServerMain(options: ServerRunOptions = {}) {
  const { bridgeServer, mcpServer } = resolveServerRuntime(options);
  const writeError = options.writeError ?? ((...args: unknown[]) => console.error(...args));
  const createTransport = options.createTransport ?? (() => new StdioServerTransport());

  try {
    await bridgeServer.start();
    const transport = createTransport();
    await mcpServer.connect(transport as never);
    writeError(
      `Prompt Switchboard MCP sidecar listening on stdio with loopback bridge http://${bridgeServer.getHost()}:${bridgeServer.getPort()}`
    );
  } catch (error) {
    await bridgeServer.close().catch(() => undefined);
    throw error;
  }
}

export async function runServerCli(options: ServerRunOptions = {}) {
  const writeError = options.writeError ?? ((...args: unknown[]) => console.error(...args));

  try {
    await runServerMain(options);
  } catch (error) {
    writeError('Prompt Switchboard MCP server failed to start:', error);
    (options.exit ?? process.exit)(1);
  }
}

export async function main() {
  await runServerCli();
}

const isMainModule =
  process.argv[1] !== undefined &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isMainModule) {
  await main();
}
