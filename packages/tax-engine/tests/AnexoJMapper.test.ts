import { describe, it, expect } from 'vitest';
import { mapToAnexoJ } from '../src/AnexoJMapper';

describe('AnexoJMapper (vitest)', () => {
  it('serialises a €1,000 dividend from US into Quadro4 with USA/401/1000.00', () => {
    const evt: any = {
      id: 'evt1',
      userId: 'u1',
      taxYear: 2024,
      sourceCountry: 'US',
      source: 'FOREIGN',
      category: 'E',
      grossAmountCents: 100000, // €1,000.00
      description: 'Dividend from Acme Corp',
      receivedAt: '2024-06-01T00:00:00Z',
      createdAt: '2024-06-01T00:00:00Z',
      updatedAt: '2024-06-01T00:00:00Z',
    };

    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C1>USA</C1>');
    expect(xml).toContain('<C2>401</C2>');
    expect(xml).toContain('<C3>1000.00</C3>');
  });
});
