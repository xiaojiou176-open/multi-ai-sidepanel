import { DELIVERY_STATUS, MESSAGE_ROLES, type Message, type ModelName } from './types';

export interface CompareTurn {
  id: string;
  userMessage: Message | null;
  responses: Partial<Record<ModelName, Message>>;
  startedAt: number;
}

export const getMessageDeliveryStatus = (message: Message) => {
  if (message.deliveryStatus) {
    return message.deliveryStatus;
  }

  if (message.role === MESSAGE_ROLES.USER || message.role === MESSAGE_ROLES.SYSTEM) {
    return DELIVERY_STATUS.COMPLETE;
  }

  return message.isStreaming ? DELIVERY_STATUS.STREAMING : DELIVERY_STATUS.COMPLETE;
};

export const normalizeSessionMessages = (
  messages: Message[],
  sessionModels: ModelName[] = ['ChatGPT']
): Message[] => {
  let activeTurnId: string | undefined;
  let legacyTurnIndex = 0;

  return messages.map((message) => {
    if (message.role === MESSAGE_ROLES.USER) {
      activeTurnId = message.turnId ?? `legacy-turn:${message.id}`;
    } else if (!activeTurnId && !message.turnId) {
      legacyTurnIndex += 1;
      activeTurnId = `legacy-turn:${legacyTurnIndex}`;
    }

    const turnId = message.turnId ?? activeTurnId;
    const deliveryStatus = getMessageDeliveryStatus(message);
    const isTerminal =
      deliveryStatus === DELIVERY_STATUS.COMPLETE || deliveryStatus === DELIVERY_STATUS.ERROR;

    return {
      ...message,
      turnId,
      requestedModels:
        message.requestedModels ??
        (message.role === MESSAGE_ROLES.USER ? [...sessionModels] : message.requestedModels),
      deliveryStatus,
      deliveryErrorCode:
        deliveryStatus === DELIVERY_STATUS.ERROR ? message.deliveryErrorCode : undefined,
      completedAt: message.completedAt ?? (isTerminal ? message.timestamp : undefined),
      isStreaming: deliveryStatus === DELIVERY_STATUS.STREAMING,
    };
  });
};

export const buildCompareTurns = (messages: Message[]): CompareTurn[] => {
  const turns = new Map<string, CompareTurn>();

  for (const message of messages) {
    const turnId = message.turnId ?? `message:${message.id}`;
    const existing = turns.get(turnId);
    const turn = existing ?? {
      id: turnId,
      userMessage: null,
      responses: {},
      startedAt: message.timestamp,
    };

    turn.startedAt = Math.min(turn.startedAt, message.timestamp);

    if (message.role === MESSAGE_ROLES.USER) {
      turn.userMessage = message;
    } else if (message.role === MESSAGE_ROLES.ASSISTANT && message.model) {
      turn.responses[message.model] = message;
    }

    turns.set(turnId, turn);
  }

  return Array.from(turns.values()).sort((left, right) => left.startedAt - right.startedAt);
};
