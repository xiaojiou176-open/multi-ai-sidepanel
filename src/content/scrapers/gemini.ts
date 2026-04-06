import { Scraper } from './base';
import { waitForElement, simulateContentEditableInput } from '../utils/dom';
import { SelectorService, type ScraperSelectors } from '../../services/selectorService';
import { Logger } from '../../utils/logger';

const SCRAPER_MODEL = 'Gemini' as const;

export class GeminiScraper implements Scraper {
  private selectors: ScraperSelectors | null = null;

  async init(): Promise<void> {
    this.selectors = await SelectorService.getSelectors('Gemini');
  }

  async fillInput(text: string): Promise<void> {
    if (!this.selectors) await this.init();
    const inputSelector = this.selectors?.input || 'div.ql-editor.textarea';
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
    const submitSelector = this.selectors?.submit || 'button[aria-label="发送"]';
    const sendButton = (await waitForElement(submitSelector)) as HTMLButtonElement;
    sendButton.click();
  }

  observeResponse(onData: (text: string, isComplete: boolean) => void): () => void {
    let isActive = true;
    let observer: MutationObserver | null = null;

    const start = () => {
      if (!isActive) return;

      observer = new MutationObserver(() => {
        const messageSelector = this.selectors?.message || '.model-response-text';
        const responses = document.querySelectorAll(messageSelector);
        const lastResponse = responses[responses.length - 1];

        if (lastResponse) {
          const text = (lastResponse as HTMLElement).innerText;
          const isGenerating = !!document.querySelector(
            this.selectors?.stop || 'button[aria-label*="Stop"]'
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
