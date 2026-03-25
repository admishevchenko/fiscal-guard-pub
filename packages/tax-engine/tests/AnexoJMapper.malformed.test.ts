import { describe, it, expect } from 'vitest';
import { mapToAnexoJ } from '../src/AnexoJMapper';

describe('AnexoJMapper malformed inputs', () => {
  it('parses grossAmountCents strings with commas as cents', () => {
    const evt: any = { id: 'm1', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: '1,000' };
    const xml = mapToAnexoJ([evt]);
    // '1,000' -> '1000' cents -> 10.00 euros
    expect(xml).toContain('<C3>10.00</C3>');
  });

  it('parses grossAmountCents as euros string with currency symbol', () => {
    const evt: any = { id: 'm2', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: '€1000.50' };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C3>1000.50</C3>');
  });

  it('parses payerTaxPaidCents euro float string', () => {
    const evt: any = { id: 'm3', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: 100000, payerTaxPaidCents: '45.67' };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C4>45.67</C4>');
  });

  it('skips Quadro8 when both IBAN and BIC invalid', () => {
    const evt: any = { id: 'm4', source: 'FOREIGN', sourceCountry: 'PT', category: 'E', grossAmountCents: 100000, iban: 'INVALID', bic: 'BADBIC' };
    const xml = mapToAnexoJ([evt]);
    expect(xml).not.toContain('<Quadro8><Linha>');
  });
});
