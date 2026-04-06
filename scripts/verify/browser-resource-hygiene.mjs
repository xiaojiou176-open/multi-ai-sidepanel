import { spawnSync } from 'node:child_process';

const DEFAULT_MAX_BROWSER_INSTANCES = 6;

const TOP_LEVEL_BROWSER_PATTERNS = [
  /\/Contents\/MacOS\/Google Chrome(?:\s|$)/i,
  /\/Contents\/MacOS\/Chromium(?:\s|$)/i,
  /\/chrome-headless-shell(?:\s|$)/i,
];

const isTopLevelBrowserInstance = (line) => {
  const matchesBrowserBinary = TOP_LEVEL_BROWSER_PATTERNS.some((pattern) => pattern.test(line));
  if (!matchesBrowserBinary) {
    return false;
  }

  return !(
    line.includes('crashpad_handler') ||
    line.includes('ChromeRemoteDesktopHost') ||
    line.includes('/Google Chrome Helper') ||
    line.includes('/Chromium Helper') ||
    line.includes('--type=')
  );
};

const parseMaxBrowserInstances = () => {
  const raw = process.env.PROMPT_SWITCHBOARD_MAX_BROWSER_INSTANCES;
  if (!raw) {
    return DEFAULT_MAX_BROWSER_INSTANCES;
  }

  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BROWSER_INSTANCES;
};

export const inspectBrowserResourceState = () => {
  const result = spawnSync('ps', ['-axo', 'pid=,comm=,args='], {
    encoding: 'utf8',
  });

  if ((result.status ?? 1) !== 0) {
    return {
      available: false,
      maxBrowserInstances: parseMaxBrowserInstances(),
      activeBrowsers: [],
      activeBrowserCount: 0,
      blocker: `Could not inspect browser processes: ${result.stderr?.trim() || 'ps failed'}`,
    };
  }

  const activeBrowsers = (result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter(isTopLevelBrowserInstance);

  const maxBrowserInstances = parseMaxBrowserInstances();
  const activeBrowserCount = activeBrowsers.length;

  return {
    available: true,
    maxBrowserInstances,
    activeBrowsers,
    activeBrowserCount,
    blocker:
      activeBrowserCount > maxBrowserInstances
        ? `Browser resource guard tripped: ${activeBrowserCount} active browser instances exceed the repo limit of ${maxBrowserInstances}. Wait for other repo/worker lanes to reclaim browser load before launching another Prompt Switchboard helper.`
        : null,
  };
};
