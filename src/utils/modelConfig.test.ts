import { describe, it, expect } from 'vitest';
import {
  MODEL_ORDER,
  MODEL_CONFIGS,
  getModelConfig,
  getModelOpenUrls,
  isModelHostname,
  findModelByHostname,
} from './modelConfig';

describe('modelConfig', () => {
  it('should return model config by name', () => {
    const config = getModelConfig('ChatGPT');
    expect(config).toEqual(MODEL_CONFIGS.ChatGPT);
  });

  it('should return open urls in model order', () => {
    const urls = getModelOpenUrls();
    const expected = MODEL_ORDER.map((model) => MODEL_CONFIGS[model].openUrl);
    expect(urls).toEqual(expected);
  });

  it('should match hostname and subdomain', () => {
    expect(isModelHostname('chatgpt.com', 'ChatGPT')).toBe(true);
    expect(isModelHostname('www.chatgpt.com', 'ChatGPT')).toBe(true);
    expect(isModelHostname('chat.openai.com', 'ChatGPT')).toBe(true);
    expect(isModelHostname('example.com', 'ChatGPT')).toBe(false);
  });

  it('should find model by hostname', () => {
    expect(findModelByHostname('https://gemini.google.com')).toBe('Gemini');
    expect(findModelByHostname('perplexity.ai')).toBe('Perplexity');
    expect(findModelByHostname('unknown.host')).toBeNull();
  });
});
