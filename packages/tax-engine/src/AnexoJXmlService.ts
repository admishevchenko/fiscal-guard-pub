import { create } from "xmlbuilder2";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const countries = require('i18n-iso-countries');
// eslint-disable-next-line @typescript-eslint/no-var-requires
countries.registerLocale(require('i18n-iso-countries/langs/en.json'));

import type { EngineIncomeEvent } from "./types.js";

const NS = 'http://www.at.gov.pt/schemas/irs/modelo3/2026';
const UNKNOWN_PAYER_NIF = '999999990';

function iso2To3(alpha2: string | undefined | null): string {
  if (!alpha2) return '';
  try {
    const code = countries.alpha2ToAlpha3((alpha2 || '').toUpperCase());
    return code ?? '';
  } catch (e) {
    return '';
  }
}

function centsToDecimalString(cents: number | string | undefined | null): string {
  const asStr = cents == null ? '0' : String(cents);
  const asInt = parseInt(asStr, 10) || 0;
  return (asInt / 100).toFixed(2);
}

function normalizeIban(iban: string | undefined | null): string {
  if (!iban) return '';
  return iban.toString().replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function normalizeBic(bic: string | undefined | null): string {
  if (!bic) return '';
  return bic.toString().replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function mapIncomeCode(evt: EngineIncomeEvent): string {
  // Category B -> 452
  if (evt.category === 'B') return '452';

  const desc = (evt.description || '').toString().toLowerCase();
  if (/(dividend|dividendos|dividendo)/.test(desc)) return '401';
  if (/(interest|juros)/.test(desc)) return '402';

  // default to dividends if unknown
  return '401';
}

export function generateAnexoJXml(taxpayerNif: string, events: EngineIncomeEvent[]): string {
  const doc = create({ version: '1.0', encoding: 'UTF-8' })
    .ele('Modelo3', { xmlns: NS })
    .ele('Anexos')
    .ele('AnexoJ');

  // Quadro3: taxpayer identification
  const quadro3 = doc.ele('Quadro3');
  quadro3.ele('NIF').txt(taxpayerNif || '');
  quadro3.ele('SujeitoPassivo').txt('A');

  // Quadro4: Foreign income
  const quadro4 = doc.ele('Quadro4');

  for (const evt of events) {
    if (((evt.source ?? '') as string).toString().toUpperCase() !== 'FOREIGN') continue;

    const linha = quadro4.ele('Linha');

    // C1: ISO-3 country
    linha.ele('C1').txt(iso2To3(evt.sourceCountry));

    // C2: income code mapping
    linha.ele('C2').txt(mapIncomeCode(evt));

    // C3: Gross amount (original gross, not discounted)
    linha.ele('C3').txt(centsToDecimalString(evt.grossAmountCents));

    // C4: Tax paid abroad (if provided)
    linha.ele('C4').txt(centsToDecimalString((evt as any).payerTaxPaidCents));

    // Payer NIF (use placeholder if missing)
    linha.ele('PayerNIF').txt(((evt as any).payerNif as string) || UNKNOWN_PAYER_NIF);
  }

  // Quadro8: Bank accounts
  const quadro8 = doc.ele('Quadro8');
  const seen = new Set<string>();
  for (const evt of events) {
    const iban = normalizeIban((evt as any).iban);
    const bic = normalizeBic((evt as any).bic);
    if (!iban && !bic) continue;
    const key = iban ? `IBAN:${iban}` : `BIC:${bic}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const linha = quadro8.ele('Linha');
    if (iban) linha.ele('C1').txt(iban);
    if (bic) linha.ele('C2').txt(bic);
  }

  return doc.end({ prettyPrint: false });
}

