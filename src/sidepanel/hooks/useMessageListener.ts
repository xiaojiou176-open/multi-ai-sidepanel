import { useEffect, useCallback } from 'react';
import { MessagePayload, StreamResponsePayload, MSG_TYPES } from '../../utils/types';

interface UseMessageListenerProps {
  updateLastMessage: (payload: StreamResponsePayload) => void;
}

export function useMessageListener({ updateLastMessage }: UseMessageListenerProps) {
  const handleMessage = useCallback(
    (message: MessagePayload) => {
      if (message.type === MSG_TYPES.ON_RESPONSE_UPDATE) {
        const payload = message.payload as StreamResponsePayload;
        updateLastMessage(payload);
      }
    },
    [updateLastMessage]
  );

  useEffect(() => {
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [handleMessage]);
}
