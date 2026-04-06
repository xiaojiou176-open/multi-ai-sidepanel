import { Scraper } from './base';
import { waitForElement, simulateContentEditableInput } from '../utils/dom';
import { SelectorService, type ScraperSelectors } from '../../services/selectorService';
import { Logger } from '../../utils/logger';

const SCRAPER_MODEL = 'Grok' as const;

export class GrokScraper implements Scraper {
  private selectors: ScraperSelectors | null = null;

  async init(): Promise<void> {
    this.selectors = await SelectorService.getSelectors('Grok');
  }

  async fillInput(text: string): Promise<void> {
    if (!this.selectors) await this.init();
    const inputSelector = this.selectors?.input || 'div.tiptap.ProseMirror';
    const input = (await waitForElement(inputSelector)) as HTMLElement;

    // Retry logic
    for (let attempt = 0; attempt < 3; attempt++) {
      simulateContentEditableInput(input, text);
      await new Promise((resolve) => setTimeout(resolve, 500)); // Grok might be slower

      if (input.innerText.trim().length > 0) {
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

    const sendButtonSelector =
      this.selectors?.submit || 'button[aria-label="提交"], button[aria-label="Submit"]';
    const submitButton = (await waitForElement(sendButtonSelector)) as HTMLButtonElement;

    if (submitButton) {
      Logger.debug('scraper_submit_started', {
        surface: 'content',
        model: SCRAPER_MODEL,
        code: 'scraper_submit_started',
        submitSelector: sendButtonSelector,
      });

      // Wait for button to be enabled
      await new Promise<void>((resolve) => {
        const checkEnabled = () => {
          if (!submitButton.hasAttribute('disabled')) {
            resolve();
          } else {
            setTimeout(checkEnabled, 100);
          }
        };
        checkEnabled();
      });

      submitButton.click();
    } else {
      Logger.error('scraper_submit_button_missing', {
        surface: 'content',
        model: SCRAPER_MODEL,
        code: 'scraper_submit_button_missing',
        submitSelector: sendButtonSelector,
      });
    }
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
        messageSelector: this.selectors?.message || '.message-bubble',
      });

      observer = new MutationObserver(() => {
        const messageSelector = this.selectors?.message || '.message-bubble';
        const bubbles = document.querySelectorAll(messageSelector);

        // Filter for assistant messages
        // Assistant messages are usually left-aligned (items-start) or distinct from user messages (items-end)
        const assistantBubbles = Array.from(bubbles).filter((bubble) => {
          const container = bubble.closest('.group');
          if (!container) return false;
          // Check for alignment classes that indicate assistant (left-aligned) vs user (right-aligned)
          // User messages usually have 'items-end' in their container
          // Assistant messages usually have 'items-start'
          return container.classList.contains('items-start');
        });

        if (assistantBubbles.length > 0) {
          const lastBubble = assistantBubbles[assistantBubbles.length - 1] as HTMLElement;

          // Look for the markdown content inside the bubble
          const markdownContent =
            lastBubble.querySelector('.response-content-markdown') || lastBubble;
          const text = (markdownContent as HTMLElement).innerText.trim();

          if (text && text.length > 0 && text !== lastText && text !== 'Thinking...') {
            lastText = text;
            sentCount++;

            // Check if generating
            const stopButtonSelector =
              this.selectors?.stop || 'button[aria-label*="Stop"], button[aria-label*="停止"]';
            const isGenerating = !!document.querySelector(stopButtonSelector);

            // Model Detection
            let modelVersion = '';
            const modelSelector = document.querySelector('#model-select-trigger span');
            if (modelSelector) {
              modelVersion = modelSelector.textContent?.trim() || '';
            }

            if (!modelVersion) {
              modelVersion = 'Grok';
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
