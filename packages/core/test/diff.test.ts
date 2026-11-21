import { describe, expect, it } from 'vitest';
import { NOTIFY_MIN_SCORE, diffRuns, notificationsFor, type BreakdownEntry, type DiffRunInput, type FlowEntry } from '../src/index.js';
import { synthEth } from './helpers.js';

const A1 = synthEth('a1');
const A2 = synthEth('a2');
const HOT = synthEth('hot');
const SITE = 'http://site.example/me';
const README = 'http://git.example/me';

const rule = (ruleId: string, delta: number, kind: BreakdownEntry['kind'] = 'base'): BreakdownEntry => ({ ruleId, kind, delta, reasonPl: `pl ${ruleId}`, reasonEn: `en ${ruleId}`, evidenceIds: [] });
const link = (address: string, score: number, breakdown: BreakdownEntry[], extra: { band?: string; category?: string; excluded?: boolean } = {}): DiffRunInput['links'][number] => ({
  identifier: { type: 'NICK', value: 'jtestowy' },
  address: { chain: 'ETH', address, category: extra.category ?? 'UNHOSTED' },
  score,
  band: extra.band ?? (extra.excluded ? 'EXCLUDED' : score >= 80 ? 'VERY_HIGH' : score >= 60 ? 'PROBABLE' : 'MEDIUM'),
  excludedReason: extra.excluded ? 'EXCL_CEX' : null,
  breakdownJson: breakdown,
});
const flow = (tx: string, time: string, tags: string[] = []): FlowEntry => ({ time, tx, direction: 'in', counterparty: { address: HOT }, asset: 'USDT', amount: 100, valuePln: 400, valueEur: 100, tags });
const thr = (eur: number, single: string | null = null, cumulative: string | null = null) => ({ eur, maxSingleEur: 0, singleCrossedAt: single, cumulativeCrossedAt: cumulative });
const chainOf = (address: string, flows: FlowEntry[], extra: { tags?: string[]; thresholds?: ReturnType<typeof thr>[]; detected?: boolean } = {}): DiffRunInput['chain'][number] => ({
  address: { chain: 'ETH', address, category: 'UNHOSTED' },
  indicators: { tags: extra.tags ?? [], thresholds: extra.thresholds ?? [thr(1000), thr(10000), thr(15000)], cashOut: { detected: extra.detected ?? false, patterns: [], totalPln: 0, totalEur: 0, firstAt: null, lastAt: null, endpoints: [] } },
  flows,
});
const run = (id: string, startedAt: string, parts: Partial<DiffRunInput> = {}): DiffRunInput => ({ id, startedAt, params: { connectors: ['sandbox'], chain: 'fixture' }, links: [], evidence: [], traces: [], chain: [], ...parts });
const page = (id: string, url: string, platform = 'site.example') => ({ id, url, metaJson: { platform, title: `title of ${id}` } });

const first = run('r1', '2026-11-21T10:00:00Z', {
  links: [link(A1, 100, [rule('BASE_OFFICIAL_PROFILE', 85), rule('IDENT_EXACT_SAME_PLATFORM', 10), rule('SYNERGY_INDEPENDENT_SOURCES', 15), rule('CLAMP', -10, 'clamp')])],
  evidence: [page('e1', SITE), page('e2', README, 'git.example')],
  traces: [
    { evidenceId: 'e1', chain: 'ETH', address: A1 },
    { evidenceId: 'e2', chain: 'ETH', address: A1 },
  ],
  chain: [chainOf(A1, [flow('t1', '2026-10-01T10:00:00Z')])],
});

