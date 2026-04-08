import { readFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  BRIDGE_HEADER_EXTENSION_ID,
  BRIDGE_HEADER_KEY,
  createBridgeBaseUrl,
  resolveBridgeHost,
} from '../src/bridge/protocol.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageJson = JSON.parse(
  readFileSync(path.resolve(__dirname, '../package.json'), 'utf8')
) as { version: string };

const extensionId = 'prompt-switchboard-smoke-extension';
const extensionVersion = 'smoke';
const workflowTemplateId = 'compare-analyze-follow-up';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const getFreePort = async () =>
  new Promise<number>((resolve, reject) => {
    const bridgeHost = resolveBridgeHost(process.env);
    const server = createServer();
    server.listen(0, bridgeHost, () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        reject(new Error('mcp_smoke_port_unavailable'));
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

const bootstrapBridge = async (bridgeBaseUrl: string) => {
  const response = await fetch(`${bridgeBaseUrl}/v1/bridge/bootstrap`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      extensionId,
      extensionVersion,
    }),
  });
  if (!response.ok) {
    throw new Error(`bridge_bootstrap_failed:${response.status}`);
  }
  const payload = (await response.json()) as { bridgeKey: string };
  return payload.bridgeKey;
};

const createMockWorkflowRunResult = (args: Record<string, unknown>) => {
  const timestamp = Date.now();
  return {
    runId: 'run-smoke',
    workflowId: typeof args.workflowId === 'string' ? args.workflowId : workflowTemplateId,
    status: 'completed',
    requestedAt: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp,
    currentStepId: 'seed-follow-up',
    steps: [
      {
        id: 'compare',
        action: 'compare',
        status: 'completed',
        startedAt: timestamp,
        finishedAt: timestamp,
        output: {
          sessionId: 'session-smoke',
          turnId: 'turn-smoke',
        },
      },
      {
        id: 'analyze',
        action: 'analyze_compare',
        status: 'completed',
        startedAt: timestamp,
        finishedAt: timestamp,
      },
    ],
    input: args.input ?? {},
  };
};

const createMockWorkflowSnapshotResult = (args: Record<string, unknown>) => {
  const timestamp = Date.now();
  return {
    runId: typeof args.runId === 'string' ? args.runId : 'run-smoke',
    workflowId: workflowTemplateId,
    status: 'completed',
    requestedAt: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp,
    currentStepId: 'seed-follow-up',
    steps: [
      {
        id: 'compare',
        action: 'compare',
        status: 'completed',
        startedAt: timestamp,
        finishedAt: timestamp,
        output: {
          sessionId: 'session-smoke',
          turnId: 'turn-smoke',
        },
      },
      {
        id: 'analyze',
        action: 'analyze_compare',
        status: 'completed',
        startedAt: timestamp,
        finishedAt: timestamp,
      },
      {
        id: 'seed-follow-up',
        action: 'seed_follow_up',
        status: 'completed',
        startedAt: timestamp,
        finishedAt: timestamp,
        output: {
          type: 'seed_follow_up',
          prompt: 'What should the next validation step be?',
          sessionId: 'session-smoke',
          turnId: 'turn-smoke',
        },
      },
    ],
    output: {
      type: 'seed_follow_up',
      prompt: 'What should the next validation step be?',
      sessionId: 'session-smoke',
      turnId: 'turn-smoke',
    },
  };
};

const createMockWorkflowListResult = () => {
  const timestamp = Date.now();
  return {
    runs: [
      {
        runId: 'run-smoke',
        workflowId: workflowTemplateId,
        status: 'completed',
        requestedAt: timestamp,
        startedAt: timestamp,
        finishedAt: timestamp,
        currentStepId: 'seed-follow-up',
      },
    ],
  };
};

const createMockWorkflowResumeResult = (args: Record<string, unknown>) => {
  const timestamp = Date.now();
  const runId = typeof args.runId === 'string' ? args.runId : 'run-smoke';
  return {
    runId,
    workflowId: workflowTemplateId,
    status: 'completed',
    requestedAt: timestamp,
    startedAt: timestamp,
    finishedAt: timestamp,
    currentStepId: 'seed-follow-up',
    steps: [
      {
        id: 'compare',
        action: 'compare',
        status: 'completed',
        startedAt: timestamp,
        finishedAt: timestamp,
        output:
          args.externalUpdate &&
          typeof args.externalUpdate === 'object' &&
          'output' in args.externalUpdate
            ? args.externalUpdate.output
            : {
                type: 'compare',
                prompt: 'Smoke compare prompt',
                sessionId: 'session-smoke',
                turnId: 'turn-smoke',
                requestId: null,
                requestedModels: ['ChatGPT'],
                completedModels: ['ChatGPT'],
              },
      },
      {
        id: 'analyze',
        action: 'analyze_compare',
        status: 'completed',
        startedAt: timestamp,
        finishedAt: timestamp,
      },
      {
        id: 'seed-follow-up',
        action: 'seed_follow_up',
        status: 'completed',
        startedAt: timestamp,
        finishedAt: timestamp,
        output: {
          type: 'seed_follow_up',
          prompt: 'What should the next validation step be?',
          sessionId: 'session-smoke',
          turnId: 'turn-smoke',
        },
      },
    ],
    output: {
      type: 'seed_follow_up',
      prompt: 'What should the next validation step be?',
      sessionId: 'session-smoke',
      turnId: 'turn-smoke',
    },
  };
};

