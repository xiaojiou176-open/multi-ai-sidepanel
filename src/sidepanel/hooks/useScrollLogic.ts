import { useState, useEffect, useCallback, RefObject } from 'react';

interface UseScrollLogicProps {
  messagesLength: number;
  useVirtualization: boolean;
  messagesContainerRef: RefObject<HTMLDivElement | null>;
  messagesEndRef: RefObject<HTMLDivElement | null>;
}

export function useScrollLogic({
  messagesLength,
  useVirtualization,
  messagesContainerRef,
  messagesEndRef,
}: UseScrollLogicProps) {
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isAutoScrolling, setIsAutoScrolling] = useState(true);

  const handleScroll = useCallback(() => {
    const container = messagesContainerRef.current;
    if (!container) return;

    const { scrollTop, scrollHeight, clientHeight } = container;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;

    setShowScrollButton(!isNearBottom);
    setIsAutoScrolling(isNearBottom);
  }, [messagesContainerRef]);

  useEffect(() => {
    const container = messagesContainerRef.current;
    if (!container) return;
    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, [handleScroll, messagesContainerRef]);

  const scrollToBottom = useCallback(() => {
    if (useVirtualization) {
      // Virtual list handles its own scrolling via ref in the component
    } else {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [useVirtualization, messagesEndRef]);

  useEffect(() => {
    if (isAutoScrolling && !useVirtualization) {
      scrollToBottom();
    }
  }, [messagesLength, isAutoScrolling, scrollToBottom, useVirtualization]);

  return {
    showScrollButton,
    scrollToBottom,
  };
}
