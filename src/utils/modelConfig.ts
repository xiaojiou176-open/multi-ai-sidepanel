import type { ModelName } from './types.js';

// ==================== Model Config ====================

export interface ModelConfig {
  name: ModelName;
  label: string;
  openUrl: string;
  hostnames: string[];
}

export const MODEL_ORDER: ModelName[] = ['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok'];

export const MODEL_CONFIGS: Record<ModelName, ModelConfig> = {
  ChatGPT: {
    name: 'ChatGPT',
    label: 'ChatGPT',
    openUrl: 'https://chatgpt.com/',
    hostnames: ['chatgpt.com', 'chat.openai.com'],
  },
  Gemini: {
    name: 'Gemini',
    label: 'Gemini',
    openUrl: 'https://gemini.google.com/',
    hostnames: ['gemini.google.com'],
  },
  Perplexity: {
    name: 'Perplexity',
    label: 'Perplexity',
    openUrl: 'https://www.perplexity.ai/',
    hostnames: ['perplexity.ai'],
  },
  Qwen: {
    name: 'Qwen',
    label: 'Qwen',
    openUrl: 'https://chat.qwen.ai/',
    hostnames: ['qwen.ai'],
  },
  Grok: {
    name: 'Grok',
    label: 'Grok',
    openUrl: 'https://grok.com/',
    hostnames: ['grok.com', 'x.ai'],
  },
};

export const getModelConfig = (model: ModelName): ModelConfig => MODEL_CONFIGS[model];

export const getModelOpenUrls = (): string[] =>
  MODEL_ORDER.map((model) => MODEL_CONFIGS[model].openUrl);

export const isModelHostname = (hostname: string, model: ModelName): boolean => {
  const { hostnames } = MODEL_CONFIGS[model];
  return hostnames.some((host) => hostname === host || hostname.endsWith(`.${host}`));
};

const normalizeHostname = (value: string): string => {
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
};

export const findModelByHostname = (hostnameOrUrl: string): ModelName | null => {
  const hostname = normalizeHostname(hostnameOrUrl);
  const match = MODEL_ORDER.find((model) => isModelHostname(hostname, model));
  return match || null;
};
