import { Scraper } from './base';
import { waitForElement, simulateContentEditableInput } from '../utils/dom';
import { SelectorService, type ScraperSelectors } from '../../services/selectorService';
import { Logger } from '../../utils/logger';

const SCRAPER_MODEL = 'ChatGPT' as const;
const DEFAULT_CHATGPT_SUBMIT_SELECTOR =
  '[data-testid="send-button"], button.composer-submit-button-color, button[aria-label="启动语音功能"], button[aria-label="Start voice mode"]';

export class ChatGPTScraper implements Scraper {
  private selectors: ScraperSelectors | null = null;

  async init(): Promise<void> {
    this.selectors = await SelectorService.getSelectors('ChatGPT');
  }

  async fillInput(text: string): Promise<void> {
    if (!this.selectors) await this.init();
    const inputSelector = this.selectors?.input || '#prompt-textarea';
    const input = (await waitForElement(inputSelector)) as HTMLElement;
    // Retry logic
    for (let attempt = 0; attempt < 3; attempt++) {
      simulateContentEditableInput(input, text);
      await new Promise((resolve) => setTimeout(resolve, 300));

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
    const submitSelector = this.selectors?.submit || DEFAULT_CHATGPT_SUBMIT_SELECTOR;
    const sendButton = (await waitForElement(submitSelector)) as HTMLButtonElement;

    // Ensure button is enabled
    if (sendButton.disabled) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!sendButton.disabled) resolve();
          else setTimeout(check, 100);
        };
        check();
      });
    }

    sendButton.click();
  }

  observeResponse(onData: (text: string, isComplete: boolean) => void): () => void {
    let isActive = true;
    let observer: MutationObserver | null = null;

    const start = () => {
      if (!isActive) return;

      observer = new MutationObserver(() => {
        const messageSelector =
          this.selectors?.message || 'div[data-message-author-role="assistant"]';
        const messages = document.querySelectorAll(messageSelector);
        const lastMessage = messages[messages.length - 1];

        if (lastMessage) {
          const text = (lastMessage as HTMLElement).innerText;
          const isGenerating = !!document.querySelector(
            this.selectors?.stop || 'button[aria-label="Stop generating"]'
          );
          onData(text, !isGenerating);
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
