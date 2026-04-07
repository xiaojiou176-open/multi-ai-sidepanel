import { useEffect, useCallback } from 'react';
import {
  MessagePayload,
  StreamResponsePayload,
  MSG_TYPES,
  hasMessageType,
} from '../../utils/types';

interface UseMessageListenerProps {
  updateLastMessage: (payload: StreamResponsePayload) => void;
}

export function useMessageListener({ updateLastMessage }: UseMessageListenerProps) {
  const handleMessage = useCallback(
    (message: MessagePayload) => {
      if (hasMessageType(message, MSG_TYPES.ON_RESPONSE_UPDATE)) {
        updateLastMessage(message.payload as StreamResponsePayload);
      }
    },
    [updateLastMessage]
  );

  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
      return;
    }

    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [handleMessage]);
}
