import { execFileSync } from 'node:child_process';

const ghToken = process.env.GH_TOKEN || process.env.HOST_VERIFY_GH_TOKEN || '';

const result = {
  mode: 'prompt_switchboard_host_verify_doctor',
  ghInstalled: false,
  tokenPresent: Boolean(ghToken),
  ghAuthStatus: 'unknown',
  authSource: 'none',
  nextActions: [],
};

try {
  execFileSync('gh', ['--version'], {
    cwd: process.cwd(),
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  });
  result.ghInstalled = true;
} catch {
  result.nextActions.push('Install GitHub CLI (`gh`) before running host-side verification scripts.');
}

if (result.ghInstalled) {
  const authEnvs = result.tokenPresent
    ? {
        ...process.env,
        GH_TOKEN: ghToken,
      }
    : process.env;

  try {
    const whoami = execFileSync('gh', ['api', 'user', '--jq', '.login'], {
      cwd: process.cwd(),
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
      env: authEnvs,
    }).trim();

    result.ghAuthStatus = whoami ? `authenticated:${whoami}` : 'authenticated:unknown-user';
    result.authSource = result.tokenPresent ? 'env-token' : 'gh-keyring-session';
  } catch {
    result.ghAuthStatus = result.tokenPresent
      ? 'token_present_but_auth_failed'
      : 'gh_installed_no_auth';
    result.nextActions.push(
      result.tokenPresent
        ? 'The current token could not authenticate with gh api user. Refresh the token before running verify:host-*.'
        : 'Authenticate gh or export GH_TOKEN / HOST_VERIFY_GH_TOKEN before running verify:host-* locally.'
    );
  }
}

if (result.nextActions.length === 0) {
  result.nextActions.push(
    'Host verification prerequisites look ready. Run verify:host:pack for the default host surface, then add verify:host-release-proof when you need published-release proof.'
  );
}

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
