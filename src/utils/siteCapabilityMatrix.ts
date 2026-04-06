import { MODEL_CONFIGS, type ModelConfig } from './modelConfig.js';
import type { ModelName } from './types.js';

export interface SiteCapabilityProfile {
  model: ModelName;
  routing: Pick<ModelConfig, 'openUrl' | 'hostnames'>;
  promptSurfaceSelectors: string[];
  responseSelectors: string[];
  stopSelectors: string[];
  loginSignalPatternSource: string;
  inputSurface: 'contenteditable' | 'textarea' | 'mixed';
  compareExecution: {
    transport: 'dom_send_button';
    observation: 'mutation_observer';
    completionHeuristic: 'stop_button_absent_or_hidden';
  };
  modelVersionSignal?: string;
  stableSelectors: string[];
  fragileSelectors: string[];
  privateApiBoundary: {
    observedClass: 'dom_primary_private_api_observe_only';
    writeAllowed: false;
    note: string;
  };
}

const DEFAULT_LOGIN_SIGNAL_PATTERN =
  /(?:登录|免费注册|注册|log in|login|sign in|sign up|get started|continue with)/i;

export const SITE_CAPABILITY_MATRIX: Record<ModelName, SiteCapabilityProfile> = {
  ChatGPT: {
    model: 'ChatGPT',
    routing: MODEL_CONFIGS.ChatGPT,
    promptSurfaceSelectors: ['#prompt-textarea', 'textarea', '[contenteditable="true"]'],
    responseSelectors: ['div[data-message-author-role="assistant"]'],
    stopSelectors: ['button[aria-label="Stop generating"]'],
    loginSignalPatternSource: DEFAULT_LOGIN_SIGNAL_PATTERN.source,
    inputSurface: 'contenteditable',
    compareExecution: {
      transport: 'dom_send_button',
      observation: 'mutation_observer',
      completionHeuristic: 'stop_button_absent_or_hidden',
    },
    stableSelectors: [
      '#prompt-textarea',
      '[data-testid="send-button"]',
      'button.composer-submit-button-color',
    ],
    fragileSelectors: ['textarea', '[contenteditable="true"]'],
    privateApiBoundary: {
      observedClass: 'dom_primary_private_api_observe_only',
      writeAllowed: false,
      note:
        'Current repo-owned execution stays on DOM input + send controls. Any private API observation is diagnostics-only and must not become silent account writes.',
    },
  },
  Gemini: {
    model: 'Gemini',
    routing: MODEL_CONFIGS.Gemini,
    promptSurfaceSelectors: ['div.ql-editor.textarea', 'textarea', '[contenteditable="true"]'],
    responseSelectors: ['.model-response-text'],
    stopSelectors: ['button[aria-label*="Stop"]', 'button[aria-label="Stop generating"]'],
    loginSignalPatternSource: DEFAULT_LOGIN_SIGNAL_PATTERN.source,
    inputSurface: 'contenteditable',
    compareExecution: {
      transport: 'dom_send_button',
      observation: 'mutation_observer',
      completionHeuristic: 'stop_button_absent_or_hidden',
    },
    stableSelectors: ['div.ql-editor.textarea', '.model-response-text'],
    fragileSelectors: ['textarea', '[contenteditable="true"]'],
    privateApiBoundary: {
      observedClass: 'dom_primary_private_api_observe_only',
      writeAllowed: false,
      note:
        'Current repo-owned path is DOM-first. Runtime-backed analysis belongs in Switchyard, not in direct browser-side API writes from this extension.',
    },
  },
  Perplexity: {
    model: 'Perplexity',
    routing: MODEL_CONFIGS.Perplexity,
    promptSurfaceSelectors: ['#ask-input', 'textarea', 'div[contenteditable="true"]'],
    responseSelectors: ['.prose'],
    stopSelectors: ['button[aria-label="Stop"]', 'button[aria-label="Stop generating"]'],
    loginSignalPatternSource: DEFAULT_LOGIN_SIGNAL_PATTERN.source,
    inputSurface: 'mixed',
    compareExecution: {
      transport: 'dom_send_button',
      observation: 'mutation_observer',
      completionHeuristic: 'stop_button_absent_or_hidden',
    },
    modelVersionSignal: 'button[aria-label="选择模型"], button[aria-label="Select Model"]',
    stableSelectors: ['#ask-input', '.prose'],
    fragileSelectors: ['textarea', 'div[contenteditable="true"]'],
    privateApiBoundary: {
      observedClass: 'dom_primary_private_api_observe_only',
      writeAllowed: false,
      note:
        'Repo evidence currently observes streaming through DOM mutation only. Any private request analysis must stay read-only and support compare diagnostics rather than direct writes.',
    },
  },
  Qwen: {
    model: 'Qwen',
    routing: MODEL_CONFIGS.Qwen,
    promptSurfaceSelectors: [
      'textarea#chat-input',
      'textarea[placeholder*="帮您"]',
      'textarea[placeholder*="help"]',
      'textarea',
      '[contenteditable="true"]',
    ],
    responseSelectors: ['.markdown-content-container', '.chat-message-content'],
    stopSelectors: ['button[aria-label*="Stop"]', 'button[aria-label*="停止"]'],
    loginSignalPatternSource: DEFAULT_LOGIN_SIGNAL_PATTERN.source,
    inputSurface: 'textarea',
    compareExecution: {
      transport: 'dom_send_button',
      observation: 'mutation_observer',
      completionHeuristic: 'stop_button_absent_or_hidden',
    },
    modelVersionSignal: '.inline-flex.message-title',
    stableSelectors: ['textarea#chat-input', '.markdown-content-container'],
    fragileSelectors: ['.chat-message-content', '[contenteditable="true"]'],
    privateApiBoundary: {
      observedClass: 'dom_primary_private_api_observe_only',
      writeAllowed: false,
      note:
        'Repo-owned Qwen flow is DOM-send plus observed message-title metadata. Private APIs may exist, but current truthful capability remains browser-DOM driven.',
    },
  },
  Grok: {
    model: 'Grok',
    routing: MODEL_CONFIGS.Grok,
    promptSurfaceSelectors: ['div.tiptap.ProseMirror[contenteditable="true"]', 'textarea', '[contenteditable="true"]'],
    responseSelectors: ['.message-bubble', '.response-content-markdown'],
    stopSelectors: ['button[aria-label*="Stop"]', 'button[aria-label*="停止"]'],
    loginSignalPatternSource: DEFAULT_LOGIN_SIGNAL_PATTERN.source,
    inputSurface: 'contenteditable',
    compareExecution: {
      transport: 'dom_send_button',
      observation: 'mutation_observer',
      completionHeuristic: 'stop_button_absent_or_hidden',
    },
    modelVersionSignal: '#model-select-trigger span',
    stableSelectors: ['div.tiptap.ProseMirror[contenteditable="true"]'],
    fragileSelectors: ['.message-bubble', '.response-content-markdown'],
    privateApiBoundary: {
      observedClass: 'dom_primary_private_api_observe_only',
      writeAllowed: false,
      note:
        'Current repo evidence uses DOM alignment and message bubbles, not private x.ai request writes. Keep any deeper API recon read-only unless separately authorized.',
    },
  },
};

export const getSiteCapability = (model: ModelName): SiteCapabilityProfile =>
  SITE_CAPABILITY_MATRIX[model];
