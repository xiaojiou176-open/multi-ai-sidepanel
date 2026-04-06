import { describe, it, expect } from 'vitest';
import { scraperRegistry } from './scraperRegistry';
import { ChatGPTScraper } from '../content/scrapers/chatgpt';
import { GeminiScraper } from '../content/scrapers/gemini';
import { PerplexityScraper } from '../content/scrapers/perplexity';
import { QwenScraper } from '../content/scrapers/qwen';
import { GrokScraper } from '../content/scrapers/grok';

describe('ScraperRegistry', () => {
  it('should return ChatGPTScraper for chatgpt.com', () => {
    const result = scraperRegistry.getScraper('https://chatgpt.com');
    expect(result).not.toBeNull();
    expect(result?.scraper).toBeInstanceOf(ChatGPTScraper);
    expect(result?.model).toBe('ChatGPT');
  });

  it('should return GeminiScraper for gemini.google.com', () => {
    const result = scraperRegistry.getScraper('https://gemini.google.com');
    expect(result).not.toBeNull();
    expect(result?.scraper).toBeInstanceOf(GeminiScraper);
    expect(result?.model).toBe('Gemini');
  });

  it('should return PerplexityScraper for perplexity.ai', () => {
    const result = scraperRegistry.getScraper('https://www.perplexity.ai');
    expect(result).not.toBeNull();
    expect(result?.scraper).toBeInstanceOf(PerplexityScraper);
    expect(result?.model).toBe('Perplexity');
  });

  it('should return QwenScraper for qwen.ai', () => {
    const result = scraperRegistry.getScraper('https://qwen.ai');
    expect(result).not.toBeNull();
    expect(result?.scraper).toBeInstanceOf(QwenScraper);
    expect(result?.model).toBe('Qwen');
  });

  it('should return GrokScraper for grok.com', () => {
    const result = scraperRegistry.getScraper('https://grok.com');
    expect(result).not.toBeNull();
    expect(result?.scraper).toBeInstanceOf(GrokScraper);
    expect(result?.model).toBe('Grok');
  });

  it('should return null for unknown domains', () => {
    const result = scraperRegistry.getScraper('https://example.com');
    expect(result).toBeNull();
  });
});
