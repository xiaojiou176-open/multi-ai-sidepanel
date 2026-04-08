import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const read = (relPath) => readFileSync(path.join(repoRoot, relPath), 'utf8');
const readJson = (relPath) => JSON.parse(read(relPath));

const findings = [];

const hostPackets = [
  {
    packageJson: 'mcp/integration-kits/public-bundles/codex-bundle/package.json',
    manifest: 'mcp/integration-kits/public-bundles/codex-bundle/manifest.json',
  },
  {
    packageJson: 'mcp/integration-kits/public-bundles/claude-code-bundle/package.json',
    manifest: 'mcp/integration-kits/public-bundles/claude-code-bundle/manifest.json',
  },
  {
    packageJson: 'mcp/integration-kits/public-bundles/opencode-plugin/package.json',
    manifest: 'mcp/integration-kits/public-bundles/opencode-plugin/manifest.json',
  },
  {
    packageJson: 'mcp/integration-kits/public-bundles/openclaw-bundle/package.json',
    manifest: 'mcp/integration-kits/public-bundles/openclaw-bundle/manifest.json',
  },
];

for (const { packageJson, manifest } of hostPackets) {
  if (!existsSync(path.join(repoRoot, packageJson))) {
    findings.push(`${packageJson} must exist.`);
    continue;
  }
  if (!existsSync(path.join(repoRoot, manifest))) {
    findings.push(`${manifest} must exist.`);
    continue;
  }

  const packetPackage = readJson(packageJson);
  const packetManifest = readJson(manifest);

  if (!Array.isArray(packetPackage.files) || !packetPackage.files.includes('manifest.json')) {
    findings.push(`${packageJson} must ship manifest.json.`);
  }
  for (const requiredField of [
    'schemaVersion',
    'kind',
    'id',
    'name',
    'description',
    'version',
    'license',
    'homepage',
    'repository',
    'supportTier',
    'publicationStatus',
    'install',
    'smoke',
    'capabilities',
  ]) {
    if (!(requiredField in packetManifest)) {
      findings.push(`${manifest} must expose ${requiredField}.`);
    }
  }

  if (packetManifest.version !== packetPackage.version) {
    findings.push(`${manifest} must match ${packageJson} version.`);
  }
  if (
    packetManifest.kind !== 'host_packet' &&
    packetManifest.kind !== 'prompt_switchboard_host_packet' &&
    packetManifest.kind !== 'prompt_switchboard_plugin_packet'
  ) {
    findings.push(`${manifest} must use a recognized packet kind.`);
  }
  if (typeof packetManifest.install?.host !== 'string') {
    findings.push(`${manifest} must expose install.host.`);
  }
  if (typeof packetManifest.install?.placement !== 'string') {
    findings.push(`${manifest} must expose install.placement.`);
  }
  if (
    !Array.isArray(packetManifest.smoke?.smallestUsefulFlow) ||
    packetManifest.smoke.smallestUsefulFlow.length === 0
  ) {
    findings.push(`${manifest} must expose smoke.smallestUsefulFlow.`);
  }
  if (!Array.isArray(packetManifest.capabilities) || packetManifest.capabilities.length === 0) {
    findings.push(`${manifest} must expose capabilities.`);
  }
}

for (const relPath of [
  'mcp/integration-kits/public-bundles/codex-bundle/skills/prompt-switchboard/manifest.yaml',
  'mcp/integration-kits/public-bundles/openclaw-bundle/skills/prompt-switchboard/manifest.yaml',
]) {
  if (!existsSync(path.join(repoRoot, relPath))) {
    findings.push(`${relPath} must exist.`);
    continue;
  }

  const text = read(relPath);
  for (const requiredSnippet of [
    'schemaVersion:',
    'kind: skill_packet',
    'name:',
    'description:',
    'version:',
    'homepage:',
    'repository:',
    'supportTier:',
    'publicationStatus:',
    'placement:',
    'capabilities:',
    'smoke:',
  ]) {
    if (!text.includes(requiredSnippet)) {
      findings.push(`${relPath} must include ${requiredSnippet}.`);
    }
  }
}

if (findings.length > 0) {
  console.error('[packet-manifests] failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(
  '[packet-manifests] passed: host packet manifests and embedded skill manifests stay internally consistent'
);
