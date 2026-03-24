import Decimal from 'decimal.js';

// Centralized Decimal configuration for the tax-engine package.
// Other modules should import { Decimal } from './decimal' to ensure consistent precision/rounding.
(Decimal as any).set({ precision: 20, rounding: (Decimal as any).ROUND_HALF_UP });

export { Decimal };
