export const logger = {
  warn: (message: string, meta?: Record<string, any>) => {
    const payload: Record<string, any> = { event: 'anexoj', level: 'warn', message };
    if (meta) payload.meta = meta;
    try {
      console.warn(JSON.stringify(payload));
    } catch (e) {
      // Fallback to plain warn if serialization fails
      console.warn(message, meta);
    }
  }
};
