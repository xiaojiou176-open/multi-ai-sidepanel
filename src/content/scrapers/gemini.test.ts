import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiScraper } from './gemini';

vi.mock('../utils/dom', () => ({
  waitForElement: vi.fn(),
  simulateContentEditableInput: vi.fn(),
}));

vi.mock('../../services/selectorService', () => ({
  SelectorService: {
    getSelectors: vi.fn(),
  },
}));

describe('GeminiScraper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills input with retry logic', async () => {
    const { waitForElement, simulateContentEditableInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const input = document.createElement('div');
    let attempts = 0;

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(input);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'div.ql-editor.textarea',
      submit: 'button[aria-label="发送"]',
      message: '.model-response-text',
    });

    (simulateContentEditableInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_el: HTMLElement, text: string) => {
        attempts += 1;
        if (attempts > 1) {
          _el.innerText = text;
        }
      }
    );

    const scraper = new GeminiScraper();
    const promise = scraper.fillInput('Hi Gemini');
    await vi.runAllTimersAsync();
    await promise;

    expect(input.innerText).toBe('Hi Gemini');
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('uses fallback input selector when config is missing and skips reinit', async () => {
    const { waitForElement, simulateContentEditableInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const input = document.createElement('div');
    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(input);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      submit: 'button[aria-label="发送"]',
    });
    (simulateContentEditableInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (el: HTMLElement, text: string) => {
        el.innerText = text;
      }
    );

    const scraper = new GeminiScraper();
    await scraper.init();
    const promise = scraper.fillInput('Fallback');
    await vi.runAllTimersAsync();
    await promise;

    expect(SelectorService.getSelectors).toHaveBeenCalledTimes(1);
    expect(waitForElement).toHaveBeenCalledWith('div.ql-editor.textarea');
    expect(input.innerText).toBe('Fallback');
  });

  it('clicks send button', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const button = document.createElement('button');
    const clickSpy = vi.spyOn(button, 'click');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(button);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'div.ql-editor.textarea',
      submit: 'button[aria-label="发送"]',
      message: '.model-response-text',
    });

    const scraper = new GeminiScraper();
    await scraper.clickSend();

    expect(clickSpy).toHaveBeenCalled();
  });

  it('uses fallback submit selector when config is missing and skips reinit', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const button = document.createElement('button');
    const clickSpy = vi.spyOn(button, 'click');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(button);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'div.ql-editor.textarea',
    });

    const scraper = new GeminiScraper();
    await scraper.init();
    await scraper.clickSend();

    expect(waitForElement).toHaveBeenCalledWith('button[aria-label="发送"]');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('observes responses and detects stop button', async () => {
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
      message: '.model-response-text',
      stop: 'button[aria-label*="Stop"]',
      input: 'div.ql-editor.textarea',
      submit: 'button[aria-label="发送"]',
    });

    const response = document.createElement('div');
    response.className = 'model-response-text';
    document.body.appendChild(response);

    const stopButton = document.createElement('button');
    stopButton.setAttribute('aria-label', 'Stop');
    document.body.appendChild(stopButton);

    const scraper = new GeminiScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    response.innerText = 'Gemini Answer';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Gemini Answer', false);

    stopButton.remove();
    response.innerText = 'Gemini Done';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Gemini Done', true);

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('uses fallback selectors when config is missing and emits completion', async () => {
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

    const response = document.createElement('div');
    response.className = 'model-response-text';
    response.innerText = 'Fallback answer';
    document.body.appendChild(response);

    const scraper = new GeminiScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Fallback answer', true);

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('does not emit when no response elements are found', async () => {
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

    const scraper = new GeminiScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    triggers.forEach((trigger) => trigger());

    expect(onData).not.toHaveBeenCalled();

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('uses fallback selectors when config is missing', async () => {
    const { waitForElement, simulateContentEditableInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const input = document.createElement('div');
    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(input);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (simulateContentEditableInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_el: HTMLElement, text: string) => {
        _el.innerText = text;
      }
    );

    const scraper = new GeminiScraper();
    const promise = scraper.fillInput('Fallback');
    await vi.runAllTimersAsync();
    await promise;

    expect(SelectorService.getSelectors).toHaveBeenCalled();
  });

  it('initializes observeResponse when selectors are missing', async () => {
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
      message: '.model-response-text',
      stop: 'button[aria-label*="Stop"]',
      input: 'div.ql-editor.textarea',
      submit: 'button[aria-label="发送"]',
    });

    const scraper = new GeminiScraper();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    triggers.forEach((trigger) => trigger());

    expect(SelectorService.getSelectors).toHaveBeenCalled();
    expect(onData).not.toHaveBeenCalled();

    stop();
    globalThis.MutationObserver = originalObserver;
  });
});
