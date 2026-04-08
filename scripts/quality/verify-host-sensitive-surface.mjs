import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { findOutputSurfaceFindingsWithContext } from './sensitive-surface-rules.mjs';

const repo = 'xiaojiou176-open/multi-ai-sidepanel';
const findings = [];
const scanGaps = [];

function parseHttpStatus(detail) {
  const match = detail.match(/\(HTTP (\d{3})\)/u);
  return match ? Number.parseInt(match[1], 10) : null;
}

function runGh(args, { encoding = 'utf8', maxBuffer = 25 * 1024 * 1024 } = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync('gh', args, {
        cwd: process.cwd(),
        encoding,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer,
      }),
      detail: '',
      status: 0,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        ok: false,
        stdout: '',
        detail: 'GitHub CLI (`gh`) is not installed.',
        status: null,
      };
    }

    const stderr =
      error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim()
        : '';
    const stdout =
      error && typeof error === 'object' && 'stdout' in error && typeof error.stdout === 'string'
        ? error.stdout.trim()
        : '';
    const detail = stderr || stdout || (error instanceof Error ? error.message : String(error));
    return {
      ok: false,
      stdout,
      detail,
      status: parseHttpStatus(detail),
    };
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    findings.push(`${label}: failed to parse JSON (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
}

function loadArrayEndpoint(label, endpoint, allowStatuses = []) {
  const result = runGh(['api', endpoint]);
  if (!result.ok) {
    if (allowStatuses.includes(result.status)) {
      return [];
    }
    scanGaps.push(`${label}: gh api ${endpoint} failed (${result.detail})`);
    return [];
  }

  const parsed = parseJson(result.stdout, label);
  return Array.isArray(parsed) ? parsed : [];
}

function addTextFindings(surface, identifier, text, sourcePath = null) {
  for (const finding of findOutputSurfaceFindingsWithContext(text, { sourcePath })) {
    findings.push(`${surface}: ${identifier} -> ${finding.reason}`);
  }
}

function downloadReleaseAsset(assetId) {
  const result = runGh(
    ['api', `repos/${repo}/releases/assets/${assetId}`, '-H', 'Accept: application/octet-stream'],
    { encoding: 'buffer', maxBuffer: 50 * 1024 * 1024 },
  );

  if (!result.ok) {
    return { ok: false, detail: result.detail, data: null };
  }

  return {
    ok: true,
    detail: '',
    data: Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout),
  };
}

function scanArchiveMembers(archivePath, archiveType, label) {
  const listArgs = archiveType === 'zip' ? ['-Z1', archivePath] : ['-tzf', archivePath];
  const listResult = spawnSync(archiveType === 'zip' ? 'unzip' : 'tar', listArgs, {
    cwd: process.cwd(),
    encoding: 'utf8',
  });

  if (listResult.status !== 0) {
    scanGaps.push(`${label}: failed to list archive members (${listResult.stderr.trim() || listResult.stdout.trim()})`);
    return;
  }

  const members = listResult.stdout
    .split('\n')
    .map((entry) => entry.trim())
    .filter(Boolean);

  for (const member of members) {
    const extension = path.posix.extname(member).toLowerCase();
    if (
      ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2', '.ttf', '.ico', '.mp4', '.mov', '.pdf'].includes(
        extension,
      )
    ) {
      continue;
    }

    const readArgs = archiveType === 'zip' ? ['-p', archivePath, member] : ['-xOf', archivePath, member];
    const readResult = spawnSync(archiveType === 'zip' ? 'unzip' : 'tar', readArgs, {
      cwd: process.cwd(),
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024,
    });

    if (readResult.status !== 0) {
      continue;
    }

    addTextFindings(label, member, readResult.stdout, member);
  }
}

const repoMetaResult = runGh([
  'api',
  `repos/${repo}`,
  '--jq',
  '{full_name, private, visibility, default_branch, has_pages, homepage, html_url}',
]);
const repoMeta = repoMetaResult.ok ? parseJson(repoMetaResult.stdout, 'repo metadata') : null;

if (!repoMetaResult.ok || !repoMeta) {
  scanGaps.push(`repo metadata: ${repoMetaResult.detail || 'missing repo metadata'}`);
} else if (repoMeta.default_branch !== 'main') {
  findings.push(`repo metadata: expected default branch main, got ${repoMeta.default_branch}`);
}

for (const item of loadArrayEndpoint('commit comments', `repos/${repo}/comments?per_page=100`)) {
  addTextFindings('commit-comment', item.html_url || item.url || 'unknown', item.body || '');
}

for (const item of loadArrayEndpoint('issues', `repos/${repo}/issues?state=all&per_page=100`)) {
  addTextFindings('issue', item.html_url || item.url || 'unknown', `${item.title || ''}\n${item.body || ''}`);
}

for (const item of loadArrayEndpoint('issue comments', `repos/${repo}/issues/comments?per_page=100`)) {
  addTextFindings('issue-comment', item.html_url || item.url || 'unknown', item.body || '');
}

for (const item of loadArrayEndpoint('pull comments', `repos/${repo}/pulls/comments?per_page=100`)) {
  addTextFindings('pull-comment', item.html_url || item.url || 'unknown', `${item.body || ''}\n${item.diff_hunk || ''}`);
}

for (const pull of loadArrayEndpoint('pulls', `repos/${repo}/pulls?state=all&per_page=100`)) {
  const pullNumber = pull.number;
  addTextFindings('pull-body', pull.html_url || pull.url || `#${pullNumber}`, pull.body || '');

  for (const review of loadArrayEndpoint(
    `pull reviews #${pullNumber}`,
    `repos/${repo}/pulls/${pullNumber}/reviews?per_page=100`,
    [404],
  )) {
    addTextFindings('pull-review', review.html_url || review.pull_request_url || `#${pullNumber}`, review.body || '');
  }

  for (const file of loadArrayEndpoint(
    `pull files #${pullNumber}`,
    `repos/${repo}/pulls/${pullNumber}/files?per_page=100`,
  )) {
    addTextFindings(
      'pull-file-patch',
      `${pull.html_url || `#${pullNumber}`} :: ${file.filename}`,
      file.patch || '',
      file.filename,
    );
  }
}

