import type { Chain } from '../chain.js';
import type { AddressCategory } from '../labels.js';
import { isStablecoin, normAddr, round2, sameAddress, type ValuedTransfer } from './model.js';

/** AML premises (PLAN §3.5, docs/research-notes.md): analytical, not a legal qualification. */
export const THRESHOLDS_EUR = [1000, 10000, 15000] as const;
export const THRESHOLD_NOTE = {
  pl: 'Progi 1 000 / 10 000 / 15 000 EUR to przesłanki analityczne (ustawa o AML, art. 35), a nie kwalifikacja prawna.',
  en: 'The 1,000 / 10,000 / 15,000 EUR thresholds are analytical premises (AML act, art. 35), not a legal qualification.',
};

/** Where crypto can leave the market: exchanges, deposit addresses, kantors, payment gateways, card issuers. */
export const CASH_OUT_CATEGORIES: readonly AddressCategory[] = ['CEX_CUSTODIAL', 'CEX_DEPOSIT', 'CASP_KANTOR', 'PAYMENT_GATEWAY', 'CRYPTO_CARD'];
const INTERACTION_CATEGORIES: readonly AddressCategory[] = [...CASH_OUT_CATEGORIES, 'MIXER', 'DEX', 'SANCTIONED'];
const MAX_FLOWS = 500;

export interface CounterpartyInfo {
  category?: AddressCategory;
  name?: string;
}

export interface FlowParty extends CounterpartyInfo {
  address: string;
}

/** One line of the chronology of funds. */
export interface FlowEntry {
  time: string;
  tx: string;
  direction: 'in' | 'out';
  counterparty: FlowParty;
  asset: string;
  amount: number;
  valuePln: number | null;
  valueEur: number | null;
  tags: string[];
}

export interface Swap {
  tx: string;
  time: string;
  via: string;
  sold: Record<string, number>;
  bought: Record<string, number>;
  valuePln: number | null;
}

export interface Interaction {
  count: number;
  inPln: number;
  outPln: number;
  addresses: string[];
}

export interface CashOutEndpoint {
  address: string;
  kind: AddressCategory | 'AD_ADDRESS';
  name?: string;
  count: number;
  totalPln: number;
  totalEur: number;
}

export interface ThresholdResult {
  eur: number;
  maxSingleEur: number;
  /** First single transfer worth ≥ threshold. */
  singleCrossedAt: string | null;
  /** First moment the cumulative cash-out reached the threshold. */
  cumulativeCrossedAt: string | null;
}

export interface Indicators {
  chain: Chain;
  address: string;
  txCount: number;
  firstActivity: string | null;
  lastActivity: string | null;
  totals: { inPln: number; outPln: number; inEur: number; outEur: number; /** transfers that could not be valued */ unvalued: number };
  byAsset: Record<string, { in: number; out: number }>;
  stablecoin: { inUsd: number; outUsd: number };
  counterparties: { total: number; known: number };
  interactions: Partial<Record<AddressCategory, Interaction>>;
  swaps: Swap[];
  cashOut: { detected: boolean; patterns: string[]; totalPln: number; totalEur: number; firstAt: string | null; lastAt: string | null; endpoints: CashOutEndpoint[] };
  thresholds: ThresholdResult[];
  /** Distinct flow tags present, e.g. SWAP_DEX, TO_KANTOR, USDT_TO_CASH. */
  tags: string[];
  note: typeof THRESHOLD_NOTE;
}

export interface AnalyseInput {
  chain: Chain;
  address: string;
  transfers: readonly ValuedTransfer[];
  /** Category (label, bytecode or heuristic) of any counterparty. */
  categoryOf: (address: string) => CounterpartyInfo;
  /** Addresses published in "sell USDT for cash" style ads found by OSINT (other than the subject's own). */
  adAddresses?: ReadonlySet<string>;
  thresholdsEur?: readonly number[];
}

const sum = (xs: readonly (number | null)[]) => round2(xs.reduce<number>((s, x) => s + (x ?? 0), 0));
const byTime = (a: { time: string; tx: string }, b: { time: string; tx: string }) => Date.parse(a.time) - Date.parse(b.time) || a.tx.localeCompare(b.tx);
const bump = (m: Record<string, number>, k: string, v: number) => void (m[k] = (m[k] ?? 0) + v);
/** Natural order, so OVER_1000_EUR comes before OVER_10000_EUR. */
const natural = (xs: Iterable<string>) => [...xs].sort((a, b) => a.localeCompare(b, 'en', { numeric: true }));

