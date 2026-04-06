export const DOCS_BASE_URL = 'https://xiaojiou176-open.github.io/multi-ai-sidepanel';

export const PUBLIC_DOC_PATHS = {
  install: 'install.html',
  firstCompare: 'first-compare-guide.html',
  supportedSites: 'supported-sites.html',
  starterKits: 'mcp-starter-kits.html',
  publicDistribution: 'public-distribution-matrix.html',
  mcpAgents: 'mcp-coding-agents.html',
  faq: 'faq.html',
  trustBoundary: 'trust-boundary.html',
} as const;

export type PublicDocPath = (typeof PUBLIC_DOC_PATHS)[keyof typeof PUBLIC_DOC_PATHS];

export const CANONICAL_GUIDE_LINKS = [
  {
    id: 'installGuide',
    fallbackLabel: 'Install guide',
    path: PUBLIC_DOC_PATHS.install,
  },
  {
    id: 'firstCompare',
    fallbackLabel: 'First compare guide',
    path: PUBLIC_DOC_PATHS.firstCompare,
  },
  {
    id: 'supportedSites',
    fallbackLabel: 'Supported sites',
    path: PUBLIC_DOC_PATHS.supportedSites,
  },
  {
    id: 'starterKits',
    fallbackLabel: 'MCP starter kits',
    path: PUBLIC_DOC_PATHS.starterKits,
  },
  {
    id: 'publicDistribution',
    fallbackLabel: 'Public distribution matrix',
    path: PUBLIC_DOC_PATHS.publicDistribution,
  },
  {
    id: 'mcpAgents',
    fallbackLabel: 'MCP agents guide',
    path: PUBLIC_DOC_PATHS.mcpAgents,
  },
  {
    id: 'faq',
    fallbackLabel: 'FAQ',
    path: PUBLIC_DOC_PATHS.faq,
  },
  {
    id: 'trustBoundary',
    fallbackLabel: 'Trust boundary',
    path: PUBLIC_DOC_PATHS.trustBoundary,
  },
] as const;

const ESSENTIAL_GUIDE_IDS = new Set([
  'installGuide',
  'firstCompare',
  'supportedSites',
  'faq',
  'trustBoundary',
]);

const BUILDER_GUIDE_IDS = new Set(['starterKits', 'publicDistribution', 'mcpAgents']);

const REPAIR_GUIDE_IDS = new Set(['firstCompare', 'supportedSites', 'faq', 'trustBoundary']);

export const ESSENTIAL_GUIDE_LINKS = CANONICAL_GUIDE_LINKS.filter((link) =>
  ESSENTIAL_GUIDE_IDS.has(link.id)
);

export const BUILDER_GUIDE_LINKS = CANONICAL_GUIDE_LINKS.filter((link) =>
  BUILDER_GUIDE_IDS.has(link.id)
);

export const REPAIR_GUIDE_LINKS = CANONICAL_GUIDE_LINKS.filter((link) =>
  REPAIR_GUIDE_IDS.has(link.id)
);

export const buildPublicDocUrl = (path: PublicDocPath) => `${DOCS_BASE_URL}/${path}`;
