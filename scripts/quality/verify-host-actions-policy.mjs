import { execFileSync } from 'node:child_process';

const repo = 'xiaojiou176-open/multi-ai-sidepanel';

function runGh(args) {
  try {
    return execFileSync('gh', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.error('[verify-host-actions-policy] missing tool: install GitHub CLI (`gh`) first.');
      process.exit(1);
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
    console.error(`[verify-host-actions-policy] gh ${args.join(' ')} failed: ${detail}`);
    process.exit(1);
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error(
      `[verify-host-actions-policy] failed to parse ${label}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

const permissions = parseJson(
  runGh(['api', `repos/${repo}/actions/permissions`]),
  'actions permissions',
);

const findings = [];

if (permissions.enabled !== true) {
  findings.push('GitHub Actions are not enabled at the repository level');
}

if (permissions.allowed_actions !== 'selected') {
  findings.push(
    `allowed_actions must be "selected", got "${permissions.allowed_actions ?? 'unknown'}"`,
  );
}

if (permissions.sha_pinning_required !== true) {
  findings.push('repository-level SHA pinning is not enforced');
}

if (permissions.allowed_actions === 'selected') {
  const selectedActions = parseJson(
    runGh(['api', `repos/${repo}/actions/permissions/selected-actions`]),
    'selected actions',
  );

  const patterns = new Set(selectedActions.patterns_allowed ?? []);

  if (selectedActions.github_owned_allowed !== true) {
    findings.push('GitHub-owned actions are not allowed under selected-actions policy');
  }

  if (!patterns.has('release-drafter/release-drafter@*')) {
    findings.push('selected-actions policy is missing release-drafter/release-drafter@*');
  }

  if (!patterns.has('softprops/action-gh-release@*')) {
    findings.push('selected-actions policy is missing softprops/action-gh-release@*');
  }
}

if (findings.length > 0) {
  console.error('[verify-host-actions-policy] failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('[verify-host-actions-policy] passed: repository-level Actions policy is hardened');
console.log(
  `[verify-host-actions-policy] summary: selected actions only, SHA pinning enforced, and required third-party actions are explicitly allowed for ${repo}`,
);
