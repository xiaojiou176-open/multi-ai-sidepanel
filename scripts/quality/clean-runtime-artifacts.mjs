import { Dirent, existsSync, readdirSync, rmSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  REPO_OWNED_LIVE_CLONE_PREFIX,
  formatBytes,
  getExternalLiveProfileCloneRoot,
  inspectPersistentBrowserState,
  pruneExternalRepoCache,
  sanitizePathForReport,
} from '../shared/runtime-governance.mjs';

const repoRoot = process.cwd();
const dryRun = process.argv.includes('--dry-run');
const ttlHours = 72;
const now = Date.now();
const ttlMs = ttlHours * 60 * 60 * 1000;
const evidenceRetentionCount = 4;
const removalRetryCodes = new Set(['ENOTEMPTY', 'EBUSY', 'EPERM']);
const removalRetryAttempts = 4;
const removalRetryDelayMs = 80;
const legacyTempCloneRoot = os.tmpdir();
const legacyTempCloneLabel = 'legacy os.tmpdir() prompt-switchboard-live-* cleanup compatibility sweep';
const persistentBrowserState = inspectPersistentBrowserState();

const immediateTargets = [
  {
    relPath: '.runtime-cache/marketing-user-data',
    cleanupClass: 'disposable_generated',
    rebuildHint: 'npm run marketing:assets',
  },
  {
    relPath: '.runtime-cache/marketing-frames',
    cleanupClass: 'disposable_generated',
    rebuildHint: 'npm run marketing:assets',
  },
  {
    relPath: '.runtime-cache/test_output',
    cleanupClass: 'disposable_generated',
    rebuildHint: 'npm run test:e2e:shell',
  },
  {
    relPath: '.runtime-cache/playwright-user-data',
    cleanupClass: 'disposable_generated',
    rebuildHint: 'npm run test:e2e:shell',
  },
  {
    relPath: '.runtime-cache/test-results',
    cleanupClass: 'disposable_generated',
    rebuildHint: 'npm run test:e2e:shell',
  },
  {
    relPath: '.runtime-cache/coverage-tmp',
    cleanupClass: 'scratch',
    rebuildHint: 'npm run test:coverage',
  },
  {
    relPath: '.runtime-cache/coverage-split',
    cleanupClass: 'scratch',
    rebuildHint: 'npm run test:coverage',
  },
];

function logAction(message) {
  console.log(`[clean-runtime-artifacts] ${message}`);
}

function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function removeWithRetry(absPath) {
  for (let attempt = 0; attempt < removalRetryAttempts; attempt += 1) {
    try {
      rmSync(absPath, { recursive: true, force: true });
      return;
    } catch (error) {
      const code =
        error && typeof error === 'object' && 'code' in error ? error.code : undefined;

      if (!existsSync(absPath)) {
        return;
      }

      const shouldRetry =
        typeof code === 'string' &&
        removalRetryCodes.has(code) &&
        attempt < removalRetryAttempts - 1;

      if (!shouldRetry) {
        throw error;
      }

      sleepSync(removalRetryDelayMs * (attempt + 1));
    }
  }
}

