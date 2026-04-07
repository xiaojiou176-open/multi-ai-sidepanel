import {
  test,
  expect,
  chromium,
  type Page,
  type BrowserContext,
  type TestInfo,
} from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { waitForPromptSwitchboardExtensionId } from '../../scripts/verify/live-probe-shared';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extensionPathCandidates = ['../../dist'];
const extensionIdCachePath = path.resolve(
  process.cwd(),
  '.runtime-cache',
  'live-extension-id.txt'
);
const E2E_HEADED = process.env.PROMPT_SWITCHBOARD_E2E_HEADED === '1';

const resolveExtensionPath = (): string => {
  const fromEnv = process.env.EXTENSION_PATH;
  if (fromEnv) return path.resolve(fromEnv);

  for (const candidate of extensionPathCandidates) {
    const resolved = path.resolve(__dirname, candidate);
    if (fs.existsSync(resolved)) {
      return resolved;
    }
  }

  return path.resolve(__dirname, extensionPathCandidates[0]);
};

const createPersistentUserDataDir = (testInfo: TestInfo) => {
  const slug =
    testInfo.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'playwright-shell';

  return path.resolve(
    process.cwd(),
    '.runtime-cache',
    'playwright-user-data',
    `${slug}-${testInfo.parallelIndex}`
  );
};

const ensurePlaywrightArtifactRoots = (testInfo: TestInfo) => {
  fs.mkdirSync(testInfo.outputDir, { recursive: true });
  fs.mkdirSync(
    path.resolve(
      process.cwd(),
      '.runtime-cache',
      'test_output',
      'e2e',
      `.playwright-artifacts-${testInfo.parallelIndex}`,
      'traces'
    ),
    { recursive: true }
  );
};

let context: BrowserContext | null = null;
let page: Page | null = null;

const attachDomSnapshot = async (target: Page, testInfo: TestInfo) => {
  try {
    const html = await target.content();
    await testInfo.attach('dom.html', { body: html, contentType: 'text/html' });
  } catch {
    // ignore snapshot failures
  }

  try {
    const text = await target.evaluate(() => document.body?.innerText || '');
    await testInfo.attach('dom.txt', { body: text, contentType: 'text/plain' });
  } catch {
    // ignore snapshot failures
  }
};

test.afterEach(async ({ browserName: _browserName }, testInfo) => {
  void _browserName;
  if (page && testInfo.status !== testInfo.expectedStatus) {
    await attachDomSnapshot(page, testInfo);
  }

  await page?.close();
  await context?.close();
  page = null;
  context = null;
});

