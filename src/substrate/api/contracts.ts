import { z } from 'zod';

export const PROMPT_SWITCHBOARD_API_SUBSTRATE = 'prompt-switchboard.substrate' as const;
export const PROMPT_SWITCHBOARD_API_VERSION = 'v1' as const;

export const SUBSTRATE_ACTION_NAMES = {
  CHECK_READINESS: 'check_readiness',
  OPEN_MODEL_TABS: 'open_model_tabs',
  COMPARE: 'compare',
  RETRY_FAILED: 'retry_failed',
  GET_SESSION: 'get_session',
  LIST_SESSIONS: 'list_sessions',
  EXPORT_COMPARE: 'export_compare',
  ANALYZE_COMPARE: 'analyze_compare',
  RUN_WORKFLOW: 'run_workflow',
  LIST_WORKFLOW_RUNS: 'list_workflow_runs',
  GET_WORKFLOW_RUN: 'get_workflow_run',
  RESUME_WORKFLOW: 'resume_workflow',
} as const;

export type SubstrateActionName =
  (typeof SUBSTRATE_ACTION_NAMES)[keyof typeof SUBSTRATE_ACTION_NAMES];

export const MODEL_NAMES = ['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok'] as const;
export const ModelNameSchema = z.enum(MODEL_NAMES);

export const READINESS_STATUSES = [
  'ready',
  'tab_missing',
  'tab_loading',
  'content_unavailable',
  'model_mismatch',
  'selector_drift_suspect',
] as const;
export const ReadinessStatusSchema = z.enum(READINESS_STATUSES);

export const DELIVERY_STATUSES = ['pending', 'streaming', 'complete', 'error'] as const;
export const DeliveryStatusSchema = z.enum(DELIVERY_STATUSES);

export const SELECTOR_SOURCES = ['default', 'cached'] as const;
export const SelectorSourceSchema = z.enum(SELECTOR_SOURCES);

export const FAILURE_CLASSES = [
  'handshake_mismatch',
  'selector_drift_suspect',
  'transient_delivery_or_runtime',
  'tab_unavailable',
] as const;
export const FailureClassSchema = z.enum(FAILURE_CLASSES);

export const COMPARE_ANALYSIS_PROVIDER_IDS = ['browser_session', 'switchyard_runtime'] as const;
export const CompareAnalysisProviderIdSchema = z.enum(COMPARE_ANALYSIS_PROVIDER_IDS);
export const CompareAnalysisExecutionSurfaceSchema = z.enum(['browser_tab', 'future_runtime']);

export const COMPARE_EXPORT_FORMATS = ['markdown', 'summary'] as const;
export const CompareExportFormatSchema = z.enum(COMPARE_EXPORT_FORMATS);

export const SUBSTRATE_ERROR_KINDS = [
  'blocked',
  'waiting_external',
  'validation',
  'runtime',
] as const;
export const SubstrateApiErrorKindSchema = z.enum(SUBSTRATE_ERROR_KINDS);

export const EXTERNAL_ACTION_TYPES = [
  'open_tab',
  'sign_in',
  'wait_for_completion',
  'retry_later',
  'provide_input',
  'approve_permission',
] as const;
export const ExternalActionTypeSchema = z.enum(EXTERNAL_ACTION_TYPES);

export const WORKFLOW_RUN_STATUSES = [
  'queued',
  'running',
  'completed',
  'failed',
  'blocked',
  'waiting_external',
] as const;
export const WorkflowRunStatusSchema = z.enum(WORKFLOW_RUN_STATUSES);

export const COMPARE_QUEUE_SUCCESS_STATUSES = ['queued', 'partially_blocked'] as const;
export const CompareQueueSuccessStatusSchema = z.enum(COMPARE_QUEUE_SUCCESS_STATUSES);

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

const JsonLiteralSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([JsonLiteralSchema, z.array(JsonValueSchema), z.record(z.string(), JsonValueSchema)])
);
export const JsonRecordSchema = z.record(z.string(), JsonValueSchema);

const TimestampSchema = z.number().int().nonnegative();
const NonEmptyStringSchema = z.string().min(1);
const OptionalJsonRecordSchema = JsonRecordSchema.optional();

