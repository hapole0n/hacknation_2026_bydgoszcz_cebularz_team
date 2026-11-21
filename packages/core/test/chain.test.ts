import { describe, expect, it } from 'vitest';
import {
  SERVICE_MIN_COUNTERPARTIES,
  activeNearTrace,
  analyseHistory,
  detectCexDeposit,
  looksLikeService,
  previousRate,
  tronAddressFromHex,
  valueTransfer,
  warsawDate,
  type AddressCategory,
  type ChainTransfer,
  type CounterpartyInfo,
  type FxRates,
} from '../src/index.js';
import { synthEth, synthTron } from './helpers.js';

// 1 USD = 1 EUR = 4 PLN keeps the arithmetic of the thresholds obvious.
const fx: FxRates = { usdPln: 4, eurPln: 4, usdDate: '2026-01-01', eurDate: '2026-01-01' };
const tr = (tx: string, time: string, from: string, to: string, asset: string, amount: number, extra: Partial<ChainTransfer> = {}): ChainTransfer => ({ tx, time, from, to, asset, amount, ...extra });
const valued = (ts: ChainTransfer[]) => ts.map((t) => valueTransfer(t, fx));
const cats = (m: Record<string, CounterpartyInfo>) => (a: string): CounterpartyInfo => m[a.toLowerCase()] ?? m[a] ?? {};

const S = synthEth('subject');
const ROUTER = synthEth('router');
const DEPOSIT = synthEth('deposit');
const HOT = synthEth('hot');
const EXCH = { [ROUTER.toLowerCase()]: { category: 'DEX', name: 'Uniswap V2: Router 02' } as CounterpartyInfo, [DEPOSIT.toLowerCase()]: { category: 'CEX_DEPOSIT' } as CounterpartyInfo };

describe('valuation', () => {
  it('values stablecoins 1:1 and other assets only when the transfer carries a price', () => {
    expect(valueTransfer(tr('a', '2026-01-01T00:00:00Z', 'x', 'y', 'USDT', 100), fx)).toMatchObject({ valueUsd: 100, valuePln: 400, valueEur: 100 });
    expect(valueTransfer(tr('a', '2026-01-01T00:00:00Z', 'x', 'y', 'ETH', 2, { usdPrice: 2000 }), fx)).toMatchObject({ valueUsd: 4000, valuePln: 16000, valueEur: 4000 });
    expect(valueTransfer(tr('a', '2026-01-01T00:00:00Z', 'x', 'y', 'ETH', 2), fx)).toMatchObject({ valueUsd: null, valuePln: null, valueEur: null });
    expect(valueTransfer(tr('a', '2026-01-01T00:00:00Z', 'x', 'y', 'USDT', 100))).toMatchObject({ valueUsd: 100, valuePln: null }); // no rate known
  });

  it('uses the Polish calendar day and the last rate strictly before it (art. 11a PIT)', () => {
    expect(warsawDate('2026-11-04T23:30:00Z')).toBe('2026-11-05'); // CET
    expect(warsawDate('2026-06-30T22:30:00Z')).toBe('2026-07-01'); // CEST
    const rates = [{ date: '2026-11-06', mid: 1 }, { date: '2026-11-09', mid: 2 }, { date: '2026-11-10', mid: 3 }, { date: '2026-11-12', mid: 4 }];
    expect(previousRate(rates, '2026-11-12')?.date).toBe('2026-11-10'); // a rate is not used on its own day
    expect(previousRate(rates, '2026-11-11')?.date).toBe('2026-11-10'); // holiday
    expect(previousRate(rates, '2026-11-09')?.date).toBe('2026-11-06'); // Monday → Friday
    expect(previousRate(rates, '2026-11-06')).toBeUndefined();
  });

  it('converts TronGrid hex addresses', () => {
    const t = synthTron('x');
    expect(tronAddressFromHex('41' + '00'.repeat(20))).toBe('T9yD14Nj9j7xAB4dbGeiX9h8unkKHxuWwb'); // the TRON zero address
    expect(t).toMatch(/^T/);
  });
});

