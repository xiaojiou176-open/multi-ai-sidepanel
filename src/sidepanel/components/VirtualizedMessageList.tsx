import React from 'react';
import {
  List,
  type RowComponentProps,
  type DynamicRowHeight,
  useDynamicRowHeight,
  useListRef,
} from 'react-window';
import { ChatBubble } from './ChatBubble';
import type { Message } from '../../utils/types';

interface VirtualizedMessageListProps {
  messages: Message[];
}

interface RowProps {
  messages: Message[];
  rowHeight: DynamicRowHeight;
}

const Row = ({
  index,
  style,
  ariaAttributes,
  messages,
  rowHeight,
}: RowComponentProps<RowProps>) => {
  const message = messages[index];
  const rowRef = React.useRef<HTMLDivElement>(null);

  React.useLayoutEffect(() => {
    if (!rowRef.current) return;
    const nextSize = rowRef.current.getBoundingClientRect().height;
    rowHeight.setRowHeight(index, nextSize);
  }, [index, message.text, rowHeight]);

  return (
    <div style={style} {...ariaAttributes}>
      <div ref={rowRef} className="px-4 py-2">
        <ChatBubble
          role={message.role}
          text={message.text}
          model={message.model}
          isStreaming={message.isStreaming}
          deliveryStatus={message.deliveryStatus}
        />
      </div>
    </div>
  );
};

// ==================== Virtualized List ====================
export const VirtualizedMessageList = React.memo<VirtualizedMessageListProps>(({ messages }) => {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const listRef = useListRef(null);
  const [listSize, setListSize] = React.useState({ height: 0, width: 0 });

  const estimatedRowHeight = 72;
  const rowHeight = useDynamicRowHeight({
    defaultRowHeight: estimatedRowHeight,
    key: messages.length,
  });

  React.useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (typeof ResizeObserver === 'undefined') {
      setListSize({
        height: container.clientHeight,
        width: container.clientWidth,
      });
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setListSize({
        height: entry.contentRect.height,
        width: entry.contentRect.width,
      });
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Auto-scroll to bottom when new messages arrive
  React.useEffect(() => {
    if (messages.length === 0) return;
    listRef.current?.scrollToRow({ index: messages.length - 1, align: 'end' });
  }, [messages.length, listRef]);

  return (
    <div ref={containerRef} className="h-full w-full overflow-hidden">
      {listSize.height > 0 && listSize.width > 0 && (
        <List
          listRef={listRef}
          rowCount={messages.length}
          rowHeight={rowHeight}
          rowComponent={Row}
          rowProps={{ messages, rowHeight }}
          overscanCount={6}
          style={{ height: listSize.height, width: listSize.width }}
        />
      )}
    </div>
  );
});

VirtualizedMessageList.displayName = 'VirtualizedMessageList';
