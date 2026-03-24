import { describe, it, expect, vi } from 'vitest';
import { logger } from '../src/logger';

describe('logger util', () => {
  it('logger.warn emits structured JSON payload', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    logger.warn('test message', { foo: 'bar' });
    expect(spy).toHaveBeenCalled();
    const arg = spy.mock.calls[0][0];
    expect(typeof arg).toBe('string');
    const parsed = JSON.parse(arg as string);
    expect(parsed.event).toBeDefined();
    expect(parsed.level).toBe('warn');
    expect(parsed.message).toBe('test message');
    spy.mockRestore();
  });
});
