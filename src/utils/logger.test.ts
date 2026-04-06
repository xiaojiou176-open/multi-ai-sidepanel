import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Logger, toErrorMessage } from './logger';

const setupConsoleSpies = () => {
  const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  return { log, warn, error };
};

describe('Logger', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('emits structured info logs with context', () => {
    const { log } = setupConsoleSpies();
    Logger.info('test_info', { sessionId: 's1', requestId: 'r1', model: 'ChatGPT' });

    expect(log).toHaveBeenCalled();
    const payload = String(log.mock.calls[0][0]);
    expect(payload).toContain('test_info');
    expect(payload).toContain('sessionId');
  });

  it('routes warn and error levels to correct console method', () => {
    const { warn, error } = setupConsoleSpies();

    Logger.warn('test_warn', { code: 'warn_code' });
    Logger.error('test_error', { code: 'error_code' });

    expect(warn).toHaveBeenCalled();
    expect(error).toHaveBeenCalled();
  });

  it('falls back to plain text when context cannot be stringified', () => {
    const { log } = setupConsoleSpies();
    const circular: { self?: unknown } = {};
    circular.self = circular;

    Logger.debug('circular_context', circular);

    expect(log).toHaveBeenCalledWith('DEBUG: circular_context');
  });

  it('normalizes unknown errors into strings', () => {
    expect(toErrorMessage(new Error('boom'))).toBe('boom');
    expect(toErrorMessage('string failure')).toBe('string failure');
  });
});
