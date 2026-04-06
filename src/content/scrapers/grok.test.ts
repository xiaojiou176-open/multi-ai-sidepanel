import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GrokScraper } from './grok';

vi.mock('../utils/dom', () => ({
  waitForElement: vi.fn(),
  simulateContentEditableInput: vi.fn(),
}));

vi.mock('../../services/selectorService', () => ({
  SelectorService: {
    getSelectors: vi.fn(),
  },
}));

describe('GrokScraper', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('fills input and retries until text is present', async () => {
    const { waitForElement, simulateContentEditableInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const input = document.createElement('div');
    let attempts = 0;

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(input);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'div.tiptap.ProseMirror',
      submit: 'button[aria-label="提交"]',
      message: '.message-bubble',
      stop: 'button[aria-label*="Stop"]',
    });

    (simulateContentEditableInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (_el: HTMLElement, text: string) => {
        attempts += 1;
        if (attempts > 1) {
          _el.innerText = text;
        }
      }
    );

    const scraper = new GrokScraper();
    const promise = scraper.fillInput('Grok');
    await vi.runAllTimersAsync();
    await promise;

    expect(input.innerText).toBe('Grok');
  });

  it('uses fallback input selector when config is missing and skips reinit', async () => {
    const { waitForElement, simulateContentEditableInput } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const input = document.createElement('div');
    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(input);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      submit: 'button[aria-label="提交"]',
    });
    (simulateContentEditableInput as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (el: HTMLElement, text: string) => {
        el.innerText = text;
      }
    );

    const scraper = new GrokScraper();
    await scraper.init();
    const promise = scraper.fillInput('Fallback');
    await vi.runAllTimersAsync();
    await promise;

    expect(SelectorService.getSelectors).toHaveBeenCalledTimes(1);
    expect(waitForElement).toHaveBeenCalledWith('div.tiptap.ProseMirror');
    expect(input.innerText).toBe('Fallback');
  });

  it('waits for enabled send button and clicks', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const button = document.createElement('button');
    button.setAttribute('disabled', 'true');
    const clickSpy = vi.spyOn(button, 'click');

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(button);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'div.tiptap.ProseMirror',
      submit: 'button[aria-label="提交"]',
      message: '.message-bubble',
      stop: 'button[aria-label*="Stop"]',
    });

    setTimeout(() => {
      button.removeAttribute('disabled');
    }, 200);

    const scraper = new GrokScraper();
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
      input: 'div.tiptap.ProseMirror',
    });

    const scraper = new GrokScraper();
    await scraper.init();
    const promise = scraper.clickSend();
    await vi.runAllTimersAsync();
    await promise;

    expect(waitForElement).toHaveBeenCalledWith(
      'button[aria-label="提交"], button[aria-label="Submit"]'
    );
    expect(clickSpy).toHaveBeenCalled();
  });

  it('observes assistant bubbles and emits model version', async () => {
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
      message: '.message-bubble',
      stop: 'button[aria-label*="Stop"]',
      input: 'div.tiptap.ProseMirror',
      submit: 'button[aria-label="提交"]',
    });

    const container = document.createElement('div');
    container.className = 'group items-start';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';

    const content = document.createElement('div');
    content.className = 'response-content-markdown';
    content.textContent = 'Answer';

    bubble.appendChild(content);
    container.appendChild(bubble);
    document.body.appendChild(container);

    const modelSpan = document.createElement('span');
    modelSpan.textContent = 'Grok-2';
    const modelTrigger = document.createElement('div');
    modelTrigger.id = 'model-select-trigger';
    modelTrigger.appendChild(modelSpan);
    document.body.appendChild(modelTrigger);

    const stopButton = document.createElement('button');
    stopButton.setAttribute('aria-label', 'Stop');
    document.body.appendChild(stopButton);

    const scraper = new GrokScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    content.innerText = 'Answer Updated';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Answer Updated', false, 'Grok-2');

    stopButton.remove();
    content.innerText = 'Answer Final';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Answer Final', true, 'Grok-2');

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('ignores non-assistant bubbles and missing containers', async () => {
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

    const orphanBubble = document.createElement('div');
    orphanBubble.className = 'message-bubble';
    document.body.appendChild(orphanBubble);

    const userContainer = document.createElement('div');
    userContainer.className = 'group items-end';
    const userBubble = document.createElement('div');
    userBubble.className = 'message-bubble';
    userBubble.textContent = 'User';
    userContainer.appendChild(userBubble);
    document.body.appendChild(userContainer);

    const scraper = new GrokScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    triggers.forEach((trigger) => trigger());

    expect(onData).not.toHaveBeenCalled();

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('uses fallback selectors and defaults model when label is empty', async () => {
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
    container.className = 'group items-start';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = 'Answer';
    container.appendChild(bubble);
    document.body.appendChild(container);

    const modelSpan = document.createElement('span');
    modelSpan.textContent = '';
    const modelTrigger = document.createElement('div');
    modelTrigger.id = 'model-select-trigger';
    modelTrigger.appendChild(modelSpan);
    document.body.appendChild(modelTrigger);

    const stopButton = document.createElement('button');
    stopButton.setAttribute('aria-label', 'Stop');
    document.body.appendChild(stopButton);

    const scraper = new GrokScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Answer', false, 'Grok');

    stop();
    globalThis.MutationObserver = originalObserver;
  });

  it('skips observation when stopped before init completes', async () => {
    const { SelectorService } = await import('../../services/selectorService');
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({});

    const scraper = new GrokScraper();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    stop();
    await Promise.resolve();

    expect(onData).not.toHaveBeenCalled();
  });

  it('logs error when send button is missing', async () => {
    const { waitForElement } = await import('../utils/dom');
    const { SelectorService } = await import('../../services/selectorService');

    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    (waitForElement as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    (SelectorService.getSelectors as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
      input: 'div.tiptap.ProseMirror',
      submit: 'button[aria-label="提交"]',
      message: '.message-bubble',
      stop: 'button[aria-label*="Stop"]',
    });

    const scraper = new GrokScraper();
    await scraper.clickSend();

    expect(errorSpy).toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('falls back to default model version when selector is missing', async () => {
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
      message: '.message-bubble',
      stop: 'button[aria-label*="Stop"]',
      input: 'div.tiptap.ProseMirror',
      submit: 'button[aria-label="提交"]',
    });

    const container = document.createElement('div');
    container.className = 'group items-start';

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = 'Thinking...';

    container.appendChild(bubble);
    document.body.appendChild(container);

    const scraper = new GrokScraper();
    await scraper.init();
    const onData = vi.fn();
    const stop = scraper.observeResponse(onData);

    triggers.forEach((trigger) => trigger());
    expect(onData).not.toHaveBeenCalled();

    bubble.textContent = 'Final Answer';
    triggers.forEach((trigger) => trigger());

    expect(onData).toHaveBeenCalledWith('Final Answer', true, 'Grok');

    stop();
    globalThis.MutationObserver = originalObserver;
  });
});
