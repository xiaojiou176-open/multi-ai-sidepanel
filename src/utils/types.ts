export type ModelName = 'ChatGPT' | 'Gemini' | 'Perplexity' | 'Qwen' | 'Grok';

export const MESSAGE_ROLES = {
  USER: 'user',
  ASSISTANT: 'assistant',
  SYSTEM: 'system',
} as const;

export type MessageRole = (typeof MESSAGE_ROLES)[keyof typeof MESSAGE_ROLES];

export interface MessagePayload {
  type: string;
  payload?: unknown;
}

export const MSG_TYPES = {
  BROADCAST_PROMPT: 'BROADCAST_PROMPT',
  CHECK_MODELS_READY: 'CHECK_MODELS_READY',
  EXECUTE_SUBSTRATE_ACTION: 'EXECUTE_SUBSTRATE_ACTION',
  EXECUTE_PROMPT: 'EXECUTE_PROMPT',
  RUN_COMPARE_ANALYSIS: 'RUN_COMPARE_ANALYSIS',
  EXECUTE_COMPARE_ANALYSIS: 'EXECUTE_COMPARE_ANALYSIS',
  ANALYSIS_RESPONSE: 'ANALYSIS_RESPONSE',
  ON_ANALYSIS_UPDATE: 'ON_ANALYSIS_UPDATE',
  GET_BUFFERED_UPDATES: 'GET_BUFFERED_UPDATES',
  STREAM_RESPONSE: 'STREAM_RESPONSE',
  ON_RESPONSE_UPDATE: 'ON_RESPONSE_UPDATE',
  PING: 'PING',
  PONG: 'PONG',
} as const;

export const SEND_ERROR_CODES = {
  TIMEOUT: 'timeout',
  RUNTIME: 'runtime_error',
  HANDSHAKE: 'content_not_ready',
  REJECTED: 'rejected',
} as const;

export type SendErrorCode = (typeof SEND_ERROR_CODES)[keyof typeof SEND_ERROR_CODES];

export const FAILURE_CLASSES = {
  HANDSHAKE_MISMATCH: 'handshake_mismatch',
  SELECTOR_DRIFT_SUSPECT: 'selector_drift_suspect',
  TRANSIENT_DELIVERY_OR_RUNTIME: 'transient_delivery_or_runtime',
  TAB_UNAVAILABLE: 'tab_unavailable',
} as const;

export type FailureClass = (typeof FAILURE_CLASSES)[keyof typeof FAILURE_CLASSES];

export const SELECTOR_SOURCES = {
  DEFAULT: 'default',
  CACHED: 'cached',
} as const;

export type SelectorSource = (typeof SELECTOR_SOURCES)[keyof typeof SELECTOR_SOURCES];

export const READINESS_STATUSES = {
  READY: 'ready',
  TAB_MISSING: 'tab_missing',
  TAB_LOADING: 'tab_loading',
  CONTENT_UNAVAILABLE: 'content_unavailable',
  MODEL_MISMATCH: 'model_mismatch',
  SELECTOR_DRIFT_SUSPECT: 'selector_drift_suspect',
} as const;

export type ReadinessStatus = (typeof READINESS_STATUSES)[keyof typeof READINESS_STATUSES];

export interface DeliveryDiagnostics {
  stage?: string;
  hostname?: string;
  selectorSource?: SelectorSource;
  remoteConfigConfigured?: boolean;
  failureClass?: FailureClass;
  readinessStatus?: ReadinessStatus;
  inputReady?: boolean;
  submitReady?: boolean;
  lastCheckedAt?: number;
}

export const DELIVERY_STATUS = {
  PENDING: 'pending',
  STREAMING: 'streaming',
  COMPLETE: 'complete',
  ERROR: 'error',
} as const;

export type DeliveryStatus = (typeof DELIVERY_STATUS)[keyof typeof DELIVERY_STATUS];

export interface BroadcastPromptPayload {
  prompt: string;
  models: ModelName[];
  sessionId?: string;
  requestId: string;
  turnId: string;
}

export interface PingPayload {
  expectedModel?: ModelName;
}

export interface PongPayload {
  ready: boolean;
  model: ModelName;
  hostname: string;
  selectorSource: SelectorSource;
  remoteConfigConfigured: boolean;
  failureClass?: FailureClass;
  readinessStatus: ReadinessStatus;
  inputReady: boolean;
  submitReady: boolean;
  lastCheckedAt: number;
}

export interface CheckModelsReadyPayload {
  models: ModelName[];
}

export interface ModelReadinessReport {
  model: ModelName;
  ready: boolean;
  status: ReadinessStatus;
  tabId?: number | null;
  hostname?: string;
  selectorSource?: SelectorSource;
  remoteConfigConfigured: boolean;
  failureClass?: FailureClass;
  inputReady?: boolean;
  submitReady?: boolean;
  lastCheckedAt: number;
}

export interface ExecutePromptPayload {
  prompt: string;
  sessionId?: string;
  requestId: string;
  turnId: string;
  model: ModelName;
}

export interface RunCompareAnalysisPayload {
  prompt: string;
  turnId: string;
  analysisRequestId: string;
  model: ModelName;
}

export type ExecuteCompareAnalysisPayload = RunCompareAnalysisPayload;

export interface CompareAnalysisResponsePayload {
  ok: boolean;
  text?: string;
  errorMessage?: string;
  errorCode?: SendErrorCode;
  model: ModelName;
  turnId: string;
  analysisRequestId: string;
  completedAt: number;
  data?: DeliveryDiagnostics;
}

export interface StreamResponsePayload {
  model: ModelName;
  requestId?: string;
  turnId?: string;
  text: string;
  isComplete?: boolean;
  deliveryStatus?: DeliveryStatus;
  errorCode?: SendErrorCode;
  completedAt?: number;
  data?: DeliveryDiagnostics;
}

export interface Message {
  id: string;
  role: MessageRole;
  text: string;
  model?: ModelName;
  timestamp: number;
  turnId?: string;
  requestId?: string;
  requestedModels?: ModelName[];
  isStreaming?: boolean;
  deliveryStatus?: DeliveryStatus;
  deliveryErrorCode?: SendErrorCode;
  completedAt?: number;
  data?: DeliveryDiagnostics;
}

export interface Session {
  id: string;
  title: string;
  messages: Message[];
  updatedAt: number;
  createdAt: number;
  selectedModels: ModelName[];
}
