import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const repo = 'xiaojiou176-open/multi-ai-sidepanel';
const metadata = JSON.parse(
  readFileSync(path.join(process.cwd(), 'docs', 'frontdoor-metadata.json'), 'utf8'),
);
const expectedDescription = metadata.repo_description;
const expectedHomepage = metadata.homepage_url;
const expectedTopics = new Set(metadata.topics);
const requiredLabels = new Set(metadata.required_labels);

function runGh(args) {
  try {
    return execFileSync('gh', args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      console.error('[verify-host-frontdoor] missing tool: install GitHub CLI (`gh`) first.');
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
    console.error(`[verify-host-frontdoor] gh ${args.join(' ')} failed: ${detail}`);
    process.exit(1);
  }
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    console.error(
      `[verify-host-frontdoor] failed to parse ${label}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    process.exit(1);
  }
}

const repoView = parseJson(
  runGh([
    'repo',
    'view',
    repo,
    '--json',
    'description,homepageUrl,hasDiscussionsEnabled,repositoryTopics,url,visibility,isPrivate',
  ]),
  'repo view',
);
const isPrivateRepo = repoView.isPrivate === true || repoView.visibility === 'PRIVATE';

if (isPrivateRepo) {
  console.log('[verify-host-frontdoor] passed: repository is private, so public front-door checks are skipped');
  console.log(
    `[verify-host-frontdoor] summary: visibility=${repoView.visibility}; public Pages, discussions, topics, labels, and social preview checks are not enforced while ${repo} remains private`
  );
  process.exit(0);
}

const socialPreview = parseJson(
  runGh([
    'api',
    'graphql',
    '-f',
    'query=query { repository(owner:"xiaojiou176-open", name:"multi-ai-sidepanel") { usesCustomOpenGraphImage openGraphImageUrl } }',
  ]),
  'social preview graphql',
).data?.repository;
const pages = parseJson(runGh(['api', `repos/${repo}/pages`]), 'pages');
const labels = runGh(['label', 'list', '--repo', repo, '--limit', '200'])
  .split('\n')
  .map((line) => line.split('\t')[0]?.trim())
  .filter(Boolean);

const findings = [];

if (repoView.description !== expectedDescription) {
  findings.push(`description drifted: expected "${expectedDescription}", got "${repoView.description}"`);
}

if (repoView.homepageUrl !== expectedHomepage) {
  findings.push(`homepage drifted: expected "${expectedHomepage}", got "${repoView.homepageUrl}"`);
}

if (repoView.hasDiscussionsEnabled !== true) {
  findings.push('GitHub Discussions are not enabled');
}

const actualTopics = new Set((repoView.repositoryTopics ?? []).map((topic) => topic.name));
for (const topic of expectedTopics) {
  if (!actualTopics.has(topic)) {
    findings.push(`missing repository topic: ${topic}`);
  }
}

if (pages.build_type !== 'workflow') {
  findings.push(`Pages build_type drifted: expected "workflow", got "${pages.build_type}"`);
}

if (pages.html_url !== expectedHomepage) {
  findings.push(`Pages html_url drifted: expected "${expectedHomepage}", got "${pages.html_url}"`);
}

if (pages.https_enforced !== true) {
  findings.push('Pages HTTPS is not enforced');
}

const labelSet = new Set(labels);
for (const label of requiredLabels) {
  if (!labelSet.has(label)) {
    findings.push(`missing release/front-door label: ${label}`);
  }
}

if (socialPreview?.usesCustomOpenGraphImage !== true) {
  findings.push('GitHub custom social preview image is not enabled');
}

if (!socialPreview?.openGraphImageUrl) {
  findings.push('GitHub open graph image URL is empty');
}

if (findings.length > 0) {
  console.error('[verify-host-frontdoor] failed:');
  findings.forEach((finding) => console.error(`- ${finding}`));
  process.exit(1);
}

console.log('[verify-host-frontdoor] passed: public GitHub front-door settings are in the expected state');
console.log(
  `[verify-host-frontdoor] summary: description, homepage, discussions, Pages workflow, topics, release labels, and custom social preview state match the expected public surface for ${repo}`,
);
console.log(
  `[verify-host-frontdoor] social preview url: ${socialPreview?.openGraphImageUrl ?? 'missing'}`
);
