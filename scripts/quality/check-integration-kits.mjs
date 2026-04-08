import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();

const read = (relPath) => readFileSync(path.join(repoRoot, relPath), 'utf8');
const readJson = (relPath) => JSON.parse(read(relPath));
const stripJsonComments = (text) =>
  text.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');

const expect = (condition, message, findings) => {
  if (!condition) {
    findings.push(message);
  }
};

const expectNonEmptyString = (value, label, findings) => {
  expect(
    typeof value === 'string' && value.trim().length > 0,
    `${label} must be a non-empty string.`,
    findings
  );
};

const expectStringArray = (value, label, findings) => {
  expect(
    Array.isArray(value) &&
      value.length > 0 &&
      value.every((item) => typeof item === 'string' && item.trim().length > 0),
    `${label} must be a non-empty string array.`,
    findings
  );
};

const readSkillFrontmatter = (relPath) => {
  const text = read(relPath);
  const match = text.match(/^---\n([\s\S]*?)\n---/);
  if (!match) {
    return {};
  }

  return Object.fromEntries(
    match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        const [key, ...rest] = line.split(':');
        return [key.trim(), rest.join(':').trim()];
      })
  );
};

const readSkillManifestYaml = (relPath) => {
  const text = read(relPath);
  const scalar = (key) =>
    text
      .match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))?.[1]
      ?.trim()
      ?.replace(/^"|"$/g, '');
  const list = (key) => {
    const match = text.match(new RegExp(`^${key}:\\n((?:\\s+-\\s.+\\n?)+)`, 'm'));
    if (!match) {
      return [];
    }

    return match[1]
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.startsWith('- '))
      .map((line) => line.slice(2).trim());
  };
  const nestedScalar = (section, key) =>
    text
      .match(new RegExp(`^${section}:\\n(?:\\s+.+\\n)*\\s+${key}:\\s*(.+)$`, 'm'))?.[1]
      ?.trim()
      ?.replace(/^"|"$/g, '');

  return {
    schemaVersion: scalar('schemaVersion'),
    kind: scalar('kind'),
    id: scalar('id'),
    name: scalar('name'),
    description: scalar('description'),
    version: scalar('version'),
    license: scalar('license'),
    homepage: scalar('homepage'),
    repository: {
      type: nestedScalar('repository', 'type'),
      url: nestedScalar('repository', 'url'),
      directory: nestedScalar('repository', 'directory'),
    },
    supportTier: scalar('supportTier'),
    publicationStatus: scalar('publicationStatus'),
    host: scalar('host'),
    placement: {
      relativePath: nestedScalar('placement', 'relativePath'),
      discoveryRoots: list('discoveryRoots'),
    },
    capabilities: list('capabilities'),
    smoke: {
      path: nestedScalar('smoke', 'path'),
      minimalFlow: list('minimalFlow'),
      preferredFlow: list('preferredFlow'),
    },
  };
};

const PATH_PLACEHOLDER = '/absolute/path/to/multi-ai-sidepanel';
const FORBIDDEN_LOCAL_PATH_PATTERNS = ['/Users/', '/home/', 'C:\\Users\\'];
const ROOT_PACKAGE_REQUIRED_FIELDS = [
  'description',
  'homepage',
  'repository',
  'bugs',
  'keywords',
  'license',
];
const packetManifestRequiredFields = [
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
  'capabilities',
  'install',
  'smoke',
];
const skillManifestRequiredFields = [
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
  'host',
  'placement',
  'capabilities',
  'smoke',
];
const packetManifestPaths = {
  codex: 'mcp/integration-kits/public-bundles/codex-bundle/manifest.json',
  claude_code: 'mcp/integration-kits/public-bundles/claude-code-bundle/manifest.json',
  opencode: 'mcp/integration-kits/public-bundles/opencode-plugin/manifest.json',
  openclaw: 'mcp/integration-kits/public-bundles/openclaw-bundle/manifest.json',
};
const skillManifestPaths = {
  codex: 'mcp/integration-kits/public-bundles/codex-bundle/skills/prompt-switchboard/manifest.yaml',
  openclaw:
    'mcp/integration-kits/public-bundles/openclaw-bundle/skills/prompt-switchboard/manifest.yaml',
};

const findings = [];
const rootPackage = readJson('package.json');
const frontdoorMetadata = readJson('docs/frontdoor-metadata.json');
const supportMatrix = readJson('mcp/integration-kits/support-matrix.json');
const publicDistributionMatrix = readJson('mcp/integration-kits/public-distribution-matrix.json');
const distributionSubjectMap = readJson('mcp/integration-kits/distribution-subject-map.json');
const skillManifestSchema = readJson('mcp/integration-kits/skill-manifest.schema.json');

