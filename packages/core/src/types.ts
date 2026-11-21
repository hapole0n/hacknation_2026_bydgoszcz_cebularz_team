// Closed id lists shared by the scoring engine and the YAML rules loader.
// config/scoring-rules.v1.yaml must define exactly these ids (parseRules enforces it).
export interface Localized {
  pl: string;
  en: string;
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
] as const;
export type ExclusionId = (typeof EXCLUSION_IDS)[number];