describe('detectCexDeposit', () => {
  const cat = (a: string): AddressCategory | undefined => (a === HOT ? 'CEX_CUSTODIAL' : undefined);

  it('recognises an address that only sweeps what it receives to an exchange wallet', () => {
    const h = [tr('1', '2026-10-01T10:00:00Z', S, DEPOSIT, 'USDT', 1000), tr('2', '2026-10-01T11:00:00Z', DEPOSIT, HOT, 'USDT', 999)];
    expect(detectCexDeposit(DEPOSIT, h, cat)).toEqual({ isDeposit: true, sweepsTo: [HOT.toLowerCase()] });
  });

  it.each([
    ['nothing received', [tr('2', '2026-10-01T11:00:00Z', DEPOSIT, HOT, 'USDT', 5)]],
    ['nothing forwarded', [tr('1', '2026-10-01T10:00:00Z', S, DEPOSIT, 'USDT', 5)]],
    ['one outflow to an unknown wallet', [tr('1', '2026-10-01T10:00:00Z', S, DEPOSIT, 'USDT', 1000), tr('2', '2026-10-01T11:00:00Z', DEPOSIT, HOT, 'USDT', 500), tr('3', '2026-10-01T12:00:00Z', DEPOSIT, S, 'USDT', 499)]],
    ['keeps most of the funds', [tr('1', '2026-10-01T10:00:00Z', S, DEPOSIT, 'USDT', 1000), tr('2', '2026-10-01T11:00:00Z', DEPOSIT, HOT, 'USDT', 100)]],
  ])('is not a deposit address: %s', (_n, h) => {
    expect(detectCexDeposit(DEPOSIT, h, cat).isDeposit).toBe(false);
  });
});

describe('looksLikeService / activeNearTrace', () => {
  it('flags a crowd of one-off counterparties, not a personal wallet', () => {
    const crowd = Array.from({ length: SERVICE_MIN_COUNTERPARTIES }, (_, i) => tr(`t${i}`, '2026-10-01T10:00:00Z', synthEth(`p${i}`), S, 'ETH', 1));
    expect(looksLikeService(S, crowd)).toBe(true);
    expect(looksLikeService(S, crowd.slice(0, 30))).toBe(false);
    const same = Array.from({ length: 300 }, (_, i) => tr(`u${i}`, '2026-10-01T10:00:00Z', synthEth('p1'), S, 'ETH', 1)); // many transfers, one counterparty
    expect(looksLikeService(S, same)).toBe(false);
  });

  it('is true when any transaction is within ±90 days of a trace', () => {
    expect(activeNearTrace(['2026-10-01T00:00:00Z'], ['2026-12-20'])).toBe(true);
    expect(activeNearTrace(['2026-10-01T00:00:00Z'], ['2027-01-15'])).toBe(false);
    expect(activeNearTrace([], ['2026-10-01'])).toBe(false);
    expect(activeNearTrace(['2026-10-01T00:00:00Z'], ['2027-01-15'], 200)).toBe(true);
  });
});

