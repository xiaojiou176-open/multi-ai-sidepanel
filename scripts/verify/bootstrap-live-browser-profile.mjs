import process from 'node:process';
import { spawnSync } from 'node:child_process';
import {
  PERSISTENT_BROWSER_PROFILE_DIRECTORY,
  bootstrapPersistentBrowserProfile,
  getPersistentBrowserUserDataDir,
  resolveSourceBrowserProfile,
} from '../shared/runtime-governance.mjs';

const inspectBootstrapConflicts = () => {
  const sourceProfile = resolveSourceBrowserProfile();
  const targetUserDataDir = getPersistentBrowserUserDataDir();
  const result = spawnSync('ps', ['-axo', 'pid=,args='], {
    encoding: 'utf8',
  });

  if ((result.status ?? 1) !== 0) {
    return {
      blockers: [
        result.stderr?.trim() || 'Could not inspect running browser processes before bootstrap.',
      ],
      sample: [],
      sourceProfile,
      targetUserDataDir,
    };
  }

  const lines = (result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const relevantLines = lines.filter(
    (line) =>
      line.includes('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ||
      line.includes(`--user-data-dir=${sourceProfile.userDataDir}`) ||
      line.includes(`--user-data-dir=${targetUserDataDir}`)
  );

  return {
    blockers:
      relevantLines.length > 0
        ? [
            'Close every real Google Chrome process that may still be holding the source or target browser roots before bootstrapping the isolated Prompt Switchboard browser root.',
          ]
        : [],
    sample: relevantLines.slice(0, 8),
    sourceProfile,
    targetUserDataDir,
  };
};

const bootstrapConflicts = inspectBootstrapConflicts();

if (bootstrapConflicts.blockers.length > 0) {
  process.stdout.write(
    `${JSON.stringify(
      {
        ok: false,
        mode: 'prompt_switchboard_live_bootstrap_profile',
        blockers: bootstrapConflicts.blockers,
        bootstrapConflicts: {
          sourceUserDataDir: bootstrapConflicts.sourceProfile.userDataDir,
          sourceProfileDirectory: bootstrapConflicts.sourceProfile.profileDirectory,
          targetUserDataDir: bootstrapConflicts.targetUserDataDir,
          sample: bootstrapConflicts.sample,
        },
      },
      null,
      2
    )}\n`
  );
  process.exit(1);
}

const result = bootstrapPersistentBrowserProfile({
  log: (message) => console.log(`[test:live:bootstrap-profile] ${message}`),
});

process.stdout.write(
  `${JSON.stringify(
    {
      ok: result.ok,
      mode: 'prompt_switchboard_live_bootstrap_profile',
      alreadyBootstrapped: result.alreadyBootstrapped,
      sourceUserDataDir: result.sourceProfile.userDataDir,
      sourceProfileName: result.sourceProfile.profileName,
      sourceProfileDirectory: result.sourceProfile.profileDirectory,
      targetUserDataDir: result.target.userDataDir,
      targetProfileDirectory: PERSISTENT_BROWSER_PROFILE_DIRECTORY,
      targetProfileName: result.target.profileName,
      targetBootstrapReady: result.target.bootstrapReady,
      removedSingletonArtifacts: result.removedSingletonArtifacts,
      blockers: result.blockers,
    },
    null,
    2
  )}\n`
);

process.exit(result.ok ? 0 : 1);
