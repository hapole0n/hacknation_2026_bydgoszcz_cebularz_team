import { describe, expect, it } from 'vitest';
import {
  EXCLUSION_IDS,
  RulesError,
  classifyContext,
  extractAddresses,
  parseRules,
  scoreLink,
  sourceTypeFor,
  type ScoreResult,
  type ScoringInput,
  type ScoringTrace,
} from '../src/index.js';
import { RULES_YAML, synthTron } from './helpers.js';

const rules = parseRules(RULES_YAML);
const asOf = '2026-11-21T12:00:00Z';
const score = (input: Omit<ScoringInput, 'asOf'>) => scoreLink(rules, { asOf, ...input });
const trace = (evidenceId: string, originKey: string, sourceType: ScoringTrace['sourceType'], extra: Partial<ScoringTrace> = {}): ScoringTrace => ({
  evidenceId,
  originKey,
  sourceType,
  ...extra,
});
const deltas = (r: ScoreResult) => r.breakdown.map((e) => [e.ruleId, e.delta]);
const EXACT = ['IDENT_EXACT_SAME_PLATFORM'] as const;

describe('parseRules', () => {
  it('loads config/scoring-rules.v1.yaml', () => {
    expect(rules.version).toBe('1.0.0');
    expect(Object.keys(rules.base)).toHaveLength(8);
    expect(Object.keys(rules.modifiers)).toHaveLength(10);
    expect(Object.keys(rules.exclusions)).toHaveLength(6);
    expect(rules.hints).toHaveLength(2);
    expect(rules.base.OFFICIAL_PROFILE.score).toBe(85);
    expect(rules.modifiers.SYNERGY_INDEPENDENT_SOURCES.delta).toBe(15);
  });

  const broken = (from: string | RegExp, to: string) => () => parseRules(RULES_YAML.replace(from, to));

  it('fails loudly on a missing / unknown / duplicate rule id', () => {
    expect(broken(/  - \{ id: CHAIN_NEVER_USED.*\n/, '')).toThrow(/missing rule "CHAIN_NEVER_USED"/);
    expect(broken('id: CHAIN_NEVER_USED', 'id: CHAIN_NEVER_USD')).toThrow(/unknown rule id "CHAIN_NEVER_USD"/);
    expect(broken('id: CHAIN_NEVER_USED', 'id: CHAIN_ACTIVE_CONSISTENT')).toThrow(/duplicate rule id/);
    expect(broken('  GIVEAWAY:', '  GIVEAWAYS:')).toThrow(RulesError);
    expect(broken('id: EXCL_MIXER', 'id: EXCL_MIXR')).toThrow(/unknown rule id/);
  });

  it('fails on bad numbers, bands and clamp', () => {
    expect(broken('delta: 15,', 'delta: "15",')).toThrow(/expected a number/);
    expect(broken('id: EXCLUDED', 'id: NOPE')).toThrow(/missing band "EXCLUDED"/);
    expect(broken('clamp: { min: 0, max: 100 }', 'clamp: { min: 100, max: 0 }')).toThrow(/clamp/);
    expect(broken('version: "1.0.0"', 'version: ""')).toThrow(/version/);
  });

  it('validates hint conditions at load time', () => {
    expect(broken('band == MEDIUM &&', 'band == NOPE &&')).toThrow(/unknown band "NOPE"/);
    expect(broken('!SYNERGY_INDEPENDENT_SOURCES', '!SYNERGY_INDEPENDENT_SOURCE')).toThrow(/unknown rule/);
    expect(broken('"band == MEDIUM && !SYNERGY_INDEPENDENT_SOURCES"', '"band == MEDIUM &&"')).toThrow(RulesError);
    expect(broken('"IDENT_NAME_ONLY"', '"(IDENT_NAME_ONLY"')).toThrow(RulesError);
    expect(broken('"IDENT_NAME_ONLY"', '"IDENT_NAME_ONLY IDENT_NAME_ONLY"')).toThrow(/unexpected/);
  });

  it('supports ||, ! and parentheses in hint conditions', () => {
    const custom = parseRules(RULES_YAML.replace('"IDENT_NAME_ONLY"', '"(IDENT_NAME_ONLY || band == VERY_HIGH) && !CHAIN_NEVER_USED"'));
    const nameOnly = scoreLink(custom, { asOf, traces: [trace('e1', 'x.pl', 'FORUM_DISCUSSION', { identity: ['IDENT_NAME_ONLY'] })] });
    expect(nameOnly.hints.map((h) => h.pl)).toContain('Potwierdzenie nickiem lub e-mailem usunęłoby karę −20 pp');
    const neverUsed = scoreLink(custom, { asOf, chain: { everUsed: false }, traces: [trace('e1', 'x.pl', 'FORUM_DISCUSSION', { identity: ['IDENT_NAME_ONLY'] })] });
    expect(neverUsed.hints).toEqual([]);
  });
});

describe('Confidence Score — synthetic persona "Jan Testowy" (PLAN §5)', () => {
  it('own personal site with the address, exact handle → 95, very high', () => {
    const r = score({ traces: [trace('ev-site', 'jtestowy.example.org', 'OFFICIAL_PROFILE', { identity: [...EXACT] })] });
    expect(r).toMatchObject({ score: 95, band: 'VERY_HIGH', excluded: false, rulesVersion: '1.0.0' });
    expect(r.bandLabel.pl).toBe('Bardzo wysokie prawdopodobieństwo');
    expect(deltas(r)).toEqual([
      ['BASE_OFFICIAL_PROFILE', 85],
      ['IDENT_EXACT_SAME_PLATFORM', 10],
    ]);
    expect(r.breakdown.every((e) => e.evidenceIds.includes('ev-site'))).toBe(true);
    expect(r.hints).toEqual([]);
  });

  it('same address on site + GitHub README + e-mail footer → synergy, clamped to 100', () => {
    const r = score({
      traces: [
        trace('ev-site', 'jtestowy.example.org', 'OFFICIAL_PROFILE', { identity: [...EXACT] }),
        trace('ev-gh', 'github.com', 'OFFICIAL_PROFILE', { identity: [...EXACT] }),
        trace('ev-mail', 'mail.example.org', 'EMAIL_FOOTER', { identity: ['IDENT_EMAIL_EXACT'] }),
      ],
    });
    expect(r.score).toBe(100);
    expect(deltas(r)).toEqual([
      ['BASE_OFFICIAL_PROFILE', 85],
      ['IDENT_EXACT_SAME_PLATFORM', 10],
      ['SYNERGY_INDEPENDENT_SOURCES', 15],
      ['CLAMP', -10],
    ]);
    expect(r.breakdown.find((e) => e.ruleId === 'SYNERGY_INDEPENDENT_SOURCES')!.evidenceIds).toEqual(['ev-site', 'ev-gh', 'ev-mail']);
  });

  it('repeats inside one service are not independent sources', () => {
    const r = score({
      traces: [
        trace('ev-1', 'forum.example.pl', 'FORUM_DISCUSSION'),
        trace('ev-2', 'forum.example.pl', 'FORUM_DISCUSSION'),
        trace('ev-3', 'forum.example.pl', 'FORUM_DISCUSSION'),
      ],
    });
    expect(r.breakdown.map((e) => e.ruleId)).not.toContain('SYNERGY_INDEPENDENT_SOURCES');
    expect(r.score).toBe(50);
  });

  it('P2P ad "Sprzedam USDT za gotówkę" with the exact Telegram handle → 80, very high', () => {
    const r = score({ traces: [trace('ev-p2p', 'p2p.example', 'P2P_OFFER', { identity: [...EXACT] })] });
    expect(r).toMatchObject({ score: 80, band: 'VERY_HIGH' });
  });

  it('forum post alone → 50, medium, hint asks for a second independent source', () => {
    const r = score({ traces: [trace('ev-forum', 'forum.example.pl', 'FORUM_DISCUSSION')] });
    expect(r).toMatchObject({ score: 50, band: 'MEDIUM' });
    expect(r.hints.map((h) => h.pl)).toEqual(['Drugie niezależne źródło podniosłoby wynik o 15 pp']);
    expect(r.hints.map((h) => h.en)).toEqual(['A second independent source would add 15 pp']);
  });

  it('forum post confirmed by a second independent forum → 65, probable, no hint', () => {
    const r = score({ traces: [trace('ev-1', 'forum.example.pl', 'FORUM_DISCUSSION'), trace('ev-2', 'other-forum.example', 'FORUM_DISCUSSION')] });
    expect(r).toMatchObject({ score: 65, band: 'PROBABLE', hints: [] });
  });

  it('giveaway spam → 25, low / noise', () => {
    expect(score({ traces: [trace('ev-gw', 'social.example', 'GIVEAWAY')] })).toMatchObject({ score: 25, band: 'LOW' });
    expect(score({ traces: [trace('ev-mc', 'social.example', 'MASS_COMMENT')] })).toMatchObject({ score: 25, band: 'LOW' });
  });

  it('old snapshot of the personal site (address A0) → recency penalty', () => {
    const r = score({ traces: [trace('ev-old', 'jtestowy.example.org', 'OFFICIAL_PROFILE', { identity: [...EXACT], observedAt: '2021-03-01T00:00:00Z' })] });
    expect(r.score).toBe(90);
    expect(deltas(r)).toContainEqual(['TRACE_OLDER_THAN_3Y', -5]);
  });

  it('the 3-year limit is exclusive and uses the newest trace', () => {
    const at = (observedAt: string) => score({ traces: [trace('e', 'a.pl', 'OFFICIAL_PROFILE', { observedAt })] }).score;
    expect(at('2023-11-21T12:00:00Z')).toBe(85); // exactly 3 years → not older
    expect(at('2023-11-20T12:00:00Z')).toBe(80);
    const mixed = score({ traces: [trace('old', 'a.pl', 'OFFICIAL_PROFILE', { observedAt: '2019-01-01' }), trace('new', 'b.pl', 'OFFICIAL_PROFILE', { observedAt: '2026-01-01' })] });
    expect(mixed.breakdown.map((e) => e.ruleId)).not.toContain('TRACE_OLDER_THAN_3Y');
  });

  it('persona B (same nick, other platform, address copied by several identities) → low', () => {
    const r = score({
      unrelatedIdentities: 3,
      traces: [trace('ev-b', 'other-forum.example', 'FORUM_DISCUSSION', { identity: ['IDENT_NICK_OTHER_PLATFORM'] })],
    });
    expect(r).toMatchObject({ score: 20, band: 'LOW' });
    expect(deltas(r)).toEqual([
      ['BASE_FORUM_DISCUSSION', 50],
      ['IDENT_NICK_OTHER_PLATFORM', -10],
      ['ADDRESS_MULTI_IDENTITY', -20],
    ]);
    expect(score({ unrelatedIdentities: 2, traces: [trace('e', 'x.pl', 'FORUM_DISCUSSION')] }).score).toBe(50); // needs ≥ 3
  });

  it('name-only link → 30, with the "confirm by nick or e-mail" hint', () => {
    const r = score({ traces: [trace('e', 'forum.example.pl', 'FORUM_DISCUSSION', { identity: ['IDENT_NAME_ONLY'] })] });
    expect(r).toMatchObject({ score: 30, band: 'LOW' });
    expect(r.hints.map((h) => h.pl)).toEqual(['Potwierdzenie nickiem lub e-mailem usunęłoby karę −20 pp']);
  });

  it('a nick variant costs 5, an exact e-mail adds 10; modifiers are applied once', () => {
    const variant = score({ traces: [trace('e', 'a.pl', 'SALE_AD', { identity: ['IDENT_NICK_VARIANT'] })] });
    expect(variant.score).toBe(65);
    const email = score({ traces: [trace('e', 'a.pl', 'EMAIL_FOOTER', { identity: ['IDENT_EMAIL_EXACT', 'IDENT_EMAIL_EXACT'] })] });
    expect(email.score).toBe(80);
  });
});

describe('Confidence Score — on-chain consistency', () => {
  const sale = [trace('e', 'a.pl', 'SALE_AD')];

  it('never used on-chain → −10', () => {
    expect(score({ traces: sale, chain: { everUsed: false } })).toMatchObject({ score: 60, band: 'PROBABLE' });
  });

  it('active around the trace date → +5; used but not near the trace → no change', () => {
    expect(score({ traces: sale, chain: { everUsed: true, activeNearTrace: true } }).score).toBe(75);
    expect(score({ traces: sale, chain: { everUsed: true, activeNearTrace: false } }).score).toBe(70);
  });

  it('no chain data yet → no on-chain rule', () => {
    expect(score({ traces: sale }).score).toBe(70);
  });
});

describe('Confidence Score — exclusions (false positives → 0)', () => {
  it.each(EXCLUSION_IDS)('%s → 0, band EXCLUDED, reason recorded', (id) => {
    const r = score({ exclusions: [id], traces: [trace('ev-1', 'forum.example.pl', 'P2P_OFFER', { identity: [...EXACT] })] });
    expect(r).toMatchObject({ score: 0, band: 'EXCLUDED', excluded: true, excludedReason: id });
    expect(r.breakdown).toEqual([
      { ruleId: id, kind: 'exclusion', delta: 0, reasonPl: rules.exclusions[id].pl, reasonEn: rules.exclusions[id].en, evidenceIds: ['ev-1'] },
    ]);
    expect(r.bandLabel.pl).toBe('Wykluczone (fałszywe trafienie)');
  });

  it('a strong source cannot override an exclusion; several exclusions are all listed', () => {
    const r = score({
      exclusions: ['EXCL_CEX', 'EXCL_CONTRACT'],
      traces: [trace('e1', 'a.pl', 'OFFICIAL_PROFILE', { identity: [...EXACT] }), trace('e2', 'b.pl', 'OFFICIAL_PROFILE')],
    });
    expect(r.score).toBe(0);
    expect(r.excludedReason).toBe('EXCL_CEX');
    expect(r.breakdown.map((e) => e.ruleId)).toEqual(['EXCL_CEX', 'EXCL_CONTRACT']);
  });

  it('an excluded address needs no trace', () => {
    expect(score({ exclusions: ['EXCL_EXAMPLE'], traces: [] })).toMatchObject({ score: 0, excluded: true });
  });
});

describe('Confidence Score — engine properties', () => {
  it('clamps to 0 without becoming "excluded"', () => {
    const r = score({ chain: { everUsed: false }, traces: [trace('e', 'a.pl', 'GIVEAWAY', { identity: ['IDENT_NAME_ONLY'] })] });
    expect(r).toMatchObject({ score: 0, excluded: false, band: 'LOW' }); // 25 − 20 − 10 = −5 → 0
    expect(deltas(r).at(-1)).toEqual(['CLAMP', 5]);
  });

  it('scores 1–9 (a gap in the published scale) fall into the lowest live band', () => {
    const r = score({ chain: { everUsed: false }, traces: [trace('e', 'a.pl', 'GIVEAWAY', { identity: ['IDENT_NICK_OTHER_PLATFORM'] })] });
    expect(r).toMatchObject({ score: 5, band: 'LOW', excluded: false });
  });

  it('every non-excluded breakdown sums to the score', () => {
    const cases: Omit<ScoringInput, 'asOf'>[] = [
      { traces: [trace('a', 'x', 'OFFICIAL_PROFILE', { identity: [...EXACT] }), trace('b', 'y', 'SALE_AD')] },
      { traces: [trace('a', 'x', 'GIVEAWAY', { identity: ['IDENT_NAME_ONLY'] })], chain: { everUsed: false } },
      { traces: [trace('a', 'x', 'FORUM_DISCUSSION', { observedAt: '2020-01-01' })], unrelatedIdentities: 5 },
      { traces: [trace('a', 'x', 'P2P_OFFER'), trace('b', 'y', 'MESSENGER_SETTLEMENT')], chain: { everUsed: true, activeNearTrace: true } },
    ];
    for (const c of cases) {
      const r = score(c);
      expect(r.breakdown.reduce((s, e) => s + e.delta, 0)).toBe(r.score);
      expect(r.score).toBeGreaterThanOrEqual(0);
      expect(r.score).toBeLessThanOrEqual(100);
      expect(r.breakdown.every((e) => e.reasonPl && e.reasonEn)).toBe(true);
    }
  });

  it('uses the strongest trace as the base (ties keep input order) and is deterministic', () => {
    const traces = [trace('weak', 'a.pl', 'GIVEAWAY'), trace('strong', 'b.pl', 'P2P_OFFER'), trace('tie', 'c.pl', 'SALE_AD')];
    const r = score({ traces });
    expect(r.breakdown[0]).toMatchObject({ ruleId: 'BASE_P2P_OFFER', evidenceIds: ['strong'] });
    expect(score({ traces })).toEqual(r);
    // identity bonus can make a weaker tier the strongest trace
    const r2 = score({ traces: [trace('a', 'a.pl', 'SALE_AD', { identity: ['IDENT_NAME_ONLY'] }), trace('b', 'b.pl', 'FORUM_DISCUSSION', { identity: [...EXACT] })] });
    expect(r2.breakdown[0]).toMatchObject({ ruleId: 'BASE_FORUM_DISCUSSION' });
  });

  it('rejects bad input at the boundary', () => {
    expect(() => score({ traces: [] })).toThrow(/at least one trace/);
    expect(() => scoreLink(rules, { asOf: 'yesterday', traces: [trace('e', 'a', 'SALE_AD')] })).toThrow(RangeError);
    expect(() => score({ traces: [trace('e', 'a', 'SALE_AD', { observedAt: 'soon' })] })).toThrow(RangeError);
  });
});

describe('pipeline: extract → classify → score', () => {
  it('P2P ad of the synthetic persona ends at 80', () => {
    const T1 = synthTron('T1');
    const ad = `Sprzedam USDT za gotówkę, Lublin, odbiór osobisty. Kontakt Telegram @jtestowy_pl. Adres TRC20: ${T1}`;
    const [found] = extractAddresses(ad).addresses;
    expect(found).toMatchObject({ chain: 'TRON', address: T1 });
    const cls = classifyContext(found!.context);
    expect(cls.contextType).toBe('P2P');
    const sourceType = sourceTypeFor(cls.contextType, 'PUBLIC');
    expect(sourceType).toBe('P2P_OFFER');
    expect(score({ traces: [trace('ev-ad', 'p2p.example', sourceType, { identity: [...EXACT] })] }).score).toBe(80);
  });
});
