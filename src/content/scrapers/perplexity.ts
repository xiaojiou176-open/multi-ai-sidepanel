import { Scraper } from './base';
import { waitForElement, simulateInput, simulatePasteInput } from '../utils/dom';
import { SelectorService, type ScraperSelectors } from '../../services/selectorService';
import { Logger } from '../../utils/logger';

const SCRAPER_MODEL = 'Perplexity' as const;

export class PerplexityScraper implements Scraper {
  private selectors: ScraperSelectors | null = null;

  async init(): Promise<void> {
    this.selectors = await SelectorService.getSelectors('Perplexity');
  }

  async fillInput(text: string): Promise<void> {
    if (!this.selectors) await this.init();
    const inputSelector =
      this.selectors?.input || '#ask-input, textarea, div[contenteditable="true"]';
    const input = (await waitForElement(inputSelector)) as HTMLElement;
    Logger.debug('scraper_fill_input_started', {
      surface: 'content',
      model: SCRAPER_MODEL,
      code: 'scraper_fill_input_started',
      textLength: text.length,
      inputSelector,
      isContentEditable: input.isContentEditable,
    });

    // Retry logic to ensure input is accepted
    for (let attempt = 0; attempt < 3; attempt++) {
      if (input.isContentEditable) {
        simulatePasteInput(input, text);
      } else {
        simulateInput(input as HTMLTextAreaElement, text);
      }

      // Wait for editor to process input
      await new Promise((resolve) => setTimeout(resolve, 300));

      const currentContent = input.innerText || (input as HTMLTextAreaElement).value || '';
      if (currentContent.trim().length > 0) {
        Logger.debug('scraper_fill_input_succeeded', {
          surface: 'content',
          model: SCRAPER_MODEL,
          code: 'scraper_fill_input_succeeded',
          attempt: attempt + 1,
          contentLength: currentContent.trim().length,
        });
        break;
      }
      Logger.warn('scraper_fill_input_retry', {
        surface: 'content',
        model: SCRAPER_MODEL,
        code: 'scraper_fill_input_retry',
        attempt: attempt + 1,
        inputSelector,
      });

      // If failed, try to focus again explicitly
      input.focus();
      input.click();
    }
  }

  async clickSend(): Promise<void> {
    if (!this.selectors) await this.init();
    const submitSelector = this.selectors?.submit || 'button[aria-label="Submit"]';
    const sendButton = (await waitForElement(submitSelector)) as HTMLButtonElement;

    // Ensure button is enabled
    // Ensure button is enabled
    if (sendButton.disabled) {
      await new Promise<void>((resolve) => {
        let checks = 0;
        const check = () => {
          checks++;
          if (!sendButton.disabled) {
            resolve();
          } else if (checks > 50) {
            // 5s timeout
            Logger.warn('scraper_submit_wait_timeout', {
              surface: 'content',
              model: SCRAPER_MODEL,
              code: 'scraper_submit_wait_timeout',
              submitSelector,
              timeoutMs: 5000,
            });
            resolve(); // Try clicking anyway, or we could reject
          } else {
            setTimeout(check, 100);
          }
        };
        check();
      });
    }

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
        messageSelector: this.selectors?.message || '.prose',
      });

      observer = new MutationObserver(() => {
        const messageSelector = this.selectors?.message || '.prose';
        const proses = document.querySelectorAll(messageSelector);

        if (proses.length > 0) {
          const lastProse = proses[proses.length - 1] as HTMLElement;
          const text = lastProse.innerText?.trim() || '';

          if (text && text.length > 0 && text !== lastText) {
            lastText = text;
            sentCount++;

            // Check if generating by looking for stop button or loading indicators
            const stopSelector =
              this.selectors?.stop || 'button[aria-label="Stop"], button[aria-label="Stop generating"]';
            const isGenerating = !!document.querySelector(stopSelector);

            // Try to find model version
            let modelVersion: string | undefined;
            const modelButton = document.querySelector(
              'button[aria-label="选择模型"], button[aria-label="Select Model"]'
            );
            if (modelButton) {
              // Try to get text from within the button or nearby
              modelVersion = modelButton.textContent?.trim();
            }

            Logger.debug('scraper_response_update', {
              surface: 'content',
              model: SCRAPER_MODEL,
              code: 'scraper_response_update',
              messageLength: text.length,
              responseCount: sentCount,
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
