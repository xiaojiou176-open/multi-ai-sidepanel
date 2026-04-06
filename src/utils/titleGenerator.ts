import i18n from '../i18n';
/**
 * Session title generation helpers.
 * These functions derive a compact title from the first user prompt.
 */

/**
 * Generate a short session title from the first user message.
 */
export function generateSessionTitle(firstMessage: string): string {
  // Normalize whitespace before applying title heuristics.
  const cleaned = firstMessage.trim();

  if (cleaned.length === 0) {
    return i18n.t('runtime.sessionNew', 'New Chat');
  }

  // Strategy 1: keep short prompts intact.
  if (cleaned.length <= 30) {
    return cleaned;
  }

  // Strategy 2: use the first 30 characters as a preview.
  const preview = cleaned.slice(0, 30);

  // If truncation lands mid-word, prefer the last complete word boundary.
  const lastSpace = preview.lastIndexOf(' ');
  if (lastSpace > 15) {
    // Keep enough signal before truncating at a word boundary.
    return preview.slice(0, lastSpace) + '...';
  }

  return preview + '...';
}

/**
 * Extract lightweight keywords from a message.
 * This remains intentionally simple and can be replaced with richer NLP later.
 */
export function extractKeywords(message: string, maxKeywords = 3): string {
  // Stop words in both English and Chinese.
  const stopWords = new Set([
    // English (lowercase)
    'the',
    'is',
    'at',
    'which',
    'on',
    'a',
    'an',
    'and',
    'or',
    'but',
    'in',
    'with',
    'to',
    'for',
    'of',
    'as',
    'by',
    'this',
    'that',
    'can',
    'could',
    'would',
    'should',
    'will',
    'do',
    'does',
    'did',
    'what',
    'how',
    'when',
    'where',
    'why',
    'who',
    // Chinese
    '的',
    '了',
    '在',
    '是',
    '我',
    '有',
    '和',
    '就',
    '不',
    '人',
    '都',
    '一',
    '一个',
    '上',
    '也',
    '很',
    '到',
    '说',
    '要',
    '去',
    '你',
    '会',
    '着',
    '没有',
    '看',
    '好',
    '自己',
    '这',
    '那',
  ]);

  // Tokenize by whitespace and common Chinese punctuation.
  const words = message
    .replace(/[，。！？；：、"'（）【】《》]/g, ' ')
    .split(/\s+/)
    .filter((word) => {
      const lowerWord = word.toLowerCase();
      // Filter out very short tokens and stop words.
      return word.length > 2 && !stopWords.has(lowerWord);
    });

  // Keep only the requested number of keywords.
  const keywords = words.slice(0, maxKeywords).join(' ');

  return keywords || message.slice(0, 30);
}

/**
 * Generate a session title using a few lightweight heuristics.
 */
export function smartGenerateTitle(message: string): string {
  const cleaned = message.trim();

  // Strategy 1: preserve question-style prompts.
  if (/[?？]/.test(cleaned)) {
    // Keep the core question rather than a raw prefix slice.
    const question = cleaned.split(/[?？]/)[0].trim();
    if (question.length <= 50) {
      return question + '?';
    }
    return question.slice(0, 47) + '...?';
  }

  // Strategy 2: detect action-oriented prompts.
  const actionWords = [
    '帮我',
    '帮忙',
    '生成',
    '写',
    '创建',
    '制作',
    '解释',
    '分析',
    'help',
    'create',
    'write',
    'generate',
    'explain',
    'analyze',
  ];
  for (const action of actionWords) {
    if (cleaned.toLowerCase().startsWith(action)) {
      return generateSessionTitle(cleaned);
    }
  }

  // Strategy 3: fall back to the basic preview generator.
  return generateSessionTitle(cleaned);
}
