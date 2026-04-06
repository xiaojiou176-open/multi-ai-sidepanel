import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { QwenScraper } from './qwen';

vi.mock('../utils/dom', () => ({
  waitForElement: vi.fn(),
  simulateInput: vi.fn(),
}));

vi.mock('../../services/selectorService', () => ({
  SelectorService: {
    getSelectors: vi.fn(),
  },
}));

describe('QwenScraper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills textarea input with retry logic', async () => {
    const { waitForElement, simulateInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const textarea = document.createElement('textarea');
    let attempts = 0;

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(textarea);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'textarea#chat-input',
      submit: 'button#send-message-button',
      message: '.markdown-content-container',
    });

    (simulateInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_el: HTMLTextAreaElement, text: string) => {
        attempts += 1;
        if (attempts > 1) {
          _el.value = text;
        }
      }
    );

    const scraper = new QwenScraper();
    const promise = scraper.fillInput('Qwen');
    await vi.runAllTimersAsync();
    await promise;

    expect(textarea.value).toBe('Qwen');
  });

  it('uses fallback input selector when config is missing and skips reinit', async () => {
    const { waitForElement, simulateInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const textarea = document.createElement('textarea');
    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(textarea);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      submit: 'button#send-message-button',
    });
    (simulateInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_el: HTMLTextAreaElement, text: string) => {
        _el.value = text;
      }
    );

    const scraper = new QwenScraper();
    await scraper.init();
    const promise = scraper.fillInput('Fallback');
    await vi.runAllTimersAsync();
    await promise;

    expect(SelectorService.getSelectors).toHaveBeenCalledTimes(1);
    expect(waitForElement).toHaveBeenCalledWith('textarea#chat-input');
    expect(textarea.value).toBe('Fallback');
  });

  it('clicks send button using form fallback when selector not found', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('not found')
    );
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'textarea#chat-input',
      submit: 'button#send-message-button',
      message: '.markdown-content-container',
    });

    const form = document.createElement('form');
    form.className = 'flex w-full';
    const button = document.createElement('button');
    button.type = 'submit';
    const clickSpy = vi.spyOn(button, 'click');
    form.appendChild(button);
    document.body.appendChild(form);

    const scraper = new QwenScraper();
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
      input: 'textarea#chat-input',
    });

    const scraper = new QwenScraper();
    await scraper.init();
    const promise = scraper.clickSend();
    await vi.runAllTimersAsync();
    await promise;

    expect(waitForElement).toHaveBeenCalledWith('button#send-message-button', 5000);
    expect(clickSpy).toHaveBeenCalled();
  });

  it('throws when send button is missing', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error('not found')
    );
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'textarea#chat-input',
      submit: 'button#send-message-button',
      message: '.markdown-content-container',
    });

    const scraper = new QwenScraper();
    await expect(scraper.clickSend()).rejects.toThrow('Send button not found');
  });

  it('observes responses and reports model version', async () => {
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
      message: '.markdown-content-container',
      stop: 'button[aria-label*="Stop"]',
      input: 'textarea#chat-input',
      submit: 'button#send-message-button',
    });

    const container = document.createElement('div');
    container.className = 'markdown-content-container';
    document.body.appendChild(container);

    const title = document.createElement('div');
    title.className = 'inline-flex message-title';
    title.textContent = 'Qwen-Plus';
    document.body.appendChild(title);

    const stopButton = document.createElement('button');
    stopButton.setAttribute('aria-label', 'Stop');
    document.body.appendChild(stopButton);

    const scraper = new QwenScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    container.innerText = 'Output';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Output', false, 'Qwen-Plus');

    stopButton.remove();
    container.innerText = 'Final';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Final', true, 'Qwen-Plus');

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

    const container = document.createElement('div');
    container.className = 'markdown-content-container';
    document.body.appendChild(container);

    const stopButton = document.createElement('button');
    stopButton.setAttribute('aria-label', 'Stop');
    document.body.appendChild(stopButton);

    const scraper = new QwenScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    container.innerText = 'Fallback Output';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Fallback Output', false, 'Qwen');

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('does not emit when no containers are found', async () => {
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

    const scraper = new QwenScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    triggers.forEach((trigger) => trigger());

    expect(onData).not.toHaveBeenCalled();

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('does not emit duplicate or empty content', async () => {
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

    const container = document.createElement('div');
    container.className = 'markdown-content-container';
    document.body.appendChild(container);

    const scraper = new QwenScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    container.innerText = 'Same';
    triggers.forEach((trigger) => trigger());
    triggers.forEach((trigger) => trigger());

    container.innerText = '   ';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledTimes(1);

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('skips observation when stopped before init completes', async () => {
    const { SelectorService } = await import('../../services/selectorService');
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const scraper = new QwenScraper();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    stop();
    await Promise.resolve();

    expect(onData).not.toHaveBeenCalled();
  });

  it('falls back to default model version when title is missing', async () => {
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
      message: '.markdown-content-container',
      input: 'textarea#chat-input',
      submit: 'button#send-message-button',
    });

    const container = document.createElement('div');
    container.className = 'markdown-content-container';
    document.body.appendChild(container);

    const scraper = new QwenScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    container.innerText = 'Qwen Answer';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Qwen Answer', true, 'Qwen');

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('times out waiting for disabled send button', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const button = document.createElement('button');
    button.setAttribute('disabled', 'true');
    const clickSpy = vi.spyOn(button, 'click');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(button);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'textarea#chat-input',
      submit: 'button#send-message-button',
      message: '.markdown-content-container',
    });

    const scraper = new QwenScraper();
    const promise = scraper.clickSend();

    await vi.advanceTimersByTimeAsync(6000);
    await promise;

    expect(clickSpy).toHaveBeenCalled();
  });
});
