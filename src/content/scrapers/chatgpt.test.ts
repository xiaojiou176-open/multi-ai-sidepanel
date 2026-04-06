import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ChatGPTScraper } from './chatgpt';

const CHATGPT_SUBMIT_SELECTOR =
  '[data-testid="send-button"], button.composer-submit-button-color, button[aria-label="启动语音功能"], button[aria-label="Start voice mode"]';

vi.mock('../utils/dom', () => ({
  waitForElement: vi.fn(),
  simulateContentEditableInput: vi.fn(),
}));

vi.mock('../../services/selectorService', () => ({
  SelectorService: {
    getSelectors: vi.fn(),
  },
}));

describe('ChatGPTScraper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('retries fillInput until content appears', async () => {
    const { waitForElement, simulateContentEditableInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const input = document.createElement('div');
    let attempts = 0;

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(input);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: '#prompt-textarea',
      submit: CHATGPT_SUBMIT_SELECTOR,
      message: 'div[data-message-author-role="assistant"]',
      stop: 'button[aria-label="Stop generating"]',
    });

    (simulateContentEditableInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_el: HTMLElement, text: string) => {
        attempts += 1;
        if (attempts > 1) {
          _el.innerText = text;
        }
      }
    );

    const scraper = new ChatGPTScraper();
    const promise = scraper.fillInput('Hello');
    await vi.runAllTimersAsync();
    await promise;

    expect(attempts).toBeGreaterThanOrEqual(2);
    expect(input.innerText).toBe('Hello');
  });

  it('uses fallback input selector when config is missing and skips reinit', async () => {
    const { waitForElement, simulateContentEditableInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const input = document.createElement('div');
    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(input);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      submit: CHATGPT_SUBMIT_SELECTOR,
    });
    (simulateContentEditableInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (el: HTMLElement, text: string) => {
        el.innerText = text;
      }
    );

    const scraper = new ChatGPTScraper();
    await scraper.init();
    const promise = scraper.fillInput('Fallback');
    await vi.runAllTimersAsync();
    await promise;

    expect(SelectorService.getSelectors).toHaveBeenCalledTimes(1);
    expect(waitForElement).toHaveBeenCalledWith('#prompt-textarea');
    expect(input.innerText).toBe('Fallback');
  });

  it('waits for enabled send button before clicking', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const button = document.createElement('button');
    button.disabled = true;
    const clickSpy = vi.spyOn(button, 'click');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(button);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: '#prompt-textarea',
      submit: CHATGPT_SUBMIT_SELECTOR,
      message: 'div[data-message-author-role="assistant"]',
      stop: 'button[aria-label="Stop generating"]',
    });

    setTimeout(() => {
      button.disabled = false;
    }, 200);

    const scraper = new ChatGPTScraper();
    const promise = scraper.clickSend();
    await vi.runAllTimersAsync();
    await promise;

    expect(clickSpy).toHaveBeenCalled();
  });

  it('uses fallback submit selector when config is missing and skips reinit', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const button = document.createElement('button');
    const clickSpy = vi.spyOn(button, 'click');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(button);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: '#prompt-textarea',
    });

    const scraper = new ChatGPTScraper();
    await scraper.init();
    await scraper.clickSend();

    expect(waitForElement).toHaveBeenCalledWith(CHATGPT_SUBMIT_SELECTOR);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('observes responses and reports completion state', async () => {
    const originalObserver = globalThis.MutationObserver;
    const triggers: Array<() => void> = [];
    globalThis.MutationObserver = class {
      private cb: MutationCallback;
      constructor(cb: MutationCallback) {
        this.cb = cb;
        triggers.push(() => this.cb([], this));
      }
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };

    const { SelectorService } = await import('../../services/selectorService');
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: '#prompt-textarea',
      submit: CHATGPT_SUBMIT_SELECTOR,
      message: 'div[data-message-author-role="assistant"]',
      stop: 'button[aria-label="Stop generating"]',
    });

    const message = document.createElement('div');
    message.setAttribute('data-message-author-role', 'assistant');
    document.body.appendChild(message);

    const stopButton = document.createElement('button');
    stopButton.setAttribute('aria-label', 'Stop generating');
    document.body.appendChild(stopButton);

    const scraper = new ChatGPTScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    message.innerText = 'Partial';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Partial', false);

    stopButton.remove();
    message.innerText = 'Done';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Done', true);

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('observes responses using fallback selectors', async () => {
    const originalObserver = globalThis.MutationObserver;
    const triggers: Array<() => void> = [];
    globalThis.MutationObserver = class {
      private cb: MutationCallback;
      constructor(cb: MutationCallback) {
        this.cb = cb;
        triggers.push(() => this.cb([], this));
      }
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };

    const { SelectorService } = await import('../../services/selectorService');
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const message = document.createElement('div');
    message.setAttribute('data-message-author-role', 'assistant');
    document.body.appendChild(message);

    const stopButton = document.createElement('button');
    stopButton.setAttribute('aria-label', 'Stop generating');
    document.body.appendChild(stopButton);

    const scraper = new ChatGPTScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    message.innerText = 'Streaming';
    triggers.forEach((trigger) => trigger());
    expect(onData).toHaveBeenCalledWith('Streaming', false);

    stopButton.remove();
    message.innerText = 'Done';
    triggers.forEach((trigger) => trigger());
    expect(onData).toHaveBeenCalledWith('Done', true);

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('does not emit when no assistant messages are present', async () => {
    const originalObserver = globalThis.MutationObserver;
    const triggers: Array<() => void> = [];
    globalThis.MutationObserver = class {
      private cb: MutationCallback;
      constructor(cb: MutationCallback) {
        this.cb = cb;
        triggers.push(() => this.cb([], this));
      }
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };

    const { SelectorService } = await import('../../services/selectorService');
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const scraper = new ChatGPTScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    triggers.forEach((trigger) => trigger());

    expect(onData).not.toHaveBeenCalled();

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('clicks send button immediately when enabled', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const button = document.createElement('button');
    button.disabled = false;
    const clickSpy = vi.spyOn(button, 'click');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(button);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: '#prompt-textarea',
      submit: CHATGPT_SUBMIT_SELECTOR,
      message: 'div[data-message-author-role="assistant"]',
      stop: 'button[aria-label="Stop generating"]',
    });

    const scraper = new ChatGPTScraper();
    await scraper.clickSend();

    expect(clickSpy).toHaveBeenCalled();
  });

  it('initializes selectors in observeResponse and ignores empty content', async () => {
    const originalObserver = globalThis.MutationObserver;
    const triggers: Array<() => void> = [];
    globalThis.MutationObserver = class {
      private cb: MutationCallback;
      constructor(cb: MutationCallback) {
        this.cb = cb;
        triggers.push(() => this.cb([], this));
      }
      observe() {}
      disconnect() {}
      takeRecords() {
        return [];
      }
    };

    const { SelectorService } = await import('../../services/selectorService');
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: '#prompt-textarea',
      submit: CHATGPT_SUBMIT_SELECTOR,
      message: 'div[data-message-author-role="assistant"]',
      stop: 'button[aria-label="Stop generating"]',
    });

    const scraper = new ChatGPTScraper();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    triggers.forEach((trigger) => trigger());

    expect(SelectorService.getSelectors).toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();

    stop();
    globalThis.MutationObserver = originalObserver;
  });
});
