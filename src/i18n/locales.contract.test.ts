import { describe, expect, it } from 'vitest';
import en from './locales/en.json';
import zh from './locales/zh.json';

interface TranslationTree {
  [key: string]: string | TranslationTree;
}

const flattenKeys = (
  value: TranslationTree,
  prefix = '',
  acc: string[] = []
): string[] => {
  Object.entries(value).forEach(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;

    if (typeof child === 'string') {
      acc.push(next);
      return;
    }

    flattenKeys(child, next, acc);
  });

  return acc;
};

const flattenLeafEntries = (
  value: TranslationTree,
  prefix = '',
  acc: Array<[string, string]> = []
): Array<[string, string]> => {
  Object.entries(value).forEach(([key, child]) => {
    const next = prefix ? `${prefix}.${key}` : key;

    if (typeof child === 'string') {
      acc.push([next, child]);
      return;
    }

    flattenLeafEntries(child, next, acc);
  });

  return acc;
};

const getEntryValue = (entries: Array<[string, string]>, key: string): string | undefined =>
  entries.find(([entryKey]) => entryKey === key)?.[1];

describe('i18n locale contract', () => {
  it('keeps English and Chinese locale trees in key-level lockstep', () => {
    const englishKeys = flattenKeys(en as TranslationTree).sort();
    const chineseKeys = flattenKeys(zh as TranslationTree).sort();

    expect(chineseKeys).toEqual(englishKeys);
    expect(englishKeys.length).toBeGreaterThan(350);
  });

  it('keeps critical compare-workbench copy populated in both locales', () => {
    const englishEntries = flattenLeafEntries(en as TranslationTree);
    const chineseEntries = flattenLeafEntries(zh as TranslationTree);

    [...englishEntries, ...chineseEntries].forEach(([key, value]) => {
      expect(value.trim(), `${key} should not be blank`).not.toBe('');
    });

    const criticalKeys = [
      'analysis.title',
      'analysis.actions.useNextQuestion',
      'analysis.actions.useRecommendedAnswer',
      'analysis.actions.useSynthesis',
      'analysis.run',
      'compare.export.summaryTitle',
      'compare.diagnostics.selector.cached',
      'input.placeholder',
      'readiness.repair.summary',
      'settings.analysis.browserSessionTitle',
      'settings.analysis.byokTitle',
      'runtime.readinessSelectorDrift',
      'workflow.title',
      'workflow.action.seedNextStep',
      'workflow.action.runNextCompare',
      'workflow.hint.seedNextStep',
    ];

    criticalKeys.forEach((key) => {
      expect(getEntryValue(englishEntries, key)).toBeTruthy();
      expect(getEntryValue(chineseEntries, key)).toBeTruthy();
    });

    expect(getEntryValue(englishEntries, 'workflow.action.seedNextStep')).toContain('Seed');
    expect(getEntryValue(englishEntries, 'workflow.action.runNextCompare')).toContain('Run');
    expect(getEntryValue(englishEntries, 'workflow.hint.seedNextStep')).toContain(
      'does not auto-send'
    );

    expect(getEntryValue(chineseEntries, 'workflow.action.seedNextStep')).toContain('种子');
    expect(getEntryValue(chineseEntries, 'workflow.action.runNextCompare')).toContain('运行');
    expect(getEntryValue(chineseEntries, 'workflow.hint.seedNextStep')).toContain(
      '不会自动发送'
    );
  });
});
