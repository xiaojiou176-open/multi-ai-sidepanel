export async function waitForElement(selector: string, timeout = 10000): Promise<Element> {
  return new Promise((resolve, reject) => {
    const element = document.querySelector(selector);
    if (element) return resolve(element);

    const observer = new MutationObserver(() => {
      const element = document.querySelector(selector);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    setTimeout(() => {
      observer.disconnect();
      reject(new Error(`Element ${selector} not found within ${timeout}ms`));
    }, timeout);
  });
}

export function simulateInput(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  element.focus();
  element.click();

  const nativeTextAreaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype,
    'value'
  )?.set;
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;

  const setter =
    element instanceof HTMLTextAreaElement ? nativeTextAreaValueSetter : nativeInputValueSetter;
  setter?.call(element, value);

  // Dispatch InputEvent which is more specific than generic Event
  element.dispatchEvent(
    new InputEvent('input', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value,
    })
  );

  element.dispatchEvent(new Event('change', { bubbles: true }));
}

export function simulateContentEditableInput(element: HTMLElement, value: string) {
  element.focus();
  element.click(); // Some editors need a click to activate

  // Lexical/ProseMirror often wrap content in <p> tags.
  // We should try to insert into the existing paragraph if possible to avoid breaking the schema.
  const pTag = element.querySelector('p');

  if (pTag) {
    // Clear existing text content of the p tag but keep the tag
    const range = document.createRange();
    range.selectNodeContents(pTag);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  } else {
    // Fallback for simple contenteditables
    const range = document.createRange();
    range.selectNodeContents(element);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
  }

  // execCommand is deprecated but still the most reliable way to trigger
  // editor events (like ProseMirror/Quill) that listen for input.
  const success = document.execCommand('insertText', false, value);

  if (!success) {
    // Fallback: set text content directly but try to preserve structure
    if (pTag) {
      pTag.textContent = value;
    } else {
      element.textContent = value;
    }
  }

  // Dispatch a sequence of events to ensure frameworks detect the change
  // React/Lexical often rely on 'beforeinput' or 'input' bubbling up
  const events = [
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: value,
    }),
    new Event('input', { bubbles: true, cancelable: true }),
    new Event('change', { bubbles: true }),
    // Some frameworks (like Lexical/React) might rely on key events to trigger updates
    new KeyboardEvent('keydown', { bubbles: true, key: 'Unidentified' }),
    new KeyboardEvent('keyup', { bubbles: true, key: 'Unidentified' }),
  ];

  setTimeout(() => {
    events.forEach((event) => element.dispatchEvent(event));
  }, 50);
}

export function simulatePasteInput(element: HTMLElement, value: string) {
  element.focus();
  element.click();

  // 1. Select content to replace
  const pTag = element.querySelector('p');
  const range = document.createRange();
  const sel = window.getSelection();
  sel?.removeAllRanges();

  if (pTag) {
    const br = pTag.querySelector('br');
    if (br) {
      range.selectNode(br);
    } else {
      range.selectNodeContents(pTag);
    }
  } else {
    range.selectNodeContents(element);
  }
  sel?.addRange(range);

  // 2. Use Paste Event with a small delay to ensure focus is registered
  setTimeout(() => {
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: new DataTransfer(),
    });
    pasteEvent.clipboardData?.setData('text/plain', value);
    element.dispatchEvent(pasteEvent);

    // Dispatch generic input events just in case, but minimal
    element.dispatchEvent(new Event('input', { bubbles: true }));
  }, 50);
}
