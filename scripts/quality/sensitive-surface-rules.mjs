import path from 'node:path';

export const TEXT_SURFACE_SKIP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.ico',
  '.woff',
  '.woff2',
  '.ttf',
  '.eot',
  '.mp4',
  '.mov',
  '.pdf',
  '.zip',
  '.tgz',
  '.gz',
]);

export const TEXT_SURFACE_SKIP_BASENAMES = new Set([
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
]);

export const FORBIDDEN_TRACKED_PATH_RULES = [
  {
    id: 'env_file',
    reason: 'tracked .env file',
    test: (relPath) =>
      relPath === '.env' || (relPath.startsWith('.env.') && relPath !== '.env.example'),
  },
  {
    id: 'runtime_cache',
    reason: 'tracked runtime cache',
    test: (relPath) => relPath.startsWith('.runtime-cache/'),
  },
  {
    id: 'logs_dir',
    reason: 'tracked log directory',
    test: (relPath) => relPath.startsWith('logs/') || relPath.startsWith('log/'),
  },
  {
    id: 'log_file',
    reason: 'tracked log file',
    test: (relPath) => relPath.endsWith('.log'),
  },
  {
    id: 'playwright_report',
    reason: 'tracked Playwright report',
    test: (relPath) => relPath.startsWith('playwright-report/'),
  },
  {
    id: 'test_results',
    reason: 'tracked test results',
    test: (relPath) => relPath.startsWith('test-results/'),
  },
  {
    id: 'macos_metadata',
    reason: 'tracked macOS metadata',
    test: (relPath) => relPath === '.DS_Store' || relPath.includes('/.DS_Store'),
  },
];

export const LOCAL_MACHINE_PATH_PATTERNS = [
  /\/Users\/(?!username(?:\/|$)|user(?:\/|$)|example(?:\/|$)|yourname(?:\/|$)|your-user(?:\/|$))/u,
  /\/home\/(?!runner(?:\/|$)|dependabot(?:\/|$)|username(?:\/|$)|user(?:\/|$)|example(?:\/|$)|yourname(?:\/|$)|your-user(?:\/|$))/u,
  /\/var\/folders\//u,
  /C:\\Users\\(?!username\\|user\\|example\\|yourname\\|your-user\\)/u,
  /Documents\/VS Code/u,
];

export const SECRET_LIKE_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9_]{20,}/u,
  /gho_[A-Za-z0-9_]{20,}/u,
  /AKIA[0-9A-Z]{16}/u,
  /sk-[A-Za-z0-9]{16,}/u,
  /xox[baprs]-[A-Za-z0-9-]{10,}/u,
];

export const PRIVATE_KEY_PATTERNS = [
  /BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY/u,
];

export const RAW_PREVIEW_PATTERNS = [
  /"promptPreview"\s*:\s*"(?!\[redacted promptPreview\])[^"]+/u,
  /"bodyPreview"\s*:\s*"(?!\[redacted bodyPreview\])[^"]+/u,
];

const LOCAL_PATH_PATTERN_CARRIER_FILES = new Set([
  'scripts/quality/check-integration-kits.mjs',
  'scripts/quality/sensitive-surface-rules.mjs',
  'scripts/quality/verify-sensitive-surface.mjs',
  'scripts/quality/verify-host-sensitive-surface.mjs',
  'scripts/quality/verify-sensitive-surface.test.ts',
]);

const SECRET_PATTERN_CARRIER_FILES = new Set([
  'scripts/quality/sensitive-surface-rules.mjs',
  'scripts/quality/verify-sensitive-surface.mjs',
  'scripts/quality/verify-host-sensitive-surface.mjs',
  'scripts/quality/verify-sensitive-surface.test.ts',
]);

export const normalizeRepoPath = (filePath) => filePath.split(path.sep).join('/');

export const shouldScanTextSurface = (filePath) => {
  const normalized = normalizeRepoPath(filePath);
  const basename = path.posix.basename(normalized);
  const extension = path.posix.extname(normalized).toLowerCase();

  if (TEXT_SURFACE_SKIP_BASENAMES.has(basename)) {
    return false;
  }

  return !TEXT_SURFACE_SKIP_EXTENSIONS.has(extension);
};

export const findForbiddenTrackedPathFindings = (filePath) => {
  const normalized = normalizeRepoPath(filePath);
  return FORBIDDEN_TRACKED_PATH_RULES.filter((rule) => rule.test(normalized)).map((rule) => ({
    id: rule.id,
    reason: rule.reason,
  }));
};

export const findTextSurfaceFindings = (filePath, text) => {
  const normalized = normalizeRepoPath(filePath);
  const findings = [];

  if (
    !LOCAL_PATH_PATTERN_CARRIER_FILES.has(normalized) &&
    LOCAL_MACHINE_PATH_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    findings.push({
      id: 'local_machine_path',
      reason: 'contains a maintainer-local absolute path marker',
    });
  }

  if (
    !SECRET_PATTERN_CARRIER_FILES.has(normalized) &&
    SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    findings.push({
      id: 'secret_like_pattern',
      reason: 'contains a credential-like token pattern',
    });
  }

  if (
    !SECRET_PATTERN_CARRIER_FILES.has(normalized) &&
    PRIVATE_KEY_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    findings.push({
      id: 'private_key_block',
      reason: 'contains a private-key block marker',
    });
  }

  return findings;
};

export const findOutputSurfaceFindingsWithContext = (text, { sourcePath } = {}) => {
  const normalizedSourcePath =
    typeof sourcePath === 'string' && sourcePath.trim().length > 0
      ? normalizeRepoPath(sourcePath)
      : null;
  const findings = [];

  if (
    !(
      normalizedSourcePath && LOCAL_PATH_PATTERN_CARRIER_FILES.has(normalizedSourcePath)
    ) &&
    LOCAL_MACHINE_PATH_PATTERNS.some((pattern) => pattern.test(text))
  ) {
    findings.push({
      id: 'local_machine_path',
      reason: 'output exposed a maintainer-local absolute path marker',
    });
  }

  if (SECRET_LIKE_PATTERNS.some((pattern) => pattern.test(text))) {
    findings.push({
      id: 'secret_like_pattern',
      reason: 'output exposed a credential-like token pattern',
    });
  }

  if (PRIVATE_KEY_PATTERNS.some((pattern) => pattern.test(text))) {
    findings.push({
      id: 'private_key_block',
      reason: 'output exposed a private-key block marker',
    });
  }

  if (RAW_PREVIEW_PATTERNS.some((pattern) => pattern.test(text))) {
    findings.push({
      id: 'raw_preview_field',
      reason: 'output exposed a raw prompt/body preview field',
    });
  }

  return findings;
};

export const findOutputSurfaceFindings = (text) => findOutputSurfaceFindingsWithContext(text);
