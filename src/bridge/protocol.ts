import { z } from 'zod';
import {
  ModelNameSchema,
  SUBSTRATE_ACTION_NAMES,
  SubstrateActionArgSchemas,
  type SubstrateActionName,
} from '../substrate/api/index.js';

export const PROMPT_SWITCHBOARD_BRIDGE_HOST = '127.0.0.1';
export const PROMPT_SWITCHBOARD_BRIDGE_PORT = 48123;
export const PROMPT_SWITCHBOARD_BRIDGE_VERSION = 1;
export const PROMPT_SWITCHBOARD_BRIDGE_HOST_ENV = 'PROMPT_SWITCHBOARD_BRIDGE_HOST';
export const PROMPT_SWITCHBOARD_BRIDGE_PORT_ENV = 'PROMPT_SWITCHBOARD_BRIDGE_PORT';

export type BridgeRuntimeEnv = Record<string, string | undefined>;

export const BRIDGE_HEADER_EXTENSION_ID = 'x-prompt-switchboard-extension-id';
export const BRIDGE_HEADER_KEY = 'x-prompt-switchboard-bridge-key';

export const BRIDGE_COMMAND_NAMES = SUBSTRATE_ACTION_NAMES;

export type BridgeCommandName = SubstrateActionName;

export const BridgeBootstrapRequestSchema = z.object({
  extensionId: z.string().min(1),
  extensionVersion: z.string().min(1),
});

export const BridgeBootstrapResponseSchema = z.object({
  ok: z.literal(true),
  bridgeKey: z.string().min(1),
  pollIntervalMs: z.number().int().positive(),
  bridgeVersion: z.number().int().positive(),
});

export const BridgeCommandSchemas = SubstrateActionArgSchemas;

export type BridgeCommandArgsMap = {
  [K in keyof typeof BridgeCommandSchemas]: z.infer<(typeof BridgeCommandSchemas)[K]>;
};

export const BridgeCommandEnvelopeSchema = z.discriminatedUnion('command', [
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.CHECK_READINESS),
    args: BridgeCommandSchemas.check_readiness,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.OPEN_MODEL_TABS),
    args: BridgeCommandSchemas.open_model_tabs,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.COMPARE),
    args: BridgeCommandSchemas.compare,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.RETRY_FAILED),
    args: BridgeCommandSchemas.retry_failed,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.GET_SESSION),
    args: BridgeCommandSchemas.get_session,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.LIST_SESSIONS),
    args: BridgeCommandSchemas.list_sessions,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.EXPORT_COMPARE),
    args: BridgeCommandSchemas.export_compare,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.ANALYZE_COMPARE),
    args: BridgeCommandSchemas.analyze_compare,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.RUN_WORKFLOW),
    args: BridgeCommandSchemas.run_workflow,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.LIST_WORKFLOW_RUNS),
    args: BridgeCommandSchemas.list_workflow_runs,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.GET_WORKFLOW_RUN),
    args: BridgeCommandSchemas.get_workflow_run,
  }),
  z.object({
    id: z.string().min(1),
    command: z.literal(BRIDGE_COMMAND_NAMES.RESUME_WORKFLOW),
    args: BridgeCommandSchemas.resume_workflow,
  }),
]);

export type BridgeCommandEnvelope = z.infer<typeof BridgeCommandEnvelopeSchema>;

export const BridgeCommandResultSchema = z.object({
  id: z.string().min(1),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z
    .object({
      code: z.string().min(1),
      message: z.string().min(1),
      details: z.unknown().optional(),
    })
    .optional(),
});

export type BridgeCommandResult = z.infer<typeof BridgeCommandResultSchema>;

export const BridgeSessionSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  updatedAt: z.number(),
  createdAt: z.number(),
  selectedModels: z.array(ModelNameSchema),
  messageCount: z.number().int().nonnegative(),
  turnCount: z.number().int().nonnegative(),
  isCurrent: z.boolean(),
  latestTurnId: z.string().nullable(),
});

export const BridgeCurrentSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  selectedModels: z.array(ModelNameSchema),
  messageCount: z.number().int().nonnegative(),
  turns: z.array(
    z.object({
      id: z.string(),
      prompt: z.string(),
      requestedModels: z.array(ModelNameSchema),
      statuses: z.record(z.string(), z.string()),
      startedAt: z.number(),
    })
  ),
});

export const BridgeStateSnapshotSchema = z.object({
  extensionId: z.string().optional(),
  lastSeenAt: z.number().int().optional(),
  currentSessionId: z.string().nullable(),
  sessions: z.array(BridgeSessionSummarySchema),
  currentSession: BridgeCurrentSessionSchema.nullable(),
  readiness: z.record(
    z.string(),
    z.object({
      ready: z.boolean(),
      status: z.string(),
      hostname: z.string().optional(),
      lastCheckedAt: z.number().optional(),
    })
  ),
});

export type BridgeStateSnapshot = z.infer<typeof BridgeStateSnapshotSchema>;

const defaultBridgeRuntimeEnv: BridgeRuntimeEnv = (() => {
  const maybeProcess = globalThis as typeof globalThis & {
    process?: { env?: BridgeRuntimeEnv };
  };
  return maybeProcess.process?.env ?? {};
})();

export const resolveBridgeHost = (env: BridgeRuntimeEnv = defaultBridgeRuntimeEnv) =>
  env[PROMPT_SWITCHBOARD_BRIDGE_HOST_ENV]?.trim() || PROMPT_SWITCHBOARD_BRIDGE_HOST;

export const resolveBridgePort = (env: BridgeRuntimeEnv = defaultBridgeRuntimeEnv) => {
  const rawPort = env[PROMPT_SWITCHBOARD_BRIDGE_PORT_ENV];
  if (!rawPort) {
    return PROMPT_SWITCHBOARD_BRIDGE_PORT;
  }

  const parsedPort = Number(rawPort);
  return Number.isInteger(parsedPort) && parsedPort > 0
    ? parsedPort
    : PROMPT_SWITCHBOARD_BRIDGE_PORT;
};

export const createBridgeBaseUrl = (
  host = PROMPT_SWITCHBOARD_BRIDGE_HOST,
  port = PROMPT_SWITCHBOARD_BRIDGE_PORT
) => `http://${host}:${port}`;
