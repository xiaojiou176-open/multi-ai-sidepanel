import { describe, expect, it } from 'vitest';
import {
  buildAttachTargetUrls,
  buildOpenLiveBrowserArgs,
} from './open-live-browser-helpers.mjs';

describe('open-live-browser helpers', () => {
  it('keeps identity, start, and extension warmup targets in the canonical browser handoff', () => {
    expect(
      buildAttachTargetUrls({
        identityPageUrl: 'file:///tmp/browser-identity/index.html',
        startUrl: 'https://chatgpt.com/',
        extensionWarmupUrl: 'chrome-extension://abc/settings.html',
      })
    ).toEqual([
      'file:///tmp/browser-identity/index.html',
      'https://chatgpt.com/',
      'chrome-extension://abc/settings.html',
    ]);
  });

  it('deduplicates repeated target urls while preserving order', () => {
    expect(
      buildAttachTargetUrls({
        identityPageUrl: 'file:///tmp/browser-identity/index.html',
        startUrl: 'https://chatgpt.com/',
        extensionWarmupUrl: 'https://chatgpt.com/',
      })
    ).toEqual(['file:///tmp/browser-identity/index.html', 'https://chatgpt.com/']);
  });

  it('builds launch args that keep the extension warmup target when available', () => {
    expect(
      buildOpenLiveBrowserArgs({
        cdpPort: 9336,
        userDataDir: '/tmp/browser-root',
        profileDirectory: 'Profile 1',
        extensionPath: '/tmp/dist',
        identityPageUrl: 'file:///tmp/browser-identity/index.html',
        startUrl: 'https://chatgpt.com/',
        extensionWarmupUrl: 'chrome-extension://abc/settings.html',
      })
    ).toEqual([
      '--remote-debugging-port=9336',
      '--user-data-dir=/tmp/browser-root',
      '--profile-directory=Profile 1',
      '--disable-extensions-except=/tmp/dist',
      '--load-extension=/tmp/dist',
      'file:///tmp/browser-identity/index.html',
      'https://chatgpt.com/',
      'chrome-extension://abc/settings.html',
    ]);
  });
});
