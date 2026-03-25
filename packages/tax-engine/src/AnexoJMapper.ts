import { create } from "xmlbuilder2";
import { Decimal, logger } from '@fiscal-guard/shared-utils';
// Use require-style imports for these CJS modules to avoid TS resolution issues in this workspace
// eslint-disable-next-line @typescript-eslint/no-var-requires
const countries = require('i18n-iso-countries');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { isValid: isValidIBAN } = require('iban');
import type { IncomeEvent } from "@fiscal-guard/types";

const NS = "http://www.at.gov.pt/schemas/irs/modelo3/2026";

// Register English locale for i18n-iso-countries (used to convert alpha2 -> alpha3)
// eslint-disable-next-line @typescript-eslint/no-var-requires
countries.registerLocale(require("i18n-iso-countries/langs/en.json"));

// Placeholder NIF used when payer NIF is unavailable. Documented sentinel.
const UNKNOWN_NIF_PLACEHOLDER = "999999990"; // AT placeholder when payer NIF unknown (confirm with legal)




function iso2To3(alpha2: string): string {
  if (!alpha2) return "";
  const s = alpha2.toString().trim();
  if (s.length === 3 && /^[A-Z]{3}$/i.test(s)) return s.toUpperCase();
  try {
    const code = countries.alpha2ToAlpha3(s.toUpperCase());
    return code ?? "";
  } catch (e) {
    logger.warn("Unable to convert country code", { alpha2, error: String(e) });
    return "";
  }
}

function normalizeIban(iban: string): string {
  if (!iban) return "";
  // Remove all non-alphanumeric characters and uppercase
  return iban.toString().replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function normalizeBic(bic: string): string {
  if (!bic) return "";
  // Remove non-alphanumeric and uppercase
  return bic.toString().replace(/[^A-Z0-9]/gi, '').toUpperCase();
}

function maskSensitive(v?: string): string {
  if (!v) return '';
  // preserve last 4 characters, mask rest
  return v.replace(/.(?=.{4})/g, '*');
}

function parseMoneyToCents(input: string | number): number {
  if (input == null) return 0;
  if (typeof input === 'number') {
    // treat numeric input as cents if it's an integer; if float, treat as euros
    if (Number.isInteger(input)) return input;
    return new Decimal(input).times(100).toDecimalPlaces(0, (Decimal as any).ROUND_HALF_UP).toNumber();
  }
  let s = input.toString().trim();
  if (!s) return 0;
  // remove currency symbols and NBSPs
  s = s.replace(/[€$£\s\u00A0]/g, '');

  // If both separators present, decide by last separator position
  const hasDot = s.indexOf('.') !== -1;
  const hasComma = s.indexOf(',') !== -1;
  if (hasDot && hasComma) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) {
      // format like 1.234,56 -> remove '.' thousands, replace ',' with '.' decimal
      s = s.replace(/\./g, '').replace(',', '.');
      return new Decimal(s).times(100).toDecimalPlaces(0, (Decimal as any).ROUND_HALF_UP).toNumber();
    } else {
      // format like 1,234.56 -> remove ',' thousands
      s = s.replace(/,/g, '');
      return new Decimal(s).times(100).toDecimalPlaces(0, (Decimal as any).ROUND_HALF_UP).toNumber();
    }
  }

  if (hasComma && !hasDot) {
    // ambiguous: if there are exactly 2 digits after comma, treat as decimal separator
    const parts = s.split(',');
    const last = parts[parts.length - 1] ?? '';
    if (last.length === 2) {
      s = s.replace(/\./g, '').replace(',', '.');
      return new Decimal(s).times(100).toDecimalPlaces(0, (Decimal as any).ROUND_HALF_UP).toNumber();
    }
    // otherwise treat as integer cents with commas as thousand separators: remove commas
    s = s.replace(/,/g, '');
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    try {
      return new Decimal(s).times(100).toDecimalPlaces(0, (Decimal as any).ROUND_HALF_UP).toNumber();
    } catch (e) {
      return 0;
    }
  }

  if (hasDot && !hasComma) {
    const parts = s.split('.');
    const last = parts[parts.length - 1] ?? '';
    if (last.length === 2) {
      // treat as euros float
      return new Decimal(s).times(100).toDecimalPlaces(0, (Decimal as any).ROUND_HALF_UP).toNumber();
    }
    // otherwise treat as integer cents with dots as thousand separators
    s = s.replace(/\./g, '');
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    try {
      return new Decimal(s).times(100).toDecimalPlaces(0, (Decimal as any).ROUND_HALF_UP).toNumber();
    } catch (e) {
      return 0;
    }
  }

  // only digits -> interpret as cents integer
  if (/^\d+$/.test(s)) return parseInt(s, 10);
  // fallback: try parse as float euros
  try {
    return new Decimal(s).times(100).toDecimalPlaces(0, (Decimal as any).ROUND_HALF_UP).toNumber();
  } catch (e) {
    return 0;
  }
}