const codexKit = read('mcp/integration-kits/codex.config.toml.example');
expect(
  codexKit.includes('[mcp_servers.prompt_switchboard]'),
  'Codex starter kit is missing the prompt_switchboard TOML block.',
  findings
);

const claudeKit = readJson('mcp/integration-kits/claude.mcp.json.example');
expect(
  claudeKit?.mcpServers?.prompt_switchboard?.command === 'npm',
  'Claude starter kit must launch Prompt Switchboard with npm.',
  findings
);

const openCodeKit = JSON.parse(
  stripJsonComments(read('mcp/integration-kits/opencode.jsonc.example'))
);
expect(
  openCodeKit?.mcp?.prompt_switchboard?.type === 'local',
  'OpenCode starter kit must declare a local MCP server.',
  findings
);
expect(
  Array.isArray(openCodeKit?.mcp?.prompt_switchboard?.command),
  'OpenCode starter kit must keep the command as an array.',
  findings
);

const openClawJson = readJson('mcp/integration-kits/openclaw.prompt-switchboard.json.example');
expect(
  openClawJson?.command === 'npm',
  'OpenClaw starter JSON must launch Prompt Switchboard through npm.',
  findings
);
expect(
  Array.isArray(openClawJson?.args) && openClawJson.args.length > 0,
  'OpenClaw starter JSON must include command args.',
  findings
);
expect(
  openClawJson?.args?.includes('mcp:server'),
  'OpenClaw starter JSON must still target npm run mcp:server.',
  findings
);

const openClawShell = read('mcp/integration-kits/openclaw.mcp.set.example.sh');
expect(
  openClawShell.includes('openclaw mcp set prompt_switchboard'),
  'OpenClaw shell helper must show the exact registry command.',
  findings
);
expect(
  openClawShell.includes('\\"command\\": \\"npm\\"'),
  'OpenClaw shell helper must stay aligned with the npm-based JSON payload.',
  findings
);

const kitsReadme = read('mcp/integration-kits/README.md');
for (const relPath of [
  'codex.config.toml.example',
  'claude.mcp.json.example',
  'opencode.jsonc.example',
  'openclaw.prompt-switchboard.json.example',
  'openclaw.mcp.servers.json.example',
  'openclaw.mcp.set.example.sh',
  'distribution-subject-map.json',
  'skill-manifest.schema.json',
  'manifest.json',
]) {
  expect(kitsReadme.includes(relPath), `Integration kits README is missing ${relPath}.`, findings);
}

expect(
  supportMatrix?.path_placeholder === PATH_PLACEHOLDER,
  'Support matrix must expose the shared path_placeholder.',
  findings
);
expect(
  typeof supportMatrix?.container_entry?.dockerfile === 'string',
  'Support matrix must expose container_entry.dockerfile.',
  findings
);
expect(
  typeof supportMatrix?.container_entry?.doc_page === 'string',
  'Support matrix must expose container_entry.doc_page.',
  findings
);
expect(
  Array.isArray(supportMatrix?.container_entry?.not_a),
  'Support matrix must expose container_entry.not_a.',
  findings
);
expect(
  typeof supportMatrix?.container_entry?.bridge_requirement === 'string' &&
    supportMatrix.container_entry.bridge_requirement.includes(
      'PROMPT_SWITCHBOARD_BRIDGE_HOST=0.0.0.0'
    ),
  'Support matrix container_entry.bridge_requirement must document PROMPT_SWITCHBOARD_BRIDGE_HOST=0.0.0.0.',
  findings
);

for (const host of ['codex', 'claude_code', 'opencode', 'openclaw']) {
  expect(
    Boolean(supportMatrix?.hosts?.[host]),
    `Support matrix must expose hosts.${host}.`,
    findings
  );
  expect(
    typeof supportMatrix?.hosts?.[host]?.placement_hint === 'string',
    `Support matrix must expose hosts.${host}.placement_hint.`,
    findings
  );
  expect(
    typeof supportMatrix?.hosts?.[host]?.public_bundle_dir === 'string',
    `Support matrix must expose hosts.${host}.public_bundle_dir.`,
    findings
  );
  expect(
    typeof supportMatrix?.hosts?.[host]?.manifest_path === 'string',
    `Support matrix must expose hosts.${host}.manifest_path.`,
    findings
  );
}
expect(
  Array.isArray(supportMatrix?.public_bundle_ready_unverified_host_lane),
  'Support matrix must expose public_bundle_ready_unverified_host_lane.',
  findings
);
expect(
  Array.isArray(supportMatrix?.workflow_followthrough) &&
    supportMatrix.workflow_followthrough.includes('prompt_switchboard.get_workflow_run') &&
    supportMatrix.workflow_followthrough.includes('prompt_switchboard.list_workflow_runs') &&
    supportMatrix.workflow_followthrough.includes('prompt_switchboard.resume_workflow'),
  'Support matrix must expose the workflow_followthrough sequence for get/list/resume.',
  findings
);