export const ValidationIssueSchema = z
  .object({
    path: z.array(z.union([z.string(), z.number()])),
    message: NonEmptyStringSchema,
    code: NonEmptyStringSchema.optional(),
  })
  .strict();

export const WaitingExternalActionSchema = z
  .object({
    type: ExternalActionTypeSchema,
    target: NonEmptyStringSchema.optional(),
    message: NonEmptyStringSchema.optional(),
  })
  .strict();

export const SubstrateApiErrorSchema = z
  .object({
    kind: SubstrateApiErrorKindSchema,
    code: NonEmptyStringSchema,
    message: NonEmptyStringSchema,
    retryable: z.boolean().default(false),
    details: JsonValueSchema.optional(),
    validationIssues: z.array(ValidationIssueSchema).nonempty().optional(),
    externalAction: WaitingExternalActionSchema.optional(),
  })
  .strict();

export type SubstrateApiError = z.infer<typeof SubstrateApiErrorSchema>;

export const DeliveryDiagnosticsSchema = z
  .object({
    stage: NonEmptyStringSchema.optional(),
    hostname: NonEmptyStringSchema.optional(),
    selectorSource: SelectorSourceSchema.optional(),
    remoteConfigConfigured: z.boolean().optional(),
    failureClass: FailureClassSchema.optional(),
    readinessStatus: ReadinessStatusSchema.optional(),
    inputReady: z.boolean().optional(),
    submitReady: z.boolean().optional(),
    lastCheckedAt: TimestampSchema.optional(),
  })
  .strict();

export const ModelReadinessReportSchema = z
  .object({
    model: ModelNameSchema,
    ready: z.boolean(),
    status: ReadinessStatusSchema,
    tabId: z.number().int().nullable().optional(),
    hostname: NonEmptyStringSchema.optional(),
    selectorSource: SelectorSourceSchema.optional(),
    remoteConfigConfigured: z.boolean(),
    failureClass: FailureClassSchema.optional(),
    inputReady: z.boolean().optional(),
    submitReady: z.boolean().optional(),
    lastCheckedAt: TimestampSchema,
  })
  .strict();

export const SessionMessageSchema = z
  .object({
    id: NonEmptyStringSchema,
    role: z.enum(['user', 'assistant', 'system']),
    text: z.string(),
    model: ModelNameSchema.optional(),
    timestamp: TimestampSchema,
    turnId: NonEmptyStringSchema.optional(),
    requestId: NonEmptyStringSchema.optional(),
    requestedModels: z.array(ModelNameSchema).optional(),
    isStreaming: z.boolean().optional(),
    deliveryStatus: DeliveryStatusSchema.optional(),
    deliveryErrorCode: NonEmptyStringSchema.optional(),
    completedAt: TimestampSchema.optional(),
    data: DeliveryDiagnosticsSchema.optional(),
  })
  .strict();

export const SessionSummarySchema = z
  .object({
    id: NonEmptyStringSchema,
    title: z.string(),
    updatedAt: TimestampSchema,
    createdAt: TimestampSchema,
    selectedModels: z.array(ModelNameSchema),
    messageCount: z.number().int().nonnegative(),
    turnCount: z.number().int().nonnegative(),
    isCurrent: z.boolean(),
    latestTurnId: z.string().nullable(),
  })
  .strict();

export const SessionTurnSchema = z
  .object({
    id: NonEmptyStringSchema,
    prompt: z.string(),
    requestedModels: z.array(ModelNameSchema),
    responseModels: z.array(ModelNameSchema).optional(),
    statuses: z.record(z.string(), DeliveryStatusSchema).optional(),
    startedAt: TimestampSchema,
  })
  .strict();

export const CompareAnalysisResultSchema = z
  .object({
    consensusSummary: NonEmptyStringSchema,
    disagreementSummary: NonEmptyStringSchema,
    recommendedAnswerModel: ModelNameSchema.nullable().optional(),
    recommendationReason: NonEmptyStringSchema,
    nextQuestion: NonEmptyStringSchema,
    synthesisDraft: NonEmptyStringSchema.optional(),
    provider: CompareAnalysisProviderIdSchema,
    executionSurface: CompareAnalysisExecutionSurfaceSchema.optional(),
    model: ModelNameSchema,
    createdAt: TimestampSchema,
  })
  .strict();

