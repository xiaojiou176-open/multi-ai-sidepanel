import { spawn } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  createBridgeBaseUrl,
  PROMPT_SWITCHBOARD_BRIDGE_HOST,
  PROMPT_SWITCHBOARD_BRIDGE_PORT,
} from '../src/bridge/protocol.js';
import { presentWorkflowRun, type WorkflowPresentableRun } from '../src/substrate/workflow/presentation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const packageJson = JSON.parse(
  readFileSync(path.resolve(repoRoot, 'package.json'), 'utf8')
) as { version: string };
const tsxCliPath = path.resolve(repoRoot, 'node_modules/tsx/dist/cli.mjs');
const serverEntrypoint = path.resolve(__dirname, 'server.ts');

export const OPERATOR_COMMANDS = [
  'doctor',
  'server',
  'smoke',
  'status',
  'live-probe',
  'live-diagnose',
  'live-support-bundle',
  'switchyard-runtime-probe',
  'bridge-status',
  'support-matrix',
  'readiness',
  'workflow-run',
  'workflow-resume',
  'workflow-list',
  'workflow-get',
] as const;

export type OperatorCommandName = (typeof OPERATOR_COMMANDS)[number];

export type OperatorOptions = {
  bridgePort?: number;
  externalUpdate?: Record<string, unknown>;
  models?: string[];
  prompt?: string;
  runId?: string;
  sessionId?: string;
  turnId?: string;
};

type OperatorTransport = 'child_process' | 'bridge_http' | 'mcp_stdio';

export type OperatorEnvelope =
  | {
      ok: true;
      localOnly: true;
      surface: 'repo_local_operator_helper';
      command: OperatorCommandName | 'help';
      transport: OperatorTransport | 'none';
      result: unknown;
      metadata: Record<string, unknown>;
    }
  | {
      ok: false;
      localOnly: true;
      surface: 'repo_local_operator_helper';
      command: OperatorCommandName | 'help';
      transport: OperatorTransport | 'none';
      error: {
        code: string;
        message: string;
        details?: unknown;
      };
      metadata: Record<string, unknown>;
    };

type ParsedArgv = {
  command: OperatorCommandName | 'help';
  options: OperatorOptions;
};

type JsonScriptResult = {
  stdout: string;
  stderr: string;
  exitCode: number;
};

const normalizeWorkflowRun = (value: unknown) => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  return presentWorkflowRun(value as WorkflowPresentableRun);
};

const normalizeWorkflowRunList = (value: unknown) => {
  if (!value || typeof value !== 'object' || !('runs' in value) || !Array.isArray(value.runs)) {
    return null;
  }

  return value.runs.map((run) => ({
    run,
    presentation: normalizeWorkflowRun(run),
  }));
};

const commandDescriptions: Record<OperatorCommandName, string> = {
  doctor: 'Wrap mcp/doctor.ts and report bridge health guidance.',
  server: 'Start the local MCP sidecar in the foreground.',
  smoke: 'Wrap mcp/smoke.ts and verify the local MCP/server handshake end-to-end.',
  status: 'Read the loopback bridge health endpoint without creating a new protocol.',
  'live-probe':
    'Run the maintainer-local supported-site probe against the active live browser/profile.',
  'live-diagnose':
    'Run the maintainer-local live diagnosis ladder and compress blockers into next actions.',
  'live-support-bundle':
    'Write a maintainer-local support bundle with screenshots, HTML, text, and diagnosis.',
  'switchyard-runtime-probe':
    'Probe the optional local Switchyard runtime-backed analyst lane through the current helper path.',
  'bridge-status': 'Alias for bridge health/status output through the local helper.',
  'support-matrix': 'Read the machine-readable builder support matrix through the MCP resource surface.',
  readiness: 'Read cached readiness state through the MCP resource surface.',
  'workflow-run': 'Print the exact governed MCP tool-call template for the built-in workflow.',
  'workflow-resume':
    'Resume a waiting workflow run through the MCP tool surface, optionally with an external update payload.',
  'workflow-list': 'List session-scoped workflow snapshots through the MCP tool surface.',
  'workflow-get': 'Fetch one workflow run snapshot through the MCP tool surface.',
};

