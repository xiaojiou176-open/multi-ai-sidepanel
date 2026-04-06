import { Dirent, lstatSync, readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import {
  PERSISTENT_BROWSER_PROFILE_DIRECTORY,
  REPO_OWNED_LIVE_CLONE_PREFIX,
  formatBytes,
  getExternalCachePolicy,
  getExternalLiveProfileCloneRoot,
  getExternalRepoCacheRoot,
  inspectExternalRepoCache,
  inspectPersistentBrowserState,
  sanitizePathForReport,
} from '../shared/runtime-governance.mjs';

const repoRoot = process.cwd();
const externalCacheRoot = getExternalRepoCacheRoot();
const externalCloneRoot = getExternalLiveProfileCloneRoot();
const externalCachePolicy = getExternalCachePolicy();
const externalCacheState = inspectExternalRepoCache();
const persistentBrowserState = inspectPersistentBrowserState();
const sanitizedExternalCacheRoot = sanitizePathForReport(externalCacheRoot);
const sanitizedExternalCloneRoot = sanitizePathForReport(externalCloneRoot);
const sanitizedPersistentBrowserUserDataDir = sanitizePathForReport(
  persistentBrowserState.userDataDir
);

const targets = [
  {
    relPath: 'node_modules',
    cleanupClass: 'dependency_replica',
    kind: 'dependency replica',
    defaultAction: 'cautious-clean',
    notes: 'Rebuild with npm install',
  },
  {
    relPath: '.runtime-cache/marketing-user-data',
    cleanupClass: 'disposable_generated',
    kind: 'marketing scratch profile',
    defaultAction: 'safe-clean',
    notes: 'Recreated by npm run marketing:assets',
  },
  {
    relPath: '.runtime-cache/marketing-frames',
    cleanupClass: 'disposable_generated',
    kind: 'marketing scratch frames',
    defaultAction: 'safe-clean',
    notes: 'Recreated by npm run marketing:assets',
  },
  {
    relPath: '.runtime-cache/test_output',
    cleanupClass: 'disposable_generated',
    kind: 'playwright scratch',
    defaultAction: 'safe-clean',
    notes: 'Recreated by npm run test:e2e:shell',
  },
  {
    relPath: '.runtime-cache/playwright-user-data',
    cleanupClass: 'disposable_generated',
    kind: 'playwright persistent profile scratch',
    defaultAction: 'safe-clean',
    notes: 'Recreated by npm run test:e2e:shell',
  },
  {
    relPath: '.runtime-cache/release',
    cleanupClass: 'evidence_keep',
    kind: 'release evidence cache',
    defaultAction: 'verify-first-retention',
    notes: 'Retain newest release artifacts and prune aged local copies via clean:runtime',
  },
  {
    relPath: '.runtime-cache/live-site-runs',
    cleanupClass: 'evidence_keep',
    kind: 'live support bundle evidence',
    defaultAction: 'verify-first-retention',
    notes: 'Keep recent support bundles and prune aged copies via clean:runtime',
  },
  {
    relPath: '.runtime-cache/live-attach',
    cleanupClass: 'evidence_keep',
    kind: 'live attach trace evidence',
    defaultAction: 'verify-first-retention',
    notes: 'Keep recent attach traces and prune aged copies via clean:runtime',
  },
  {
    relPath: 'dist',
    cleanupClass: 'disposable_generated',
    kind: 'build output',
    defaultAction: 'safe-clean',
    notes: 'Rebuild with npm run build',
  },
  {
    relPath: 'mcp-dist',
    cleanupClass: 'disposable_generated',
    kind: 'MCP sidecar build output',
    defaultAction: 'safe-clean',
    notes: 'Rebuild with npm run build:mcp',
  },
  {
    relPath: 'coverage',
    cleanupClass: 'disposable_generated',
    kind: 'test evidence',
    defaultAction: 'safe-clean',
    notes: 'Rebuild with npm run test:coverage',
  },
  {
    relPath: '.runtime-cache/test-results',
    cleanupClass: 'disposable_generated',
    kind: 'test evidence scratch',
    defaultAction: 'safe-clean',
    notes: 'Recreated by npm run test:e2e:shell',
  },
  {
    relPath: '.runtime-cache/coverage-tmp',
    cleanupClass: 'disposable_generated',
    kind: 'coverage scratch',
    defaultAction: 'safe-clean',
    notes: 'Recreated by npm run test:coverage',
  },
  {
    relPath: '.runtime-cache/coverage-split',
    cleanupClass: 'disposable_generated',
    kind: 'coverage scratch',
    defaultAction: 'safe-clean',
    notes: 'Recreated by npm run test:coverage',
  },
  {
    relPath: '.husky/_',
    cleanupClass: 'disposable_generated',
    kind: 'generated hook helper',
    defaultAction: 'safe-clean',
    notes: 'Recreated by husky prepare',
  },
  {
    relPath: '.agents',
    cleanupClass: 'preserve',
    kind: 'local collaboration archive',
    defaultAction: 'preserve',
    notes: 'Keep by default to retain local context',
  },
  {
    relPath: '.vscode',
    cleanupClass: 'preserve',
    kind: 'editor preference',
    defaultAction: 'preserve',
    notes: 'Not a disk-governance priority target',
  },
  {
    relPath: '.git',
    cleanupClass: 'preserve',
    kind: 'git metadata',
    defaultAction: 'preserve',
    notes: 'Version history and worktree metadata; never a cleanup target',
  },
  {
    relPath: 'docs/assets',
    cleanupClass: 'preserve',
    kind: 'tracked public assets',
    defaultAction: 'preserve',
    notes: 'Part of the public product surface; never a cleanup target',
  },
];

function safeLstat(targetPath) {
  try {
    return lstatSync(targetPath);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }

    throw error;
  }
}