export const WorkflowStepActionSchema = z.enum([
  SUBSTRATE_ACTION_NAMES.CHECK_READINESS,
  SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS,
  SUBSTRATE_ACTION_NAMES.COMPARE,
  SUBSTRATE_ACTION_NAMES.RETRY_FAILED,
  SUBSTRATE_ACTION_NAMES.GET_SESSION,
  SUBSTRATE_ACTION_NAMES.LIST_SESSIONS,
  SUBSTRATE_ACTION_NAMES.EXPORT_COMPARE,
  SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE,
  'seed_follow_up',
  'continue_from_answer',
]);

export const WORKFLOW_STEP_RESULT_STATUSES = [
  'pending',
  'waiting_external',
  'completed',
  'failed',
] as const;
export const WorkflowStepResultStatusSchema = z.enum(WORKFLOW_STEP_RESULT_STATUSES);

export const WorkflowExternalActionSchema = z.discriminatedUnion('command', [
  z
    .object({
      command: z.literal(SUBSTRATE_ACTION_NAMES.COMPARE),
      stepId: NonEmptyStringSchema,
      args: z
        .object({
          prompt: NonEmptyStringSchema,
          sessionId: NonEmptyStringSchema.optional(),
          models: z.array(ModelNameSchema).optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      command: z.literal(SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE),
      stepId: NonEmptyStringSchema,
      args: z
        .object({
          turnId: NonEmptyStringSchema,
          sessionId: NonEmptyStringSchema.optional(),
        })
        .strict(),
    })
    .strict(),
  z
    .object({
      command: z.literal(SUBSTRATE_ACTION_NAMES.RETRY_FAILED),
      stepId: NonEmptyStringSchema,
      args: z
        .object({
          turnId: NonEmptyStringSchema,
          sessionId: NonEmptyStringSchema.optional(),
          models: z.array(ModelNameSchema).optional(),
        })
        .strict(),
    })
    .strict(),
]);

const WorkflowCompareOutputSchema = z
  .object({
    type: z.literal(SUBSTRATE_ACTION_NAMES.COMPARE),
    prompt: z.string(),
    sessionId: NonEmptyStringSchema.optional(),
    turnId: NonEmptyStringSchema,
    requestId: z.string().nullable().optional(),
    requestedModels: z.array(ModelNameSchema),
    completedModels: z.array(ModelNameSchema),
  })
  .strict();

const WorkflowAnalyzeCompareOutputSchema = z
  .object({
    type: z.literal(SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE),
    sessionId: NonEmptyStringSchema.optional(),
    turnId: NonEmptyStringSchema,
    provider: CompareAnalysisProviderIdSchema.optional(),
    analystModel: z.string().optional(),
    result: CompareAnalysisResultSchema,
  })
  .strict();

const WorkflowRetryFailedOutputSchema = z
  .object({
    type: z.literal(SUBSTRATE_ACTION_NAMES.RETRY_FAILED),
    sessionId: NonEmptyStringSchema.optional(),
    turnId: NonEmptyStringSchema,
    requestId: z.string().nullable().optional(),
    requestedModels: z.array(ModelNameSchema),
  })
  .strict();

export const WorkflowExternalUpdateSchema = z.discriminatedUnion('status', [
  z
    .object({
      stepId: NonEmptyStringSchema,
      status: z.literal('completed'),
      output: z.union([
        WorkflowCompareOutputSchema,
        WorkflowAnalyzeCompareOutputSchema,
        WorkflowRetryFailedOutputSchema,
      ]),
    })
    .strict(),
  z
    .object({
      stepId: NonEmptyStringSchema,
      status: z.literal('error'),
      error: z
        .object({
          code: NonEmptyStringSchema,
          message: NonEmptyStringSchema,
          stepId: NonEmptyStringSchema.optional(),
          bindingKey: NonEmptyStringSchema.optional(),
        })
        .strict(),
    })
    .strict(),
]);

export const WorkflowStepResultSchema = z
  .object({
    id: NonEmptyStringSchema,
    action: WorkflowStepActionSchema,
    status: WorkflowStepResultStatusSchema,
    startedAt: TimestampSchema.optional(),
    finishedAt: TimestampSchema.optional(),
    message: NonEmptyStringSchema.optional(),
    output: OptionalJsonRecordSchema,
    error: SubstrateApiErrorSchema.optional(),
  })
  .strict();

export const WorkflowRunSummarySchema = z
  .object({
    runId: NonEmptyStringSchema,
    workflowId: NonEmptyStringSchema,
    status: WorkflowRunStatusSchema,
    requestedAt: TimestampSchema,
    startedAt: TimestampSchema.optional(),
    finishedAt: TimestampSchema.optional(),
    currentStepId: NonEmptyStringSchema.optional(),
    emittedAction: WorkflowExternalActionSchema.optional(),
  })
  .strict();

export const SubstrateActionArgSchemas = {
  [SUBSTRATE_ACTION_NAMES.CHECK_READINESS]: z
    .object({
      models: z.array(ModelNameSchema).optional(),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS]: z
    .object({
      models: z.array(ModelNameSchema).optional(),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.COMPARE]: z
    .object({
      prompt: NonEmptyStringSchema,
      sessionId: NonEmptyStringSchema.optional(),
      models: z.array(ModelNameSchema).optional(),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.RETRY_FAILED]: z
    .object({
      turnId: NonEmptyStringSchema,
      sessionId: NonEmptyStringSchema.optional(),
      models: z.array(ModelNameSchema).optional(),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.GET_SESSION]: z
    .object({
      sessionId: NonEmptyStringSchema.optional(),
      includeMessages: z.boolean().optional(),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.LIST_SESSIONS]: z
    .object({
      limit: z.number().int().positive().max(50).optional(),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.EXPORT_COMPARE]: z
    .object({
      sessionId: NonEmptyStringSchema.optional(),
      turnId: NonEmptyStringSchema.optional(),
      format: CompareExportFormatSchema.default('markdown'),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE]: z
    .object({
      sessionId: NonEmptyStringSchema.optional(),
      turnId: NonEmptyStringSchema.optional(),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW]: z
    .object({
      workflowId: NonEmptyStringSchema,
      sessionId: NonEmptyStringSchema.optional(),
      turnId: NonEmptyStringSchema.optional(),
      input: OptionalJsonRecordSchema,
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS]: z
    .object({
      limit: z.number().int().positive().max(50).optional(),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN]: z
    .object({
      runId: NonEmptyStringSchema,
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW]: z
    .object({
      runId: NonEmptyStringSchema,
      externalUpdate: WorkflowExternalUpdateSchema.optional(),
    })
    .strict(),
} as const;

export const SubstrateActionSuccessSchemas = {
  [SUBSTRATE_ACTION_NAMES.CHECK_READINESS]: z
    .object({
      models: z.array(ModelNameSchema),
      reports: z.array(ModelReadinessReportSchema),
      checkedAt: TimestampSchema,
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS]: z
    .object({
      tabs: z.array(
        z
          .object({
            model: ModelNameSchema,
            tabId: z.number().int().nonnegative(),
            openUrl: NonEmptyStringSchema,
            existed: z.boolean(),
          })
          .strict()
      ),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.COMPARE]: z
    .object({
      status: CompareQueueSuccessStatusSchema,
      sessionId: NonEmptyStringSchema,
      turnId: NonEmptyStringSchema,
      requestId: NonEmptyStringSchema,
      requestedModels: z.array(ModelNameSchema).min(1),
      readyModels: z.array(ModelNameSchema).min(1),
      blockedReports: z.array(ModelReadinessReportSchema),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.RETRY_FAILED]: z
    .object({
      status: CompareQueueSuccessStatusSchema,
      sessionId: NonEmptyStringSchema,
      turnId: NonEmptyStringSchema,
      requestId: NonEmptyStringSchema,
      requestedModels: z.array(ModelNameSchema).min(1),
      readyModels: z.array(ModelNameSchema).min(1),
      blockedReports: z.array(ModelReadinessReportSchema),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.GET_SESSION]: SessionSummarySchema.extend({
    turns: z.array(SessionTurnSchema),
    messages: z.array(SessionMessageSchema).optional(),
  }).strict(),
  [SUBSTRATE_ACTION_NAMES.LIST_SESSIONS]: z
    .object({
      sessions: z.array(SessionSummarySchema),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.EXPORT_COMPARE]: z
    .object({
      sessionId: NonEmptyStringSchema,
      turnId: NonEmptyStringSchema,
      format: CompareExportFormatSchema,
      content: z.string(),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE]: z
    .object({
      status: z.literal('success'),
      sessionId: NonEmptyStringSchema,
      turnId: NonEmptyStringSchema,
      provider: CompareAnalysisProviderIdSchema,
      analystModel: ModelNameSchema,
      result: CompareAnalysisResultSchema,
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW]: WorkflowRunSummarySchema.extend({
    input: OptionalJsonRecordSchema,
  }).strict(),
  [SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS]: z
    .object({
      runs: z.array(WorkflowRunSummarySchema),
    })
    .strict(),
  [SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN]: WorkflowRunSummarySchema.extend({
    steps: z.array(WorkflowStepResultSchema),
    output: OptionalJsonRecordSchema,
    waitingFor: NonEmptyStringSchema.optional(),
  }).strict(),
  [SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW]: WorkflowRunSummarySchema.extend({
    steps: z.array(WorkflowStepResultSchema),
    output: OptionalJsonRecordSchema,
    waitingFor: NonEmptyStringSchema.optional(),
  }).strict(),
} as const;

export type SubstrateActionArgsMap = {
  [K in keyof typeof SubstrateActionArgSchemas]: z.infer<(typeof SubstrateActionArgSchemas)[K]>;
};

export type SubstrateActionSuccessPayloadMap = {
  [K in keyof typeof SubstrateActionSuccessSchemas]: z.infer<
    (typeof SubstrateActionSuccessSchemas)[K]
  >;
};

const CommandEnvelopeBaseSchema = z
  .object({
    substrate: z.literal(PROMPT_SWITCHBOARD_API_SUBSTRATE),
    version: z.literal(PROMPT_SWITCHBOARD_API_VERSION),
    id: NonEmptyStringSchema,
  })
  .strict();

const ResultEnvelopeBaseSchema = z
  .object({
    substrate: z.literal(PROMPT_SWITCHBOARD_API_SUBSTRATE),
    version: z.literal(PROMPT_SWITCHBOARD_API_VERSION),
    id: NonEmptyStringSchema,
    ok: z.boolean(),
  })
  .strict();

export const SubstrateApiCommandEnvelopeSchema = z.discriminatedUnion('action', [
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.CHECK_READINESS),
    args: SubstrateActionArgSchemas.check_readiness,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS),
    args: SubstrateActionArgSchemas.open_model_tabs,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.COMPARE),
    args: SubstrateActionArgSchemas.compare,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.RETRY_FAILED),
    args: SubstrateActionArgSchemas.retry_failed,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.GET_SESSION),
    args: SubstrateActionArgSchemas.get_session,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.LIST_SESSIONS),
    args: SubstrateActionArgSchemas.list_sessions,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.EXPORT_COMPARE),
    args: SubstrateActionArgSchemas.export_compare,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE),
    args: SubstrateActionArgSchemas.analyze_compare,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW),
    args: SubstrateActionArgSchemas.run_workflow,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS),
    args: SubstrateActionArgSchemas.list_workflow_runs,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN),
    args: SubstrateActionArgSchemas.get_workflow_run,
  }).strict(),
  CommandEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW),
    args: SubstrateActionArgSchemas.resume_workflow,
  }).strict(),
]);

export const SubstrateApiSuccessEnvelopeSchema = z.discriminatedUnion('action', [
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.CHECK_READINESS),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.check_readiness,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.open_model_tabs,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.COMPARE),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.compare,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.RETRY_FAILED),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.retry_failed,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.GET_SESSION),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.get_session,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.LIST_SESSIONS),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.list_sessions,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.EXPORT_COMPARE),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.export_compare,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.analyze_compare,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.run_workflow,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.list_workflow_runs,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.get_workflow_run,
  }).strict(),
  ResultEnvelopeBaseSchema.extend({
    action: z.literal(SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW),
    ok: z.literal(true),
    result: SubstrateActionSuccessSchemas.resume_workflow,
  }).strict(),
]);

