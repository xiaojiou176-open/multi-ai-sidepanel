import type { ModelName } from './types';

// ==================== Logger Types ====================
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogContext {
  surface?: string;
  sessionId?: string;
  requestId?: string;
  requestKey?: string;
  turnId?: string;
  model?: ModelName;
  code?: string;
  [key: string]: unknown;
}

// ==================== Logger Core ====================
const safeJsonStringify = (value: unknown): string | null => {
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

export const toErrorMessage = (error: unknown): string =>
  error instanceof Error ? error.message : String(error);

const emit = (level: LogLevel, message: string, context?: LogContext): void => {
  const entry = {
    timestamp: new Date().toISOString(),
    level,
    message,
    ...context,
  };

  const serialized = safeJsonStringify(entry) ?? `${level.toUpperCase()}: ${message}`;

  if (level === 'error') {
    console.error(serialized);
    return;
  }

  if (level === 'warn') {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
};

// ==================== Logger API ====================
export const Logger = {
  debug: (message: string, context?: LogContext) => emit('debug', message, context),
  info: (message: string, context?: LogContext) => emit('info', message, context),
  warn: (message: string, context?: LogContext) => emit('warn', message, context),
  error: (message: string, context?: LogContext) => emit('error', message, context),
};