/**
 * Indicators of one address and the chronology of its flows (PLAN §3.5). Pure: valuation (NBP) and the
 * categories of counterparties (labels, deposit detection) are computed by the caller.
 */
export function analyseHistory(input: AnalyseInput): { indicators: Indicators; flows: FlowEntry[] } {
  const { address, chain } = input;
  const thresholds = input.thresholdsEur ?? THRESHOLDS_EUR;
  const ads = new Set([...(input.adAddresses ?? [])].map(normAddr));
  ads.delete(normAddr(address));

  // Only movements that involve the subject on exactly one side.
  const legs = input.transfers
    .filter((t) => !t.failed && sameAddress(t.from, address) !== sameAddress(t.to, address))
    .map((t) => {
      const direction: 'in' | 'out' = sameAddress(t.to, address) ? 'in' : 'out';
      const cpAddress = direction === 'in' ? t.from : t.to;
      return { t, direction, cp: { address: cpAddress, ...input.categoryOf(cpAddress) } as FlowParty, tags: new Set<string>() };
    })
    .sort((a, b) => byTime(a.t, b.t));

  // Swaps: in one transaction the subject gives an asset to / through a DEX and gets another one.
  const swaps: Swap[] = [];
  const byTx = new Map<string, typeof legs>();
  for (const l of legs) byTx.set(l.t.tx, [...(byTx.get(l.t.tx) ?? []), l]);
  for (const [tx, group] of byTx) {
    const outs = group.filter((l) => l.direction === 'out');
    const ins = group.filter((l) => l.direction === 'in');
    const dex = group.find((l) => l.cp.category === 'DEX');
    const gaveAssets = new Set(outs.map((l) => l.t.asset));
    if (!dex || outs.length === 0 || !ins.some((l) => !gaveAssets.has(l.t.asset))) continue;
    const sold: Record<string, number> = {};
    const bought: Record<string, number> = {};
    for (const l of outs) bump(sold, l.t.asset, l.t.amount);
    for (const l of ins) bump(bought, l.t.asset, l.t.amount);
    const valued = outs.every((l) => l.t.valuePln !== null);
    swaps.push({ tx, time: group[0]!.t.time, via: dex.cp.name ?? dex.cp.address, sold, bought, valuePln: valued ? sum(outs.map((l) => l.t.valuePln)) : null });
    for (const l of group) l.tags.add('SWAP_DEX');
    if (!Object.keys(sold).every(isStablecoin)) for (const l of ins) if (isStablecoin(l.t.asset)) l.tags.add('STABLECOIN_CONVERSION');
  }

  // Per-flow tags.
  const cashOutLegs: typeof legs = [];
  for (const l of legs) {
    const { category } = l.cp;
    const isAd = l.direction === 'out' && ads.has(normAddr(l.cp.address));
    if (l.direction === 'out') {
      if (category === 'CEX_CUSTODIAL') l.tags.add('TO_CEX');
      if (category === 'CEX_DEPOSIT') l.tags.add('TO_CEX_DEPOSIT');
      if (category === 'CASP_KANTOR') l.tags.add('TO_KANTOR');
      if (category === 'PAYMENT_GATEWAY') l.tags.add('TO_GATEWAY');
      if (category === 'CRYPTO_CARD') l.tags.add('TO_CARD');
      if (isAd) l.tags.add('TO_AD_ADDRESS');
      const cash = category === 'CASP_KANTOR' || category === 'PAYMENT_GATEWAY' || category === 'CRYPTO_CARD' || isAd;
      if (cash && isStablecoin(l.t.asset)) l.tags.add(l.t.asset.toUpperCase() === 'USDT' ? 'USDT_TO_CASH' : 'STABLECOIN_TO_CASH');
      if ((category && CASH_OUT_CATEGORIES.includes(category)) || isAd) cashOutLegs.push(l);
    } else {
      if (category === 'CEX_CUSTODIAL' || category === 'CEX_DEPOSIT') l.tags.add('FROM_CEX');
      if (category === 'CASP_KANTOR') l.tags.add('FROM_KANTOR');
    }
    if (category === 'MIXER') l.tags.add('MIXER');
    if (category === 'SANCTIONED') l.tags.add('SANCTIONED');
    for (const th of thresholds) if ((l.t.valueEur ?? 0) >= th) l.tags.add(`OVER_${th}_EUR`);
  }

  // Totals, assets, interactions.
  const byAsset: Indicators['byAsset'] = {};
  const interactions: Indicators['interactions'] = {};
  const counterparties = new Map<string, boolean>(); // address → has a known category
  const stable = { inUsd: 0, outUsd: 0 };
  for (const l of legs) {
    const a = (byAsset[l.t.asset] ??= { in: 0, out: 0 });
    a[l.direction] += l.t.amount;
    if (isStablecoin(l.t.asset)) stable[l.direction === 'in' ? 'inUsd' : 'outUsd'] += l.t.valueUsd ?? 0;
    counterparties.set(normAddr(l.cp.address), l.cp.category !== undefined);
    const c = l.cp.category;
    if (c && INTERACTION_CATEGORIES.includes(c)) {
      const i = (interactions[c] ??= { count: 0, inPln: 0, outPln: 0, addresses: [] });
      i.count++;
      if (l.direction === 'in') i.inPln = round2(i.inPln + (l.t.valuePln ?? 0));
      else i.outPln = round2(i.outPln + (l.t.valuePln ?? 0));
      if (!i.addresses.some((x) => sameAddress(x, l.cp.address))) i.addresses.push(l.cp.address);
    }
  }
  for (const a of Object.values(byAsset)) {
    a.in = round2(a.in);
    a.out = round2(a.out);
  }

  // Cash-out endpoints and threshold crossing (cumulative value of cash-out outflows).
  const endpoints = new Map<string, CashOutEndpoint>();
  for (const l of cashOutLegs) {
    const k = normAddr(l.cp.address);
    const e = endpoints.get(k) ?? { address: l.cp.address, kind: l.cp.category && CASH_OUT_CATEGORIES.includes(l.cp.category) ? l.cp.category : ('AD_ADDRESS' as const), name: l.cp.name, count: 0, totalPln: 0, totalEur: 0 };
    e.count++;
    e.totalPln = round2(e.totalPln + (l.t.valuePln ?? 0));
    e.totalEur = round2(e.totalEur + (l.t.valueEur ?? 0));
    endpoints.set(k, e);
  }
  const patterns = [...new Set(cashOutLegs.flatMap((l) => [...l.tags].filter((x) => !x.startsWith('OVER_') && x !== 'SWAP_DEX')))].sort();

  const thresholdResults: ThresholdResult[] = thresholds.map((th) => {
    let running = 0;
    let cumulativeCrossedAt: string | null = null;
    for (const l of cashOutLegs) {
      running += l.t.valueEur ?? 0;
      if (running >= th) {
        cumulativeCrossedAt = l.t.time;
        break;
      }
    }
    return {
      eur: th,
      maxSingleEur: round2(Math.max(0, ...legs.map((l) => l.t.valueEur ?? 0))),
      singleCrossedAt: legs.find((l) => (l.t.valueEur ?? 0) >= th)?.t.time ?? null,
      cumulativeCrossedAt,
    };
  });

  const flows: FlowEntry[] = legs.slice(-MAX_FLOWS).map((l) => ({
    time: l.t.time,
    tx: l.t.tx,
    direction: l.direction,
    counterparty: l.cp,
    asset: l.t.asset,
    amount: round2(l.t.amount),
    valuePln: l.t.valuePln,
    valueEur: l.t.valueEur,
    tags: natural(l.tags),
  }));

  const indicators: Indicators = {
    chain,
    address,
    txCount: byTx.size,
    firstActivity: legs[0]?.t.time ?? null,
    lastActivity: legs.at(-1)?.t.time ?? null,
    totals: {
      inPln: sum(legs.filter((l) => l.direction === 'in').map((l) => l.t.valuePln)),
      outPln: sum(legs.filter((l) => l.direction === 'out').map((l) => l.t.valuePln)),
      inEur: sum(legs.filter((l) => l.direction === 'in').map((l) => l.t.valueEur)),
      outEur: sum(legs.filter((l) => l.direction === 'out').map((l) => l.t.valueEur)),
      unvalued: legs.filter((l) => l.t.valueEur === null).length,
    },
    byAsset,
    stablecoin: { inUsd: round2(stable.inUsd), outUsd: round2(stable.outUsd) },
    counterparties: { total: counterparties.size, known: [...counterparties.values()].filter(Boolean).length },
    interactions,
    swaps,
    cashOut: {
      detected: cashOutLegs.length > 0,
      patterns,
      totalPln: sum(cashOutLegs.map((l) => l.t.valuePln)),
      totalEur: sum(cashOutLegs.map((l) => l.t.valueEur)),
      firstAt: cashOutLegs[0]?.t.time ?? null,
      lastAt: cashOutLegs.at(-1)?.t.time ?? null,
      endpoints: [...endpoints.values()],
    },
    thresholds: thresholdResults,
    tags: natural(new Set(legs.flatMap((l) => [...l.tags]))),
    note: THRESHOLD_NOTE,
  };
  return { indicators, flows };
}
