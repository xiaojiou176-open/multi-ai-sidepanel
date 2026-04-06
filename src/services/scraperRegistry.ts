import type { Scraper } from '../content/scrapers/base';
import type { ModelName } from '../utils/types';
import { ChatGPTScraper } from '../content/scrapers/chatgpt';
import { GeminiScraper } from '../content/scrapers/gemini';
import { PerplexityScraper } from '../content/scrapers/perplexity';
import { QwenScraper } from '../content/scrapers/qwen';
import { GrokScraper } from '../content/scrapers/grok';
import { isModelHostname } from '../utils/modelConfig';

interface ScraperConfig {
  model: ModelName;
  matcher: (hostname: string) => boolean;
  factory: () => Scraper;
}

export class ScraperRegistry {
  // ==================== Scraper Config ====================
  private configs: ScraperConfig[] = [
    {
      model: 'ChatGPT',
      matcher: (h) => isModelHostname(h, 'ChatGPT'),
      factory: () => new ChatGPTScraper(),
    },
    {
      model: 'Gemini',
      matcher: (h) => isModelHostname(h, 'Gemini'),
      factory: () => new GeminiScraper(),
    },
    {
      model: 'Perplexity',
      matcher: (h) => isModelHostname(h, 'Perplexity'),
      factory: () => new PerplexityScraper(),
    },
    {
      model: 'Qwen',
      matcher: (h) => isModelHostname(h, 'Qwen'),
      factory: () => new QwenScraper(),
    },
    {
      model: 'Grok',
      matcher: (h) => isModelHostname(h, 'Grok'),
      factory: () => new GrokScraper(),
    },
  ];

  private normalizeHostname(value: string): string {
    try {
      return new URL(value).hostname;
    } catch {
      return value;
    }
  }

  getScraper(hostnameOrUrl: string): { scraper: Scraper; model: ModelName } | null {
    const hostname = this.normalizeHostname(hostnameOrUrl);
    const config = this.configs.find((c) => c.matcher(hostname));
    if (!config) return null;

    return {
      scraper: config.factory(),
      model: config.model,
    };
  }
}

export const scraperRegistry = new ScraperRegistry();