const usageExamples = [
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts doctor',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts server',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts status',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts live-probe',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts live-diagnose',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts live-support-bundle',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts switchyard-runtime-probe --models Gemini',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts bridge-status',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts support-matrix',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts readiness --models ChatGPT,Gemini',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts workflow-run --session-id session-1 --turn-id turn-1 --prompt "Stage the next move" --models ChatGPT,Gemini',
  `node node_modules/tsx/dist/cli.mjs mcp/operator.ts workflow-resume --run-id <workflow-run-id> --external-update-json '{"stepId":"compare","status":"completed","output":{"type":"compare","prompt":"...","sessionId":"session-1","turnId":"turn-1","requestId":null,"requestedModels":["ChatGPT"],"completedModels":["ChatGPT"]}}'`,
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts workflow-list',
  'node node_modules/tsx/dist/cli.mjs mcp/operator.ts workflow-get --run-id <workflow-run-id>',
];

const resolveBridgePort = (override?: number) =>
  override ?? Number(process.env.PROMPT_SWITCHBOARD_BRIDGE_PORT || PROMPT_SWITCHBOARD_BRIDGE_PORT);

const createMetadata = (
  command: OperatorCommandName | 'help',
  transport: OperatorTransport | 'none',
  options: OperatorOptions = {}
) => {
  const bridgePort = resolveBridgePort(options.bridgePort);
  return {
    command,
    transport,
    bridgePort,
    bridgeBaseUrl: createBridgeBaseUrl(PROMPT_SWITCHBOARD_BRIDGE_HOST, bridgePort),
    maintainerEntry: 'npm run mcp:operator -- <subcommand>',
    publicCliProduct: false,
    rationale:
      'This helper stays repo-local because it only wraps the local MCP sidecar and maintainer tooling. It is not a public CLI product or a second protocol surface.',
  };
};

const createSuccess = (
  command: OperatorCommandName | 'help',
  transport: OperatorTransport | 'none',
  result: unknown,
  options: OperatorOptions = {}
): OperatorEnvelope => ({
  ok: true,
  localOnly: true,
  surface: 'repo_local_operator_helper',
  command,
  transport,
  result,
  metadata: createMetadata(command, transport, options),
});

const createFailure = (
  command: OperatorCommandName | 'help',
  transport: OperatorTransport | 'none',
  code: string,
  message: string,
  details?: unknown,
  options: OperatorOptions = {}
): OperatorEnvelope => ({
  ok: false,
  localOnly: true,
  surface: 'repo_local_operator_helper',
  command,
  transport,
  error: {
    code,
    message,
    details,
  },
  metadata: createMetadata(command, transport, options),
});

const parseJson = <T>(raw: string): T => JSON.parse(raw) as T;

const parseJsonFromStdout = <T>(stdout: string) => {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('operator_empty_stdout');
  }

  return parseJson<T>(trimmed);
};

const parseListOption = (value?: string) =>
  value
    ? value
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    : undefined;

const parseIntegerOption = (value?: string) => {
  if (!value) return undefined;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
};

const parseJsonOption = (value?: string): Record<string, unknown> | undefined => {
  if (!value) return undefined;
  const parsed = JSON.parse(value);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
};

export const parseOperatorArgv = (argv: string[]): ParsedArgv => {
  const [rawCommand, ...rest] = argv;
  const command = rawCommand ?? 'help';

  if (command === 'help') {
    return {
      command: 'help',
      options: {},
    };
  }

  if (!OPERATOR_COMMANDS.includes(command as OperatorCommandName)) {
    throw new Error(`operator_unknown_command:${command}`);
  }

  const rawOptions: Record<string, string> = {};
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const [rawKey, inlineValue] = token.slice(2).split('=', 2);
    const nextToken = rest[index + 1];
    const value =
      inlineValue !== undefined
        ? inlineValue
        : nextToken && !nextToken.startsWith('--')
          ? nextToken
          : 'true';

    rawOptions[rawKey] = value;
    if (inlineValue === undefined && nextToken && !nextToken.startsWith('--')) {
      index += 1;
    }
  }

  return {
    command: command as OperatorCommandName,
    options: {
      bridgePort: parseIntegerOption(rawOptions['bridge-port']),
      externalUpdate: parseJsonOption(rawOptions['external-update-json']),
      models: parseListOption(rawOptions.models),
      prompt: rawOptions.prompt,
      runId: rawOptions['run-id'],
      sessionId: rawOptions['session-id'],
      turnId: rawOptions['turn-id'],
    },
  };
};

