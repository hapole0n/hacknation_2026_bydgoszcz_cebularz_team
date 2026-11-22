import type { IdentifierType } from './identity.js';

// Closed id lists shared by the scoring engine and the YAML rules loader.
// config/scoring-rules.v1.yaml must define exactly these ids (parseRules enforces it).
export interface Localized {
  pl: string;
  en: string;
}

/** What one source did with one identifier: it found something, found nothing, failed, lacked a key, or cannot take that kind of identifier. */
export const SEARCH_OUTCOMES = ['FOUND', 'NONE', 'ERROR', 'SKIPPED_NO_KEY', 'UNSUPPORTED'] as const;
export type SearchOutcome = (typeof SEARCH_OUTCOMES)[number];

/** One line of the search log of a run ("Przeszukane źródła"): stored in `Run.summaryJson.searches`. */
export interface SearchLogEntry {
  connector: string;
  /** 1 = the case identifiers, 2 = reverse lookup of each found address, 3 = pivot on a publisher's handle, 4 = earlier copies of pages (web archive). */
  round: 1 | 2 | 3 | 4;
  /** Round 1: the identifier searched. Rounds 2-4 sum up many lookups: null. */
  identifier: { type: IdentifierType; value: string } | null;
  outcome: SearchOutcome;
  /** Resources (profiles, pages, records) found, and the crypto addresses in them. */
  resources: number;
  addresses: number;
  /** Rounds 2-4: how many lookups were made. */
  queries?: number;
  /** ERROR: what went wrong; SKIPPED_NO_KEY: `{ code: 'KEY_MISSING', params: { key } }`. */
  note?: { code: string; params?: Record<string, string | number> };
  /** When the source answered (ISO time; rounds 2-4: the last lookup). Absent in runs made before this field. */
  at?: string;
}

export const SOURCE_TYPES = [
  'OFFICIAL_PROFILE',
  'SALE_AD',
  'P2P_OFFER',
  'EMAIL_FOOTER',
  'MESSENGER_SETTLEMENT',
  'FORUM_DISCUSSION',
  'MASS_COMMENT',
  'GIVEAWAY',
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const IDENTITY_RULE_IDS = [
  'IDENT_EXACT_SAME_PLATFORM',
  'IDENT_EMAIL_EXACT',
  'IDENT_NICK_VARIANT',
  'IDENT_NICK_OTHER_PLATFORM',
  'IDENT_NAME_ONLY',
] as const;
export type IdentityRuleId = (typeof IDENTITY_RULE_IDS)[number];

export const MODIFIER_IDS = [
  ...IDENTITY_RULE_IDS,
  'SYNERGY_INDEPENDENT_SOURCES',
  'CHAIN_ACTIVE_CONSISTENT',
  'CHAIN_NEVER_USED',
  'TRACE_OLDER_THAN_3Y',
  'ADDRESS_MULTI_IDENTITY',
] as const;
export type ModifierId = (typeof MODIFIER_IDS)[number];

export const EXCLUSION_IDS = [
  'EXCL_CEX',
  'EXCL_CUSTODIAL_DEPOSIT',
  'EXCL_CONTRACT',
  'EXCL_MIXER',
  'EXCL_CHARITY',
  'EXCL_EXAMPLE',
  'EXCL_SERVICE',
] as const;
export type ExclusionId = (typeof EXCLUSION_IDS)[number];
