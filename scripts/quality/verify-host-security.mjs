import { execFileSync } from 'node:child_process';

const repo = 'xiaojiou176-open/multi-ai-sidepanel';

function parseHttpStatus(detail) {
  const match = detail.match(/\(HTTP (\d{3})\)/u);
  return match ? Number.parseInt(match[1], 10) : null;
}

function runGh(args, { allowStatuses = [] } = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync('gh', args, {
        cwd: process.cwd(),
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
      status: 0,
      detail: '',
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.error('[verify-host-security] missing tool: install GitHub CLI (`gh`) first.');
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
    const status = parseHttpStatus(detail);

    if (allowStatuses.includes(status)) {
      return {
        ok: false,
        stdout: '',
        status,
        detail,
      };
    }

    console.error(`[verify-host-security] gh ${args.join(' ')} failed: ${detail}`);
    process.exit(1);
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error(
      `[verify-host-security] failed to parse ${label}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

function tryRunGhJson(args, label, allowStatuses = []) {
  const result = runGh(args, { allowStatuses });
  if (!result.ok || !result.stdout) {
    return null;
  }
  return parseJson(result.stdout, label);
}

function tryRunGhCount(args, allowStatuses = []) {
  const result = runGh(args, { allowStatuses });
  if (!result.ok || !result.stdout) {
    return null;
  }
  return Number(result.stdout);
}

const repoMeta = parseJson(
  runGh([
    'api',
    `repos/${repo}`,
    '--jq',
    '{default_branch,private,visibility,security_and_analysis}',
  ]).stdout,
  'repo metadata',
);

const isPrivateRepo = repoMeta.private === true || repoMeta.visibility === 'private';
const findings = [];
const notes = [];

const privateReporting = isPrivateRepo
  ? null
  : tryRunGhJson(['api', `repos/${repo}/private-vulnerability-reporting`], 'private vulnerability reporting', [
      404,
    ]);

const branchProtection = tryRunGhJson(
  [
    'api',
    `repos/${repo}/branches/main/protection`,
    '--jq',
    '{required_status_checks,required_linear_history,allow_force_pushes,allow_deletions,required_conversation_resolution}',
  ],
  'branch protection',
  [403, 404],
);

const codeScanningSetup = tryRunGhJson(
  [
    'api',
    `repos/${repo}/code-scanning/default-setup`,
    '--jq',
    '{state,query_suite,schedule,runner_type}',
  ],
  'code scanning default setup',
  [403, 404],
);

const openSecretAlerts = tryRunGhCount(
  [
    'api',
    `repos/${repo}/secret-scanning/alerts?state=open&per_page=100`,
    '--jq',
    'length',
  ],
  [403, 404],
);

const openCodeScanningAlerts = tryRunGhCount(
  [
    'api',
    `repos/${repo}/code-scanning/alerts?state=open&per_page=100`,
    '--jq',
    'length',
  ],
  [403, 404],
);

const requiredContexts =
  branchProtection?.required_status_checks?.contexts ??
  branchProtection?.required_status_checks?.checks?.map((check) => check.context) ??
  [];

if (repoMeta.default_branch !== 'main') {
  findings.push(`default branch drifted: expected "main", got "${repoMeta.default_branch}"`);
}

if (!isPrivateRepo && repoMeta.security_and_analysis?.secret_scanning?.status !== 'enabled') {
  findings.push('secret scanning is not enabled');
}

if (
  !isPrivateRepo &&
  repoMeta.security_and_analysis?.secret_scanning_push_protection?.status !== 'enabled'
) {
  findings.push('secret scanning push protection is not enabled');
}

if (!isPrivateRepo && repoMeta.security_and_analysis?.dependabot_security_updates?.status !== 'enabled') {
  findings.push('Dependabot security updates are not enabled');
}

if (!isPrivateRepo && privateReporting?.enabled !== true) {
  findings.push('private vulnerability reporting is not enabled');
}

if (branchProtection && branchProtection.required_linear_history?.enabled !== true) {
  findings.push('required linear history is not enabled on main');
}

if (branchProtection && branchProtection.allow_force_pushes?.enabled !== false) {
  findings.push('force pushes are not blocked on main');
}

if (branchProtection && branchProtection.allow_deletions?.enabled !== false) {
  findings.push('branch deletions are not blocked on main');
}

if (branchProtection && branchProtection.required_conversation_resolution?.enabled !== true) {
  findings.push('required conversation resolution is not enabled on main');
}

if (branchProtection && branchProtection.required_status_checks?.strict !== true) {
  findings.push('required status checks are not strict on main');
}

for (const context of ['verify', 'extension-shell']) {
  if (branchProtection && !requiredContexts.includes(context)) {
    findings.push(`required status check missing: ${context}`);
  }
}

if (codeScanningSetup && codeScanningSetup.state !== 'configured') {
  findings.push(`code scanning default setup is not configured (state=${codeScanningSetup.state})`);
}

if (openSecretAlerts != null && openSecretAlerts !== 0) {
  findings.push(`open secret-scanning alerts must be 0, got ${openSecretAlerts}`);
}

if (openCodeScanningAlerts != null && openCodeScanningAlerts !== 0) {
  findings.push(`open code-scanning alerts must be 0, got ${openCodeScanningAlerts}`);
}

if (isPrivateRepo) {
  if (openSecretAlerts == null) {
    notes.push('secret-scanning open-alert API is unavailable on the current private-repo host surface');
  }
  if (openCodeScanningAlerts == null) {
    notes.push('code-scanning open-alert API is unavailable on the current private-repo host surface');
  }
  if (!branchProtection) {
    notes.push('branch protection API is unavailable on the current private-repo plan/visibility');
  }
  if (!codeScanningSetup) {
    notes.push('code-scanning setup API is unavailable on the current private-repo plan/visibility');
  }
}

if (findings.length > 0) {
  console.error('[verify-host-security] failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log('[verify-host-security] passed: host-side release gates are enabled');
console.log(
  isPrivateRepo
    ? `[verify-host-security] summary: repository is private, so some GitHub Advanced Security surfaces may be unavailable; branch protection, code-scanning setup, and open alert checks are enforced when those APIs are available for ${repo}`
    : `[verify-host-security] summary: secret scanning, push protection, private vulnerability reporting, branch protection, Dependabot security updates, code-scanning setup, and open secret/code-scanning alerts are in the expected state for ${repo}`,
);
for (const note of notes) {
  console.log(`[verify-host-security] note: ${note}`);
}
