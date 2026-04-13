import React from 'react';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { useTranslation } from 'react-i18next';
import {
  DELIVERY_STATUS,
  ModelName,
  MESSAGE_ROLES,
  MessageRole,
  type DeliveryStatus,
} from '../../utils/types';
import {
  User,
  Bot,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  LoaderCircle,
} from 'lucide-react';

interface ChatBubbleProps {
  role: MessageRole;
  text: string;
  model?: ModelName;
  isStreaming?: boolean;
  deliveryStatus?: DeliveryStatus;
}

const STATUS_META: Partial<
  Record<DeliveryStatus, { labelKey: string; defaultLabel: string; className: string; icon: React.ReactNode }>
> = {
  [DELIVERY_STATUS.PENDING]: {
    labelKey: 'status.pending',
    defaultLabel: 'Pending',
    className:
      'border-[rgba(243,192,107,0.28)] bg-[rgba(243,192,107,0.12)] text-[color:var(--ps-warning)]',
    icon: <Clock3 size={12} />,
  },
  [DELIVERY_STATUS.STREAMING]: {
    labelKey: 'status.streaming',
    defaultLabel: 'Streaming',
    className:
      'border-[rgba(138,155,255,0.28)] bg-[rgba(138,155,255,0.14)] text-[color:var(--ps-focus)]',
    icon: <LoaderCircle size={12} className="animate-spin" />,
  },
  [DELIVERY_STATUS.COMPLETE]: {
    labelKey: 'status.complete',
    defaultLabel: 'Complete',
    className:
      'border-[rgba(83,196,143,0.28)] bg-[rgba(83,196,143,0.12)] text-[color:var(--ps-success)]',
    icon: <CheckCircle2 size={12} />,
  },
  [DELIVERY_STATUS.ERROR]: {
    labelKey: 'status.error',
    defaultLabel: 'Failed',
    className:
      'border-[rgba(255,123,134,0.28)] bg-[rgba(255,123,134,0.12)] text-[color:var(--ps-danger)]',
    icon: <AlertTriangle size={12} />,
  },
};

export const ChatBubble: React.FC<ChatBubbleProps> = ({
  role,
  text,
  model,
  isStreaming,
  deliveryStatus,
}) => {
  const { t } = useTranslation();
  const isUser = role === MESSAGE_ROLES.USER;
  const isSystem = role === MESSAGE_ROLES.SYSTEM;
  const shouldAnnounce = !isUser && !isSystem && isStreaming;
  const statusMeta = deliveryStatus ? STATUS_META[deliveryStatus] : undefined;

  return (
    <div
      className={clsx(
        'flex w-full mb-6 gap-3',
        isSystem ? 'justify-center' : isUser ? 'justify-end' : 'justify-start'
      )}
    >
      {/* Avatar (Assistant) */}
      {!isUser && !isSystem && (
        <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] shadow-sm">
          {model === 'ChatGPT' && <Sparkles size={16} className="text-[color:var(--ps-success)]" />}
          {model === 'Gemini' && <Sparkles size={16} className="text-[color:var(--ps-focus)]" />}
          {model === 'Perplexity' && <Sparkles size={16} className="text-cyan-300" />}
          {model === 'Grok' && <Sparkles size={16} className="text-white" />}
          {model === 'Qwen' && <Sparkles size={16} className="text-violet-300" />}
          {!model && <Bot size={16} className="text-[color:var(--ps-accent)]" />}
        </div>
      )}

      <div
        className={clsx(
          'flex flex-col max-w-[85%]',
          isSystem ? 'items-center' : isUser ? 'items-end' : 'items-start'
        )}
      >
        {/* Model Name */}
        {!isUser && !isSystem && model && (
          <div className="mb-1 ml-1 flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-[color:var(--ps-text-muted)]">{model}</span>
            {statusMeta && (
              <span
                className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${statusMeta.className}`}
              >
                {statusMeta.icon}
                {t(statusMeta.labelKey, statusMeta.defaultLabel)}
              </span>
            )}
          </div>
        )}

        {/* Bubble */}
        <div
          className={twMerge(
            'px-4 py-3 rounded-2xl text-sm leading-relaxed shadow-sm',
            isSystem
              ? 'ps-system-bubble'
              : isUser
                ? 'ps-user-bubble rounded-tr-none'
                : 'ps-assistant-bubble rounded-tl-none'
          )}
        >
          <div
            className="whitespace-pre-wrap break-words"
            aria-live={shouldAnnounce ? 'polite' : undefined}
          >
            {text}
          </div>
        </div>
      </div>

      {/* Avatar (User) */}
      {isUser && (
        <div className="mt-1 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border border-[color:var(--ps-border)] bg-[rgba(255,255,255,0.05)] shadow-sm">
          <User size={16} className="text-[color:var(--ps-text-soft)]" />
        </div>
      )}
    </div>
  );
};
