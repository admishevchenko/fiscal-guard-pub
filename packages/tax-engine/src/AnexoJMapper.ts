import { create } from "xmlbuilder2";
import Decimal from "decimal.js";
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

// Decimal configuration for financial formatting. This is intentionally set here
// but should be centralized if used across multiple modules.
(Decimal as any).set({ precision: 20, rounding: (Decimal as any).ROUND_HALF_UP });

function iso2To3(alpha2: string): string {
  if (!alpha2) return "";
  const s = alpha2.toString().trim();
  if (s.length === 3 && /^[A-Z]{3}$/i.test(s)) return s.toUpperCase();
  try {
    const code = countries.alpha2ToAlpha3(s.toUpperCase());
    return code ?? "";
  } catch (e) {
    console.warn("Unable to convert country code", alpha2, e);
    return "";
  }
}

function normalizeIban(iban: string): string {
  if (!iban) return "";
  return iban.toString().replace(/\s+/g, '').toUpperCase();
}

function normalizeBic(bic: string): string {
  if (!bic) return "";
  return bic.toString().trim().toUpperCase();
}

function centsToDecimalString(cents: number | string): string {
  if (cents == null || cents === "") return "0.00";
  try {
    if (typeof cents === 'string') {
      let s = cents.trim();
      // remove common currency symbols and spaces
      s = s.replace(/[€$£\s]/g, '');
      // remove thousand separators like commas
      s = s.replace(/,/g, '');
      if (s === '') return '0.00';
      if (s.includes('.')) {
        // treat as euros float
        const d = new (Decimal as any)(s);
        return (d as any).toFixed(2);
      }
      // digits-only: interpret as cents
      const d = new (Decimal as any)(s).dividedBy(100);
      return (d as any).toFixed(2);
    }

    // number input: interpret as cents
    const d = new (Decimal as any)(cents).dividedBy(100);
    return (d as any).toFixed(2);
  } catch (e) {
    console.warn('Failed to format cents value', cents, e);
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
    let taxPaidCents = 0;
    if (anyEvt.payerTaxPaidCents != null) {
      if (Number.isInteger(anyEvt.payerTaxPaidCents)) {
        taxPaidCents = anyEvt.payerTaxPaidCents;
      } else if (typeof anyEvt.payerTaxPaidCents === 'string') {
        // normalize string: remove currency symbols and commas
        let s = anyEvt.payerTaxPaidCents.trim().replace(/[€$£\s]/g, '').replace(/,/g, '');
        if (s === '') {
          taxPaidCents = 0;
        } else if (s.includes('.')) {
          // interpret as euros float
          try {
            taxPaidCents = new (Decimal as any)(s).times(100).toNumber();
          } catch (e) {
            console.warn('Failed to parse payerTaxPaidCents', anyEvt.payerTaxPaidCents, e);
            taxPaidCents = 0;
          }
        } else if (/^\d+$/.test(s)) {
          taxPaidCents = parseInt(s, 10);
        } else {
          const num = Number(s);
          taxPaidCents = Number.isFinite(num) ? Math.round(num) : 0;
        }
      } else if (!Number.isNaN(Number(anyEvt.payerTaxPaidCents))) {
        taxPaidCents = Math.round(Number(anyEvt.payerTaxPaidCents));
      }
    }
    if (taxPaidCents < 0) {
      console.warn("Negative payerTaxPaidCents for event", anyEvt.id);
      taxPaidCents = 0; // clamp negative values
    }
    linha.ele("C4").txt(centsToDecimalString(taxPaidCents));

    // Payer NIF handling (use sentinel when missing)
    const payerNif = anyEvt.payerNif ?? "";
    linha.ele("PayerNIF").txt(payerNif || UNKNOWN_NIF_PLACEHOLDER);
  }

  // Quadro8: Foreign accounts (if events include iban/bic)
  const quadro8 = doc.ele("Quadro8");
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
      if (hasIban || hasBic) console.warn('Skipping Quadro8 entry: no valid IBAN or BIC for event', anyEvt.id);
      continue;
    }

    const linha = quadro8.ele("Linha");
    linha.ele("C1").txt(ibanValid ? ibanNorm : "");
    linha.ele("C2").txt(bicValid ? bicNorm : "");
  }

  return doc.end({ prettyPrint: false });
}
