import { describe, expect, it } from 'vitest';
import { PROMPT_PACKS, getPromptPackById, getPromptPacks, getStarterPrompts } from './promptPacks';

describe('promptPacks', () => {
  it('exposes the built-in prompt packs with prompts and recommended models', () => {
    expect(PROMPT_PACKS.length).toBeGreaterThanOrEqual(4);
    expect(PROMPT_PACKS[0]?.prompts.length).toBeGreaterThan(0);
    expect(PROMPT_PACKS[0]?.recommendedModels.length).toBeGreaterThan(0);
    expect(new Set(PROMPT_PACKS.map((pack) => pack.category))).toEqual(
      new Set(['writing', 'research', 'coding', 'rewrite'])
    );
  });

  it('looks up a pack by id', () => {
    const pack = getPromptPackById('writing-pack');
    expect(pack?.name).toBe('Writing Pack');
    expect(pack?.prompts[0]?.prompt).toContain('Rewrite');
  });

  it('builds translated prompt packs and starter prompts through the translation callback', () => {
    const translated = getPromptPacks((key, fallback) => `${key}:${fallback}`);
    const starters = getStarterPrompts((key, fallback) => `${key}:${fallback}`);

    expect(translated[0]?.name).toContain('promptPacks.writing.name:');
    expect(translated[1]?.description).toContain('promptPacks.research.description:');
    expect(translated[2]?.prompts[0]?.title).toContain('promptPacks.coding.debug.title:');
    expect(translated[3]?.prompts[1]?.prompt).toContain('promptPacks.rewrite.bilingual.prompt:');
    expect(starters).toHaveLength(2);
    expect(starters[0]).toContain('input.starterPrompt.structure:');
    expect(starters[1]).toContain('input.starterPrompt.rewrite:');
  });
});