function centsToDecimalString(cents: number | string): string {
  const centsInt = parseMoneyToCents(cents as any);
  try {
    const d = new Decimal(centsInt).dividedBy(100);
    return (d as any).toFixed(2);
  } catch (e) {
    logger.warn('Failed to format cents value', { cents, error: String(e) });
    return '0.00';
  }
}

/**
 * Map internal category + event details to AT income code (Quadro4 C2)
 * Rules:
 * - 401 = Dividends
 * - 402 = Interest
 * - 452 = Category B (self-employment) services under DTA when hasOpenAtividade true
 * Prefer explicit evt.incomeCode when provided by upstream pipeline.
 */
function mapIncomeCode(evt: IncomeEvent): string {
  const anyEvt = evt as any;
  if (anyEvt.incomeCode != null) return String(anyEvt.incomeCode);

  if (evt.category === "B" && anyEvt.hasOpenAtividade === true) return "452";

  if (evt.category === "E") {
    const desc = (evt.description ?? "").toLowerCase();
    if (/(dividend|dividendos|dividendo)/.test(desc)) return "401";
    if (/(interest|juros)/.test(desc)) return "402";
    return "401";
  }

  if (evt.category === "G" && (evt.description ?? "").toLowerCase().includes("interest")) return "402";

  return "401";
}

export function mapToAnexoJ(events: IncomeEvent[]): string {
  const doc = create({ version: "1.0", encoding: "UTF-8" })
    .ele("Modelo3", { xmlns: NS })
    .ele("AnexoJ");

  // Quadro4: Foreign income
  const quadro4 = doc.ele("Quadro4");

  for (const evt of events) {
    if (((evt.source ?? "") as string).toString().toUpperCase() !== "FOREIGN") continue;

    const anyEvt = evt as any;
    const linha = quadro4.ele("Linha");

    // C1: Country code (ISO3)
    linha.ele("C1").txt(iso2To3(evt.sourceCountry));

    // C2: Income code
    linha.ele("C2").txt(mapIncomeCode(evt));

    // C3: Gross amount (Decimal string with 2 dp)
    linha.ele("C3").txt(centsToDecimalString(evt.grossAmountCents));

    // C4: Tax paid abroad — if provided on event (payerTaxPaidCents), else 0.00
    let taxPaidCents = parseMoneyToCents(anyEvt.payerTaxPaidCents);
    if (taxPaidCents < 0) {
      logger.warn("Negative payerTaxPaidCents for event", { eventId: anyEvt.id, value: taxPaidCents });
      taxPaidCents = 0; // clamp negative values
    }
    linha.ele("C4").txt(centsToDecimalString(taxPaidCents));

    // Payer NIF handling (use sentinel when missing)
    const payerNif = anyEvt.payerNif ?? "";
    linha.ele("PayerNIF").txt(payerNif || UNKNOWN_NIF_PLACEHOLDER);
  }

  // Quadro8: Foreign accounts (if events include iban/bic)
  const quadro8 = doc.ele("Quadro8");
  const seenQuadro8 = new Set<string>();
  for (const evt of events) {
    const anyEvt = evt as any;
    const rawIban = anyEvt.iban ?? '';
    const rawBic = anyEvt.bic ?? '';
    const ibanNorm = normalizeIban(rawIban);
    const bicNorm = normalizeBic(rawBic);
    const hasIban = !!ibanNorm;
    const hasBic = !!bicNorm;

    const ibanValid = hasIban && isValidIBAN(ibanNorm);
    const bicValid = hasBic && /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bicNorm);

    // Require at least one valid identifier before emitting
    if (!ibanValid && !bicValid) {
      if (hasIban || hasBic) logger.warn('Skipping Quadro8 entry: no valid IBAN or BIC', { eventId: anyEvt.id, iban: maskSensitive(rawIban), bic: maskSensitive(rawBic) });
      continue;
    }

      const key = ibanValid ? `IBAN:${ibanNorm}` : `BIC:${bicNorm}`;
    // dedupe: ensure we only emit unique account lines per key per document
    if (!seenQuadro8.has(key)) {
      seenQuadro8.add(key);
      const linha = quadro8.ele("Linha");
      if (ibanValid) linha.ele("C1").txt(ibanNorm);
      if (bicValid) linha.ele("C2").txt(bicNorm);
    }
  }

  return doc.end({ prettyPrint: false });
}
