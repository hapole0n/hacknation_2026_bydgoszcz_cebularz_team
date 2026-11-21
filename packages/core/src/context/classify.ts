import type { SourceType } from '../types.js';

/** Ordered by priority: on a tie the more specific type wins. */
export const CONTEXT_TYPES = ['GIVEAWAY', 'P2P', 'SALE', 'SETTLEMENT', 'DONATION', 'DISCUSSION'] as const;
export type ContextType = (typeof CONTEXT_TYPES)[number];

// Matched against lower-case text with diacritics stripped (ł → l), so "gotówkę" is "gotowke".
const KEYWORDS: Record<ContextType, RegExp[]> = {
  GIVEAWAY: [/\bgiveaway\w*/, /\brozdani\w*/, /\brozdaj\w*/, /\bkonkurs\w*/, /\blosowani\w*/, /\bairdrop\w*/, /\bwygraj\w*/, /\bnagrod\w*/, /\bpromocj\w*/],
  P2P: [/\bp2p\b/, /\bpeer.to.peer\b/, /\bpaxful\b/, /\bbisq\b/, /\bhodl ?hodl\b/, /\blocalbitcoins\b/, /\bza gotowk\w*/, /\bgotowk\w*/, /\bkantor\w*/, /\bodbior osobist\w*/, /\bcash\b/, /\bspotkani\w*/],
  SALE: [/\bsprzedam\b/, /\bsprzedaj\w*/, /\bsprzedaz\w*/, /\bna sprzedaz\b/, /\bkupie\b/, /\bskupuj\w*/, /\bogloszeni\w*/, /\boferuj\w*/, /\boferta\b/, /\bsell(?:ing)?\b/, /\bfor sale\b/, /\bbuying\b/, /\bcena\b/, /\bkurs\b/],
  SETTLEMENT: [/\brozlicz\w*/, /\bprzelew\w*/, /\bwyslij na\b/, /\bwplat\w*/, /\bzaplat\w*/, /\bzaplac\w*/, /\bplatnos\w*/, /\bfaktur\w*/, /\binvoice\b/, /\bpayment\b/, /\bpay to\b/, /\bsend (?:it )?to\b/, /\bsettle\w*/, /\boplat\w*/, /\bzaliczk\w*/],
  DONATION: [/\bdonat\w*/, /\bwsparci\w*/, /\bwspiera\w*/, /\bwesprzyj\w*/, /\bbuy me a coffee\b/, /\bpostaw mi kawe\b/, /\bnapiwek\b/, /\btips?\b/, /\bdarowizn\w*/, /\bsponsor\w*/, /\bzrzutk\w*/],
  DISCUSSION: [/\bforum\b/, /\bwatek\b/, /\bthread\b/, /\bdyskusj\w*/, /\bpytani\w*/, /\bodpowiedz\w*/, /\breply\b/],
};

export interface ContextClassification {
  contextType: ContextType;
  /** The matched keywords (provenance shown to the analyst). */
  matchedKeywords: string[];
  /** True when no keyword matched and DISCUSSION is only the default — a hook for the optional local-LLM fallback. */
  fallback: boolean;
}

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/ł/g, 'l').toLowerCase();

export function classifyContext(context: string): ContextClassification {
  const text = fold(context);
  let best: { type: ContextType; hits: string[] } | undefined;
  for (const type of CONTEXT_TYPES) {
    const hits = [...new Set(KEYWORDS[type].flatMap((re) => text.match(new RegExp(re, 'g')) ?? []))];
    if (hits.length > (best?.hits.length ?? 0)) best = { type, hits };
  }
  return best
    ? { contextType: best.type, matchedKeywords: best.hits, fallback: false }
    : { contextType: 'DISCUSSION', matchedKeywords: [], fallback: true };
}

/** Where the trace was found, as reported by the connector (it knows the platform, the text does not). */
export type TraceOrigin =
  | 'OWN_PROFILE' // page controlled by the subject: personal site, own GitHub, verified account
  | 'EMAIL'
  | 'MESSENGER'
  | 'COMMENT_THREAD' // many unrelated commenters under a post
  | 'PUBLIC'; // forum, social post, advert site, anything else public

/** Source type = base-score tier of config/scoring-rules.v1.yaml. */
export function sourceTypeFor(contextType: ContextType, origin: TraceOrigin = 'PUBLIC'): SourceType {
  if (origin === 'OWN_PROFILE') return 'OFFICIAL_PROFILE';
  if (origin === 'EMAIL') return 'EMAIL_FOOTER';
  if (origin === 'COMMENT_THREAD') return contextType === 'GIVEAWAY' ? 'GIVEAWAY' : 'MASS_COMMENT';
  if (origin === 'MESSENGER' && contextType === 'SETTLEMENT') return 'MESSENGER_SETTLEMENT';
  switch (contextType) {
    case 'GIVEAWAY':
      return 'GIVEAWAY';
    case 'P2P':
      return 'P2P_OFFER';
    case 'SALE':
      return 'SALE_AD';
    default:
      return 'FORUM_DISCUSSION'; // settlement outside a messenger, donation on a third-party page, discussion
  }
}
