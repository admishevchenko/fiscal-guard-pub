/**
 * Eligible high-value activity profession codes from the Annex to
 * Portaria n.º 352/2024.
 *
 * Activities whose CPP 2010 code (Classificação Portuguesa das Profissões —
 * Portugal's implementation of ISCO-08) appears in this set qualify for the
 * 20% flat rate under both NHR (Art. 72(10) CIRS) and IFICI (Art. 58-A(1) EBF)
 * when the income is PT-sourced (Category A or B).
 *
 * Engine-internal copy — mirrors the `eligible_professions` DB seed.
 */
export const ELIGIBLE_PROFESSION_CODES: ReadonlySet<string> = new Set<string>([
  "1120", // Dirigente executivo                            – Annex I, Item 1
  "2111", // Físico e astrónomo                            – Annex I, Item 2
  "2112", // Meteorologista                                – Annex I, Item 2
  "2120", // Matemático, atuário e estatístico             – Annex I, Item 3
  "2131", // Informático – sistemas de informação          – Annex I, Item 4
  "2132", // Informático – desenvolvimento de software     – Annex I, Item 4
  "2133", // Engenheiro de redes e sistemas                – Annex I, Item 4
  "2140", // Arquiteto, urbanista e designer industrial    – Annex I, Item 5
  "2141", // Engenheiro civil                              – Annex I, Item 5
  "2142", // Engenheiro eletrotécnico                      – Annex I, Item 5
  "2143", // Engenheiro eletrónico e de telecomunicações   – Annex I, Item 5
  "2144", // Engenheiro mecânico                           – Annex I, Item 5
  "2145", // Engenheiro químico e de materiais             – Annex I, Item 5
  "2146", // Engenheiro de minas e metalúrgico             – Annex I, Item 5
  "2149", // Engenheiro não classificado anteriormente     – Annex I, Item 5
  "2211", // Médico generalista                            – Annex I, Item 6
  "2212", // Médico especialista                           – Annex I, Item 6
  "2221", // Enfermeiro especialista                       – Annex I, Item 6
  "2310", // Professor universitário e de ensino superior  – Annex I, Item 7
  "2410", // Especialista em finanças                      – Annex I, Item 8
  "2411", // Contabilista                                  – Annex I, Item 8
  "2421", // Advogado                                      – Annex I, Item 8
  "2423", // Especialista em recursos humanos              – Annex I, Item 8
  "2431", // Profissional de publicidade e marketing       – Annex I, Item 8
  // NOTE: 2433 intentionally omitted — see SUSPECT_PROFESSION_CODES below.
  "3113", // Técnico de eletrónica                         – Annex I, Item 9
  "3114", // Técnico de telecomunicações                   – Annex I, Item 9
  "3115", // Técnico de engenharia mecânica                – Annex I, Item 9
]);

/**
 * Profession codes that require manual compliance review before the 20% flat
 * rate (FLAT_20) can be confirmed.
 *
 * A code lands here when its mapping in the Portaria n.º 352/2024 Annex is
 * ambiguous or disputed.  The engine returns PENDING_MANUAL_REVIEW for income
 * events bearing these codes, applying conservative PROGRESSIVE rates until a
 * compliance officer clears the flag (see IncomeClassifier.ts Rule 2).
 *
 * ### Why 2433 is suspect
 * In CPP 2010 (Portugal's ISCO-08 implementation), code 2433 denotes
 * "Analistas financeiros" (Financial Analysts / Fund Managers) — a financial
 * profession under sub-major group 241.  The Portaria n.º 352/2024 Annex
 * lists high-value IT activities under Item 4 (sub-major group 213) and
 * financial specialists separately under Item 8.  Whether 2433 qualifies under
 * Item 4 or Item 8, and whether it meets the "high value" threshold in both
 * cases, requires a code-by-code comparison with the official Annex text and
 * AT administrative guidance.  Flagged by Anvil evidence review (Round 3).
 *
 * Resolution: obtain an AT informação vinculativa (binding ruling) for 2433
 * before moving it back to ELIGIBLE_PROFESSION_CODES.
 */
export const SUSPECT_PROFESSION_CODES: ReadonlySet<string> = new Set<string>([
  "2433", // Analistas financeiros — CPP 2010 sub-group 2433; Annex item ambiguous (Item 4 vs Item 8)
]);