for (const host of ['codex', 'claude_code', 'opencode', 'openclaw']) {
  expect(
    Boolean(publicDistributionMatrix?.hosts?.[host]),
    `Public distribution matrix must expose hosts.${host}.`,
    findings
  );
  expect(
    Array.isArray(publicDistributionMatrix?.hosts?.[host]?.public_bundle_assets),
    `Public distribution matrix must expose hosts.${host}.public_bundle_assets.`,
    findings
  );
  expect(
    typeof publicDistributionMatrix?.hosts?.[host]?.truthful_claim === 'string',
    `Public distribution matrix must expose hosts.${host}.truthful_claim.`,
    findings
  );
}
expect(
  publicDistributionMatrix?.distribution_subject_map ===
    'mcp/integration-kits/distribution-subject-map.json',
  'Public distribution matrix must point at distribution-subject-map.json.',
  findings
);
expect(
  typeof publicDistributionMatrix?.docker_glama_surface?.doc_page === 'string' &&
    publicDistributionMatrix.docker_glama_surface.doc_page === 'docs/mcp-docker-sidecar.html',
  'Public distribution matrix must point Docker docs at docs/mcp-docker-sidecar.html.',
  findings
);

for (const field of ROOT_PACKAGE_REQUIRED_FIELDS) {
  expect(field in rootPackage, `package.json must expose ${field}.`, findings);
}
expect(rootPackage.private === true, 'Root package must stay private.', findings);
expectNonEmptyString(rootPackage.description, 'package.json description', findings);
expect(
  rootPackage.description === frontdoorMetadata.repo_description,
  'package.json description must stay aligned with docs/frontdoor-metadata.json repo_description.',
  findings
);
expect(
  rootPackage.homepage === frontdoorMetadata.homepage_url,
  'package.json homepage must stay aligned with docs/frontdoor-metadata.json homepage_url.',
  findings
);
expect(
  rootPackage?.bugs?.url === frontdoorMetadata.issues_url,
  'package.json bugs.url must stay aligned with docs/frontdoor-metadata.json issues_url.',
  findings
);
expectStringArray(rootPackage.keywords, 'package.json keywords', findings);

expect(
  distributionSubjectMap?.rootPackage?.private === true,
  'distribution-subject-map rootPackage.private must stay true.',
  findings
);
expect(
  distributionSubjectMap?.rootPackage?.publishable === false,
  'distribution-subject-map rootPackage.publishable must stay false.',
  findings
);
expect(
  Array.isArray(distributionSubjectMap?.primaryPublishableUnits) &&
    distributionSubjectMap.primaryPublishableUnits.length === 6,
  'distribution-subject-map must list six primary publishable units.',
  findings
);
expect(
  Array.isArray(distributionSubjectMap?.embeddedSkillPackets) &&
    distributionSubjectMap.embeddedSkillPackets.length === 2,
  'distribution-subject-map must list two embedded skill packets.',
  findings
);

expect(
  skillManifestSchema?.$id ===
    'https://xiaojiou176-open.github.io/multi-ai-sidepanel/mcp/integration-kits/skill-manifest.schema.json',
  'skill-manifest.schema.json must keep the canonical schema id.',
  findings
);