export const SubstrateApiFailureEnvelopeSchema = ResultEnvelopeBaseSchema.extend({
  action: z.enum([
    SUBSTRATE_ACTION_NAMES.CHECK_READINESS,
    SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS,
    SUBSTRATE_ACTION_NAMES.COMPARE,
    SUBSTRATE_ACTION_NAMES.RETRY_FAILED,
    SUBSTRATE_ACTION_NAMES.GET_SESSION,
    SUBSTRATE_ACTION_NAMES.LIST_SESSIONS,
    SUBSTRATE_ACTION_NAMES.EXPORT_COMPARE,
    SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE,
    SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW,
    SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS,
    SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN,
    SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW,
  ]),
  ok: z.literal(false),
  error: SubstrateApiErrorSchema,
}).strict();

export const SubstrateApiResultEnvelopeSchema = z.union([
  SubstrateApiSuccessEnvelopeSchema,
  SubstrateApiFailureEnvelopeSchema,
]);

export type SubstrateApiVersion = typeof PROMPT_SWITCHBOARD_API_VERSION;
export type SubstrateApiCommandEnvelope = z.infer<typeof SubstrateApiCommandEnvelopeSchema>;
export type SubstrateApiSuccessEnvelope = z.infer<typeof SubstrateApiSuccessEnvelopeSchema>;
export type SubstrateApiFailureEnvelope = z.infer<typeof SubstrateApiFailureEnvelopeSchema>;
export type SubstrateApiResultEnvelope = z.infer<typeof SubstrateApiResultEnvelopeSchema>;

