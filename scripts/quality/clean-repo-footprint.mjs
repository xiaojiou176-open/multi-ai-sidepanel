import { rmSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const profileArg = process.argv.find((arg) => arg.startsWith('--profile='));
const profile = profileArg ? profileArg.slice('--profile='.length) : 'light';

const profileTargets = {
  light: ['dist', 'mcp-dist', 'coverage', '.husky/_'],
  heavy: ['dist', 'mcp-dist', 'coverage', '.husky/_', 'node_modules'],
};

const targets = profileTargets[profile];

if (!targets) {
  console.error(`[clean-repo-footprint] invalid profile: ${profile}`);
  console.error('[clean-repo-footprint] expected --profile=light or --profile=heavy');
  process.exit(1);
}

for (const relPath of targets) {
  const absolutePath = path.resolve(repoRoot, relPath);
  const relativeCheck = path.relative(repoRoot, absolutePath);

  if (relativeCheck === '' || relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
    console.error(`[clean-repo-footprint] refused to remove out-of-repo path: ${relPath}`);
    process.exit(1);
  }

  try {
    rmSync(absolutePath, { recursive: true, force: true });
    console.log(`[clean-repo-footprint] ${profile} removed ${relPath}`);
  } catch (error) {
    console.error(
      `[clean-repo-footprint] failed to remove ${relPath}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
    process.exitCode = 1;
  }
}

if (process.exitCode !== 1) {
  console.log(
    `[clean-repo-footprint] completed ${profile}; preserved .agents, .vscode, .git, docs/assets`
  );
}
