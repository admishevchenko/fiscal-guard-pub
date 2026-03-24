import { describe, it, expect } from 'vitest';
import { mapToAnexoJ } from '../src/AnexoJMapper';

describe('AnexoJMapper additional cases', () => {
  it('maps Category B with hasOpenAtividade to 452', () => {
    const evt: any = { id: 'b1', source: 'FOREIGN', sourceCountry: 'PT', category: 'B', grossAmountCents: 50000, hasOpenAtividade: true };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C2>452</C2>');
  });

  it('formats payerTaxPaidCents into C4 correctly', () => {
    const evt: any = { id: 't1', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: 200000, payerTaxPaidCents: 12345 };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C4>123.45</C4>');
  });

  it('emits placeholder payerNIF when payerNif missing', () => {
    const evt: any = { id: 'n1', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: 100000 };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<PayerNIF>999999990</PayerNIF>');
  });

  it('ignores non-FOREIGN events', () => {
    const evt: any = { id: 'd1', source: 'DOMESTIC', sourceCountry: 'PT', category: 'E', grossAmountCents: 100000 };
    const xml = mapToAnexoJ([evt]);
    expect(xml).not.toContain('<Linha>');
  });

  it('includes IBAN and BIC in Quadro8 when present and valid', () => {
    const evt: any = { id: 'a1', source: 'FOREIGN', sourceCountry: 'PT', category: 'E', grossAmountCents: 100000, iban: 'PT50000201231234567890154', bic: 'BCPTPTPL' };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<Quadro8>');
    expect(xml).toContain('PT50000201231234567890154');
    expect(xml).toContain('BCPTPTPL');
  });

  it('handles Portuguese descriptions for income detection', () => {
    const evt1: any = { id: 'p1', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: 100000, description: 'Dividendos pagos' };
    const evt2: any = { id: 'p2', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: 100000, description: 'Juros de depósito' };
    const xml1 = mapToAnexoJ([evt1]);
    const xml2 = mapToAnexoJ([evt2]);
    expect(xml1).toContain('<C2>401</C2>');
    expect(xml2).toContain('<C2>402</C2>');
  });

  it('handles unknown country codes gracefully', () => {
    const evt: any = { id: 'z1', source: 'FOREIGN', sourceCountry: 'ZZ', category: 'E', grossAmountCents: 100000 };
    const xml = mapToAnexoJ([evt]);
    // policy: unknown country emits empty C1
    expect(xml).toContain('<C1></C1>');
  });

  it('rounding/cent-handling sanity', () => {
    const evt: any = { id: 'r1', source: 'FOREIGN', sourceCountry: 'US', category: 'E', grossAmountCents: 100005 };
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C3>1000.05</C3>');
  });
});