const createMockResult = (command: string, args: Record<string, unknown>) => {
  switch (command) {
    case 'check_readiness':
      return {
        models: (args.models as string[] | undefined) ?? ['ChatGPT'],
        reports: [
          {
            model: 'ChatGPT',
            ready: true,
            status: 'ready',
            remoteConfigConfigured: false,
            lastCheckedAt: Date.now(),
          },
        ],
        checkedAt: Date.now(),
      };
    case 'open_model_tabs':
      return {
        tabs: ((args.models as string[] | undefined) ?? ['ChatGPT']).map((model, index) => ({
          model,
          tabId: index + 1,
          openUrl: 'https://chatgpt.com/',
          existed: false,
        })),
      };
    case 'compare':
      return {
        status: 'queued',
        sessionId: 'session-smoke',
        turnId: 'turn-smoke',
        requestId: 'request-smoke',
        requestedModels: (args.models as string[] | undefined) ?? ['ChatGPT'],
        readyModels: (args.models as string[] | undefined) ?? ['ChatGPT'],
        blockedReports: [],
      };
    case 'retry_failed':
      return {
        status: 'queued',
        sessionId: 'session-smoke',
        turnId: 'turn-retry',
        requestId: 'request-retry',
        requestedModels: (args.models as string[] | undefined) ?? ['ChatGPT'],
        readyModels: (args.models as string[] | undefined) ?? ['ChatGPT'],
        blockedReports: [],
      };
    case 'get_session':
      return {
        id: 'session-smoke',
        title: 'Smoke Session',
        selectedModels: ['ChatGPT'],
        messageCount: 2,
        turnCount: 1,
        updatedAt: Date.now(),
        createdAt: Date.now(),
        isCurrent: true,
        latestTurnId: 'turn-smoke',
        turns: [
          {
            id: 'turn-smoke',
            prompt: 'Smoke compare prompt',
            requestedModels: ['ChatGPT'],
            responseModels: ['ChatGPT'],
            startedAt: Date.now(),
          },
        ],
      };
    case 'list_sessions':
      return {
        sessions: [
          {
            id: 'session-smoke',
            title: 'Smoke Session',
            selectedModels: ['ChatGPT'],
            messageCount: 2,
            turnCount: 1,
            updatedAt: Date.now(),
            createdAt: Date.now(),
            isCurrent: true,
            latestTurnId: 'turn-smoke',
          },
        ],
      };
    case 'export_compare':
      return {
        sessionId: 'session-smoke',
        turnId: 'turn-smoke',
        format: args.format ?? 'markdown',
        content: '# Prompt Switchboard compare export\n\nSmoke compare content',
      };
    case 'analyze_compare':
      return {
        status: 'success',
        sessionId: 'session-smoke',
        turnId: 'turn-smoke',
        provider: 'browser_session',
        analystModel: 'ChatGPT',
        result: {
          provider: 'browser_session',
          model: 'ChatGPT',
          createdAt: Date.now(),
          consensusSummary: 'The compared answers mostly agree.',
          disagreementSummary: 'One answer is more implementation-specific.',
          nextQuestion: 'What should the next validation step be?',
          synthesisDraft: 'A short synthesis draft.',
        },
      };
    case 'run_workflow':
      return createMockWorkflowRunResult(args);
    case 'list_workflow_runs':
      return createMockWorkflowListResult();
    case 'get_workflow_run':
      return createMockWorkflowSnapshotResult(args);
    case 'resume_workflow':
      return createMockWorkflowResumeResult(args);
    default:
      throw new Error(`unsupported_bridge_command:${command}`);
  }
};

const requireStructuredToolEnvelope = (
  toolName: string,
  result: Awaited<ReturnType<Client['callTool']>>
) => {
  if (result.isError || !result.structuredContent) {
    throw new Error(`${toolName} tool did not return structured content`);
  }

  return result.structuredContent as {
    ok?: boolean;
    result?: Record<string, unknown>;
  };
};

