import { describe, it, expect } from 'vitest';
import { mapToAnexoJ } from '../src/AnexoJMapper';

describe('AnexoJMapper edge cases', () => {
  it('uses explicit incomeCode over heuristics', () => {
    const evt: any = { id: 'e1', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: 100000, incomeCode: '402', description: 'Dividendos pagos' };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C2>402</C2>');
  });

  it('parses payerTaxPaidCents string values', () => {
    const evt: any = { id: 's1', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: 100000, payerTaxPaidCents: '4567' };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C4>45.67</C4>');
  });

  it('clamps negative payerTaxPaidCents to 0', () => {
    const evt: any = { id: 'n1', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: 100000, payerTaxPaidCents: -500 };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C4>0.00</C4>');
  });

  it('emits BIC when IBAN invalid but BIC valid', () => {
    const evt: any = { id: 'b1', source: 'FOREIGN', sourceCountry: 'PT', category: 'E', grossAmountCents: 100000, iban: 'INVALIDIBAN', bic: 'BCPTPTPL' };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('BCPTPTPL');
  });

  it('skips Quadro8 when BIC invalid and IBAN missing', () => {
    const evt: any = { id: 'b2', source: 'FOREIGN', sourceCountry: 'PT', category: 'E', grossAmountCents: 100000, bic: 'INVALIDBIC' };
    const xml = mapToAnexoJ([evt]);
    // No valid Quadro8 lines should be present
    expect(xml).not.toContain('<Quadro8><Linha>');
  });
});
