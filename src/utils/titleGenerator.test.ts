import { describe, it, expect } from 'vitest';
import { generateSessionTitle, extractKeywords, smartGenerateTitle } from './titleGenerator';

describe('titleGenerator', () => {
  describe('generateSessionTitle', () => {
    it('returns short messages as-is', () => {
      const message = 'Hello world';
      const title = generateSessionTitle(message);
      expect(title).toBe('Hello world');
    });

    it('truncates long messages and appends an ellipsis', () => {
      const message =
        'This is a very long message that should be truncated because it exceeds the maximum length';
      const title = generateSessionTitle(message);
      expect(title.length).toBeLessThanOrEqual(33); // 30 + '...'
      expect(title).toContain('...');
    });

    it('truncates at a word boundary when possible', () => {
      const message = 'This is a moderately long message that needs truncation';
      const title = generateSessionTitle(message);
      // Prefer the last whole-word break before the hard cutoff.
      expect(title).toMatch(/.*\s.*\.\.\./);
    });

    it('falls back to the default title for an empty message', () => {
      const title = generateSessionTitle('');
      expect(title).toBe('New Chat');
    });

    it('falls back to the default title for whitespace-only input', () => {
      const title = generateSessionTitle('   ');
      expect(title).toBe('New Chat');
    });
  });

  describe('extractKeywords', () => {
    it('extracts English keywords', () => {
      const message = 'How to create a React component with TypeScript';
      const keywords = extractKeywords(message, 3);
      // Stop words such as 'how', 'to', 'a', and 'with' should be filtered out.
      expect(keywords).toContain('create');
      expect(keywords).toContain('React');
    });

    it('extracts Chinese keywords', () => {
      const keywords = extractKeywords('如何创建一个 React 组件');
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords).toContain('React');
      // Truncation is acceptable as long as the core signal remains.
    });

    it('limits the number of extracted keywords', () => {
      const message = 'word1 word2 word3 word4 word5';
      const keywords = extractKeywords(message, 2);
      const wordCount = keywords.split(' ').length;
      expect(wordCount).toBeLessThanOrEqual(2);
    });
  });

  describe('smartGenerateTitle', () => {
    it('preserves question prompts', () => {
      const message = 'What is the meaning of life?';
      const title = smartGenerateTitle(message);
      expect(title).toContain('?');
      expect(title).toContain('What is the meaning of life');
    });

    it('preserves Chinese question prompts', () => {
      const message = '什么是人工智能？';
      const title = smartGenerateTitle(message);
      expect(title).toContain('?');
    });

    it('handles action-oriented prompts', () => {
      const message = '帮我写一个 Python 脚本';
      const title = smartGenerateTitle(message);
      expect(title.length).toBeGreaterThan(0);
      expect(title.length).toBeLessThanOrEqual(33);
    });

    it('truncates long questions safely', () => {
      const message =
        'Can you explain to me how machine learning algorithms work in detail with examples?';
      const title = smartGenerateTitle(message);
      expect(title).toContain('?');
      expect(title.length).toBeLessThanOrEqual(51); // 47 + '...?'
    });

    it('handles ordinary statements', () => {
      const message = 'I want to learn programming';
      const title = smartGenerateTitle(message);
      expect(title).toBe('I want to learn programming');
    });

    it('handles english action-oriented prompts through the basic title generator', () => {
      const message = 'Generate a polished launch checklist for this extension release';
      const title = smartGenerateTitle(message);

      expect(title).toContain('Generate');
      expect(title.length).toBeLessThanOrEqual(33);
    });

    it('falls back to a raw preview when keyword extraction finds nothing useful', () => {
      const keywords = extractKeywords('的 了 在', 3);
      expect(keywords).toBe('的 了 在');
    });
  });
});
