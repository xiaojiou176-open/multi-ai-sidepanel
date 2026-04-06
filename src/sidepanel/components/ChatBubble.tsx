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
    className: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: <Clock3 size={12} />,
  },
  [DELIVERY_STATUS.STREAMING]: {
    labelKey: 'status.streaming',
    defaultLabel: 'Streaming',
    className: 'bg-sky-50 text-sky-700 border-sky-200',
    icon: <LoaderCircle size={12} className="animate-spin" />,
  },
  [DELIVERY_STATUS.COMPLETE]: {
    labelKey: 'status.complete',
    defaultLabel: 'Complete',
    className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: <CheckCircle2 size={12} />,
  },
  [DELIVERY_STATUS.ERROR]: {
    labelKey: 'status.error',
    defaultLabel: 'Failed',
    className: 'bg-rose-50 text-rose-700 border-rose-200',
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
        <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center border border-purple-200 shadow-sm flex-shrink-0 mt-1">
          {model === 'ChatGPT' && <Sparkles size={16} className="text-green-600" />}
          {model === 'Gemini' && <Sparkles size={16} className="text-blue-600" />}
          {model === 'Perplexity' && <Sparkles size={16} className="text-teal-600" />}
          {model === 'Grok' && <Sparkles size={16} className="text-gray-800" />}
          {model === 'Qwen' && <Sparkles size={16} className="text-indigo-600" />}
          {!model && <Bot size={16} className="text-purple-600" />}
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
            <span className="text-xs font-medium text-gray-500">{model}</span>
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
              ? 'bg-gray-50 border border-gray-200 text-gray-600'
              : isUser
                ? 'bg-gradient-to-br from-purple-600 to-pink-600 text-white rounded-tr-none'
                : 'bg-white border border-gray-100 text-gray-800 rounded-tl-none shadow-sm'
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
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center border border-gray-200 shadow-sm flex-shrink-0 mt-1">
          <User size={16} className="text-gray-600" />
        </div>
      )}
    </div>
  );
};