function sizeWithDu(absPath) {
  const result = spawnSync('du', ['-sk', absPath], {
    cwd: repoRoot,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    return null;
  }

  const firstField = result.stdout.trim().split(/\s+/)[0];
  const kilobytes = Number.parseInt(firstField, 10);

  if (Number.isNaN(kilobytes)) {
    return null;
  }

  return kilobytes * 1024;
}

function getDirChildren(dirPath) {
  return readdirSync(dirPath, { withFileTypes: true });
}

function sizeEntry(absPath, existingStat = null) {
  const firstStat = existingStat ?? safeLstat(absPath);

  if (!firstStat) {
    return { exists: false, bytes: 0 };
  }

  if (process.platform !== 'win32') {
    const duBytes = sizeWithDu(absPath);
    if (duBytes != null) {
      return { exists: true, bytes: duBytes };
    }
  }

  if (!firstStat.isDirectory()) {
    return { exists: true, bytes: firstStat.size };
  }

  let totalBytes = 0;
  const stack = [{ absPath, entries: getDirChildren(absPath), index: 0 }];

  while (stack.length > 0) {
    const frame = stack[stack.length - 1];

    if (frame.index >= frame.entries.length) {
      stack.pop();
      continue;
    }

    const entry = frame.entries[frame.index];
    frame.index += 1;

    if (!(entry instanceof Dirent)) {
      continue;
    }

    const entryPath = path.join(frame.absPath, entry.name);
    const entryStat = safeLstat(entryPath);

    if (!entryStat) {
      continue;
    }

    if (entryStat.isDirectory()) {
      stack.push({ absPath: entryPath, entries: getDirChildren(entryPath), index: 0 });
      continue;
    }

    totalBytes += entryStat.size;
  }

  return { exists: true, bytes: totalBytes };
}

function buildAggregatePatternRow({
  displayPath,
  cleanupClass,
  kind,
  defaultAction,
  notes,
  matches,
  countsTowardRepoOwned = true,
}) {
  const sizeBytes = matches.reduce((sum, matchPath) => sum + sizeEntry(matchPath).bytes, 0);
  const matchCount = matches.length;
  return {
    path: displayPath,
    status: matchCount > 0 ? 'present' : 'missing',
    sizeBytes,
    sizeLabel: formatBytes(sizeBytes),
    cleanupClass,
    kind,
    defaultAction,
    notes: matchCount > 0 ? `${notes}; matches=${matchCount}` : notes,
    countsTowardRepoOwned,
  };
}

function collectPatternMatches(rootPath, predicate) {
  if (!safeLstat(rootPath)?.isDirectory()) {
    return [];
  }

  return readdirSync(rootPath, { withFileTypes: true })
    .filter((entry) => entry instanceof Dirent && predicate(entry))
    .map((entry) => path.join(rootPath, entry.name));
}

function sumRepoFootprint(rootPath) {
  let totalBytes = 0;

  for (const entry of readdirSync(rootPath, { withFileTypes: true })) {
    const entryPath = path.join(rootPath, entry.name);
    totalBytes += sizeEntry(entryPath).bytes;
  }

  return totalBytes;
}

function pad(value, width) {
  return value.padEnd(width, ' ');
}

const rows = targets.map((target) => {
  const absolutePath = path.join(repoRoot, target.relPath);
  const result = sizeEntry(absolutePath);

  return {
    path: target.relPath,
    status: result.exists ? 'present' : 'missing',
    sizeBytes: result.bytes,
    sizeLabel: formatBytes(result.bytes),
    cleanupClass: target.cleanupClass,
    kind: target.kind,
    defaultAction: target.defaultAction,
    notes: target.notes,
    countsTowardRepoOwned: true,
  };
});

const promptPreviewMatches = collectPatternMatches(path.join(repoRoot, '.runtime-cache'), (entry) =>
  entry.isDirectory() && /^prompt.+-release-preview$/.test(entry.name)
);
rows.push(
  buildAggregatePatternRow({
    displayPath: '.runtime-cache/prompt*-release-preview',
    cleanupClass: 'evidence_keep',
    kind: 'release preview evidence',
    defaultAction: 'verify-first-retention',
    notes: 'Keep recent preview bundles and prune aged copies via clean:runtime',
    matches: promptPreviewMatches,
  })
);

const repoOwnedTempCloneMatches = collectPatternMatches(externalCloneRoot, (entry) =>
  entry.name.startsWith(REPO_OWNED_LIVE_CLONE_PREFIX)
);
rows.push(
  buildAggregatePatternRow({
    displayPath: `${sanitizedExternalCloneRoot}/${REPO_OWNED_LIVE_CLONE_PREFIX}*`,
    cleanupClass: 'disposable_generated',
    kind: 'repo-owned temp clone',
    defaultAction: 'safe-clean',
    notes:
      `Created by npm run test:live when profile cloning is enabled; clean:runtime prunes these repo-owned clones under ${sanitizedExternalCacheRoot}`,
    matches: repoOwnedTempCloneMatches,
    countsTowardRepoOwned: false,
  })
);

rows.push({
  path: sanitizedExternalCacheRoot,
  status: safeLstat(externalCacheRoot)?.isDirectory() ? 'present' : 'missing',
  sizeBytes: externalCacheState.currentBytes,
  sizeLabel: formatBytes(externalCacheState.currentBytes),
  cleanupClass: 'repo_owned_external_cache',
  kind: 'repo-owned external cache root',
  defaultAction: 'verify-first-retention',
  notes: `Auto-pruned with ttl=${externalCachePolicy.ttlHours}h and cap=${formatBytes(externalCachePolicy.maxBytes)}`,
  countsTowardRepoOwned: false,
});

rows.push({
  path: sanitizedPersistentBrowserUserDataDir,
  status: persistentBrowserState.exists ? 'present' : 'missing',
  sizeBytes: persistentBrowserState.currentBytes,
  sizeLabel: formatBytes(persistentBrowserState.currentBytes),
  cleanupClass: 'persistent_browser_state',
  kind: `repo-owned Chrome root (${PERSISTENT_BROWSER_PROFILE_DIRECTORY})`,
  defaultAction: 'preserve',
  notes: 'Permanent browser state; excluded from ttl/cap pruning and clean:runtime',
  countsTowardRepoOwned: false,
});

const sharedToolCacheRoot = path.join(os.homedir(), 'Library', 'Caches', 'ms-playwright');
rows.push({
  path: sanitizePathForReport(sharedToolCacheRoot),
  status: safeLstat(sharedToolCacheRoot)?.isDirectory() ? 'present' : 'missing',
  sizeBytes: sizeEntry(sharedToolCacheRoot).bytes,
  sizeLabel: formatBytes(sizeEntry(sharedToolCacheRoot).bytes),
  cleanupClass: 'shared_tool_cache',
  kind: 'shared Playwright cache root',
  defaultAction: 'preserve',
  notes: 'Shared tooling cache; never auto-clean from Prompt Switchboard',
  countsTowardRepoOwned: false,
});

const repoTotalBytes = sumRepoFootprint(repoRoot);
const safeCleanBytes = rows
  .filter((row) => row.defaultAction === 'safe-clean')
  .reduce((sum, row) => sum + row.sizeBytes, 0);
const cautiousCleanBytes = rows
  .filter((row) => row.defaultAction === 'cautious-clean')
  .reduce((sum, row) => sum + row.sizeBytes, 0);
const retentionBytes = rows
  .filter((row) => row.defaultAction === 'verify-first-retention')
  .reduce((sum, row) => sum + row.sizeBytes, 0);
const preserveBytes = rows
  .filter((row) => row.defaultAction === 'preserve')
  .reduce((sum, row) => sum + row.sizeBytes, 0);
const sharedToolCacheBytes = rows
  .filter((row) => row.cleanupClass === 'shared_tool_cache')
  .reduce((sum, row) => sum + row.sizeBytes, 0);

console.log(`[repo-disk-audit] repo-local footprint: ${formatBytes(repoTotalBytes)}`);
console.log(
  `[repo-disk-audit] repo-owned external cache outside repo: ${formatBytes(
    externalCacheState.currentBytes
  )} / ${formatBytes(externalCachePolicy.maxBytes)} (ttl=${externalCachePolicy.ttlHours}h)`
);
console.log(
  `[repo-disk-audit] repo-owned persistent browser state outside repo (excluded from ttl/cap): ${formatBytes(
    persistentBrowserState.currentBytes
  )}`
);
console.log(
  `[repo-disk-audit] shared tool cache outside repo (not auto-cleaned): ${formatBytes(sharedToolCacheBytes)}`
);
console.log(`[repo-disk-audit] safe-clean candidates (repo-owned): ${formatBytes(safeCleanBytes)}`);
console.log(`[repo-disk-audit] cautious-clean candidates: ${formatBytes(cautiousCleanBytes)}`);
console.log(`[repo-disk-audit] retention-governed objects: ${formatBytes(retentionBytes)}`);
console.log(`[repo-disk-audit] preserve-by-default objects: ${formatBytes(preserveBytes)}`);
console.log('');
console.log(
  `${pad('Path', 38)} ${pad('Status', 8)} ${pad('Size', 10)} ${pad('Class', 21)} ${pad(
    'Kind',
    31
  )} ${pad(
    'Default Action',
    22
  )} Notes`
);

for (const row of rows) {
  console.log(
    `${pad(row.path, 38)} ${pad(row.status, 8)} ${pad(row.sizeLabel, 10)} ${pad(
      row.cleanupClass,
      21
    )} ${pad(row.kind, 31)} ${pad(row.defaultAction, 22)} ${row.notes}`
  );
}