function collectRetentionEntries(absRoot, relRoot) {
  return readdirSync(absRoot)
    .map((name) => {
      const absEntry = path.join(absRoot, name);
      const stat = statSync(absEntry, { throwIfNoEntry: false });
      return stat
        ? {
            name,
            relPath: path.posix.join(relRoot, name),
            absPath: absEntry,
            mtimeMs: stat.mtimeMs,
          }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);
}

function removePath(relPath, cleanupClass, rebuildHint) {
  const absPath = path.resolve(repoRoot, relPath);
  if (!existsSync(absPath)) {
    logAction(`missing class=${cleanupClass} path=${relPath}`);
    return;
  }
  if (dryRun) {
    logAction(`would remove class=${cleanupClass} path=${relPath} rebuild='${rebuildHint}'`);
    return;
  }
  try {
    removeWithRetry(absPath);
    logAction(`removed class=${cleanupClass} path=${relPath} rebuild='${rebuildHint}'`);
  } catch (error) {
    console.error(
      `[clean-runtime-artifacts] failed to remove ${relPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  }
}

function pruneRetentionEntries(entries, cleanupClass) {
  const retained = new Set(entries.slice(0, evidenceRetentionCount).map((entry) => entry.name));
  let removedCount = 0;

  for (const entry of entries) {
    const ageMs = now - entry.mtimeMs;
    if (retained.has(entry.name) || ageMs < ttlMs) {
      logAction(
        `retained class=${cleanupClass} path=${entry.relPath} reason='${
          retained.has(entry.name) ? 'retain-latest' : `ttl-${ttlHours}h`
        }'`
      );
      continue;
    }
    if (dryRun) {
      logAction(
        `would remove class=${cleanupClass} path=${entry.relPath} reason='older-than-${ttlHours}h'`
      );
      removedCount += 1;
      continue;
    }
    try {
      removeWithRetry(entry.absPath);
      logAction(`removed class=${cleanupClass} path=${entry.relPath} reason='older-than-${ttlHours}h'`);
      removedCount += 1;
    } catch (error) {
      console.error(
        `[clean-runtime-artifacts] failed to prune ${entry.relPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      process.exitCode = 1;
    }
  }

  return removedCount;
}

function pruneRetentionRoot(relRoot, cleanupClass = 'evidence_keep') {
  const absRoot = path.resolve(repoRoot, relRoot);
  if (!existsSync(absRoot)) {
    logAction(`missing class=${cleanupClass} path=${relRoot}`);
    return;
  }

  const entries = collectRetentionEntries(absRoot, relRoot);
  const removedCount = pruneRetentionEntries(entries, cleanupClass);

  if (removedCount === 0) {
    logAction(`no stale artifacts in ${relRoot} beyond ttl=${ttlHours}h and retainLatest=${evidenceRetentionCount}`);
  }
}

function prunePromptPreviewRetention() {
  const relRoot = '.runtime-cache';
  const absRoot = path.resolve(repoRoot, relRoot);
  const previewPattern = /^prompt.+-release-preview$/;

  if (!existsSync(absRoot)) {
    logAction(`missing class=evidence_keep path=.runtime-cache/prompt*-release-preview`);
    return;
  }

  const entries = readdirSync(absRoot, { withFileTypes: true })
    .filter((entry) => entry instanceof Dirent && entry.isDirectory() && previewPattern.test(entry.name))
    .map((entry) => {
      const absEntry = path.join(absRoot, entry.name);
      const stat = statSync(absEntry, { throwIfNoEntry: false });
      return stat
        ? {
            name: entry.name,
            relPath: path.posix.join(relRoot, entry.name),
            absPath: absEntry,
            mtimeMs: stat.mtimeMs,
          }
        : null;
    })
    .filter(Boolean)
    .sort((left, right) => right.mtimeMs - left.mtimeMs);

  if (entries.length === 0) {
    logAction(`missing class=evidence_keep path=.runtime-cache/prompt*-release-preview`);
    return;
  }

  const removedCount = pruneRetentionEntries(entries, 'evidence_keep');
  if (removedCount === 0) {
    logAction(
      `no stale artifacts in .runtime-cache/prompt*-release-preview beyond ttl=${ttlHours}h and retainLatest=${evidenceRetentionCount}`
    );
  }
}

function removeLegacyRepoOwnedTempClones() {
  if (!existsSync(legacyTempCloneRoot)) {
    logAction(`missing class=legacy_cleanup path=${legacyTempCloneLabel}`);
    return;
  }

  const clones = readdirSync(legacyTempCloneRoot, { withFileTypes: true })
    .filter((entry) => entry instanceof Dirent && entry.name.startsWith(REPO_OWNED_LIVE_CLONE_PREFIX))
    .map((entry) => path.join(legacyTempCloneRoot, entry.name));

  if (clones.length === 0) {
    logAction(`missing class=legacy_cleanup path=${legacyTempCloneLabel}`);
    return;
  }

  for (const clonePath of clones) {
    const cloneName = path.basename(clonePath);
    const isExpectedClone =
      cloneName.startsWith(REPO_OWNED_LIVE_CLONE_PREFIX) &&
      path.dirname(path.resolve(clonePath)) === path.resolve(legacyTempCloneRoot);
    if (!isExpectedClone) {
      logAction(
        `skipped class=legacy_cleanup path=${path.basename(
          clonePath
        )} reason='outside-expected-prefix'`
      );
      continue;
    }
    if (dryRun) {
      logAction(
        `would remove class=legacy_cleanup path=${path.basename(
          clonePath
        )} rebuild='PROMPT_SWITCHBOARD_LIVE=1 npm run test:live'`
      );
      continue;
    }
    try {
      removeWithRetry(clonePath);
      logAction(
        `removed class=legacy_cleanup path=${path.basename(
          clonePath
        )} rebuild='PROMPT_SWITCHBOARD_LIVE=1 npm run test:live'`
      );
    } catch (error) {
      console.error(
        `[clean-runtime-artifacts] failed to remove ${sanitizePathForReport(clonePath)}: ${
          error instanceof Error ? error.message : String(error)
        }`
      );
      process.exitCode = 1;
    }
  }
}

for (const target of immediateTargets) {
  removePath(target.relPath, target.cleanupClass, target.rebuildHint);
}

removeLegacyRepoOwnedTempClones();
const externalCachePrune = pruneExternalRepoCache({
  dryRun,
  log: (message) => logAction(message),
});
if (externalCachePrune.currentBytes === 0 && externalCachePrune.removed.length === 0) {
  logAction(
    `no repo-owned external cache entries under ${sanitizePathForReport(getExternalLiveProfileCloneRoot())} (ttl=${externalCachePrune.ttlHours}h, cap=${formatBytes(externalCachePrune.maxBytes)})`
  );
}
if (persistentBrowserState.exists) {
  logAction(
    `preserved class=persistent_browser_state path=${sanitizePathForReport(persistentBrowserState.userDataDir)} reason='excluded-from-clean-runtime'`
  );
}
pruneRetentionRoot('.runtime-cache/release');
pruneRetentionRoot('.runtime-cache/live-site-runs');
pruneRetentionRoot('.runtime-cache/live-attach');
prunePromptPreviewRetention();
