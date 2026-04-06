import i18n from '../i18n';
import { normalizeSessionMessages } from '../utils/messages';
import {
  DELIVERY_STATUS,
  MESSAGE_ROLES,
  READINESS_STATUSES,
  SEND_ERROR_CODES,
  type Message,
  type ModelName,
  type ModelReadinessReport,
  type SendErrorCode,
  type Session,
  type StreamResponsePayload,
} from '../utils/types';

export const DEFAULT_SELECTED_MODELS: ModelName[] = ['ChatGPT'];

export const buildDeliveryErrorMessage = (errorCode: SendErrorCode): string => {
  switch (errorCode) {
    case SEND_ERROR_CODES.TIMEOUT:
      return i18n.t('runtime.deliveryTimeout', 'This model timed out before it could respond.');
    case SEND_ERROR_CODES.RUNTIME:
      return i18n.t(
        'runtime.deliveryRuntime',
        'Prompt Switchboard could not deliver this prompt to the target tab.'
      );
    case SEND_ERROR_CODES.HANDSHAKE:
      return i18n.t(
        'runtime.deliveryHandshake',
        'Prompt Switchboard could not confirm that the target tab was ready.'
      );
    case SEND_ERROR_CODES.REJECTED:
    default:
      return i18n.t(
        'runtime.deliveryRejected',
        'This model rejected the prompt request before a response was received.'
      );
  }
};

export const buildReadinessErrorMessage = (report: ModelReadinessReport): string => {
  switch (report.status) {
    case READINESS_STATUSES.TAB_MISSING:
      return i18n.t('runtime.readinessTabMissing', {
        defaultValue: '{{model}} is not open in a signed-in browser tab.',
        model: report.model,
      });
    case READINESS_STATUSES.TAB_LOADING:
      return i18n.t('runtime.readinessTabLoading', {
        defaultValue: '{{model}} is still loading. Give the tab a moment and try again.',
        model: report.model,
      });
    case READINESS_STATUSES.MODEL_MISMATCH:
      return i18n.t('runtime.readinessModelMismatch', {
        defaultValue: '{{model}} is open, but this tab does not match the expected chat surface.',
        model: report.model,
      });
    case READINESS_STATUSES.SELECTOR_DRIFT_SUSPECT:
      return i18n.t('runtime.readinessSelectorDrift', {
        defaultValue:
          '{{model}} looks open, but Prompt Switchboard could not confirm the input controls on this page.',
        model: report.model,
      });
    case READINESS_STATUSES.CONTENT_UNAVAILABLE:
    default:
      return i18n.t('runtime.readinessContentUnavailable', {
        defaultValue: '{{model}} did not confirm readiness from the current browser tab.',
        model: report.model,
      });
  }
};

export const buildReadinessFailurePayload = (
  report: ModelReadinessReport,
  requestId: string,
  turnId: string
): StreamResponsePayload => ({
  model: report.model,
  requestId,
  turnId,
  text: buildReadinessErrorMessage(report),
  isComplete: true,
  deliveryStatus: DELIVERY_STATUS.ERROR,
  errorCode: SEND_ERROR_CODES.HANDSHAKE,
  completedAt: Date.now(),
  data: {
    stage: 'content_ready_handshake',
    hostname: report.hostname,
    selectorSource: report.selectorSource,
    remoteConfigConfigured: report.remoteConfigConfigured,
    failureClass: report.failureClass,
    readinessStatus: report.status,
    inputReady: report.inputReady,
    submitReady: report.submitReady,
    lastCheckedAt: report.lastCheckedAt,
  },
});

export const createDefaultSession = (): Session => ({
  id: crypto.randomUUID(),
  title: i18n.t('runtime.sessionNew', 'New Chat'),
  messages: [],
  createdAt: Date.now(),
  updatedAt: Date.now(),
  selectedModels: [...DEFAULT_SELECTED_MODELS],
});

export const createUserTurnMessage = (
  input: string,
  turnId: string,
  requestId: string,
  requestedModels: ModelName[]
): Message => ({
  id: crypto.randomUUID(),
  role: MESSAGE_ROLES.USER,
  text: input,
  timestamp: Date.now(),
  turnId,
  requestId,
  requestedModels,
  isStreaming: false,
  deliveryStatus: DELIVERY_STATUS.COMPLETE,
  completedAt: Date.now(),
});

export const createAssistantPlaceholder = (
  model: ModelName,
  turnId: string,
  requestId: string
): Message => ({
  id: crypto.randomUUID(),
  role: MESSAGE_ROLES.ASSISTANT,
  text: i18n.t('runtime.waitingResponse', 'Waiting for response…'),
  model,
  timestamp: Date.now(),
  turnId,
  requestId,
  isStreaming: true,
  deliveryStatus: DELIVERY_STATUS.PENDING,
});

