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

// Ensure Decimal rounding mode is explicit for tax reporting (HALF_UP is common for financial rounding)
(Decimal as any).set({ precision: 20, rounding: (Decimal as any).ROUND_HALF_UP });

function iso2To3(alpha2: string): string {
  if (!alpha2) return "";
  try {
    const code = countries.alpha2ToAlpha3(alpha2.toUpperCase());
    return code ?? "";
  } catch (e) {
    console.warn("Unable to convert country code", alpha2, e);
    return "";
  }
}

function centsToDecimalString(cents: number | string): string {
  if (cents == null || cents === "") return "0.00";
  const d = new (Decimal as any)(cents).dividedBy(100);
  return (d as any).toFixed(2);
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
  if (anyEvt.incomeCode) return String(anyEvt.incomeCode);

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
      } else if (typeof anyEvt.payerTaxPaidCents === 'string' && /^\d+$/.test(anyEvt.payerTaxPaidCents)) {
        taxPaidCents = parseInt(anyEvt.payerTaxPaidCents, 10);
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
    if (!anyEvt.iban && !anyEvt.bic) continue;

    const hasIban = !!anyEvt.iban;
    const hasBic = !!anyEvt.bic;

    // If IBAN is present but invalid, allow BIC-only entries if BIC is valid; otherwise skip
    if (hasIban && !isValidIBAN(anyEvt.iban)) {
      console.warn("Invalid IBAN for event", anyEvt.id);
      if (!hasBic) continue;
    }

    // Simple BIC validation: 8 or 11 chars, uppercase letters/digits
    const bic = (anyEvt.bic ?? "").toString().toUpperCase();
    const bicValid = /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(bic);
    if (!hasIban && !bicValid) {
      console.warn("Invalid or missing BIC for event", anyEvt.id);
      continue;
    }

    const linha = quadro8.ele("Linha");
    // Emit IBAN only if valid
    linha.ele("C1").txt(hasIban && isValidIBAN(anyEvt.iban) ? anyEvt.iban : "");
    linha.ele("C2").txt(bicValid ? bic : (anyEvt.bic ?? ""));
  }

  return doc.end({ prettyPrint: false });
}