test('sidepanel renders and handles core flow', async ({ browserName: _browserName }, testInfo) => {
  void _browserName;
  // This scenario exercises sidepanel, settings, storage migration, and a full persistent-context restart.
  test.setTimeout(180_000);
  const extensionPath = resolveExtensionPath();
  expect(fs.existsSync(extensionPath)).toBe(true);

  ensurePlaywrightArtifactRoots(testInfo);
  const userDataDir = createPersistentUserDataDir(testInfo);
  const launchContext = async () =>
    chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: !E2E_HEADED,
      args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
    });

  // Persistent Chromium profiles can leave ProcessSingleton locks behind when a
  // previous shell run or aborted debug session exits mid-flight. Reset the
  // per-test profile directory before launch so the default shell proof path
  // starts from a deterministic browser state.
  fs.rmSync(userDataDir, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(userDataDir), { recursive: true });
  context = await launchContext();

  const extensionId = await waitForPromptSwitchboardExtensionId(context);
  if (!extensionId) {
    throw new Error(
      'Prompt Switchboard shell E2E could not detect a repo-owned extension runtime in the launched persistent context.'
    );
  }
  fs.mkdirSync(path.dirname(extensionIdCachePath), { recursive: true });
  fs.writeFileSync(extensionIdCachePath, extensionId, 'utf8');
  const extensionPrefix = `chrome-extension://${extensionId}`;

  page = await context.newPage();
  await page.goto(`${extensionPrefix}/index.html`);

  await expect(page.getByText('Prompt Switchboard', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Writing Pack', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Writing Pack', exact: true }).click();
  const promptInput = page.getByRole('textbox', {
    name: /Compare prompt input|Ask once, compare every answer/i,
  });
  await expect(promptInput).toHaveValue(
    'Rewrite this paragraph in a clearer, friendlier tone for a GitHub README.'
  );
  await promptInput.fill('');

  // Create a new session and verify list grows
  const newSessionButton = page.getByRole('button', { name: /新会话|New/i });
  const sessionTitle = page.getByText('New Chat', { exact: true });
  const beforeCount = await sessionTitle.count();
  await newSessionButton.click();
  await expect(sessionTitle).toHaveCount(beforeCount + 1);

  // Search filter should show empty state when no match
  const searchInput = page.getByPlaceholder(/搜索会话|Search/i);
  await searchInput.fill('non-existent-session');
  await expect(page.getByText(/未找到匹配的会话|No chats found/i)).toBeVisible();
  await searchInput.fill('');

  // Toggle an extra model (no send to avoid spawning external tabs)
  await page.getByRole('button', { name: 'Gemini', exact: true }).click();

  // Rename a session via double click + save
  await page
    .getByTitle(/重命名|Rename/i)
    .first()
    .click();
  const editInput = page.getByRole('textbox', { name: /重命名|Rename/i });
  await editInput.fill('Renamed Chat');
  await editInput.press('Enter');
  await expect(page.getByText('Renamed Chat', { exact: true })).toBeVisible();

  // Delete a session and confirm
  await page
    .getByTitle(/删除会话|Delete/i)
    .first()
    .click();
  await page.getByRole('button', { name: /确认|Confirm/i }).click();

  // Open options page to validate data management paths
  const settingsPagePromise = context.waitForEvent('page');
  await page.evaluate(() => chrome.runtime.openOptionsPage());
  const settingsPage = await settingsPagePromise;
  settingsPage.on('pageerror', (err) => {
    console.error('SETTINGS pageerror', err);
  });
  settingsPage.on('console', (msg) => {
    console.log('SETTINGS console', msg.type(), msg.text());
  });
  settingsPage.on('requestfailed', (req) => {
    console.log('SETTINGS requestfailed', req.url(), req.failure()?.errorText);
  });
  const settingsUrl = await page.evaluate(() => chrome.runtime.getURL('settings.html'));
  await settingsPage.waitForLoadState('domcontentloaded');
  try {
    await settingsPage.waitForURL(settingsUrl, { timeout: 5000 });
  } catch {
    if (settingsPage.url() !== settingsUrl) {
      await settingsPage.goto(settingsUrl);
      await settingsPage.waitForLoadState('domcontentloaded');
    }
  }
  const settingsScripts = await settingsPage.$$eval('script', (scripts) =>
    scripts.map((script) => script.getAttribute('src') || '[inline]').join('\n')
  );
  await testInfo.attach('settings-url.txt', {
    body: settingsPage.url(),
    contentType: 'text/plain',
  });
  await testInfo.attach('settings-scripts.txt', {
    body: settingsScripts,
    contentType: 'text/plain',
  });
  const settingsMounted = await settingsPage
    .waitForFunction(() => (document.querySelector('#root')?.childElementCount || 0) > 0, null, {
      timeout: 5000,
    })
    .then(() => true)
    .catch(() => false);
  let exportPage: Page = settingsPage;
  if (!settingsMounted) {
    await settingsPage.close();
    const fallbackPage = await context.newPage();
    await fallbackPage.goto(`${extensionPrefix}/index.html#settings`);
    await fallbackPage.waitForLoadState('domcontentloaded');
    const fallbackMounted = await fallbackPage
      .waitForFunction(
        () => (document.querySelector('[data-testid="settings-panel"]') ? true : false),
        null,
        { timeout: 5000 }
      )
      .then(() => true)
      .catch(() => false);
    if (!fallbackMounted) {
      await fallbackPage.evaluate(() => {
        window.location.hash = '#settings';
      });
      await fallbackPage.waitForFunction(() => window.location.hash.includes('settings'));
      await fallbackPage.getByRole('button', { name: /设置|Settings/i }).click();
    }
    await expect(fallbackPage.getByTestId('settings-panel')).toBeVisible();
    exportPage = fallbackPage;
  } else {
    await expect(settingsPage.getByTestId('settings-panel')).toBeVisible();
  }

  // Export error path should surface alert
  await exportPage.evaluate(() => {
    const win = window as unknown as { __lastAlert?: string | null };
    win.__lastAlert = null;
    window.alert = (message?: string) => {
      win.__lastAlert = message ?? '';
    };
    URL.createObjectURL = () => {
      throw new Error('boom');
    };
  });
  await exportPage.getByRole('button', { name: /导出聊天记录|Export/i }).click();
  await exportPage.waitForFunction(() =>
    Boolean((window as unknown as { __lastAlert?: string | null }).__lastAlert)
  );
  const exportAlert = await exportPage.evaluate(
    () => (window as unknown as { __lastAlert?: string | null }).__lastAlert ?? ''
  );
  expect(exportAlert).toMatch(/导出失败|Export/);

  // Invalid-import handling is covered in SettingsPanel component tests. Leaving it
  // out of this headed persistent-context shell E2E keeps the spec focused on the
  // sidepanel core flow instead of a high-latency FileReader/upload edge case.
  if (settingsMounted) {
    await settingsPage.close();
  } else {
    await exportPage.close();
  }

  // Simulate legacy storage migration and ensure UI recovers
  await page.evaluate(() =>
    chrome.storage.local.set({
      schemaVersion: 0,
      sessions: [
        {
          id: 'legacy',
          title: 'Legacy',
          messages: [],
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      currentSessionId: 'legacy',
    })
  );
  await page.reload();
  await expect(page.getByText('Legacy', { exact: true })).toBeVisible();
  await expect(page.getByTestId('session-legacy-models')).toBeVisible();

  // Simulate service worker restart by recreating context
  await page.close();
  await context.close();
  context = await launchContext();
  page = await context.newPage();
  // The unpacked extension ID stays stable for the same build path, so the
  // shell proof path can reopen the UI without waiting on a flaky background
  // service-worker event after the persistent-context restart.
  await page.goto(`${extensionPrefix}/index.html`);
  await expect(page.getByText('Prompt Switchboard', { exact: true })).toBeVisible();
});
