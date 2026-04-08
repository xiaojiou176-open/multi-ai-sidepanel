import { describe, expect, it } from 'vitest';

import {
  findForbiddenTrackedPathFindings,
  findOutputSurfaceFindings,
  findOutputSurfaceFindingsWithContext,
  findTextSurfaceFindings,
  shouldScanTextSurface,
} from './sensitive-surface-rules.mjs';

describe('sensitive surface rules', () => {
  it('flags tracked runtime artifacts and .env files', () => {
    expect(findForbiddenTrackedPathFindings('.env').map((entry) => entry.id)).toContain('env_file');
    expect(findForbiddenTrackedPathFindings('logs/build.log').map((entry) => entry.id)).toContain(
      'logs_dir',
    );
    expect(
      findForbiddenTrackedPathFindings('.runtime-cache/live-site-runs/report.json').map(
        (entry) => entry.id,
      ),
    ).toContain('runtime_cache');
  });

  it('flags maintainer-local absolute paths in normal tracked content', () => {
    const findings = findTextSurfaceFindings(
      'docs/example.md',
      'cwd = "/Users/terry/project"\ncommand = "npm"',
    );

    expect(findings.map((entry) => entry.id)).toContain('local_machine_path');
  });

  it('allows detector files to carry the local-path rule literals', () => {
    const findings = findTextSurfaceFindings(
      'scripts/quality/check-integration-kits.mjs',
      "const FORBIDDEN_LOCAL_PATH_PATTERNS = ['/Users/', '/home/', 'C:\\\\Users\\\\'];",
    );

    expect(findings).toEqual([]);
  });

  it('does not flag GitHub automation home directories as maintainer-local output', () => {
    const findings = findOutputSurfaceFindings(
      'git clone https://github.com/xiaojiou176-open/multi-ai-sidepanel /home/dependabot/dependabot-updater/repo',
    );

    expect(findings).toEqual([]);
  });

  it('allows known detector files to appear in output surfaces when the source path is explicit', () => {
    const findings = findOutputSurfaceFindingsWithContext(
      "const FORBIDDEN_LOCAL_PATH_PATTERNS = ['/Users/', '/home/', 'C:\\\\Users\\\\'];",
      { sourcePath: 'scripts/quality/check-integration-kits.mjs' },
    );

    expect(findings).toEqual([]);
  });

  it('still flags local machine paths in non-carrier output surfaces', () => {
    const findings = findOutputSurfaceFindingsWithContext(
      "const FORBIDDEN_LOCAL_PATH_PATTERNS = ['/Users/', '/home/', 'C:\\\\Users\\\\'];",
      { sourcePath: 'docs/example.md' },
    );

    expect(findings.map((entry) => entry.id)).toContain('local_machine_path');
  });

  it('flags raw preview fields in operational output and accepts redacted previews', () => {
    const leaked = JSON.stringify({ promptPreview: 'raw prompt body' });
    const redacted = JSON.stringify({ promptPreview: '[redacted promptPreview]' });

    expect(findOutputSurfaceFindings(leaked).map((entry) => entry.id)).toContain('raw_preview_field');
    expect(findOutputSurfaceFindings(redacted)).toEqual([]);
  });

  it('skips lockfiles from text-surface scans', () => {
    expect(shouldScanTextSurface('package-lock.json')).toBe(false);
    expect(shouldScanTextSurface('docs/index.html')).toBe(true);
  });
});
