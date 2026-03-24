import { describe, it, expect } from 'vitest';
import { mapToAnexoJ } from '@/AnexoJMapper';
import type { IncomeEvent } from '@fiscal-guard/types';

describe('AnexoJMapper', () => {
  it('serialises a $1,000 dividend from US into Quadro4 with USA/401/1000.00', () => {
    const evt: IncomeEvent = {
      id: 'evt1',
      userId: 'u1',
      taxYear: 2024,
      sourceCountry: 'US',
      source: 'FOREIGN',
      category: 'E',
      grossAmountCents: 100000, // €1,000.00
      originalCurrency: 'EUR',
      fxRateToEur: '1.00000000',
      description: 'Dividend from Acme Corp',
      receivedAt: '2024-06-01T00:00:00Z',
      createdAt: '2024-06-01T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
    } as IncomeEvent;

    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C1>USA</C1>');
    expect(xml).toContain('<C2>401</C2>');
    expect(xml).toContain('<C3>1000.00</C3>');
  });
});
