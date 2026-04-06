export const MCP_MODEL_CATALOG = {
  ChatGPT: {
    name: 'ChatGPT',
    label: 'ChatGPT',
    openUrl: 'https://chatgpt.com/',
    hostnames: ['chatgpt.com', 'chat.openai.com'],
  },
  Gemini: {
    name: 'Gemini',
    label: 'Gemini',
    openUrl: 'https://gemini.google.com/',
    hostnames: ['gemini.google.com'],
  },
  Perplexity: {
    name: 'Perplexity',
    label: 'Perplexity',
    openUrl: 'https://www.perplexity.ai/',
    hostnames: ['perplexity.ai'],
  },
  Qwen: {
    name: 'Qwen',
    label: 'Qwen',
    openUrl: 'https://chat.qwen.ai/',
    hostnames: ['qwen.ai'],
  },
  Grok: {
    name: 'Grok',
    label: 'Grok',
    openUrl: 'https://grok.com/',
    hostnames: ['grok.com', 'x.ai'],
  },
} as const;