export const getHelpEnvelope = () =>
  createSuccess('help', 'none', {
    description:
      'Repo-local operator helper for maintainers and coding agents. This is not a public CLI surface.',
    commands: OPERATOR_COMMANDS.map((command) => ({
      command,
      description: commandDescriptions[command],
    })),
    usageExamples,
  });

export const runOperatorServer = async (options: OperatorOptions = {}) =>
  new Promise<number>((resolve, reject) => {
    const bridgePort = resolveBridgePort(options.bridgePort);
    const child = spawn(process.execPath, [tsxCliPath, serverEntrypoint], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PROMPT_SWITCHBOARD_BRIDGE_PORT: String(bridgePort),
      },
      stdio: 'inherit',
    });

    child.on('error', reject);
    child.on('close', (code) => resolve(code ?? 1));
  });

const runTsxScript = async (scriptPath: string, args: string[] = [], env?: NodeJS.ProcessEnv) =>
  new Promise<JsonScriptResult>((resolve, reject) => {
    const child = spawn(process.execPath, [tsxCliPath, scriptPath, ...args], {
      cwd: repoRoot,
      env: env ?? process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', reject);
    child.on('close', (code) => {
      resolve({
        stdout,
        stderr,
        exitCode: code ?? 1,
      });
    });
  });

const createLiveCommandEnv = (bridgePort: number) => ({
  ...process.env,
  PROMPT_SWITCHBOARD_BRIDGE_PORT: String(bridgePort),
  PROMPT_SWITCHBOARD_LIVE: process.env.PROMPT_SWITCHBOARD_LIVE || '1',
});

const runJsonTsxScript = async (
  command: OperatorCommandName,
  scriptPath: string,
  args: string[] = [],
  options: OperatorOptions = {},
  envOverrides?: NodeJS.ProcessEnv
) => {
  const bridgePort = resolveBridgePort(options.bridgePort);
  const result = await runTsxScript(scriptPath, args, {
    ...process.env,
    PROMPT_SWITCHBOARD_BRIDGE_PORT: String(bridgePort),
    ...envOverrides,
  });

  if (result.exitCode !== 0) {
    return createFailure(
      command,
      'child_process',
      'operator_script_failed',
      `${path.basename(scriptPath)} exited with code ${result.exitCode}.`,
      {
        stderr: result.stderr.trim() || null,
        stdout: result.stdout.trim() || null,
        exitCode: result.exitCode,
      },
      options
    );
  }

  try {
    return createSuccess(
      command,
      'child_process',
      parseJsonFromStdout<unknown>(result.stdout),
      options
    );
  } catch (error) {
    return createFailure(
      command,
      'child_process',
      'operator_script_invalid_json',
      `${path.basename(scriptPath)} did not emit JSON-safe output.`,
      {
        stdout: result.stdout.trim() || null,
        stderr: result.stderr.trim() || null,
        error: error instanceof Error ? error.message : String(error),
      },
      options
    );
  }
};

const readBridgeHealth = async (options: OperatorOptions) => {
  const bridgePort = resolveBridgePort(options.bridgePort);
  const bridgeBaseUrl = createBridgeBaseUrl(PROMPT_SWITCHBOARD_BRIDGE_HOST, bridgePort);

  try {
    const response = await fetch(`${bridgeBaseUrl}/health`);
    const payload = response.headers
      .get('content-type')
      ?.includes('application/json')
      ? await response.json()
      : null;

    return createSuccess(
      'status',
      'bridge_http',
      {
        reachable: response.ok,
        statusCode: response.status,
        bridgeBaseUrl,
        health: payload,
      },
      options
    );
  } catch (error) {
    return createFailure(
      'status',
      'bridge_http',
      'bridge_unreachable',
      'The local loopback bridge is not reachable.',
      {
        bridgeBaseUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      options
    );
  }
};

const createToolTemplateResult = (
  command: 'workflow-run' | 'workflow-get' | 'bridge-status',
  tool: string,
  args: Record<string, unknown>,
  notes: string[],
  options: OperatorOptions
) =>
  createSuccess(
    command,
    'none',
    {
      mode: 'governed_mcp_tool_template',
      tool,
      arguments: args,
      notes,
    },
    options
  );

const probeBridgeHealth = async (options: OperatorOptions) => {
  const bridgePort = resolveBridgePort(options.bridgePort);
  const bridgeBaseUrl = createBridgeBaseUrl(PROMPT_SWITCHBOARD_BRIDGE_HOST, bridgePort);

  try {
    const response = await fetch(`${bridgeBaseUrl}/health`);
    const payload = response.headers
      .get('content-type')
      ?.includes('application/json')
      ? ((await response.json()) as {
          ok?: boolean;
          connected?: boolean;
          extensionId?: string | null;
          lastSeenAt?: number | null;
        })
      : null;

    return {
      reachable: response.ok,
      statusCode: response.status,
      bridgeBaseUrl,
      connected: Boolean(payload?.connected),
      extensionId: payload?.extensionId ?? null,
      lastSeenAt: payload?.lastSeenAt ?? null,
    };
  } catch (error) {
    return {
      reachable: false,
      statusCode: null,
      bridgeBaseUrl,
      connected: false,
      extensionId: null,
      lastSeenAt: null,
      error: error instanceof Error ? error.message : String(error),
    };
  }
};

const createMcpClient = async (options: OperatorOptions) => {
  const bridgePort = resolveBridgePort(options.bridgePort);
  const client = new Client({
    name: 'prompt-switchboard-local-operator',
    version: packageJson.version,
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [tsxCliPath, serverEntrypoint],
    stderr: 'pipe',
    cwd: repoRoot,
    env: {
      ...process.env,
      PROMPT_SWITCHBOARD_BRIDGE_PORT: String(bridgePort),
    },
  });

  await client.connect(transport);

  return {
    client,
    async close() {
      await client.close().catch(() => undefined);
    },
  };
};

const readJsonResource = async (uri: string, options: OperatorOptions) => {
  const session = await createMcpClient(options);

  try {
    const bridgeStatus = await session.client.callTool({
      name: 'prompt_switchboard.bridge_status',
      arguments: {},
    });
    const resource = await session.client.readResource({ uri });
    const textContent = resource.contents.find(
      (
        entry
      ): entry is {
        uri: string;
        text: string;
        mimeType?: string;
        _meta?: Record<string, unknown>;
      } =>
        typeof entry === 'object' &&
        entry !== null &&
        'text' in entry &&
        typeof entry.text === 'string'
    );

    return createSuccess(
      'readiness',
      'mcp_stdio',
      {
        bridgeStatus: bridgeStatus.structuredContent ?? null,
        resourceUri: uri,
        snapshot: textContent ? parseJson<unknown>(textContent.text) : null,
        models: options.models ?? null,
      },
      options
    );
  } catch (error) {
    return createFailure(
      'readiness',
      'mcp_stdio',
      'operator_readiness_failed',
      'The operator helper could not read the readiness resource.',
      {
        resourceUri: uri,
        error: error instanceof Error ? error.message : String(error),
      },
      options
    );
  } finally {
    await session.close();
  }
};

const listWorkflowRuns = async (options: OperatorOptions) => {
  const bridgeHealth = await probeBridgeHealth(options);
  if (!bridgeHealth.connected) {
    return createFailure(
      'workflow-list',
      'bridge_http',
      'workflow_bridge_not_connected',
      'workflow-list requires a live Prompt Switchboard bridge connection before the MCP tool can read workflow state.',
      bridgeHealth,
      options
    );
  }

  const session = await createMcpClient(options);

  try {
    const toolResult = await session.client.callTool({
      name: 'prompt_switchboard.list_workflow_runs',
      arguments: {},
    });

    if (toolResult.isError) {
      return createFailure(
        'workflow-list',
        'mcp_stdio',
        'operator_workflow_list_failed',
        'The MCP tool reported a workflow-list error.',
        {
          structuredContent: toolResult.structuredContent ?? null,
          content: toolResult.content ?? [],
        },
        options
      );
    }

    return createSuccess(
      'workflow-list',
      'mcp_stdio',
      {
        workflowRuns: toolResult.structuredContent ?? null,
        normalizedRuns: normalizeWorkflowRunList(toolResult.structuredContent ?? null),
      },
      options
    );
  } catch (error) {
    return createFailure(
      'workflow-list',
      'mcp_stdio',
      'operator_workflow_list_failed',
      'The operator helper could not fetch workflow snapshots.',
      {
        error: error instanceof Error ? error.message : String(error),
      },
      options
    );
  } finally {
    await session.close();
  }
};

const getWorkflowRun = async (options: OperatorOptions) => {
  if (!options.runId) {
    return createFailure(
      'workflow-get',
      'mcp_stdio',
      'workflow_run_id_required',
      'workflow-get requires --run-id <workflow-run-id>.',
      undefined,
      options
    );
  }

  const bridgeHealth = await probeBridgeHealth(options);
  if (!bridgeHealth.connected) {
    return createFailure(
      'workflow-get',
      'bridge_http',
      'workflow_bridge_not_connected',
      'workflow-get requires a live Prompt Switchboard bridge connection before the MCP tool can read workflow state.',
      bridgeHealth,
      options
    );
  }

  const session = await createMcpClient(options);

  try {
    const toolResult = await session.client.callTool({
      name: 'prompt_switchboard.get_workflow_run',
      arguments: {
        runId: options.runId,
      },
    });

    if (toolResult.isError) {
      return createFailure(
        'workflow-get',
        'mcp_stdio',
        'operator_workflow_get_failed',
        'The MCP tool reported a workflow-get error.',
        {
          runId: options.runId,
          structuredContent: toolResult.structuredContent ?? null,
          content: toolResult.content ?? [],
        },
        options
      );
    }

    return createSuccess(
      'workflow-get',
      'mcp_stdio',
      {
        runId: options.runId,
        workflowRun: toolResult.structuredContent ?? null,
        normalizedRun: normalizeWorkflowRun(toolResult.structuredContent ?? null),
      },
      options
    );
  } catch (error) {
    return createFailure(
      'workflow-get',
      'mcp_stdio',
      'operator_workflow_get_failed',
      'The operator helper could not fetch the workflow run snapshot.',
      {
        runId: options.runId,
        error: error instanceof Error ? error.message : String(error),
      },
      options
    );
  } finally {
    await session.close();
  }
};

const resumeWorkflowRun = async (options: OperatorOptions) => {
  if (!options.runId) {
    return createFailure(
      'workflow-resume',
      'mcp_stdio',
      'workflow_run_id_required',
      'workflow-resume requires --run-id <workflow-run-id>.',
      undefined,
      options
    );
  }

  const bridgeHealth = await probeBridgeHealth(options);
  if (!bridgeHealth.connected) {
    return createFailure(
      'workflow-resume',
      'bridge_http',
      'workflow_bridge_not_connected',
      'workflow-resume requires a live Prompt Switchboard bridge connection before the MCP tool can resume workflow state.',
      bridgeHealth,
      options
    );
  }

  const session = await createMcpClient(options);

  try {
    const toolResult = await session.client.callTool({
      name: 'prompt_switchboard.resume_workflow',
      arguments: {
        runId: options.runId,
        externalUpdate: options.externalUpdate,
      },
    });

    if (toolResult.isError) {
      return createFailure(
        'workflow-resume',
        'mcp_stdio',
        'operator_workflow_resume_failed',
        'The MCP tool reported a workflow-resume error.',
        {
          runId: options.runId,
          externalUpdate: options.externalUpdate ?? null,
          structuredContent: toolResult.structuredContent ?? null,
          content: toolResult.content ?? [],
        },
        options
      );
    }

    return createSuccess(
      'workflow-resume',
      'mcp_stdio',
      {
        runId: options.runId,
        externalUpdate: options.externalUpdate ?? null,
        workflowRun: toolResult.structuredContent ?? null,
        normalizedRun: normalizeWorkflowRun(toolResult.structuredContent ?? null),
      },
      options
    );
  } catch (error) {
    return createFailure(
      'workflow-resume',
      'mcp_stdio',
      'operator_workflow_resume_failed',
      'The operator helper could not resume the workflow run.',
      {
        runId: options.runId,
        externalUpdate: options.externalUpdate ?? null,
        error: error instanceof Error ? error.message : String(error),
      },
      options
    );
  } finally {
    await session.close();
  }
};

export const runOperatorCommand = async (
  command: OperatorCommandName,
  options: OperatorOptions = {}
): Promise<OperatorEnvelope> => {
  switch (command) {
    case 'doctor':
      return runJsonTsxScript(command, path.resolve(__dirname, 'doctor.ts'), [], options);
    case 'bridge-status':
      return createToolTemplateResult(
        command,
        'prompt_switchboard.bridge_status',
        {},
        [
          'Use this through Codex, Claude Code, or another MCP-capable local agent after the local sidecar is attached.',
          'If you only need the local loopback health probe, `npm run mcp:operator -- status` is the fastest check.',
        ],
        options
      );
    case 'support-matrix':
      return readJsonResource('prompt-switchboard://builder/support-matrix', options);
    case 'smoke':
      return runJsonTsxScript(command, path.resolve(__dirname, 'smoke.ts'), [], options);
    case 'status':
      return readBridgeHealth(options);
    case 'live-probe':
      return runJsonTsxScript(
        command,
        path.resolve(repoRoot, 'scripts/verify/live-site-probe.ts'),
        [],
        options,
        createLiveCommandEnv(resolveBridgePort(options.bridgePort))
      );
    case 'live-diagnose':
      return runJsonTsxScript(
        command,
        path.resolve(repoRoot, 'scripts/verify/live-diagnose.ts'),
        [],
        options,
        createLiveCommandEnv(resolveBridgePort(options.bridgePort))
      );
    case 'live-support-bundle':
      return runJsonTsxScript(
        command,
        path.resolve(repoRoot, 'scripts/verify/live-support-bundle.ts'),
        [],
        options,
        createLiveCommandEnv(resolveBridgePort(options.bridgePort))
      );
    case 'switchyard-runtime-probe':
      return runJsonTsxScript(
        command,
        path.resolve(repoRoot, 'scripts/verify/switchyard-runtime-analyst-probe.ts'),
        options.models?.length ? ['--model', options.models[0]!] : [],
        options
      );
    case 'readiness':
      return readJsonResource('prompt-switchboard://models/readiness', options);
    case 'workflow-run':
      return createToolTemplateResult(
        command,
        'prompt_switchboard.run_workflow',
        {
          workflowId: 'compare-analyze-follow-up',
          sessionId: options.sessionId ?? 'session-1',
          turnId: options.turnId ?? 'turn-1',
          input: {
            prompt: options.prompt ?? 'Stage the next move',
            models: options.models ?? ['ChatGPT'],
          },
        },
        [
          'This prints the exact governed MCP tool call for the built-in linear workflow.',
          'It does not create a second operator protocol or a public CLI workflow surface.',
        ],
        options
      );
    case 'workflow-resume':
      return resumeWorkflowRun(options);
    case 'workflow-list':
      return listWorkflowRuns(options);
    case 'workflow-get':
      return getWorkflowRun(options);
    case 'server':
      return createFailure(
        command,
        'none',
        'operator_server_passthrough_only',
        'The server command is handled directly by mcp/operator.ts and should not flow through the JSON envelope path.',
        undefined,
        options
      );
    default: {
      const exhaustiveCheck: never = command;
      return createFailure(
        command,
        'none',
        'operator_command_unsupported',
        `Unsupported operator command: ${String(exhaustiveCheck)}`,
        undefined,
        options
      );
    }
  }
};
