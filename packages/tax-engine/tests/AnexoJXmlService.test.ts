import { describe, it, expect } from 'vitest';
import { generateAnexoJXml } from '../src/AnexoJXmlService';
import type { EngineIncomeEvent } from '../src/types';

describe('AnexoJXmlService mapping and serialization', () => {
  it('serializes a foreign dividend into Quadro4 with correct fields', () => {
    const evt: EngineIncomeEvent = {
      id: 'evt1',
      taxYear: 2026,
      sourceCountry: 'US',
      source: 'FOREIGN' as any,
      category: 'E' as any, // dividend category
      grossAmountCents: 123456, // 1234.56 EUR
      description: 'Dividend payment',
      receivedAt: '2026-02-01T00:00:00Z',
    } as any;

    const xml = generateAnexoJXml('123456789', [evt]);
    expect(xml).toContain('xmlns="http://www.at.gov.pt/schemas/irs/modelo3/2026"');
    expect(xml).toContain('<Quadro3>');
    expect(xml).toContain('<NIF>123456789</NIF>');
    expect(xml).toContain('<Quadro4>');
    expect(xml).toContain('<C1>USA</C1>');
    expect(xml).toContain('<C2>401</C2>');
    expect(xml).toContain('<C3>1234.56</C3>');
  });
});
