import { Sparkles } from 'lucide-react';
import {
  ChatGPTIcon,
  ClaudeIcon,
  DeepSeekIcon,
  GeminiIcon,
  GrokIcon,
  KimiIcon,
  PerplexityIcon,
  QwenIcon,
} from './index';

export const getModelIcon = (model: string, className?: string) => {
  switch (model) {
    case 'Grok':
      return <GrokIcon className={className} />;
    case 'ChatGPT':
      return <ChatGPTIcon className={className} />;
    case 'Gemini':
      return <GeminiIcon className={className} />;
    case 'Claude':
      return <ClaudeIcon className={className} />;
    case 'DeepSeek':
      return <DeepSeekIcon className={className} />;
    case 'Kimi':
      return <KimiIcon className={className} />;
    case 'Perplexity':
      return <PerplexityIcon className={className} />;
    case 'Qwen':
      return <QwenIcon className={className} />;
    default:
      return <Sparkles className={className} />;
  }
};