for (const [host, manifestPath] of Object.entries(packetManifestPaths)) {
  expect(existsSync(path.join(repoRoot, manifestPath)), `${manifestPath} must exist.`, findings);
  const manifest = readJson(manifestPath);
  const packageJsonPath = manifestPath.replace('/manifest.json', '/package.json');
  const bundlePackage = readJson(packageJsonPath);

  for (const field of packetManifestRequiredFields) {
    expect(field in manifest, `${manifestPath} must expose ${field}.`, findings);
  }

  expect(
    ['host_packet', 'prompt_switchboard_host_packet', 'prompt_switchboard_plugin_packet'].includes(
      manifest.kind
    ),
    `${manifestPath} kind must stay on a recognized packet type.`,
    findings
  );
  expect(
    manifest.id === bundlePackage.name,
    `${manifestPath} id must match ${packageJsonPath} name.`,
    findings
  );
  expect(
    manifest.version === rootPackage.version,
    `${manifestPath} version must stay aligned with root package version.`,
    findings
  );
  expect(
    manifest.license === rootPackage.license,
    `${manifestPath} license must stay aligned with root package license.`,
    findings
  );
  expectStringArray(manifest.capabilities, `${manifestPath} capabilities`, findings);
  expect(
    Array.isArray(bundlePackage.files) && bundlePackage.files.includes('manifest.json'),
    `${packageJsonPath} must include manifest.json in files.`,
    findings
  );
  expect(
    supportMatrix?.hosts?.[host]?.manifest_path ===
      manifestPath.replace('mcp/integration-kits/', ''),
    `support-matrix host ${host} must expose the correct manifest_path.`,
    findings
  );
  expect(
    Array.isArray(publicDistributionMatrix?.hosts?.[host]?.public_bundle_assets) &&
      publicDistributionMatrix.hosts[host].public_bundle_assets.includes(manifestPath),
    `public-distribution-matrix host ${host} must include ${manifestPath}.`,
    findings
  );
}

for (const [host, manifestPath] of Object.entries(skillManifestPaths)) {
  expect(existsSync(path.join(repoRoot, manifestPath)), `${manifestPath} must exist.`, findings);
  const manifest = readSkillManifestYaml(manifestPath);
  const skillPath = manifestPath.replace('/manifest.yaml', '/SKILL.md');
  const frontmatter = readSkillFrontmatter(skillPath);

  for (const field of skillManifestRequiredFields) {
    expect(field in manifest, `${manifestPath} must expose ${field}.`, findings);
  }

  expect(manifest.kind === 'skill_packet', `${manifestPath} kind must be skill_packet.`, findings);
  expect(
    manifest.version === rootPackage.version,
    `${manifestPath} version must stay aligned with root package version.`,
    findings
  );
  expect(
    manifest.name === frontmatter.name,
    `${manifestPath} name must match ${skillPath} frontmatter.`,
    findings
  );
  expect(
    manifest.description === frontmatter.description,
    `${manifestPath} description must match ${skillPath} frontmatter.`,
    findings
  );
  expectStringArray(manifest.capabilities, `${manifestPath} capabilities`, findings);
  expect(
    supportMatrix?.hosts?.[host]?.skill_manifest_paths?.includes(
      manifestPath.replace('mcp/integration-kits/', '')
    ),
    `support-matrix host ${host} must expose ${manifestPath.replace('mcp/integration-kits/', '')}.`,
    findings
  );
}

for (const relPath of [
  'Dockerfile',
  '.dockerignore',
  'docker/README.md',
  'docker/entrypoint.mjs',
  'docker/healthcheck.mjs',
  'docs/mcp-docker-sidecar.html',
]) {
  expect(existsSync(path.join(repoRoot, relPath)), `${relPath} must exist.`, findings);
}

const dockerfile = read('Dockerfile');
expect(
  dockerfile.includes('PROMPT_SWITCHBOARD_BRIDGE_HOST=0.0.0.0'),
  'Dockerfile must publish the bridge by setting PROMPT_SWITCHBOARD_BRIDGE_HOST=0.0.0.0.',
  findings
);
expect(
  dockerfile.includes('io.modelcontextprotocol.server.name='),
  'Dockerfile must carry an io.modelcontextprotocol.server.name label for future OCI publication.',
  findings
);

const starterKitsDoc = read('docs/mcp-starter-kits.html');
const publicDistributionDoc = read('docs/public-distribution-matrix.html');
const hostPacketsDoc = read('docs/mcp-host-packets.html');
if (!starterKitsDoc.includes(PATH_PLACEHOLDER)) {
  findings.push('Starter kits page must use the shared placeholder path.');
}
for (const needle of ['Codex', 'Claude Code', 'OpenCode', 'OpenClaw']) {
  if (!starterKitsDoc.includes(needle)) {
    findings.push(`Starter kits page is missing ${needle}.`);
  }
}
for (const needle of [
  'prompt-switchboard://builder/support-matrix',
  'prompt-switchboard://sites/capabilities',
  'Smallest useful compare-first loop',
]) {
  if (!starterKitsDoc.includes(needle)) {
    findings.push(`Starter kits page must mention ${needle}.`);
  }
}
for (const needle of [
  'Prompt Switchboard public distribution matrix',
  'official marketplace or registry',
  'Public-bundle-ready packet available now.',
  'npm run release:host-kits',
  'https://docs.openclaw.ai/plugins',
]) {
  if (!publicDistributionDoc.includes(needle)) {
    findings.push(`Public distribution page must mention ${needle}.`);
  }
}
for (const needle of [
  'Prompt Switchboard host packets',
  'Codex packet',
  'Claude Code packet',
  'OpenCode packet',
  'OpenClaw packet',
]) {
  if (!hostPacketsDoc.includes(needle)) {
    findings.push(`Host packets page must mention ${needle}.`);
  }
}

