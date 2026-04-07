import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = process.cwd();
const read = (...parts: string[]) => readFileSync(path.join(repoRoot, ...parts), 'utf8');
const normalize = (value: string) => value.replace(/\s+/g, ' ').trim();
const metadata = JSON.parse(read('docs', 'frontdoor-metadata.json'));

describe('front door contract', () => {
  it('keeps the README positioned as a product-first front door', () => {
    const readme = read('README.md');
    const normalizedReadme = normalize(readme);

    expect(readme).toContain(`# ${metadata.product_name}`);
    expect(readme).toContain(metadata.tagline);
    expect(normalizedReadme).toContain(metadata.current_install_surface);
    expect(normalizedReadme).toContain(metadata.store_ready_note);
    expect(readme).toContain('## Try It Now');
    expect(readme).toContain('### Good First Compare Prompts');
    expect(readme).toContain('## Why It Feels Worth Saving');
    expect(readme).toContain('## Why It Beats Tab Juggling');
    expect(readme).toContain('## FAQ');
    expect(readme).toContain('## Why Star It Now');
    expect(readme).toContain('./docs/assets/prompt-switchboard-hero.png');
    expect(readme).toContain('./docs/assets/prompt-switchboard-demo.gif');
    expect(readme).toContain('./docs/assets/prompt-switchboard-before-after.svg');
    expect(readme).toContain(metadata.install_guide_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.first_compare_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.supported_sites_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.trust_boundary_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.faq_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.prompt_packs_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.starter_kits_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.host_packets_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.public_distribution_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.use_case_compare_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.use_case_rewriting_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.use_case_coding_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.use_case_local_first_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.use_case_agents_path.replace('./', './docs/'));
    expect(readme).toContain(metadata.discussions_url);
    expect(readme).toContain(metadata.releases_url);
    expect(readme).toContain('./CONTRIBUTING.md');
    expect(readme).not.toContain('Option B: build it locally right now');
    expect(readme).not.toContain('## Release-Ready Verification');
    expect(readme).not.toContain('## Maintainer Notes');
    expect(readme).not.toContain('## Public Surface');
    expect(readme).not.toContain('npm run release:bundle');
    expect(readme).not.toContain('Chrome Web Store is live');
  });

  it('keeps the landing page wired for SEO and social sharing', () => {
    const landing = read('docs', 'index.html');
    const normalizedLanding = normalize(landing);

    expect(landing).toContain(metadata.landing_title);
    expect(landing).toContain(metadata.landing_description);
    expect(landing).toContain(metadata.landing_og_description);
    expect(normalizedLanding).toContain(metadata.current_install_surface);
    expect(normalizedLanding).toContain(metadata.store_ready_note);
    expect(landing).toContain('rel="canonical"');
    expect(landing).toContain('property="og:title"');
    expect(landing).toContain('name="twitter:card"');
    expect(landing).toContain('"@type": "SoftwareApplication"');
    expect(landing).toContain(metadata.homepage_url);
    expect(landing).toContain(metadata.discussions_url);
    expect(landing).toContain(metadata.releases_url);
    expect(landing).toContain(metadata.install_guide_path);
    expect(landing).toContain(metadata.first_compare_path);
    expect(landing).toContain(metadata.prompt_packs_path);
    expect(landing).toContain(metadata.starter_kits_path);
    expect(landing).toContain(metadata.host_packets_path);
    expect(landing).toContain(metadata.public_distribution_path);
    expect(landing).toContain(metadata.supported_sites_path);
    expect(landing).toContain(metadata.trust_boundary_path);
    expect(landing).toContain(metadata.faq_path);
    expect(landing).toContain(metadata.use_case_compare_path);
    expect(landing).toContain(metadata.use_case_rewriting_path);
    expect(landing).toContain(metadata.use_case_coding_path);
    expect(landing).toContain(metadata.use_case_local_first_path);
    expect(landing).toContain(metadata.use_case_agents_path);
    expect(landing).toContain(metadata.nav_icon_path);
    expect(landing).not.toContain('Build locally in 2 commands');
    expect(landing).not.toContain('30-second path');
  });

  it('keeps support pages aligned with the current install surface and social sharing metadata', () => {
    const install = read('docs', 'install.html');
    const firstCompare = read('docs', 'first-compare-guide.html');
    const faq = read('docs', 'faq.html');
    const mcpAgents = read('docs', 'mcp-coding-agents.html');
    const starterKits = read('docs', 'mcp-starter-kits.html');
    const hostPackets = read('docs', 'mcp-host-packets.html');
    const publicDistribution = read('docs', 'public-distribution-matrix.html');
    const promptPacks = read('docs', 'prompt-packs.html');
    const compareUseCase = read('docs', 'compare-chatgpt-vs-gemini-vs-perplexity.html');
    const rewritingUseCase = read('docs', 'best-ai-for-rewriting-text.html');
    const codingUseCase = read('docs', 'best-ai-for-coding-explanations.html');
    const localFirstUseCase = read('docs', 'local-first-ai-comparison.html');
    const normalizedInstall = normalize(install);
    const normalizedFirstCompare = normalize(firstCompare);
    const normalizedFaq = normalize(faq);
    const normalizedMcpAgents = normalize(mcpAgents);
    const normalizedStarterKits = normalize(starterKits);
    const normalizedHostPackets = normalize(hostPackets);
    const normalizedPublicDistribution = normalize(publicDistribution);
    const supportedSites = read('docs', 'supported-sites.html');
    const trustBoundary = read('docs', 'trust-boundary.html');

    expect(normalizedInstall).toContain(metadata.current_install_surface);
    expect(normalizedInstall).toContain(metadata.store_ready_note);
    expect(install).toContain('property="og:image"');
    expect(install).toContain('name="twitter:card"');
    expect(normalizedFirstCompare).toContain(metadata.current_install_surface);
    expect(normalizedFirstCompare).toContain(metadata.store_ready_note);
    expect(firstCompare).toContain('property="og:image"');
    expect(firstCompare).toContain('name="twitter:card"');
    expect(firstCompare).toContain('"@type": "HowTo"');

    expect(normalizedFaq).toContain(metadata.current_install_surface);
    expect(normalizedFaq).toContain(metadata.store_ready_note);
    expect(faq).toContain('property="og:image"');
    expect(faq).toContain('name="twitter:card"');
    expect(faq).toContain('"@type": "FAQPage"');
    expect(faq).toContain(metadata.first_compare_path);

    expect(mcpAgents).toContain('property="og:image"');
    expect(mcpAgents).toContain('name="twitter:card"');
    expect(mcpAgents).toContain('"@type": "TechArticle"');
    expect(mcpAgents).toContain('OpenAI Codex');
    expect(mcpAgents).toContain('Claude Code');
    expect(normalizedMcpAgents).toContain('does <strong>not</strong> ship a public HTTP API');
    expect(normalizedMcpAgents).toContain('Native Messaging remains a scaffold');
    expect(mcpAgents).toContain('Not arbitrary browser automation');
    expect(mcpAgents).toContain('prompt-switchboard://builder/support-matrix');
    expect(mcpAgents).toContain('prompt-switchboard://sites/capabilities');
    expect(normalizedMcpAgents).toContain('starter skill templates for all four documented hosts');
    expect(mcpAgents).toContain(metadata.first_compare_path);
    expect(normalizedStarterKits).toContain(metadata.current_install_surface);
    expect(normalizedStarterKits).toContain(metadata.store_ready_note);
    expect(starterKits).toContain('property="og:url"');
    expect(starterKits).toContain('property="og:image"');
    expect(starterKits).toContain('name="twitter:card"');
    expect(starterKits).toContain('"@type": "TechArticle"');
    expect(starterKits).toContain('OpenCode');
    expect(starterKits).toContain('OpenClaw');
    expect(starterKits).toContain('prompt-switchboard://builder/support-matrix');
    expect(starterKits).toContain('prompt-switchboard://sites/capabilities');
    expect(starterKits).toContain('not a verified repo-owned host lane');
    expect(starterKits).toContain(metadata.first_compare_path);
    expect(hostPackets).toContain('Codex packet');
    expect(hostPackets).toContain('Claude Code packet');
    expect(hostPackets).toContain('OpenCode packet');
    expect(hostPackets).toContain('OpenClaw packet');
    expect(normalizedHostPackets).toContain(metadata.public_distribution_path);
    expect(publicDistribution).toContain('property="og:image"');
    expect(publicDistribution).toContain('name="twitter:card"');
    expect(publicDistribution).toContain('"@type": "TechArticle"');
    expect(normalizedPublicDistribution).toContain(metadata.current_install_surface);
    expect(normalizedPublicDistribution).toContain('official marketplace or registry');
    expect(publicDistribution).toContain('Codex');
    expect(publicDistribution).toContain('Claude Code');
    expect(publicDistribution).toContain('OpenCode');
    expect(publicDistribution).toContain('OpenClaw');

    expect(supportedSites).toContain('property="og:image"');
    expect(supportedSites).toContain('name="twitter:card"');
    expect(supportedSites).toContain(metadata.first_compare_path);
    expect(trustBoundary).toContain('property="og:image"');
    expect(trustBoundary).toContain('name="twitter:card"');
    expect(trustBoundary).toContain(metadata.first_compare_path);
    expect(install).toContain('"@type": "HowTo"');
    expect(promptPacks).toContain('property="og:image"');
    expect(promptPacks).toContain('name="twitter:card"');
    expect(promptPacks).toContain('"@type": "CollectionPage"');
    expect(promptPacks).toContain(metadata.first_compare_path);
    expect(compareUseCase).toContain('property="og:url"');
    expect(compareUseCase).toContain('"@type": "TechArticle"');
    expect(compareUseCase).toContain(metadata.first_compare_path);
    expect(rewritingUseCase).toContain('property="og:url"');
    expect(rewritingUseCase).toContain('"@type": "TechArticle"');
    expect(rewritingUseCase).toContain(metadata.first_compare_path);
    expect(codingUseCase).toContain('property="og:url"');
    expect(codingUseCase).toContain('"@type": "TechArticle"');
    expect(codingUseCase).toContain(metadata.first_compare_path);
    expect(localFirstUseCase).toContain('property="og:url"');
    expect(localFirstUseCase).toContain('"@type": "TechArticle"');
    expect(localFirstUseCase).toContain(metadata.first_compare_path);
  });

  it('keeps the sitemap aligned with the current public front door pages', () => {
    const sitemap = read('docs', 'sitemap.xml');

    expect(sitemap).toContain(metadata.homepage_url);
    expect(sitemap).toContain('install.html');
    expect(sitemap).toContain('first-compare-guide.html');
    expect(sitemap).toContain('supported-sites.html');
    expect(sitemap).toContain('trust-boundary.html');
    expect(sitemap).toContain('faq.html');
    expect(sitemap).toContain('prompt-packs.html');
    expect(sitemap).toContain('compare-chatgpt-vs-gemini-vs-perplexity.html');
    expect(sitemap).toContain('best-ai-for-rewriting-text.html');
    expect(sitemap).toContain('best-ai-for-coding-explanations.html');
    expect(sitemap).toContain('local-first-ai-comparison.html');
    expect(sitemap).toContain('mcp-coding-agents.html');
    expect(sitemap).toContain('mcp-starter-kits.html');
    expect(sitemap).toContain('mcp-host-packets.html');
    expect(sitemap).toContain('codex-mcp-setup.html');
    expect(sitemap).toContain('claude-code-mcp-setup.html');
    expect(sitemap).toContain('opencode-mcp-setup.html');
    expect(sitemap).toContain('openclaw-mcp-setup.html');
    expect(sitemap).toContain('public-distribution-matrix.html');
  });

  it('keeps the tracked public visual assets and crawl files present', () => {
    const requiredFiles = [
      ['docs', 'assets', 'prompt-switchboard-hero.png'],
      ['docs', 'assets', 'prompt-switchboard-demo.gif'],
      ['docs', 'assets', 'prompt-switchboard-compare-detail.png'],
      ['docs', 'assets', 'prompt-switchboard-workflow-panel.png'],
      ['docs', 'assets', 'prompt-switchboard-analyst-panel.png'],
      ['docs', 'assets', 'prompt-switchboard-builder-surface.png'],
      ['docs', 'assets', 'prompt-switchboard-settings.png'],
      ['docs', 'assets', 'prompt-switchboard-social-preview.png'],
      ['docs', 'assets', 'prompt-switchboard-nav-icon.svg'],
      ['docs', 'assets', 'prompt-switchboard-before-after.svg'],
      ['docs', 'assets', 'prompt-switchboard-workflow.svg'],
      ['docs', 'install.html'],
      ['docs', 'first-compare-guide.html'],
      ['docs', 'prompt-packs.html'],
      ['docs', 'compare-chatgpt-vs-gemini-vs-perplexity.html'],
      ['docs', 'best-ai-for-rewriting-text.html'],
      ['docs', 'best-ai-for-coding-explanations.html'],
      ['docs', 'local-first-ai-comparison.html'],
      ['docs', 'mcp-coding-agents.html'],
      ['docs', 'mcp-starter-kits.html'],
      ['docs', 'mcp-host-packets.html'],
      ['docs', 'codex-mcp-setup.html'],
      ['docs', 'claude-code-mcp-setup.html'],
      ['docs', 'opencode-mcp-setup.html'],
      ['docs', 'openclaw-mcp-setup.html'],
      ['docs', 'public-distribution-matrix.html'],
      ['docs', 'supported-sites.html'],
      ['docs', 'trust-boundary.html'],
      ['docs', 'faq.html'],
      ['docs', 'robots.txt'],
      ['docs', 'sitemap.xml'],
      ['docs', '404.html'],
      ['docs', 'frontdoor-metadata.json'],
      ['mcp', 'integration-kits', 'README.md'],
      ['mcp', 'integration-kits', 'codex.config.toml.example'],
      ['mcp', 'integration-kits', 'claude.mcp.json.example'],
      ['mcp', 'integration-kits', 'public-distribution-matrix.json'],
      ['.github', 'workflows', 'pages.yml'],
      ['.github', 'workflows', 'release-package.yml'],
    ];

    requiredFiles.forEach((parts) => {
      expect(existsSync(path.join(repoRoot, ...parts))).toBe(true);
    });
  });

  it('keeps the 404 page wired back into the public front door', () => {
    const notFound = read('docs', '404.html');

    expect(notFound).toContain(metadata.homepage_url);
    expect(notFound).toContain(metadata.install_guide_path);
    expect(notFound).toContain(metadata.first_compare_path);
    expect(notFound).toContain(metadata.faq_path);
    expect(notFound).toContain(metadata.trust_boundary_path);
  });
});
