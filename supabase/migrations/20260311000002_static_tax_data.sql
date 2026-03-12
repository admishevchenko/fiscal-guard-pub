-- =============================================================================
-- Migration: 20260311000002_static_tax_data.sql
-- Fiscal Guard — Static reference data for tax year 2026
--
-- Legal bases:
--   - Portaria n.º 352/2024 (NHR/IFICI rates + eligible professions)
--   - Portaria n.º 150/2004 (blacklisted jurisdictions), as amended
--   - Ordinance 292/2025 (removes HK, Liechtenstein, Uruguay from blacklist)
--   - OE 2026 (progressive brackets)
--
-- These tables are read-only reference data; no user_id column.
-- RLS: authenticated users may SELECT; no INSERT/UPDATE/DELETE via API.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Table: tax_rates_2026
-- NHR/IFICI flat rate + progressive brackets for tax year 2026.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.tax_rates_2026 (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rate_type   TEXT NOT NULL,  -- 'NHR_FLAT' | 'IFICI_FLAT' | 'PROGRESSIVE'
  -- For progressive: lower bound of bracket in cents; NULL for flat rates
  bracket_min BIGINT,
  -- For progressive: upper bound (NULL = unbounded top bracket)
  bracket_max BIGINT,
  -- Rate as Decimal string (8dp), e.g. '0.20000000'
  rate        TEXT NOT NULL,
  description TEXT NOT NULL,
  legal_ref   TEXT NOT NULL
);

CREATE POLICY "tax_rates_2026: authenticated select"
  ON public.tax_rates_2026 FOR SELECT
  TO authenticated
  USING (TRUE);