async function main() {
  const bridgeHost = resolveBridgeHost(process.env);
  const bridgePort = await getFreePort();
  const bridgeBaseUrl = createBridgeBaseUrl(bridgeHost, bridgePort);
  const client = new Client({
    name: 'prompt-switchboard-mcp-smoke',
    version: packageJson.version,
  });

  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [
      path.resolve(__dirname, '../node_modules/tsx/dist/cli.mjs'),
      path.resolve(__dirname, '../mcp/server.ts'),
    ],
    stderr: 'pipe',
    cwd: path.resolve(__dirname, '..'),
    env: {
      ...process.env,
      PROMPT_SWITCHBOARD_BRIDGE_PORT: String(bridgePort),
    },
  });

  await client.connect(transport);
  const bridgeKey = await bootstrapBridge(bridgeBaseUrl);

  let bridgeStopped = false;
  const bridgeLoop = (async () => {
    while (!bridgeStopped) {
      let response: Response;
      try {
        response = await fetch(`${bridgeBaseUrl}/v1/bridge/pull`, {
          method: 'GET',
          headers: {
            [BRIDGE_HEADER_EXTENSION_ID]: extensionId,
            [BRIDGE_HEADER_KEY]: bridgeKey,
          },
        });
      } catch (error) {
        if (bridgeStopped) {
          return;
        }
        throw error;
      }

      if (response.status === 204) {
        await sleep(50);
        continue;
      }

      if (!response.ok) {
        throw new Error(`bridge_pull_failed:${response.status}`);
      }

      const payload = (await response.json()) as {
        id: string;
        command: string;
        args: Record<string, unknown>;
      };

      await fetch(`${bridgeBaseUrl}/v1/bridge/results`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [BRIDGE_HEADER_EXTENSION_ID]: extensionId,
          [BRIDGE_HEADER_KEY]: bridgeKey,
        },
        body: JSON.stringify({
          id: payload.id,
          ok: true,
          result: createMockResult(payload.command, payload.args),
        }),
      });

      await fetch(`${bridgeBaseUrl}/v1/bridge/state`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          [BRIDGE_HEADER_EXTENSION_ID]: extensionId,
          [BRIDGE_HEADER_KEY]: bridgeKey,
        },
        body: JSON.stringify({
          currentSessionId: 'session-smoke',
          sessions: [
            {
              id: 'session-smoke',
              title: 'Smoke Session',
              updatedAt: Date.now(),
              createdAt: Date.now(),
              selectedModels: ['ChatGPT'],
              messageCount: 2,
            },
          ],
          currentSession: {
            id: 'session-smoke',
            title: 'Smoke Session',
            selectedModels: ['ChatGPT'],
            messageCount: 2,
            turns: [
              {
                id: 'turn-smoke',
                prompt: 'Smoke compare prompt',
                requestedModels: ['ChatGPT'],
                statuses: {
                  ChatGPT: 'complete',
                },
                startedAt: Date.now(),
              },
            ],
          },
          readiness: {
            ChatGPT: {
              ready: true,
              status: 'ready',
              hostname: 'chatgpt.com',
              lastCheckedAt: Date.now(),
            },
          },
        }),
      });
    }
  })();

  const tools = await client.listTools();
  const resources = await client.listResources();

  const toolNames = tools.tools.map((tool) => tool.name).sort();
  const resourceUris = resources.resources.map((resource) => resource.uri).sort();

  const requiredTools = [
    'prompt_switchboard.check_readiness',
    'prompt_switchboard.open_model_tabs',
    'prompt_switchboard.compare',
    'prompt_switchboard.retry_failed',
    'prompt_switchboard.get_session',
    'prompt_switchboard.list_sessions',
    'prompt_switchboard.export_compare',
    'prompt_switchboard.analyze_compare',
    'prompt_switchboard.run_workflow',
    'prompt_switchboard.get_workflow_run',
    'prompt_switchboard.bridge_status',
  ];

  for (const toolName of requiredTools) {
    if (!toolNames.includes(toolName)) {
      throw new Error(`missing_mcp_tool:${toolName}`);
    }
  }

  const requiredResources = [
    'prompt-switchboard://sessions/current',
    'prompt-switchboard://models/readiness',
    'prompt-switchboard://models/catalog',
    'prompt-switchboard://analysis/providers',
    'prompt-switchboard://workflows/templates',
    'prompt-switchboard://builder/support-matrix',
    'prompt-switchboard://builder/public-distribution',
    'prompt-switchboard://sites/capabilities',
  ];

  for (const resourceUri of requiredResources) {
    if (!resourceUris.includes(resourceUri)) {
      throw new Error(`missing_mcp_resource:${resourceUri}`);
    }
  }

  const readinessResult = await client.callTool({
    name: 'prompt_switchboard.check_readiness',
    arguments: {
      models: ['ChatGPT'],
    },
  });
  const readinessEnvelope = requireStructuredToolEnvelope('check_readiness', readinessResult);

  const compareResult = await client.callTool({
    name: 'prompt_switchboard.compare',
    arguments: {
      prompt: 'Smoke compare prompt',
      models: ['ChatGPT'],
    },
  });
  const compareEnvelope = requireStructuredToolEnvelope('compare', compareResult);

  const workflowResult = await client.callTool({
    name: 'prompt_switchboard.run_workflow',
    arguments: {
      workflowId: workflowTemplateId,
      turnId: 'turn-smoke',
      sessionId: 'session-smoke',
      input: {
        prompt: 'Smoke compare prompt',
        models: ['ChatGPT'],
      },
    },
  });
  const workflowEnvelope = requireStructuredToolEnvelope('run_workflow', workflowResult);
  const workflowRunId =
    typeof workflowEnvelope.result?.runId === 'string' ? workflowEnvelope.result.runId : null;

  if (!workflowRunId) {
    throw new Error('run_workflow tool did not return a runId');
  }

  const workflowSnapshotResult = await client.callTool({
    name: 'prompt_switchboard.get_workflow_run',
    arguments: {
      runId: workflowRunId,
    },
  });
  const workflowSnapshotEnvelope = requireStructuredToolEnvelope(
    'get_workflow_run',
    workflowSnapshotResult
  );

  const workflowListResult = await client.callTool({
    name: 'prompt_switchboard.list_workflow_runs',
    arguments: {},
  });
  const workflowListEnvelope = requireStructuredToolEnvelope(
    'list_workflow_runs',
    workflowListResult
  );

  const workflowResumeResult = await client.callTool({
    name: 'prompt_switchboard.resume_workflow',
    arguments: {
      runId: workflowRunId,
      externalUpdate: {
        stepId: 'compare',
        status: 'completed',
        output: {
          type: 'compare',
          prompt: 'Smoke compare prompt',
          sessionId: 'session-smoke',
          turnId: 'turn-smoke',
          requestId: null,
          requestedModels: ['ChatGPT'],
          completedModels: ['ChatGPT'],
        },
      },
    },
  });
  const workflowResumeEnvelope = requireStructuredToolEnvelope(
    'resume_workflow',
    workflowResumeResult
  );

  const resourceResult = await client.readResource({
    uri: 'prompt-switchboard://sessions/current',
  });
  const analysisProvidersResource = await client.readResource({
    uri: 'prompt-switchboard://analysis/providers',
  });
  const workflowTemplatesResource = await client.readResource({
    uri: 'prompt-switchboard://workflows/templates',
  });
  const builderSupportMatrixResource = await client.readResource({
    uri: 'prompt-switchboard://builder/support-matrix',
  });
  const publicDistributionMatrixResource = await client.readResource({
    uri: 'prompt-switchboard://builder/public-distribution',
  });
  const siteCapabilitiesResource = await client.readResource({
    uri: 'prompt-switchboard://sites/capabilities',
  });

  if (!resourceResult.contents?.length) {
    throw new Error('current session resource did not return contents');
  }
  if (!analysisProvidersResource.contents?.length) {
    throw new Error('analysis provider resource did not return contents');
  }
  if (!workflowTemplatesResource.contents?.length) {
    throw new Error('workflow template resource did not return contents');
  }
  if (!builderSupportMatrixResource.contents?.length) {
    throw new Error('builder support matrix resource did not return contents');
  }
  if (!publicDistributionMatrixResource.contents?.length) {
    throw new Error('public distribution matrix resource did not return contents');
  }
  if (!siteCapabilitiesResource.contents?.length) {
    throw new Error('site capabilities resource did not return contents');
  }

  bridgeStopped = true;
  await sleep(50);
  await client.close();
  await bridgeLoop.catch(() => undefined);
  console.log(
    JSON.stringify(
      {
        ok: true,
        tools: toolNames,
        resources: resourceUris,
        readiness: readinessEnvelope,
        compare: compareEnvelope,
        runWorkflow: workflowEnvelope,
        workflowSnapshot: workflowSnapshotEnvelope,
        workflowList: workflowListEnvelope,
        workflowResume: workflowResumeEnvelope,
        analysisProviderResource: analysisProvidersResource.contents[0],
        workflowTemplateResource: workflowTemplatesResource.contents[0],
        builderSupportMatrixResource: builderSupportMatrixResource.contents[0],
        publicDistributionMatrixResource: publicDistributionMatrixResource.contents[0],
        siteCapabilitiesResource: siteCapabilitiesResource.contents[0],
      },
      null,
      2
    )
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
