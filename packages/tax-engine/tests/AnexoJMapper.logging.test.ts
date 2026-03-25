import { describe, it, expect, vi } from 'vitest';
import { mapToAnexoJ } from './src/AnexoJMapper';

describe('AnexoJ logging and masking', () => {
  it('masks IBAN and BIC when skipping Quadro8 entry', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const evt = {
      id: 'evt1',
      source: 'FOREIGN',
      sourceCountry: 'US',
      grossAmountCents: 100000,
      payerTaxPaidCents: null,
      iban: 'INVALID_IBAN_1234567890123456',
      bic: 'BADBIC',
    } as any;

    mapToAnexoJ([evt]);
    expect(spy).toHaveBeenCalled();
    const arg = spy.mock.calls[0][0] as string;
    // parse JSON payload
    const parsed = JSON.parse(arg);
    expect(parsed.message).toMatch(/Skipping Quadro8 entry/);
    expect(parsed.meta).toBeDefined();
    expect(parsed.meta.iban).toMatch(/\*{4,}/); // masked
    expect(parsed.meta.bic).toMatch(/\*{2,}/); // masked
    spy.mockRestore();
  });

  it('parses very large monetary values without precision loss', () => {
    const evt = {
      id: 'evt2',
      source: 'FOREIGN',
      sourceCountry: 'US',
      grossAmountCents: 100000,
      payerTaxPaidCents: '123456789012345.67',
    } as any;
    const xml = mapToAnexoJ([evt]);
    expect(xml).toContain('<C4>123456789012345.67</C4>');
  });
});