-- ---------------------------------------------------------------------------
-- Table: eligible_professions
-- High-value activities from the Annex to Portaria n.º 352/2024.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.eligible_professions (
  code        TEXT PRIMARY KEY,
  description TEXT NOT NULL,
  -- Annex section reference, e.g. "Annex I, Item 1"
  annex_ref   TEXT NOT NULL,
  -- TRUE = also eligible for IFICI innovation bonus
  ifici_bonus BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE POLICY "eligible_professions: authenticated select"
  ON public.eligible_professions FOR SELECT
  TO authenticated
  USING (TRUE);

-- ---------------------------------------------------------------------------
-- Table: dta_countries
-- Countries with active DTA (Double Taxation Agreement) with Portugal.
-- Foreign income from these countries is EXEMPT under the exemption method.
-- Portaria n.º 352/2024, Art. 4(1)(b).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.dta_countries (
  country_code CHAR(2) PRIMARY KEY,  -- ISO 3166-1 alpha-2
  country_name TEXT NOT NULL,
  treaty_ref   TEXT NOT NULL
);

CREATE POLICY "dta_countries: authenticated select"
  ON public.dta_countries FOR SELECT
  TO authenticated
  USING (TRUE);

-- ---------------------------------------------------------------------------
-- Table: blacklisted_jurisdictions
-- Portaria n.º 150/2004, as amended.
-- ⚠ Ordinance 292/2025: HK (HK), Liechtenstein (LI), Uruguay (UY)
--   removed effective 2026-01-01. These rows have removed_effective_date set.
-- Income from ACTIVE blacklisted jurisdictions taxed at progressive rates
-- (NOT the 20% NHR/IFICI flat rate). Art. 72(12) CIRS.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.blacklisted_jurisdictions (
  country_code            CHAR(2) PRIMARY KEY,  -- ISO 3166-1 alpha-2
  country_name            TEXT NOT NULL,
  added_by_portaria       TEXT NOT NULL,
  -- NULL = still active on the blacklist
  removed_by_portaria     TEXT,
  -- ISO 8601 date when removal became effective; NULL = still blacklisted
  removed_effective_date  DATE
);

CREATE POLICY "blacklisted_jurisdictions: authenticated select"
  ON public.blacklisted_jurisdictions FOR SELECT
  TO authenticated
  USING (TRUE);

-- ---------------------------------------------------------------------------
-- Enable Row Level Security on all reference tables
-- ---------------------------------------------------------------------------
ALTER TABLE public.tax_rates_2026            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.eligible_professions      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dta_countries             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blacklisted_jurisdictions ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- SEED DATA
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Tax rates 2026
-- Flat rates: Portaria n.º 352/2024, Art. 4
-- Progressive brackets: OE 2026 (Lei n.º 24-D/2022 base, updated)
-- ---------------------------------------------------------------------------
INSERT INTO public.tax_rates_2026 (rate_type, bracket_min, bracket_max, rate, description, legal_ref) VALUES
  -- NHR 20% flat rate on PT-sourced eligible income
  ('NHR_FLAT',       NULL,       NULL, '0.20000000', 'NHR flat rate on PT-sourced income',   'Art. 72(10) CIRS; Portaria n.º 352/2024, Art. 4(1)(a)'),
  -- IFICI 20% flat rate (same base rate as NHR)
  ('IFICI_FLAT',     NULL,       NULL, '0.20000000', 'IFICI flat rate on PT-sourced income', 'Art. 58-A(3) EBF; Portaria n.º 352/2024, Art. 4(2)'),
  -- 2026 progressive brackets (income in EUR cents)
  ('PROGRESSIVE',        0,  778100, '0.13000000', 'Up to €7,781',          'OE 2026, Art. 68 CIRS bracket 1'),
  ('PROGRESSIVE',   778101, 1153500, '0.18000000', '€7,781.01 – €11,535',   'OE 2026, Art. 68 CIRS bracket 2'),
  ('PROGRESSIVE',  1153501, 1611600, '0.23000000', '€11,535.01 – €16,116',  'OE 2026, Art. 68 CIRS bracket 3'),
  ('PROGRESSIVE',  1611601, 2160300, '0.26000000', '€16,116.01 – €21,603',  'OE 2026, Art. 68 CIRS bracket 4'),
  ('PROGRESSIVE',  2160301, 2664900, '0.32800000', '€21,603.01 – €26,649',  'OE 2026, Art. 68 CIRS bracket 5'),
  ('PROGRESSIVE',  2664901, 3843900, '0.37000000', '€26,649.01 – €38,439',  'OE 2026, Art. 68 CIRS bracket 6'),
  ('PROGRESSIVE',  3843901, 7557100, '0.43500000', '€38,439.01 – €75,571',  'OE 2026, Art. 68 CIRS bracket 7'),
  ('PROGRESSIVE', 7557101,     NULL, '0.48000000', 'Above €75,571',          'OE 2026, Art. 68 CIRS bracket 8');

-- ---------------------------------------------------------------------------
-- Eligible professions (Annex to Portaria n.º 352/2024)
-- Selected representative codes; extend as needed.
-- ---------------------------------------------------------------------------
INSERT INTO public.eligible_professions (code, description, annex_ref, ifici_bonus) VALUES
  ('1120', 'Dirigente executivo',                                    'Annex I, Item 1',  FALSE),
  ('2111', 'Físico e astrónomo',                                     'Annex I, Item 2',  TRUE),
  ('2112', 'Meteorologista',                                         'Annex I, Item 2',  TRUE),
  ('2120', 'Matemático, atuário e estatístico',                      'Annex I, Item 3',  TRUE),
  ('2131', 'Informático – sistemas de informação',                   'Annex I, Item 4',  TRUE),
  ('2132', 'Informático – desenvolvimento de software',              'Annex I, Item 4',  TRUE),
  ('2133', 'Engenheiro de redes e sistemas',                         'Annex I, Item 4',  TRUE),
  ('2140', 'Arquiteto, urbanista e designer industrial',             'Annex I, Item 5',  FALSE),
  ('2141', 'Engenheiro civil',                                       'Annex I, Item 5',  FALSE),
  ('2142', 'Engenheiro eletrotécnico',                               'Annex I, Item 5',  TRUE),
  ('2143', 'Engenheiro eletrónico e de telecomunicações',            'Annex I, Item 5',  TRUE),
  ('2144', 'Engenheiro mecânico',                                    'Annex I, Item 5',  FALSE),
  ('2145', 'Engenheiro químico e de materiais',                      'Annex I, Item 5',  TRUE),
  ('2146', 'Engenheiro de minas e metalúrgico',                      'Annex I, Item 5',  FALSE),
  ('2149', 'Engenheiro não classificado anteriormente',              'Annex I, Item 5',  FALSE),
  ('2211', 'Médico generalista',                                     'Annex I, Item 6',  FALSE),
  ('2212', 'Médico especialista',                                    'Annex I, Item 6',  FALSE),
  ('2221', 'Enfermeiro especialista',                                'Annex I, Item 6',  FALSE),
  ('2310', 'Professor universitário e de ensino superior',           'Annex I, Item 7',  TRUE),
  ('2410', 'Especialista em finanças',                               'Annex I, Item 8',  FALSE),
  ('2411', 'Contabilista',                                           'Annex I, Item 8',  FALSE),
  ('2421', 'Advogado',                                               'Annex I, Item 8',  FALSE),
  ('2423', 'Especialista em recursos humanos e organização',         'Annex I, Item 8',  FALSE),
  ('2431', 'Profissional de publicidade e marketing',                'Annex I, Item 8',  FALSE),
  ('2433', 'Analista de sistemas',                                   'Annex I, Item 4',  TRUE),
  ('3113', 'Técnico de eletrónica',                                  'Annex I, Item 9',  TRUE),
  ('3114', 'Técnico de telecomunicações',                            'Annex I, Item 9',  TRUE),
  ('3115', 'Técnico de engenharia mecânica',                         'Annex I, Item 9',  FALSE);

-- ---------------------------------------------------------------------------
-- DTA Countries
-- Portugal has active tax treaties with the following countries.
-- Foreign income from these → exempt under exemption method.
-- Source: AT (Autoridade Tributária) list, updated 2026.
-- ---------------------------------------------------------------------------
INSERT INTO public.dta_countries (country_code, country_name, treaty_ref) VALUES
  ('AT', 'Austria',         'DTA PT-AT 1971'),
  ('BE', 'Belgium',         'DTA PT-BE 1969'),
  ('BR', 'Brazil',          'DTA PT-BR 2001'),
  ('CA', 'Canada',          'DTA PT-CA 2001'),
  ('CL', 'Chile',           'DTA PT-CL 2008'),
  ('CN', 'China',           'DTA PT-CN 1998'),
  ('CZ', 'Czech Republic',  'DTA PT-CZ 1997'),
  ('DE', 'Germany',         'DTA PT-DE 1982'),
  ('DK', 'Denmark',         'DTA PT-DK 2002'),
  ('ES', 'Spain',           'DTA PT-ES 1995'),
  ('FI', 'Finland',         'DTA PT-FI 1971'),
  ('FR', 'France',          'DTA PT-FR 1971'),
  ('GB', 'United Kingdom',  'DTA PT-GB 1969'),
  ('GR', 'Greece',          'DTA PT-GR 2002'),
  ('HU', 'Hungary',         'DTA PT-HU 1995'),
  ('IE', 'Ireland',         'DTA PT-IE 1994'),
  ('IN', 'India',           'DTA PT-IN 1999'),
  ('IT', 'Italy',           'DTA PT-IT 1981'),
  ('JP', 'Japan',           'DTA PT-JP 1969'),
  ('KR', 'South Korea',     'DTA PT-KR 1997'),
  ('LU', 'Luxembourg',      'DTA PT-LU 1999'),
  ('MX', 'Mexico',          'DTA PT-MX 2000'),
  -- NOTE: Macao (MO) is excluded from DTA countries because it remains on the
  -- Portaria n.º 150/2004 blacklist. The blacklist takes precedence over any
  -- tax cooperation agreement — Art. 72(12) CIRS applies.
  ('NL', 'Netherlands',     'DTA PT-NL 2000'),
  ('NO', 'Norway',          'DTA PT-NO 1971'),
  ('PL', 'Poland',          'DTA PT-PL 1995'),
  ('RO', 'Romania',         'DTA PT-RO 2000'),
  ('RU', 'Russia',          'DTA PT-RU 2002'),
  ('SE', 'Sweden',          'DTA PT-SE 2003'),
  ('SG', 'Singapore',       'DTA PT-SG 2000'),
  ('SK', 'Slovakia',        'DTA PT-SK 2004'),
  ('SI', 'Slovenia',        'DTA PT-SI 2004'),
  ('CH', 'Switzerland',     'DTA PT-CH 1975'),
  ('TN', 'Tunisia',         'DTA PT-TN 1999'),
  ('TR', 'Turkey',          'DTA PT-TR 2009'),
  ('UA', 'Ukraine',         'DTA PT-UA 2001'),
  ('US', 'United States',   'DTA PT-US 1994'),
  ('VE', 'Venezuela',       'DTA PT-VE 1997'),
  ('ZA', 'South Africa',    'DTA PT-ZA 2007');

-- ---------------------------------------------------------------------------
-- Blacklisted Jurisdictions
-- Source: Portaria n.º 150/2004, as amended by successive portarias.
-- ⚠ IMPORTANT: Per Ordinance 292/2025 (effective 2026-01-01):
--   HK (Hong Kong), LI (Liechtenstein), UY (Uruguay) are NO LONGER blacklisted.
--   Their rows are included with removed_by_portaria and removed_effective_date set.
--   Application code MUST filter WHERE removed_effective_date IS NULL
--   OR removed_effective_date > current date to find active blacklisted jurisdictions.
-- ---------------------------------------------------------------------------
INSERT INTO public.blacklisted_jurisdictions
  (country_code, country_name, added_by_portaria, removed_by_portaria, removed_effective_date)
VALUES
  -- De-listed by Ordinance 292/2025 effective 2026-01-01
  ('HK', 'Hong Kong',     'Portaria n.º 150/2004', 'Ordinance 292/2025', '2026-01-01'),
  ('LI', 'Liechtenstein', 'Portaria n.º 150/2004', 'Ordinance 292/2025', '2026-01-01'),
  ('UY', 'Uruguay',       'Portaria n.º 150/2004', 'Ordinance 292/2025', '2026-01-01'),
  -- Still blacklisted
  ('AD', 'Andorra',                   'Portaria n.º 150/2004', NULL, NULL),
  ('AG', 'Antigua and Barbuda',       'Portaria n.º 150/2004', NULL, NULL),
  ('AI', 'Anguilla',                  'Portaria n.º 150/2004', NULL, NULL),
  ('AN', 'Netherlands Antilles',      'Portaria n.º 150/2004', NULL, NULL),
  ('AW', 'Aruba',                     'Portaria n.º 150/2004', NULL, NULL),
  ('BB', 'Barbados',                  'Portaria n.º 150/2004', NULL, NULL),
  ('BH', 'Bahrain',                   'Portaria n.º 150/2004', NULL, NULL),
  ('BM', 'Bermuda',                   'Portaria n.º 150/2004', NULL, NULL),
  ('BS', 'Bahamas',                   'Portaria n.º 150/2004', NULL, NULL),
  ('BZ', 'Belize',                    'Portaria n.º 150/2004', NULL, NULL),
  ('CK', 'Cook Islands',              'Portaria n.º 150/2004', NULL, NULL),
  ('CW', 'Curaçao',                   'Portaria n.º 150/2004', NULL, NULL),
  ('DM', 'Dominica',                  'Portaria n.º 150/2004', NULL, NULL),
  ('GD', 'Grenada',                   'Portaria n.º 150/2004', NULL, NULL),
  ('GI', 'Gibraltar',                 'Portaria n.º 150/2004', NULL, NULL),
  ('GG', 'Guernsey',                  'Portaria n.º 150/2004', NULL, NULL),
  ('IM', 'Isle of Man',               'Portaria n.º 150/2004', NULL, NULL),
  ('JE', 'Jersey',                    'Portaria n.º 150/2004', NULL, NULL),
  ('JO', 'Jordan',                    'Portaria n.º 150/2004', NULL, NULL),
  ('KI', 'Kiribati',                  'Portaria n.º 150/2004', NULL, NULL),
  ('KN', 'Saint Kitts and Nevis',     'Portaria n.º 150/2004', NULL, NULL),
  ('KY', 'Cayman Islands',            'Portaria n.º 150/2004', NULL, NULL),
  ('LB', 'Lebanon',                   'Portaria n.º 150/2004', NULL, NULL),
  ('LC', 'Saint Lucia',               'Portaria n.º 150/2004', NULL, NULL),
  ('LR', 'Liberia',                   'Portaria n.º 150/2004', NULL, NULL),
  ('MH', 'Marshall Islands',          'Portaria n.º 150/2004', NULL, NULL),
  ('MO', 'Macao',                     'Portaria n.º 150/2004', NULL, NULL),
  ('MS', 'Montserrat',                'Portaria n.º 150/2004', NULL, NULL),
  ('MU', 'Mauritius',                 'Portaria n.º 150/2004', NULL, NULL),
  ('MV', 'Maldives',                  'Portaria n.º 150/2004', NULL, NULL),
  ('NR', 'Nauru',                     'Portaria n.º 150/2004', NULL, NULL),
  ('NU', 'Niue',                      'Portaria n.º 150/2004', NULL, NULL),
  ('PA', 'Panama',                    'Portaria n.º 150/2004', NULL, NULL),
  ('PW', 'Palau',                     'Portaria n.º 150/2004', NULL, NULL),
  ('SA', 'Saudi Arabia',              'Portaria n.º 150/2004', NULL, NULL),
  ('SB', 'Solomon Islands',           'Portaria n.º 150/2004', NULL, NULL),
  ('SC', 'Seychelles',                'Portaria n.º 150/2004', NULL, NULL),
  ('SX', 'Sint Maarten',              'Portaria n.º 150/2004', NULL, NULL),
  ('TC', 'Turks and Caicos Islands',  'Portaria n.º 150/2004', NULL, NULL),
  ('TO', 'Tonga',                     'Portaria n.º 150/2004', NULL, NULL),
  ('TV', 'Tuvalu',                    'Portaria n.º 150/2004', NULL, NULL),
  ('UM', 'US Minor Outlying Islands', 'Portaria n.º 150/2004', NULL, NULL),
  ('VC', 'Saint Vincent',             'Portaria n.º 150/2004', NULL, NULL),
  ('VG', 'British Virgin Islands',    'Portaria n.º 150/2004', NULL, NULL),
  ('VI', 'US Virgin Islands',         'Portaria n.º 150/2004', NULL, NULL),
  ('VU', 'Vanuatu',                   'Portaria n.º 150/2004', NULL, NULL),
  ('WS', 'Samoa',                     'Portaria n.º 150/2004', NULL, NULL);
