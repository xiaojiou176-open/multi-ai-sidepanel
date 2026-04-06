import type { ModelName } from '../../utils/types';

export interface PromptPackEntry {
  id: string;
  title: string;
  prompt: string;
}

export interface PromptPack {
  id: string;
  name: string;
  description: string;
  category: 'writing' | 'research' | 'coding' | 'rewrite';
  recommendedModels: ModelName[];
  prompts: PromptPackEntry[];
}

type Translate = (key: string, defaultValue: string) => string;

const defaultT: Translate = (_key, defaultValue) => defaultValue;

export const getStarterPrompts = (t: Translate = defaultT) => [
  t(
    'input.starterPrompt.structure',
    'Compare how ChatGPT, Gemini, and Perplexity would explain browser extension state management.'
  ),
  t(
    'input.starterPrompt.rewrite',
    'Rewrite this paragraph in a clearer, friendlier tone for a GitHub README.'
  ),
];

export const getPromptPacks = (t: Translate = defaultT): PromptPack[] => [
  {
    id: 'writing-pack',
    name: t('promptPacks.writing.name', 'Writing Pack'),
    description: t(
      'promptPacks.writing.description',
      'Compare tone, clarity, and structure before you publish or share a draft.'
    ),
    category: 'writing',
    recommendedModels: ['ChatGPT', 'Gemini', 'Perplexity'],
    prompts: [
      {
        id: 'writing-clearer-rewrite',
        title: t('promptPacks.writing.clearerRewrite.title', 'Clearer rewrite'),
        prompt: t(
          'promptPacks.writing.clearerRewrite.prompt',
          'Rewrite this paragraph in a clearer, friendlier tone for a GitHub README.'
        ),
      },
      {
        id: 'writing-launch-summary',
        title: t('promptPacks.writing.launchSummary.title', 'Launch summary'),
        prompt: t(
          'promptPacks.writing.launchSummary.prompt',
          'Summarize this launch plan in three crisp bullets for a product update.'
        ),
      },
    ],
  },
  {
    id: 'research-pack',
    name: t('promptPacks.research.name', 'Research Pack'),
    description: t(
      'promptPacks.research.description',
      'Compare how different models frame trade-offs, blind spots, and recommendations.'
    ),
    category: 'research',
    recommendedModels: ['ChatGPT', 'Gemini', 'Perplexity'],
    prompts: [
      {
        id: 'research-tradeoffs',
        title: t('promptPacks.research.tradeoffs.title', 'Trade-off framing'),
        prompt: t(
          'promptPacks.research.tradeoffs.prompt',
          'Compare the trade-offs between React and Vue for a browser extension UI.'
        ),
      },
      {
        id: 'research-side-by-side',
        title: t('promptPacks.research.conflictingViewpoints.title', 'Conflicting viewpoints'),
        prompt: t(
          'promptPacks.research.conflictingViewpoints.prompt',
          'Explain the strongest argument for and against local-first AI comparison workflows.'
        ),
      },
    ],
  },
  {
    id: 'coding-pack',
    name: t('promptPacks.coding.name', 'Coding Explanations Pack'),
    description: t(
      'promptPacks.coding.description',
      'Use multiple models to compare debugging explanations and architecture breakdowns.'
    ),
    category: 'coding',
    recommendedModels: ['ChatGPT', 'Gemini', 'Grok'],
    prompts: [
      {
        id: 'coding-debug',
        title: t('promptPacks.coding.debug.title', 'Debug explanation'),
        prompt: t(
          'promptPacks.coding.debug.prompt',
          'Explain why a browser extension might fail during a persistent-context Playwright test run.'
        ),
      },
      {
        id: 'coding-architecture',
        title: t('promptPacks.coding.architecture.title', 'Architecture walkthrough'),
        prompt: t(
          'promptPacks.coding.architecture.prompt',
          'Explain this browser extension architecture to a new maintainer in plain English.'
        ),
      },
    ],
  },
  {
    id: 'rewrite-pack',
    name: t('promptPacks.rewrite.name', 'Rewrite Pack'),
    description: t(
      'promptPacks.rewrite.description',
      'Stress-test rewriting, localization, and editing tasks with a reusable compare set.'
    ),
    category: 'rewrite',
    recommendedModels: ['ChatGPT', 'Gemini', 'Qwen'],
    prompts: [
      {
        id: 'rewrite-copy',
        title: t('promptPacks.rewrite.landingPage.title', 'Landing page rewrite'),
        prompt: t(
          'promptPacks.rewrite.landingPage.prompt',
          'Rewrite this product description so a first-time visitor understands it in under 10 seconds.'
        ),
      },
      {
        id: 'rewrite-translation',
        title: t('promptPacks.rewrite.bilingual.title', 'Bilingual explanation'),
        prompt: t(
          'promptPacks.rewrite.bilingual.prompt',
          'Explain this feature in English first, then rewrite it in plain Chinese for a teammate.'
        ),
      },
    ],
  },
];

export const PROMPT_PACKS: PromptPack[] = getPromptPacks();

export const getPromptPackById = (packId: string, t: Translate = defaultT) =>
  getPromptPacks(t).find((pack) => pack.id === packId) ?? null;