describe('analyseHistory — ETH → DEX swap → USDT → exchange deposit (persona A1 pattern)', () => {
  const history = valued([
    tr('0xa', '2026-09-20T09:00:00Z', synthEth('donor'), S, 'ETH', 3, { usdPrice: 2000 }),
    tr('0xb', '2026-10-12T10:00:00Z', S, ROUTER, 'ETH', 6, { usdPrice: 2000 }),
    tr('0xb', '2026-10-12T10:00:00Z', ROUTER, S, 'USDT', 11900),
    tr('0xc', '2026-10-14T08:00:00Z', S, DEPOSIT, 'USDT', 5900),
    tr('0xd', '2026-10-20T08:00:00Z', S, DEPOSIT, 'USDT', 5900),
  ]);
  const { indicators: ind, flows } = analyseHistory({ chain: 'ETH', address: S, transfers: history, categoryOf: cats(EXCH) });

  it('summarises volume, activity and assets', () => {
    expect(ind).toMatchObject({ txCount: 4, firstActivity: '2026-09-20T09:00:00Z', lastActivity: '2026-10-20T08:00:00Z' });
    expect(ind.byAsset).toEqual({ ETH: { in: 3, out: 6 }, USDT: { in: 11900, out: 11800 } });
    expect(ind.totals).toMatchObject({ inPln: (6000 + 11900) * 4, outPln: (12000 + 11800) * 4, unvalued: 0 });
    expect(ind.stablecoin).toEqual({ inUsd: 11900, outUsd: 11800 });
    expect(ind.counterparties).toEqual({ total: 3, known: 2 });
  });

  it('detects the DEX swap into a stablecoin and the interactions', () => {
    expect(ind.swaps).toEqual([{ tx: '0xb', time: '2026-10-12T10:00:00Z', via: 'Uniswap V2: Router 02', sold: { ETH: 6 }, bought: { USDT: 11900 }, valuePln: 48000 }]);
    expect(ind.interactions.DEX?.count).toBe(2);
    expect(ind.interactions.CEX_DEPOSIT).toMatchObject({ count: 2, outPln: 11800 * 4, addresses: [DEPOSIT] });
    expect(ind.tags).toEqual(expect.arrayContaining(['SWAP_DEX', 'STABLECOIN_CONVERSION', 'TO_CEX_DEPOSIT']));
  });

  it('treats outflows to the deposit address as cash-out and finds when each threshold was crossed', () => {
    expect(ind.cashOut).toMatchObject({ detected: true, totalEur: 11800, firstAt: '2026-10-14T08:00:00Z', lastAt: '2026-10-20T08:00:00Z', patterns: ['TO_CEX_DEPOSIT'] });
    expect(ind.cashOut.endpoints).toEqual([{ address: DEPOSIT, kind: 'CEX_DEPOSIT', name: undefined, count: 2, totalPln: 11800 * 4, totalEur: 11800 }]);
    const by = Object.fromEntries(ind.thresholds.map((t) => [t.eur, t]));
    expect(by[1000]).toMatchObject({ singleCrossedAt: '2026-09-20T09:00:00Z', cumulativeCrossedAt: '2026-10-14T08:00:00Z' });
    expect(by[10000]).toMatchObject({ singleCrossedAt: '2026-10-12T10:00:00Z', cumulativeCrossedAt: '2026-10-20T08:00:00Z' });
    expect(by[15000]).toMatchObject({ singleCrossedAt: null, cumulativeCrossedAt: null, maxSingleEur: 12000 });
    expect(ind.note.pl).toMatch(/nie kwalifikacja prawna/);
  });

  it('builds the chronology: ordered, with counterparties, values and tags', () => {
    expect(flows.map((f) => [f.time.slice(0, 10), f.direction, f.asset, f.amount])).toEqual([
      ['2026-09-20', 'in', 'ETH', 3],
      ['2026-10-12', 'out', 'ETH', 6],
      ['2026-10-12', 'in', 'USDT', 11900],
      ['2026-10-14', 'out', 'USDT', 5900],
      ['2026-10-20', 'out', 'USDT', 5900],
    ]);
    expect(flows[1]).toMatchObject({ counterparty: { address: ROUTER, category: 'DEX' }, valuePln: 48000, tags: ['OVER_1000_EUR', 'OVER_10000_EUR', 'SWAP_DEX'] });
    expect(flows[2]!.tags).toEqual(['OVER_1000_EUR', 'OVER_10000_EUR', 'STABLECOIN_CONVERSION', 'SWAP_DEX']);
  });
});

