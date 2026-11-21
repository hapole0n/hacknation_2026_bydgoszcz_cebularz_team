import type { Chain } from '../chain.js';

export const STABLECOINS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDD', 'PYUSD'] as const;
export const isStablecoin = (asset: string) => (STABLECOINS as readonly string[]).includes(asset.toUpperCase());

/** One movement of an asset between two addresses, normalised across chains. */
export interface ChainTransfer {
  /** Transaction hash / id; legs of one swap share it. */
  tx: string;
  /** ISO-8601 UTC. */
  time: string;
  from: string;
  to: string;
  /** "ETH", "BTC", "TRX" or a token symbol such as "USDT". */
  asset: string;
  /** In asset units (not wei / satoshi / sun). */
  amount: number;
  /** USD price per unit at that time, when a source gave one. Stablecoins are valued 1:1 and need none. */
  usdPrice?: number;
  failed?: boolean;
}

export interface ChainHistory {
  chain: Chain;
  address: string;
  /** Which adapter produced it (e.g. "fixture", "etherscan", "trongrid", "mempool.space"). */
  provider: string;
  fetchedAt: string;
  transfers: ChainTransfer[];
  /** Bytecode check: true = smart contract, null = could not be checked. */
  isContract?: boolean | null;
  /** The provider returned only a page of a longer history. */
  truncated?: boolean;
}

/** NBP table A mid rates, each from the last business day before the transaction (art. 11a PIT). */
export interface FxRates {
  usdPln: number;
  eurPln: number;
  usdDate: string;
  eurDate: string;
}

export interface ValuedTransfer extends ChainTransfer {
  valueUsd: number | null;
  valuePln: number | null;
  valueEur: number | null;
  fx?: FxRates;
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Stablecoins: 1 USD. Other assets: only when the transfer carries a price (no price source is invented). */
export function valueTransfer(t: ChainTransfer, fx?: FxRates): ValuedTransfer {
  const usd = isStablecoin(t.asset) ? t.amount : t.usdPrice !== undefined ? t.amount * t.usdPrice : null;
  if (usd === null || !fx) return { ...t, valueUsd: usd === null ? null : round2(usd), valuePln: null, valueEur: null, fx };
  const pln = usd * fx.usdPln;
  return { ...t, valueUsd: round2(usd), valuePln: round2(pln), valueEur: round2(pln / fx.eurPln), fx };
}

/** EVM and bech32 addresses are case-insensitive, base58 is not. */
export const normAddr = (a: string) => (/^(0x|bc1)/i.test(a) ? a.toLowerCase() : a);
export const sameAddress = (a: string, b: string) => normAddr(a) === normAddr(b);

/** Calendar date (YYYY-MM-DD) of an instant in Poland — the day the PIT rules look at. */
export function warsawDate(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Warsaw', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** Last rate published strictly before `date` (art. 11a PIT: the last business day preceding the day of the revenue). */
export function previousRate<T extends { date: string }>(ratesAscending: readonly T[], date: string): T | undefined {
  return [...ratesAscending].reverse().find((r) => r.date < date);
}