const readme = read('README.md');
for (const needle of [
  'prompt-switchboard://builder/support-matrix',
  'prompt-switchboard://sites/capabilities',
  'Quick placement map',
  'public-distribution-matrix.html',
  'mcp-host-packets.html',
  'mcp-docker-sidecar.html',
]) {
  if (!readme.includes(needle)) {
    findings.push(`README must mention ${needle}.`);
  }
}

const faqDoc = read('docs/faq.html');
if (
  !faqDoc.includes(
    'Where do the MCP starter files go for Codex, Claude Code, OpenCode, and OpenClaw?'
  )
) {
  findings.push('FAQ must explain where MCP starter files go for the documented hosts.');
}
if (
  !faqDoc.includes(
    'Is Prompt Switchboard already listed on an official marketplace or registry for every documented host?'
  )
) {
  findings.push(
    'FAQ must explain official marketplace and registry truth for the documented hosts.'
  );
}
if (!faqDoc.includes('mcp-host-packets.html')) {
  findings.push('FAQ must link to the host packets page.');
}

for (const relPath of [
  'mcp/integration-kits/codex.skill.prompt-switchboard.md.example',
  'mcp/integration-kits/claude.skill.prompt-switchboard.md.example',
  'mcp/integration-kits/opencode.skill.prompt-switchboard.md.example',
  'mcp/integration-kits/openclaw.skill.prompt-switchboard.md.example',
]) {
  const text = read(relPath);
  if (!text.includes('prompt_switchboard.bridge_status')) {
    findings.push(`${relPath} must keep the bridge_status-first flow.`);
  }
  if (!text.includes('## Smallest useful flow')) {
    findings.push(`${relPath} must document the smallest useful flow.`);
  }
  if (!text.includes('## Preferred full flow')) {
    findings.push(`${relPath} must document the preferred full flow.`);
  }
  for (const required of [
    'prompt_switchboard.get_workflow_run',
    'prompt_switchboard.list_workflow_runs',
    'prompt_switchboard.resume_workflow',
  ]) {
    if (!text.includes(required)) {
      findings.push(`${relPath} must include ${required} in the workflow follow-through flow.`);
    }
  }
}

for (const relPath of [
  'mcp/integration-kits/codex.config.toml.example',
  'mcp/integration-kits/claude.mcp.json.example',
  'mcp/integration-kits/opencode.jsonc.example',
  'mcp/integration-kits/openclaw.prompt-switchboard.json.example',
  'mcp/integration-kits/openclaw.mcp.servers.json.example',
  'mcp/integration-kits/openclaw.mcp.set.example.sh',
  'mcp/integration-kits/public-bundles/codex-bundle/package.json',
  'mcp/integration-kits/public-bundles/claude-code-bundle/package.json',
  'mcp/integration-kits/public-bundles/opencode-plugin/package.json',
  'mcp/integration-kits/public-bundles/openclaw-bundle/package.json',
  'mcp/integration-kits/public-bundles/codex-bundle/manifest.json',
  'mcp/integration-kits/public-bundles/claude-code-bundle/manifest.json',
  'mcp/integration-kits/public-bundles/opencode-plugin/manifest.json',
  'mcp/integration-kits/public-bundles/openclaw-bundle/manifest.json',
  'mcp/integration-kits/public-bundles/codex-bundle/skills/prompt-switchboard/manifest.yaml',
  'mcp/integration-kits/public-bundles/openclaw-bundle/skills/prompt-switchboard/manifest.yaml',
  'mcp/integration-kits/distribution-subject-map.json',
  'mcp/integration-kits/public-distribution-matrix.json',
  'docs/mcp-host-packets.html',
  'docs/codex-mcp-setup.html',
  'docs/claude-code-mcp-setup.html',
  'docs/opencode-mcp-setup.html',
  'docs/openclaw-mcp-setup.html',
  'docs/mcp-starter-kits.html',
  'docs/public-distribution-matrix.html',
]) {
  const text = read(relPath);
  if (FORBIDDEN_LOCAL_PATH_PATTERNS.some((pattern) => text.includes(pattern))) {
    findings.push(`${relPath} must not expose a real local absolute path.`);
  }
}

if (findings.length > 0) {
  console.error('[integration-kits] failed:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(
  '[integration-kits] passed: starter kits, packet manifests, skill manifests, and publish-subject truth stay internally consistent'
);
