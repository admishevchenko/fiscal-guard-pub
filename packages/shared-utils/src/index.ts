import DecimalLib from 'decimal.js';

// Centralized Decimal configuration for shared utilities
(DecimalLib as any).set({ precision: 20, rounding: (DecimalLib as any).ROUND_HALF_UP });

export const Decimal = DecimalLib as unknown as typeof DecimalLib;

export const logger = {
  warn: (message: string, meta?: Record<string, any>) => {
    const payload: Record<string, any> = { event: 'anexoj', level: 'warn', message };
    if (meta) payload.meta = meta;
    try {
      console.warn(JSON.stringify(payload));
    } catch (e) {
      console.warn(message, meta);
    }
  }
};