type CommandLike<TAction extends SubstrateActionName> = {
  substrate?: typeof PROMPT_SWITCHBOARD_API_SUBSTRATE;
  version?: SubstrateApiVersion;
  id: string;
  action: TAction;
};

export const parseSubstrateApiCommand = (input: unknown): SubstrateApiCommandEnvelope =>
  SubstrateApiCommandEnvelopeSchema.parse(input);

export const safeParseSubstrateApiCommand = (input: unknown) =>
  SubstrateApiCommandEnvelopeSchema.safeParse(input);

export const parseSubstrateApiResult = (input: unknown): SubstrateApiResultEnvelope =>
  SubstrateApiResultEnvelopeSchema.parse(input);

export const safeParseSubstrateApiResult = (input: unknown) =>
  SubstrateApiResultEnvelopeSchema.safeParse(input);

export const createSubstrateApiSuccess = <TAction extends SubstrateActionName>(
  command: CommandLike<TAction>,
  result: SubstrateActionSuccessPayloadMap[TAction]
) =>
  SubstrateApiSuccessEnvelopeSchema.parse({
    substrate: command.substrate ?? PROMPT_SWITCHBOARD_API_SUBSTRATE,
    version: command.version ?? PROMPT_SWITCHBOARD_API_VERSION,
    id: command.id,
    action: command.action,
    ok: true,
    result,
  }) as Extract<SubstrateApiSuccessEnvelope, { action: TAction }>;