describe('analyseHistory — many small USDT in, then to a kantor (persona T1 pattern)', () => {
  const KANTOR = synthTron('kantor');
  const AD = synthTron('ad-address');
  const T = synthTron('subject');
  const small = Array.from({ length: 20 }, (_, i) => tr(`in${i}`, `2026-10-${String(10 + i).padStart(2, '0')}T12:00:00Z`, synthTron(`s${i}`), T, 'USDT', 300));
  const cash = [tr('o1', '2026-11-04T10:00:00Z', T, KANTOR, 'USDT', 5000), tr('o2', '2026-11-05T10:00:00Z', T, KANTOR, 'USDT', 6000), tr('o3', '2026-11-07T10:00:00Z', T, AD, 'USDT', 6500)];
  const run = (adAddresses?: Set<string>) =>
    analyseHistory({ chain: 'TRON', address: T, transfers: valued([...cash, ...small]), adAddresses, categoryOf: cats({ [KANTOR]: { category: 'CASP_KANTOR', name: 'Kantor' } }) }).indicators;

  it('flags USDT → cash to a labelled kantor and to an address published in an ad', () => {
    const ind = run(new Set([AD, T]));
    expect(ind.cashOut.patterns).toEqual(['TO_AD_ADDRESS', 'TO_KANTOR', 'USDT_TO_CASH']);
    expect(ind.cashOut.endpoints.map((e) => [e.kind, e.count, e.totalEur])).toEqual([['CASP_KANTOR', 2, 11000], ['AD_ADDRESS', 1, 6500]]);
    expect(ind.interactions.CASP_KANTOR).toMatchObject({ count: 2, outPln: 44000 });
    expect(ind.byAsset.USDT).toEqual({ in: 6000, out: 17500 });
  });

  it('without the ad address only the kantor counts; the subject\'s own ad address is ignored', () => {
    const ind = run(new Set([T]));
    expect(ind.cashOut.totalEur).toBe(11000);
    expect(ind.tags).not.toContain('TO_AD_ADDRESS');
  });

  it('crosses 1 000 / 10 000 / 15 000 EUR cumulatively on known dates', () => {
    const t = Object.fromEntries(run(new Set([AD])).thresholds.map((x) => [x.eur, x.cumulativeCrossedAt]));
    expect(t).toEqual({ 1000: '2026-11-04T10:00:00Z', 10000: '2026-11-05T10:00:00Z', 15000: '2026-11-07T10:00:00Z' });
  });
});

describe('analyseHistory — edge cases', () => {
  it('ignores failed transfers, self-transfers and unrelated legs; empty history is fine', () => {
    const ts = valued([tr('f', '2026-10-01T00:00:00Z', S, HOT, 'USDT', 9999, { failed: true }), tr('s', '2026-10-01T00:00:00Z', S, S, 'ETH', 1), tr('u', '2026-10-01T00:00:00Z', HOT, DEPOSIT, 'ETH', 1)]);
    expect(analyseHistory({ chain: 'ETH', address: S, transfers: ts, categoryOf: cats({}) }).indicators).toMatchObject({ txCount: 0, firstActivity: null, cashOut: { detected: false, patterns: [] } });
    expect(analyseHistory({ chain: 'BTC', address: S, transfers: [], categoryOf: cats({}) }).flows).toEqual([]);
  });

  it('counts transfers it cannot value and records mixer / sanctioned interactions', () => {
    const MIX = synthEth('mixer');
    const ts = valued([tr('1', '2026-10-01T00:00:00Z', S, MIX, 'ETH', 1), tr('2', '2026-10-02T00:00:00Z', MIX, S, 'USDT', 10)]);
    const { indicators, flows } = analyseHistory({ chain: 'ETH', address: S, transfers: ts, categoryOf: cats({ [MIX]: { category: 'MIXER' } }) });
    expect(indicators.totals.unvalued).toBe(1);
    expect(indicators.interactions.MIXER?.count).toBe(2);
    expect(flows.every((f) => f.tags.includes('MIXER'))).toBe(true);
    expect(indicators.cashOut.detected).toBe(false);
  });

  it('a swap needs a DEX and a different asset coming back', () => {
    const ts = valued([tr('x', '2026-10-01T00:00:00Z', S, ROUTER, 'ETH', 1, { usdPrice: 1 }), tr('x', '2026-10-01T00:00:00Z', ROUTER, S, 'ETH', 0.1, { usdPrice: 1 })]);
    expect(analyseHistory({ chain: 'ETH', address: S, transfers: ts, categoryOf: cats(EXCH) }).indicators.swaps).toEqual([]);
  });
});
