import { Scraper } from './base';
import { waitForElement, simulateInput } from '../utils/dom';
import { SelectorService, type ScraperSelectors } from '../../services/selectorService';
import { Logger } from '../../utils/logger';

const SCRAPER_MODEL = 'Qwen' as const;

export class QwenScraper implements Scraper {
  private selectors: ScraperSelectors | null = null;

  async init(): Promise<void> {
    this.selectors = await SelectorService.getSelectors('Qwen');
  }

  async fillInput(text: string): Promise<void> {
    if (!this.selectors) await this.init();
    const inputSelector = this.selectors?.input || 'textarea#chat-input';
    const input = (await waitForElement(inputSelector)) as HTMLTextAreaElement;

    await new Promise((resolve) => setTimeout(resolve, 1000));

    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Retry logic
    for (let attempt = 0; attempt < 3; attempt++) {
      simulateInput(input, text);
      await new Promise((resolve) => setTimeout(resolve, 500));

      if (input.value.trim().length > 0) {
        break;
      }
      Logger.warn('scraper_fill_input_retry', {
        surface: 'content',
        model: SCRAPER_MODEL,
        code: 'scraper_fill_input_retry',
        attempt: attempt + 1,
        inputSelector,
      });
    }
  }

  async clickSend(): Promise<void> {
    if (!this.selectors) await this.init();

    // Try to find the button using multiple strategies
    const submitSelector = this.selectors?.submit || 'button#send-message-button';
    let sendButton: HTMLElement | null = null;

    try {
      sendButton = (await waitForElement(submitSelector, 5000)) as HTMLElement;
    } catch {
      // Fallback: look for button inside the form
      const form = document.querySelector('form.flex.w-full');
      if (form) {
        sendButton = form.querySelector('button[type="submit"]') as HTMLElement;
      }
    }

    if (!sendButton) {
      Logger.error('scraper_submit_button_missing', {
        surface: 'content',
        model: SCRAPER_MODEL,
        code: 'scraper_submit_button_missing',
        submitSelector,
      });
      throw new Error('Send button not found');
    }

    Logger.debug('scraper_submit_started', {
      surface: 'content',
      model: SCRAPER_MODEL,
      code: 'scraper_submit_started',
      submitSelector,
    });
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Wait for button to be enabled
    await new Promise<void>((resolve) => {
      let checks = 0;
      const checkEnabled = () => {
        checks++;
        if (!sendButton!.hasAttribute('disabled') || checks > 50) {
          // 5s timeout
          resolve();
        } else {
          setTimeout(checkEnabled, 100);
        }
      };
      checkEnabled();
    });

    sendButton.click();
  }

  observeResponse(
    onData: (text: string, isComplete: boolean, modelVersion?: string) => void
  ): () => void {
    let isActive = true;
    let observer: MutationObserver | null = null;

    const start = () => {
      if (!isActive) return;

      let lastText = '';
      let sentCount = 0;
      Logger.debug('scraper_observer_started', {
        surface: 'content',
        model: SCRAPER_MODEL,
        code: 'scraper_observer_started',
        messageSelector: this.selectors?.message || '.markdown-content-container',
      });

      observer = new MutationObserver(() => {
        // Get all markdown containers (there could be multiple messages)
        const messageSelector = this.selectors?.message || '.markdown-content-container';
        const allContainers = document.querySelectorAll(messageSelector);

        if (allContainers.length > 0) {
          // Get the last container (most recent message)
          const lastContainer = allContainers[allContainers.length - 1] as HTMLElement;
          const text = lastContainer.innerText?.trim() || '';

          if (text && text.length > 0 && text !== lastText) {
            lastText = text;
            sentCount++;

            // Check if still generating
            const stopButtonSelector =
              this.selectors?.stop || 'button[aria-label*="Stop"], button[aria-label*="停止"]';
            const isGenerating = !!document.querySelector(stopButtonSelector);

            // Get model version from message title
            let modelVersion: string | undefined;
            const modelTitleEl = document.querySelectorAll('.inline-flex.message-title');
            if (modelTitleEl.length > 0) {
              const lastTitle = modelTitleEl[modelTitleEl.length - 1] as HTMLElement;
              modelVersion = lastTitle.innerText.trim();
            }

            if (!modelVersion) {
              modelVersion = 'Qwen';
            }

            Logger.debug('scraper_response_update', {
              surface: 'content',
              model: SCRAPER_MODEL,
              code: 'scraper_response_update',
              responseCount: sentCount,
              messageLength: text.length,
              isGenerating,
              modelVersion,
            });
            onData(text, !isGenerating, modelVersion);
          }
        }
      });

      observer.observe(document.body, {
        childList: true,
        subtree: true,
        characterData: true,
      });
    };

    if (!this.selectors) {
      this.init().then(start);
    } else {
      start();
    }

    return () => {
      isActive = false;
      observer?.disconnect();
    };
  }
}
