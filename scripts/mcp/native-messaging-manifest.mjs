import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const args = new Map(
  process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.split('=');
    return [key, rest.join('=')];
  })
);

const extensionId = args.get('--extension-id') || '';
const hostPath = args.get('--host-path') || '';
const browser = (args.get('--browser') || 'chrome').toLowerCase();
const write = process.argv.includes('--write');
const dryRun = !write || process.argv.includes('--dry-run');

const usage = () => {
  console.log(
    [
      'Usage:',
      '  node scripts/mcp/native-messaging-manifest.mjs --extension-id=<id> --host-path=/absolute/path/to/native-host [--browser=chrome|chromium] [--write]',
      '',
      'Notes:',
      '  - defaults to dry-run',
      '  - only user-level macOS/Linux paths are supported by this helper',
      '  - this renders a scaffold manifest; it does not claim the current release is already wired to use Native Messaging',
    ].join('\n')
  );
};

const resolveInstallDir = () => {
  const platform = process.platform;
  const homeDir = os.homedir();

  if (platform === 'darwin') {
    if (browser === 'chromium') {
      return path.join(homeDir, 'Library', 'Application Support', 'Chromium', 'NativeMessagingHosts');
    }
    return path.join(
      homeDir,
      'Library',
      'Application Support',
      'Google',
      'Chrome',
      'NativeMessagingHosts'
    );
  }

  if (platform === 'linux') {
    if (browser === 'chromium') {
      return path.join(homeDir, '.config', 'chromium', 'NativeMessagingHosts');
    }
    return path.join(homeDir, '.config', 'google-chrome', 'NativeMessagingHosts');
  }

  throw new Error(
    'native_messaging_helper_platform_unsupported: use the template file and Chrome docs for Windows or other platforms'
  );
};

if (!extensionId || !hostPath) {
  usage();
  process.exitCode = 1;
} else if (!path.isAbsolute(hostPath)) {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: 'native_messaging_host_path_must_be_absolute',
        hostPath,
      },
      null,
      2
    )
  );
  process.exitCode = 1;
} else {
  const installDir = resolveInstallDir();
  const manifestPath = path.join(installDir, 'com.prompt_switchboard.host.json');
  const manifest = {
    name: 'com.prompt_switchboard.host',
    description: 'Prompt Switchboard Native Messaging host scaffold',
    path: hostPath,
    type: 'stdio',
    allowed_origins: [`chrome-extension://${extensionId}/`],
  };

  if (write && !dryRun) {
    fs.mkdirSync(installDir, { recursive: true });
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        dryRun,
        shippedInCurrentRelease: false,
        browser,
        installDir,
        manifestPath,
        manifest,
        nextAction: dryRun
          ? 'Review the manifest output, then rerun with --write if you want to create the user-level scaffold file.'
          : 'The user-level scaffold manifest was written. The current release still uses the loopback bridge until extension-side Native Messaging wiring is added in a future change.',
      },
      null,
      2
    )
  );
}