export const createSubstrateApiFailure = <TAction extends SubstrateActionName>(
  command: CommandLike<TAction>,
  error: SubstrateApiError
) =>
  SubstrateApiFailureEnvelopeSchema.parse({
    substrate: command.substrate ?? PROMPT_SWITCHBOARD_API_SUBSTRATE,
    version: command.version ?? PROMPT_SWITCHBOARD_API_VERSION,
    id: command.id,
    action: command.action,
    ok: false,
    error,
  });

export const isSubstrateApiSuccess = (
  envelope: SubstrateApiResultEnvelope
): envelope is SubstrateApiSuccessEnvelope => envelope.ok;

export const isSubstrateApiFailure = (
  envelope: SubstrateApiResultEnvelope
): envelope is SubstrateApiFailureEnvelope => !envelope.ok;

type CompatibleActionSuccess<TAction extends SubstrateActionName> = {
  version: SubstrateApiVersion;
  action: TAction;
  ok: true;
  data: SubstrateActionSuccessPayloadMap[TAction];
};

type CompatibleActionFailure<TAction extends SubstrateActionName> = {
  version: SubstrateApiVersion;
  action: TAction;
  ok: false;
  error: SubstrateApiError;
};

export type SubstrateActionOutcome<TAction extends SubstrateActionName = SubstrateActionName> =
  | CompatibleActionSuccess<TAction>
  | CompatibleActionFailure<TAction>;

