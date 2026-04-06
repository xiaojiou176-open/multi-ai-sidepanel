import { StorageService } from './storage';
import {
  FAILURE_CLASSES,
  READINESS_STATUSES,
  SELECTOR_SOURCES,
  type FailureClass,
  type ModelName,
  type ReadinessStatus,
  type SelectorSource,
} from '../utils/types';
import { z } from 'zod';
import { Logger, toErrorMessage } from '../utils/logger';

export interface ScraperSelectors {
  input: string;
  submit: string;
  message: string;
  stop?: string;
  regenerate?: string;
}

export type SelectorConfig = Record<ModelName, ScraperSelectors>;

export interface SelectorDiagnostics {
  source: SelectorSource;
  remoteConfigConfigured: boolean;
  readinessStatus: ReadinessStatus;
  failureClass?: FailureClass;
  inputReady: boolean;
  submitReady: boolean;
  lastCheckedAt: number;
}

interface SelectorResolution {
  source: SelectorSource;
  remoteConfigConfigured: boolean;
  selectors: ScraperSelectors;
}

// ==================== Selector Config ====================
// Zod schema for validation
const ScraperSelectorsSchema = z.object({
  input: z.string().min(1),
  submit: z.string().min(1),
  message: z.string().min(1),
  stop: z.string().optional(),
  regenerate: z.string().optional(),
});

const SelectorConfigSchema = z.record(
  z.enum(['ChatGPT', 'Gemini', 'Perplexity', 'Qwen', 'Grok']),
  ScraperSelectorsSchema
);

const DEFAULT_SELECTORS: SelectorConfig = {
  ChatGPT: {
    input: '#prompt-textarea',
    submit:
      '[data-testid="send-button"], button.composer-submit-button-color, button[aria-label="启动语音功能"], button[aria-label="Start voice mode"]',
    message: 'div[data-message-author-role="assistant"]',
    stop: 'button[aria-label="Stop generating"]',
  },
  Gemini: {
    input: 'div.ql-editor.textarea',
    submit: 'button[aria-label="发送"], button[aria-label="Submit"]',
    message: '.model-response-text',
    stop: 'button[aria-label="Stop generating"]',
  },
  Perplexity: {
    input: 'textarea, div[contenteditable="true"]',
    submit: 'button[aria-label="Submit"], button[aria-label="发送"]',
    message: '.prose',
    stop: 'button[aria-label="Stop"], button[aria-label="Stop generating"]',
  },
  Grok: {
    input: 'div.tiptap.ProseMirror[contenteditable="true"]',
    submit:
      'button[aria-label="发送"], button[aria-label="Send"], button[aria-label="提交"], button[aria-label="Submit"]',
    message: '.message-bubble',
    stop: 'button[aria-label*="Stop"], button[aria-label*="停止"]',
  },
  Qwen: {
    input: 'textarea#chat-input, textarea[placeholder*="帮您"], textarea[placeholder*="help"]',
    submit: 'button.send-button, .chat-prompt-send-button button',
    message: '.markdown-content-container, .chat-message-content',
    stop: 'button[aria-label*="Stop"], button[aria-label*="停止"]',
  },
};

const REMOTE_CONFIG_URL = (import.meta.env.VITE_SELECTOR_CONFIG_URL as string | undefined) || '';
const SHOULD_FETCH_REMOTE_CONFIG =
  REMOTE_CONFIG_URL.length > 0 && !REMOTE_CONFIG_URL.includes('your-username');

export class SelectorService {
  static isRemoteConfigConfigured(): boolean {
    return SHOULD_FETCH_REMOTE_CONFIG;
  }

  private static inspectSelectorPresence(selectors: ScraperSelectors) {
    const inputReady = Boolean(document.querySelector(selectors.input));
    const submitReady = Boolean(document.querySelector(selectors.submit));

    return {
      inputReady,
      submitReady,
    };
  }

  private static async resolveSelectors(model: ModelName): Promise<SelectorResolution> {
    const cached = await StorageService.getSelectors();
    const cachedSelectors = cached?.[model] as ScraperSelectors | undefined;

    return {
      selectors: cachedSelectors || DEFAULT_SELECTORS[model],
      source: cachedSelectors ? SELECTOR_SOURCES.CACHED : SELECTOR_SOURCES.DEFAULT,
      remoteConfigConfigured: SHOULD_FETCH_REMOTE_CONFIG,
    };
  }

  static async getSelectors(model: ModelName): Promise<ScraperSelectors> {
    const { selectors } = await SelectorService.resolveSelectors(model);
    return selectors;
  }

  static async getSelectorDiagnostics(model: ModelName): Promise<SelectorDiagnostics> {
    const { source, remoteConfigConfigured, selectors } = await SelectorService.resolveSelectors(model);
    const { inputReady, submitReady } = SelectorService.inspectSelectorPresence(selectors);
    const lastCheckedAt = Date.now();

    // Treat missing submit controls as not-ready so we fail during readiness checks
    // instead of surfacing a later execution-time error after the user sends a prompt.
    if (!inputReady || !submitReady) {
      return {
        source,
        remoteConfigConfigured,
        readinessStatus: READINESS_STATUSES.SELECTOR_DRIFT_SUSPECT,
        failureClass: FAILURE_CLASSES.SELECTOR_DRIFT_SUSPECT,
        inputReady,
        submitReady,
        lastCheckedAt,
      };
    }

    return {
      source,
      remoteConfigConfigured,
      readinessStatus: READINESS_STATUSES.READY,
      inputReady,
      submitReady,
      lastCheckedAt,
    };
  }

  static async fetchAndCacheSelectors(): Promise<void> {
    try {
      if (!SHOULD_FETCH_REMOTE_CONFIG) return;

      const response = await fetch(REMOTE_CONFIG_URL);
      if (!response.ok) throw new Error('Failed to fetch selectors');

      const rawConfig = await response.json();

      // Validate with Zod schema
      const validationResult = SelectorConfigSchema.safeParse(rawConfig);
      if (!validationResult.success) {
        Logger.warn('selector_config_validation_failed', {
          surface: 'content',
          code: 'selector_config_validation_failed',
          error: validationResult.error.format(),
        });
        return;
      }

      await StorageService.saveSelectors(validationResult.data);
    } catch (error) {
      Logger.warn('selector_config_update_failed', {
        surface: 'content',
        code: 'selector_config_update_failed',
        error: toErrorMessage(error),
        remoteConfigUrl: REMOTE_CONFIG_URL,
      });
    }
  }
}