describe('diffRuns', () => {
  it('two identical runs differ in nothing', () => {
    const d = diffRuns(first, { ...first, id: 'r2', startedAt: '2026-11-21T11:00:00Z' });
    expect(d.empty).toBe(true);
    expect(d).toMatchObject({ fromRunId: 'r1', toRunId: 'r2', counts: { addressesAdded: 0, scoreChanges: 0 }, params: { same: true } });
  });

  it('says when the runs searched different sources or chain modes', () => {
    const wider = { ...first, id: 'r2', params: { connectors: ['github', 'sandbox'], chain: 'fixture' } };
    expect(diffRuns(first, wider).params).toEqual({ from: first.params, to: wider.params, same: false });
    expect(diffRuns(first, { ...wider, params: { connectors: ['sandbox'], chain: 'live' } }).params.same).toBe(false);
  });

  it('an address swap on one source: new address, source change, new transactions and thresholds, new cash-out indicator', () => {
    const second = run('r2', '2026-11-21T11:00:00Z', {
      links: [
        link(A1, 100, [rule('BASE_OFFICIAL_PROFILE', 85), rule('IDENT_EXACT_SAME_PLATFORM', 10), rule('SYNERGY_INDEPENDENT_SOURCES', 15), rule('CLAMP', -10, 'clamp')]),
        link(A2, 82, [rule('BASE_OFFICIAL_PROFILE', 85), rule('IDENT_EXACT_SAME_PLATFORM', 10), rule('CHAIN_NEVER_USED', -13, 'chain')]),
      ],
      evidence: [page('f1', SITE), page('f2', README, 'git.example')],
      traces: [
        { evidenceId: 'f1', chain: 'ETH', address: A2 }, // the site now shows A2 …
        { evidenceId: 'f2', chain: 'ETH', address: A1 }, // … the README still shows A1
      ],
      chain: [
        chainOf(A1, [flow('t1', '2026-10-01T10:00:00Z')]),
        chainOf(A2, [flow('t9', '2026-11-20T09:00:00Z', ['OVER_1000_EUR']), flow('t10', '2026-11-20T10:00:00Z', ['TO_KANTOR', 'USDT_TO_CASH'])], {
          tags: ['OVER_1000_EUR', 'TO_KANTOR', 'USDT_TO_CASH'],
          thresholds: [thr(1000, '2026-11-20T09:00:00Z', '2026-11-20T10:00:00Z'), thr(10000), thr(15000)],
          detected: true,
        }),
      ],
    });
    const d = diffRuns(first, second);

    expect(d.addresses.added).toEqual([{ chain: 'ETH', address: A2, category: 'UNHOSTED', bestScore: 82, excluded: false }]);
    expect(d.addresses.removed).toEqual([]); // A1 is still on the README
    expect(d.sourceChanges).toEqual([{ url: SITE, platform: 'site.example', title: 'title of f1', kind: 'swap', from: [{ chain: 'ETH', address: A1 }], to: [{ chain: 'ETH', address: A2 }] }]);
    expect(d.newTransactions).toHaveLength(1);
    expect(d.newTransactions[0]).toMatchObject({ address: A2, isNewAddress: true, count: 2, firstAt: '2026-11-20T09:00:00Z', lastAt: '2026-11-20T10:00:00Z' });
    expect(d.newThresholds).toEqual([
      { chain: 'ETH', address: A2, thresholdEur: 1000, kind: 'cumulative', at: '2026-11-20T10:00:00Z' },
      { chain: 'ETH', address: A2, thresholdEur: 1000, kind: 'single', at: '2026-11-20T09:00:00Z' },
    ]);
    expect(d.newIndicators).toEqual([
      { chain: 'ETH', address: A2, tag: 'TO_KANTOR', cashOut: true },
      { chain: 'ETH', address: A2, tag: 'USDT_TO_CASH', cashOut: true },
    ]); // OVER_* tags are the thresholds' business
    expect(d.empty).toBe(false);

    expect(notificationsFor(d).map((n) => n.kind)).toEqual(['NEW_ADDRESS', 'ADDRESS_CHANGED', 'THRESHOLD_EXCEEDED', 'NEW_CASH_OUT']);
    expect(notificationsFor(d)[0]).toEqual({ kind: 'NEW_ADDRESS', params: { chain: 'ETH', address: A2, score: 82 } });
    expect(notificationsFor(d)[1]!.params).toMatchObject({ from: A1, to: A2, url: SITE });
  });

  it('a score change names the rules behind it; a vanished address and a category change are listed', () => {
    const before = run('r1', '2026-11-21T10:00:00Z', {
      links: [link(A1, 60, [rule('BASE_P2P_OFFER', 70), rule('CHAIN_NEVER_USED', -10, 'chain')], { category: 'UNHOSTED' }), link(A2, 50, [rule('BASE_FORUM_DISCUSSION', 50)])],
      traces: [
        { evidenceId: 'e1', chain: 'ETH', address: A1 },
        { evidenceId: 'e1', chain: 'ETH', address: A2 },
      ],
      evidence: [page('e1', SITE)],
    });
    const after = run('r2', '2026-11-21T11:00:00Z', {
      links: [link(A1, 85, [rule('BASE_P2P_OFFER', 70), rule('SYNERGY_INDEPENDENT_SOURCES', 15, 'synergy'), rule('CLAMP', 0, 'clamp')], { category: 'CASP_KANTOR' })],
      traces: [{ evidenceId: 'f1', chain: 'ETH', address: A1 }],
      evidence: [page('f1', SITE)],
    });
    const d = diffRuns(before, after);

    expect(d.scoreChanges).toHaveLength(1);
    expect(d.scoreChanges[0]).toMatchObject({ address: A1, fromScore: 60, toScore: 85, fromBand: 'PROBABLE', toBand: 'VERY_HIGH' });
    expect(d.scoreChanges[0]!.rules.map((r) => [r.ruleId, r.change, r.fromDelta, r.toDelta])).toEqual([
      ['SYNERGY_INDEPENDENT_SOURCES', 'added', null, 15],
      ['CHAIN_NEVER_USED', 'removed', -10, null],
    ]);
    expect(d.addresses.removed.map((a) => a.address)).toEqual([A2]);
    expect(d.categoryChanges).toEqual([{ chain: 'ETH', address: A1, from: 'UNHOSTED', to: 'CASP_KANTOR' }]);
    expect(d.sourceChanges).toEqual([{ url: SITE, platform: 'site.example', title: 'title of f1', kind: 'removed', from: [{ chain: 'ETH', address: A2 }], to: [] }]);
    expect(notificationsFor(d)).toEqual([]); // nothing new, nothing crossed
  });

  it('only transactions that were not in the previous snapshot are new; thresholds already crossed are not repeated', () => {
    const prev = run('r1', '2026-11-21T10:00:00Z', {
      traces: [{ evidenceId: 'e1', chain: 'ETH', address: A1 }],
      chain: [chainOf(A1, [flow('t1', '2026-10-01T10:00:00Z')], { thresholds: [thr(1000, '2026-10-01T10:00:00Z'), thr(10000), thr(15000)] })],
    });
    const next = run('r2', '2026-11-21T11:00:00Z', {
      traces: [{ evidenceId: 'e1', chain: 'ETH', address: A1 }],
      chain: [chainOf(A1, [flow('t1', '2026-10-01T10:00:00Z'), flow('t2', '2026-11-21T10:30:00Z')], { thresholds: [thr(1000, '2026-10-01T10:00:00Z'), thr(10000, '2026-11-21T10:30:00Z'), thr(15000)] })],
    });
    const d = diffRuns(prev, next);
    expect(d.newTransactions).toMatchObject([{ address: A1, isNewAddress: false, count: 1, firstAt: '2026-11-21T10:30:00Z' }]);
    expect(d.newThresholds).toEqual([{ chain: 'ETH', address: A1, thresholdEur: 10000, kind: 'single', at: '2026-11-21T10:30:00Z' }]);
  });
});

describe('notificationsFor', () => {
  const added = (score: number | null, excluded = false) =>
    diffRuns(run('r1', '2026-11-21T10:00:00Z'), run('r2', '2026-11-21T11:00:00Z', { traces: [{ evidenceId: 'e', chain: 'ETH', address: A2 }], links: score === null ? [] : [link(A2, score, [rule('BASE', score)], { excluded })] }));

  it('a new address rings the bell from 60 up, not below, not when excluded, not without a link', () => {
    expect(NOTIFY_MIN_SCORE).toBe(60);
    expect(notificationsFor(added(60))).toHaveLength(1);
    expect(notificationsFor(added(59))).toHaveLength(0);
    expect(notificationsFor(added(95, true))).toHaveLength(0); // an exchange wallet is not a suspect
    expect(notificationsFor(added(null))).toHaveLength(0);
  });
});