for (const release of loadArrayEndpoint('releases', `repos/${repo}/releases?per_page=100`, [404])) {
  addTextFindings('release-body', release.html_url || release.url || release.tag_name || 'unknown', release.body || '');

  for (const asset of release.assets || []) {
    const assetLabel = `${release.tag_name || 'release'} :: ${asset.name}`;
    const assetResult = downloadReleaseAsset(asset.id);
    if (!assetResult.ok || !assetResult.data) {
      scanGaps.push(`release-asset: ${assetLabel} -> failed to download asset (${assetResult.detail})`);
      continue;
    }

    addTextFindings('release-asset', assetLabel, assetResult.data.toString('utf8'), asset.name);

    if (asset.name.endsWith('.zip') || asset.name.endsWith('.tgz') || asset.name.endsWith('.tar.gz')) {
      const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-switchboard-host-scan-'));
      const archivePath = path.join(tempRoot, asset.name);
      fs.writeFileSync(archivePath, assetResult.data);
      try {
        const archiveType = asset.name.endsWith('.zip') ? 'zip' : 'tgz';
        scanArchiveMembers(archivePath, archiveType, `release-archive: ${assetLabel}`);
      } finally {
        fs.rmSync(tempRoot, { recursive: true, force: true });
      }
    }
  }
}

const runsResult = runGh([
  'run',
  'list',
  '--repo',
  repo,
  '--limit',
  '100',
  '--json',
  'databaseId,workflowName,url,status,conclusion',
]);
const runs = runsResult.ok ? parseJson(runsResult.stdout, 'actions runs') : [];
if (!runsResult.ok) {
  scanGaps.push(`actions-runs: gh run list failed (${runsResult.detail})`);
}

for (const run of Array.isArray(runs) ? runs : []) {
  if (run.status && run.status !== 'completed') {
    continue;
  }
  const runId = run.databaseId;
  const runLabel = run.url || String(runId);
  const logResult = runGh(['run', 'view', String(runId), '--repo', repo, '--log'], {
    encoding: 'utf8',
    maxBuffer: 50 * 1024 * 1024,
  });
  if (!logResult.ok) {
    scanGaps.push(`actions-log: ${runLabel} -> failed to inspect run log (${logResult.detail})`);
    continue;
  }

  addTextFindings('actions-log', runLabel, logResult.stdout);
}

const artifactsResult = runGh(['api', `repos/${repo}/actions/artifacts?per_page=100`]);
const artifactsPayload = artifactsResult.ok ? parseJson(artifactsResult.stdout, 'actions artifacts') : null;
const artifacts = Array.isArray(artifactsPayload?.artifacts) ? artifactsPayload.artifacts : [];
if (!artifactsResult.ok) {
  scanGaps.push(`actions-artifacts: gh api failed (${artifactsResult.detail})`);
}

for (const artifact of artifacts) {
  if (artifact.expired || !artifact.workflow_run?.id || !artifact.name) {
    continue;
  }

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'prompt-switchboard-actions-artifact-'));
  try {
    execFileSync(
      'gh',
      ['run', 'download', String(artifact.workflow_run.id), '--repo', repo, '-n', artifact.name, '-D', tempRoot],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    const stack = [tempRoot];
    while (stack.length > 0) {
      const current = stack.pop();
      if (!current) continue;

      for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
        const entryPath = path.join(current, entry.name);
        if (entry.isDirectory()) {
          stack.push(entryPath);
          continue;
        }

        const text = fs.readFileSync(entryPath, 'utf8');
        const relativeArtifactPath = path.relative(tempRoot, entryPath);
        addTextFindings(
          'actions-artifact',
          `${artifact.name} :: ${relativeArtifactPath}`,
          text,
          relativeArtifactPath,
        );
      }
    }
  } catch (error) {
    const stderr =
      error && typeof error === 'object' && 'stderr' in error && typeof error.stderr === 'string'
        ? error.stderr.trim()
        : '';
    scanGaps.push(
      `actions-artifact: ${artifact.name} (${artifact.workflow_run.id}) -> failed to inspect artifact (${stderr || (error instanceof Error ? error.message : String(error))})`,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (findings.length > 0 || scanGaps.length > 0) {
  console.error('[verify-host-sensitive-surface] failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  for (const gap of scanGaps) {
    console.error(`- ${gap}`);
  }
  process.exit(1);
}

const visibility = repoMeta?.visibility ?? 'unknown';
console.log(
  `[verify-host-sensitive-surface] passed: scanned GitHub ${visibility} host surface for comments, PR patches, releases, assets, and recent Actions logs`,
);
