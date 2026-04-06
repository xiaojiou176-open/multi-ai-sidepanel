import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerplexityScraper } from './perplexity';

vi.mock('../utils/dom', () => ({
  waitForElement: vi.fn(),
  simulateInput: vi.fn(),
  simulatePasteInput: vi.fn(),
}));

vi.mock('../../services/selectorService', () => ({
  SelectorService: {
    getSelectors: vi.fn(),
  },
}));

describe('PerplexityScraper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills textarea input and retries until content appears', async () => {
    const { waitForElement, simulateInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const textarea = document.createElement('textarea');
    let attempts = 0;

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(textarea);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'textarea',
      submit: 'button[aria-label="Submit"]',
      message: '.prose',
    });

    (simulateInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_el: HTMLTextAreaElement, text: string) => {
        attempts += 1;
        if (attempts > 1) {
          _el.value = text;
        }
      }
    );

    const scraper = new PerplexityScraper();
    const promise = scraper.fillInput('Perplexity');
    await vi.runAllTimersAsync();
    await promise;

    expect(textarea.value).toBe('Perplexity');
    expect(attempts).toBeGreaterThanOrEqual(2);
  });

  it('uses fallback input selector when config is missing and skips reinit', async () => {
    const { waitForElement, simulateInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const textarea = document.createElement('textarea');
    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(textarea);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      submit: 'button[aria-label="Submit"]',
    });
    (simulateInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_el: HTMLTextAreaElement, text: string) => {
        _el.value = text;
      }
    );

    const scraper = new PerplexityScraper();
    await scraper.init();
    const promise = scraper.fillInput('Fallback');
    await vi.runAllTimersAsync();
    await promise;

    expect(SelectorService.getSelectors).toHaveBeenCalledTimes(1);
    expect(waitForElement).toHaveBeenCalledWith(
      '#ask-input, textarea, div[contenteditable="true"]'
    );
    expect(textarea.value).toBe('Fallback');
  });

  it('fills contenteditable input using paste simulation', async () => {
    const { waitForElement, simulatePasteInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    editable.innerText = '';

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(editable);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'div[contenteditable="true"]',
      submit: 'button[aria-label="Submit"]',
      message: '.prose',
    });

    (simulatePasteInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_el: HTMLElement, text: string) => {
        _el.innerText = text;
      }
    );

    const scraper = new PerplexityScraper();
    const promise = scraper.fillInput('Paste');
    await vi.runAllTimersAsync();
    await promise;

    expect(simulatePasteInput).toHaveBeenCalled();
    expect(editable.innerText).toBe('Paste');
  });

  it('waits for enabled send button and clicks', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const button = document.createElement('button');
    button.disabled = true;
    const clickSpy = vi.spyOn(button, 'click');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(button);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'textarea',
      submit: 'button[aria-label="Submit"]',
      message: '.prose',
    });

    setTimeout(() => {
      button.disabled = false;
    }, 200);

    const scraper = new PerplexityScraper();
    const promise = scraper.clickSend();
    await vi.runAllTimersAsync();
    await promise;

    expect(clickSpy).toHaveBeenCalled();
  });

  it('clicks send button immediately when enabled and uses fallback selector', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const button = document.createElement('button');
    button.disabled = false;
    const clickSpy = vi.spyOn(button, 'click');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(button);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'textarea',
    });

    const scraper = new PerplexityScraper();
    await scraper.init();
    await scraper.clickSend();

    expect(waitForElement).toHaveBeenCalledWith('button[aria-label="Submit"]');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('times out when send button stays disabled', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const button = document.createElement('button');
    button.disabled = true;
    const clickSpy = vi.spyOn(button, 'click');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(button);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'textarea',
      submit: 'button[aria-label="Submit"]',
      message: '.prose',
    });

    const scraper = new PerplexityScraper();
    const promise = scraper.clickSend();
    await vi.advanceTimersByTimeAsync(6000);
    await promise;

    expect(clickSpy).toHaveBeenCalled();
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
      message: '.prose',
      input: 'textarea',
      submit: 'button[aria-label="Submit"]',
    });

    const prose = document.createElement('div');
    prose.className = 'prose';
    document.body.appendChild(prose);

    const modelButton = document.createElement('button');
    modelButton.setAttribute('aria-label', 'Select Model');
    modelButton.textContent = 'Perplexity Pro';
    document.body.appendChild(modelButton);

    const stopButton = document.createElement('button');
    stopButton.setAttribute('aria-label', 'Stop');
    document.body.appendChild(stopButton);

    const scraper = new PerplexityScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    prose.innerText = 'Answer 1';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Answer 1', false, 'Perplexity Pro');

    stopButton.remove();
    prose.innerText = 'Answer 2';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Answer 2', true, 'Perplexity Pro');

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('does not emit when stopped before observer starts', async () => {
    const { SelectorService } = await import('../../services/selectorService');
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const scraper = new PerplexityScraper();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    stop();
    await Promise.resolve();

    expect(onData).not.toHaveBeenCalled();
  });

  it('ignores updates when no prose elements exist', async () => {
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

    const scraper = new PerplexityScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    triggers.forEach((trigger) => trigger());

    expect(onData).not.toHaveBeenCalled();

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('ignores duplicate or empty responses', async () => {
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

    const prose = document.createElement('div');
    prose.className = 'prose';
    document.body.appendChild(prose);

    const scraper = new PerplexityScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    prose.innerText = 'Same';
    triggers.forEach((trigger) => trigger());
    triggers.forEach((trigger) => trigger());

    prose.innerText = '   ';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledTimes(1);

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
      input: 'textarea',
      submit: 'button[aria-label="Submit"]',
      message: '.prose',
    });

    const scraper = new PerplexityScraper();
    await scraper.clickSend();

    expect(clickSpy).toHaveBeenCalled();
  });

  it('falls back to default model version when model button missing', async () => {
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
      message: '.prose',
      input: 'textarea',
      submit: 'button[aria-label="Submit"]',
    });

    const prose = document.createElement('div');
    prose.className = 'prose';
    document.body.appendChild(prose);

    const scraper = new PerplexityScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    prose.innerText = 'Answer';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Answer', true, undefined);

    stop();
    globalThis.MutationObserver = originalObserver;
  });
});
