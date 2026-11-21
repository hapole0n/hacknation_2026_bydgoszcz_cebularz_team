import type { ExclusionId, IdentityRuleId, Localized, ModifierId, SourceType } from '../types.js';
import { EXCLUDED_BAND, baseRuleId, evalCondition, type Rules } from './rules.js';

/** One occurrence of the address in one piece of evidence, tied to the identifier being scored. */
export interface ScoringTrace {
  evidenceId: string;
  /** Service / registrable domain. Repeats of one origin never count as extra confirmation. */
  originKey: string;
  sourceType: SourceType;
  /** How the identifier matches the author of this trace (none = no identity bonus or penalty). */
  identity?: IdentityRuleId[];
  /** ISO date the trace was published (or, failing that, fetched). */
  observedAt?: string;
}

export interface ScoringInput {
  /** All traces that tie this identifier to this address. */
  traces: ScoringTrace[];
  /** Verdicts of the classifier / labels / bytecode check. Any exclusion → 0. */
  exclusions?: ExclusionId[];
  /** Absent = on-chain data not fetched yet: no on-chain rule applies. */
  chain?: { everUsed: boolean; activeNearTrace?: boolean };
  /** Number of unrelated identities the same address is attributed to (copy-paste / scam). */
  unrelatedIdentities?: number;
  /** "Now" as an ISO date — core has no clock, so runs stay reproducible. */
  asOf: string;
}

export type BreakdownKind = 'base' | 'identity' | 'synergy' | 'chain' | 'recency' | 'conflict' | 'clamp' | 'exclusion';

export interface BreakdownEntry {
  ruleId: string;
  kind: BreakdownKind;
  delta: number;
  reasonPl: string;
  reasonEn: string;
  /** Evidence behind the rule. On-chain rules (kind "chain") rest on the run's ChainSnapshot instead. */
  evidenceIds: string[];
}

export interface ScoreResult {
  /** 0–100; always equals the sum of `breakdown[].delta` (clamp included). */
  score: number;
  band: string;
  bandLabel: Localized;
  rulesVersion: string;
  excluded: boolean;
  excludedReason?: ExclusionId;
  breakdown: BreakdownEntry[];
  /** "What would change the score" — shown next to the result. */
  hints: Localized[];
}

function parseDate(s: string, what: string): string {
  if (Number.isNaN(Date.parse(s))) throw new RangeError(`scoreLink: invalid ${what} "${s}"`);
  return s;
}

const olderThanThreeYears = (date: string, asOf: string): boolean => {
  const limit = new Date(date);
  limit.setUTCFullYear(limit.getUTCFullYear() + 3);
  return limit < new Date(asOf);
};

function bandFor(rules: Rules, score: number, excluded: boolean) {
  if (excluded) return rules.bands.find((b) => b.id === EXCLUDED_BAND)!;
  // The scale has no band for 1–9 (neither does the task annex): a non-excluded score never becomes
  // "excluded", it falls into the lowest live band.
  const live = rules.bands.filter((b) => b.id !== EXCLUDED_BAND).sort((a, b) => a.min - b.min);
  return live.filter((b) => b.min <= score).at(-1) ?? live[0]!;
}

export function scoreLink(rules: Rules, input: ScoringInput): ScoreResult {
  const { traces, exclusions = [] } = input;
  const asOf = parseDate(input.asOf, 'asOf');
  const allEvidence = traces.map((t) => t.evidenceId);
  const breakdown: BreakdownEntry[] = [];
  const mod = (id: ModifierId, kind: BreakdownKind, evidenceIds: string[]) =>
    breakdown.push({ ruleId: id, kind, delta: rules.modifiers[id].delta, reasonPl: rules.modifiers[id].pl, reasonEn: rules.modifiers[id].en, evidenceIds });

  let score = 0;
  let excludedReason: ExclusionId | undefined;

  if (exclusions.length > 0) {
    // Personal attribution is 0; the interaction itself is still recorded elsewhere (Trace / ChainSnapshot).
    for (const id of new Set(exclusions)) {
      breakdown.push({ ruleId: id, kind: 'exclusion', delta: 0, reasonPl: rules.exclusions[id].pl, reasonEn: rules.exclusions[id].en, evidenceIds: allEvidence });
    }
    excludedReason = exclusions[0];
  } else {
    if (traces.length === 0) throw new RangeError('scoreLink: at least one trace is required unless the address is excluded');

    // Primary trace = strongest one (base + its identity modifiers); ties keep input order.
    const identityOf = (t: ScoringTrace) => [...new Set(t.identity ?? [])];
    const strength = (t: ScoringTrace) => rules.base[t.sourceType].score + identityOf(t).reduce((s, id) => s + rules.modifiers[id].delta, 0);
    const primary = traces.reduce((best, t) => (strength(t) > strength(best) ? t : best));

    const b = rules.base[primary.sourceType];
    breakdown.push({ ruleId: baseRuleId(primary.sourceType), kind: 'base', delta: b.score, reasonPl: b.pl, reasonEn: b.en, evidenceIds: [primary.evidenceId] });
    for (const id of identityOf(primary)) mod(id, 'identity', [primary.evidenceId]);

    // One evidence per distinct origin (the first seen) — repeats inside one service add nothing.
    const perOrigin = new Map<string, string>();
    for (const t of traces) if (!perOrigin.has(t.originKey)) perOrigin.set(t.originKey, t.evidenceId);
    if (perOrigin.size >= 2) mod('SYNERGY_INDEPENDENT_SOURCES', 'synergy', [...perOrigin.values()]);

    if (input.chain) {
      if (!input.chain.everUsed) mod('CHAIN_NEVER_USED', 'chain', []);
      else if (input.chain.activeNearTrace) mod('CHAIN_ACTIVE_CONSISTENT', 'chain', []);
    }

    const dated = traces.filter((t) => t.observedAt).map((t) => ({ id: t.evidenceId, at: parseDate(t.observedAt!, 'observedAt') }));
    if (dated.length > 0) {
      const newest = dated.reduce((a, d) => (Date.parse(d.at) > Date.parse(a) ? d.at : a), dated[0]!.at);
      if (olderThanThreeYears(newest, asOf)) mod('TRACE_OLDER_THAN_3Y', 'recency', dated.filter((d) => d.at === newest).map((d) => d.id));
    }

    if ((input.unrelatedIdentities ?? 0) >= 3) mod('ADDRESS_MULTI_IDENTITY', 'conflict', allEvidence);

    const raw = breakdown.reduce((s, e) => s + e.delta, 0);
    score = Math.min(rules.clamp.max, Math.max(rules.clamp.min, raw));
    if (score !== raw) {
      breakdown.push({
        ruleId: 'CLAMP',
        kind: 'clamp',
        delta: score - raw,
        reasonPl: `Wynik ograniczony do zakresu ${rules.clamp.min}–${rules.clamp.max}`,
        reasonEn: `Score limited to the range ${rules.clamp.min}–${rules.clamp.max}`,
        evidenceIds: [],
      });
    }
  }

  const excluded = excludedReason !== undefined;
  const band = bandFor(rules, score, excluded);
  const applied = new Set(breakdown.map((e) => e.ruleId));
  const hints = rules.hints.filter((h) => evalCondition(h.condition, band.id, applied)).map((h) => h.text);

  return { score, band: band.id, bandLabel: { pl: band.pl, en: band.en }, rulesVersion: rules.version, excluded, excludedReason, breakdown, hints };
}