const createCompatibleSuccessSchema = <TAction extends SubstrateActionName>(
  action: TAction,
  schema: (typeof SubstrateActionSuccessSchemas)[TAction]
) =>
  z
    .object({
      version: z.literal(PROMPT_SWITCHBOARD_API_VERSION),
      action: z.literal(action),
      ok: z.literal(true),
      data: schema,
    })
    .strict();

const createCompatibleFailureSchema = <TAction extends SubstrateActionName>(action: TAction) =>
  z
    .object({
      version: z.literal(PROMPT_SWITCHBOARD_API_VERSION),
      action: z.literal(action),
      ok: z.literal(false),
      error: SubstrateApiErrorSchema,
    })
    .strict();

export const SubstrateActionOutcomeSchemas = {
  [SUBSTRATE_ACTION_NAMES.CHECK_READINESS]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.CHECK_READINESS,
      SubstrateActionSuccessSchemas.check_readiness
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.CHECK_READINESS),
  ]),
  [SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS,
      SubstrateActionSuccessSchemas.open_model_tabs
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.OPEN_MODEL_TABS),
  ]),
  [SUBSTRATE_ACTION_NAMES.COMPARE]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.COMPARE,
      SubstrateActionSuccessSchemas.compare
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.COMPARE),
  ]),
  [SUBSTRATE_ACTION_NAMES.RETRY_FAILED]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.RETRY_FAILED,
      SubstrateActionSuccessSchemas.retry_failed
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.RETRY_FAILED),
  ]),
  [SUBSTRATE_ACTION_NAMES.GET_SESSION]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.GET_SESSION,
      SubstrateActionSuccessSchemas.get_session
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.GET_SESSION),
  ]),
  [SUBSTRATE_ACTION_NAMES.LIST_SESSIONS]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.LIST_SESSIONS,
      SubstrateActionSuccessSchemas.list_sessions
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.LIST_SESSIONS),
  ]),
  [SUBSTRATE_ACTION_NAMES.EXPORT_COMPARE]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.EXPORT_COMPARE,
      SubstrateActionSuccessSchemas.export_compare
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.EXPORT_COMPARE),
  ]),
  [SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE,
      SubstrateActionSuccessSchemas.analyze_compare
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.ANALYZE_COMPARE),
  ]),
  [SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW,
      SubstrateActionSuccessSchemas.run_workflow
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.RUN_WORKFLOW),
  ]),
  [SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS,
      SubstrateActionSuccessSchemas.list_workflow_runs
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.LIST_WORKFLOW_RUNS),
  ]),
  [SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN,
      SubstrateActionSuccessSchemas.get_workflow_run
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.GET_WORKFLOW_RUN),
  ]),
  [SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW]: z.union([
    createCompatibleSuccessSchema(
      SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW,
      SubstrateActionSuccessSchemas.resume_workflow
    ),
    createCompatibleFailureSchema(SUBSTRATE_ACTION_NAMES.RESUME_WORKFLOW),
  ]),
} as const;

export const createSubstrateSuccess = <TAction extends SubstrateActionName>(
  action: TAction,
  data: SubstrateActionSuccessPayloadMap[TAction]
) =>
  SubstrateActionOutcomeSchemas[action].parse({
    version: PROMPT_SWITCHBOARD_API_VERSION,
    action,
    ok: true,
    data,
  }) as Extract<SubstrateActionOutcome<TAction>, { ok: true }>;

export const createSubstrateError = <TAction extends SubstrateActionName>(
  action: TAction,
  error: SubstrateApiError
) =>
  SubstrateActionOutcomeSchemas[action].parse({
    version: PROMPT_SWITCHBOARD_API_VERSION,
    action,
    ok: false,
    error,
  }) as Extract<SubstrateActionOutcome<TAction>, { ok: false }>;
