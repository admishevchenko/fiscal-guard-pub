/**
 * ISO 3166-1 alpha-2 country codes with active DTA treaties with Portugal.
 *
 * Foreign income from these countries is EXEMPT under the exemption method.
 * Portaria n.º 352/2024, Art. 4(1)(b).
 *
 * NOTE: Macao (MO) is intentionally excluded — it remains on the
 * Portaria n.º 150/2004 blacklist, which overrides any DTA per Art. 72(12) CIRS.
 *
 * NOTE: Hong Kong (HK) is included. Although HK was formerly on the Portaria n.º 150/2004
 * blacklist, Ordinance 292/2025 removes it effective 2026-01-01. IncomeClassifier Rule 1
 * (BlacklistValidator) still fires first for tax years 2025 and earlier, ensuring HK income
 * is correctly treated as BLACKLIST_35 before that date. From 2026-01-01 onward, Rule 4 applies
 * and HK income is DTA_EXEMPT under the PT-HK DTA (signed 2011; Resolução AR n.º 119/2012,
 * in force 2012-06-11; Art. 4(1)(b) Portaria n.º 352/2024).
 *
 * Engine-internal copy — mirrors the `dta_countries` DB seed.
 */
export const DTA_COUNTRY_CODES: ReadonlySet<string> = new Set<string>([
  "AT", // Austria          – DTA PT-AT 1971
  "BE", // Belgium          – DTA PT-BE 1969
  "BR", // Brazil           – DTA PT-BR 2001
  "CA", // Canada           – DTA PT-CA 2001
  "CL", // Chile            – DTA PT-CL 2008
  "CN", // China            – DTA PT-CN 1998
  "CV", // Cape Verde       – DTA PT-CV 2000 (PALOP bilateral treaty)
  "CZ", // Czech Republic   – DTA PT-CZ 1997
  "DE", // Germany          – DTA PT-DE 1982
  "DK", // Denmark          – DTA PT-DK 2002
  "EE", // Estonia          – DTA PT-EE 2004
  "ES", // Spain            – DTA PT-ES 1995
  // ⚠ VERIFY: EU Commission taxation database (taxation-customs.ec.europa.eu) indicates
  // the PT-FI DTA may have been terminated. Inclusion pending verification against
  // DRE gazette or AT (Autoridade Tributária) official DTA list.
  "FI", // Finland          – DTA PT-FI 1971 (status unverified — see warning above)
  "FR", // France           – DTA PT-FR 1971
  "GB", // United Kingdom   – DTA PT-GB 1969
  "GR", // Greece           – DTA PT-GR 2002
  "HK", // Hong Kong        – DTA PT-HK 2011 (Resolução AR n.º 119/2012, in force 2012-06-11)
        //                    De-listed from Portaria 150/2004 blacklist by Ord. 292/2025 (eff. 2026-01-01).
        //                    Rule ordering ensures BLACKLIST_35 still applies for tax years < 2026.
  "HR", // Croatia          – DTA PT-HR 2010
  "HU", // Hungary          – DTA PT-HU 1995
  "IE", // Ireland          – DTA PT-IE 1994
  "IN", // India            – DTA PT-IN 1999
  "IT", // Italy            – DTA PT-IT 1981
  "JP", // Japan            – DTA PT-JP 1969
  "KR", // South Korea      – DTA PT-KR 1997
  "LT", // Lithuania        – DTA PT-LT 2004
  "LU", // Luxembourg       – DTA PT-LU 1999
  "LV", // Latvia           – DTA PT-LV 2001
  "MA", // Morocco          – DTA PT-MA 2000
  "MT", // Malta            – DTA PT-MT 2001
  "MX", // Mexico           – DTA PT-MX 2000
  "AO", // Angola           – DTA PT-AO 2018 (Resolução AR n.º 50/2019, in force 2019-04-10)
        //                    PALOP bilateral treaty; confirmed active per AT official list.
  "MZ", // Mozambique       – DTA PT-MZ 1993 (Resolução AR n.º 31/93, in force 1993-04-30)
        //                    PALOP bilateral treaty; confirmed active per AT official list.
  "NL", // Netherlands      – DTA PT-NL 2000
  "NO", // Norway           – DTA PT-NO 1971
  "PL", // Poland           – DTA PT-PL 1995
  "RO", // Romania          – DTA PT-RO 2000
  "RU", // Russia           – DTA PT-RU 2002
  // ⚠ VERIFY: EU Commission taxation database (taxation-customs.ec.europa.eu) indicates
  // the PT-SE DTA may have been terminated. Inclusion pending verification against
  // DRE gazette or AT (Autoridade Tributária) official DTA list.
  "SE", // Sweden           – DTA PT-SE 2003 (status unverified — see warning above)
  "SG", // Singapore        – DTA PT-SG 2000
  "SK", // Slovakia         – DTA PT-SK 2004
  "SI", // Slovenia         – DTA PT-SI 2004
  "CH", // Switzerland      – DTA PT-CH 1975
  "TN", // Tunisia          – DTA PT-TN 1999
  "TR", // Turkey           – DTA PT-TR 2009
  "UA", // Ukraine          – DTA PT-UA 2001
  "US", // United States    – DTA PT-US 1994
  "VE", // Venezuela        – DTA PT-VE 1997
  "ZA", // South Africa     – DTA PT-ZA 2007
]);