export const normalizeSessionForRuntime = (session: Session): Session => ({
  ...session,
  messages: normalizeSessionMessages(session.messages, session.selectedModels),
});

const resolveDeliveryStatus = (payload: StreamResponsePayload) => {
  if (payload.deliveryStatus) {
    return payload.deliveryStatus;
  }

  if (payload.errorCode) {
    return DELIVERY_STATUS.ERROR;
  }

  return payload.isComplete ? DELIVERY_STATUS.COMPLETE : DELIVERY_STATUS.STREAMING;
};

export const updateMessageFromPayload = (
  message: Message,
  payload: StreamResponsePayload
): Message => {
  const deliveryStatus = resolveDeliveryStatus(payload);
  const nextText =
    payload.text ||
    (deliveryStatus === DELIVERY_STATUS.ERROR && payload.errorCode
      ? buildDeliveryErrorMessage(payload.errorCode)
      : message.text);
  const completedAt =
    payload.completedAt ??
    (deliveryStatus === DELIVERY_STATUS.COMPLETE || deliveryStatus === DELIVERY_STATUS.ERROR
      ? Date.now()
      : undefined);

  return {
    ...message,
    text: nextText,
    turnId: payload.turnId,
    requestId: payload.requestId,
    model: payload.model,
    isStreaming:
      deliveryStatus === DELIVERY_STATUS.STREAMING || deliveryStatus === DELIVERY_STATUS.PENDING,
    deliveryStatus,
    deliveryErrorCode: payload.errorCode ?? message.deliveryErrorCode,
    completedAt,
    data: payload.data ?? message.data,
  };
};

export const markTurnDeliveryFailure = (
  session: Session,
  turnId: string,
  models: ModelName[],
  errorCode: SendErrorCode,
  requestId: string
): Session => {
  const messages = session.messages.map((message) => {
    if (
      message.role === MESSAGE_ROLES.ASSISTANT &&
      message.turnId === turnId &&
      message.model &&
      models.includes(message.model)
    ) {
      return updateMessageFromPayload(message, {
        model: message.model,
        requestId,
        turnId,
        text: buildDeliveryErrorMessage(errorCode),
        isComplete: true,
        deliveryStatus: DELIVERY_STATUS.ERROR,
        errorCode,
      });
    }

    return message;
  });

  return {
    ...session,
    messages,
    updatedAt: Date.now(),
  };
};

export const applyStreamResponsePayloadToSessions = ({
  sessions,
  currentSessionId,
  payload,
}: {
  sessions: Session[];
  currentSessionId: string | null;
  payload: StreamResponsePayload;
}): { updatedSessions: Session[]; didUpdateAnySession: boolean } => {
  const deliveryStatus = resolveDeliveryStatus(payload);
  let didUpdateAnySession = false;

  const updatedSessions = sessions.map((session) => {
    const matchesTurn = payload.turnId
      ? session.messages.some((message) => message.turnId === payload.turnId)
      : session.id === currentSessionId;

    if (!matchesTurn) {
      return session;
    }

    const messages = [...session.messages];
    const lastMsgIndex = messages.findLastIndex(
      (message) =>
        message.model === payload.model &&
        message.role === MESSAGE_ROLES.ASSISTANT &&
        (payload.turnId ? message.turnId === payload.turnId : true)
    );

    if (lastMsgIndex !== -1) {
      messages[lastMsgIndex] = updateMessageFromPayload(messages[lastMsgIndex], payload);
    } else {
      messages.push({
        id: crypto.randomUUID(),
        role: MESSAGE_ROLES.ASSISTANT,
        text:
          payload.text ||
          (payload.errorCode
            ? buildDeliveryErrorMessage(payload.errorCode)
            : i18n.t('runtime.waitingResponse', 'Waiting for response…')),
        model: payload.model,
        timestamp: Date.now(),
        turnId: payload.turnId,
        requestId: payload.requestId,
        isStreaming:
          deliveryStatus === DELIVERY_STATUS.PENDING ||
          deliveryStatus === DELIVERY_STATUS.STREAMING,
        deliveryStatus,
        deliveryErrorCode: payload.errorCode,
        completedAt: payload.completedAt,
        data: payload.data,
      });
    }

    didUpdateAnySession = true;
    return {
      ...session,
      messages,
      updatedAt: Date.now(),
    };
  });

  return {
    updatedSessions,
    didUpdateAnySession,
  };
};
