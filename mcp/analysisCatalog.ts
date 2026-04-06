import { MCP_MODEL_CATALOG } from './modelCatalog.js';

const MODEL_ORDER = Object.keys(MCP_MODEL_CATALOG);
const SWITCHYARD_RUNTIME_BASE_URL = 'http://127.0.0.1:4317';
const SWITCHYARD_RUNTIME_MODEL_MAP = {
  ChatGPT: {
    invokeRoute: 'web',
    provider: 'chatgpt',
    model: 'gpt-4o',
  },
  Gemini: {
    invokeRoute: 'byok',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
  },
  Qwen: {
    invokeRoute: 'web',
    provider: 'qwen',
    model: 'qwen3.5-plus',
  },
  Grok: {
    invokeRoute: 'web',
    provider: 'grok',
    model: 'grok-3',
  },
} as const;

export const MCP_ANALYSIS_PROVIDER_CATALOG = {
  surface: 'analysis_provider_catalog',
  trustBoundary:
    'Prompt Switchboard keeps compare, tabs, readiness, and workflow orchestration in the browser. Analysis lanes only describe how the extra analyst prompt executes.',
  providers: [
    {
      id: 'browser_session',
      label: 'Browser session',
      description: 'Run one analysis prompt through a supported tab you already keep signed in.',
      executionSurface: 'browser_tab',
      availableInBrowserBuild: true,
      availabilityReason: null,
      publicClaimClass: 'supported_now',
    },
    {
      id: 'switchyard_runtime',
      label: 'Local Switchyard runtime',
      description:
        'Route one analysis prompt through a local Switchyard service without letting Switchyard take over Prompt Switchboard tab orchestration.',
      executionSurface: 'future_runtime',
      availableInBrowserBuild: true,
      availabilityReason:
        'Requires a local Switchyard service on http://127.0.0.1:4317 plus a compatible runtime-backed provider session.',
      publicClaimClass:
        'maintainer_local_partial',
    },
  ],
  browserSession: {
    id: 'browser_session',
    supportedModels: MODEL_ORDER,
    executionSurface: 'browser_tab',
  },
  switchyardRuntime: {
    id: 'switchyard_runtime',
    executionSurface: 'future_runtime',
    defaultBaseUrl: SWITCHYARD_RUNTIME_BASE_URL,
    supportedModels: Object.keys(SWITCHYARD_RUNTIME_MODEL_MAP),
    unsupportedModels: MODEL_ORDER.filter((model) => !(model in SWITCHYARD_RUNTIME_MODEL_MAP)),
    targetMappings: SWITCHYARD_RUNTIME_MODEL_MAP,
    note:
      'This lane is analyst-only, maintainer-local, and partial. It does not replace browser-tab compare or tab orchestration.',
  },
} as const;
