import type { AddressCategory } from '../labels.js';
import { normAddr, sameAddress, type ChainTransfer } from './model.js';

/** A "service" has a crowd of one-off counterparties; a person's wallet does not. */
export const SERVICE_MIN_COUNTERPARTIES = 100;
export const SERVICE_MIN_NEWNESS = 0.5; // distinct counterparties / transfers

/**
 * Exchange deposit address: it only forwards what it receives to a labelled exchange wallet (a sweep).
 * Custodial — the exchange holds the keys — but a strong lead for a KYC request.
 */
export function detectCexDeposit(
  address: string,
  transfers: readonly ChainTransfer[],
  categoryOf: (address: string) => AddressCategory | undefined,
): { isDeposit: boolean; sweepsTo: string[] } {
  const ok = transfers.filter((t) => !t.failed);
  const ins = ok.filter((t) => sameAddress(t.to, address) && !sameAddress(t.from, address));
  const outs = ok.filter((t) => sameAddress(t.from, address) && !sameAddress(t.to, address));
  if (ins.length === 0 || outs.length === 0) return { isDeposit: false, sweepsTo: [] };
  if (!outs.every((t) => categoryOf(t.to) === 'CEX_CUSTODIAL')) return { isDeposit: false, sweepsTo: [] };

  // The asset it mostly receives must be (almost) fully forwarded: ≥ 90 % of the amount.
  const count = new Map<string, number>();
  for (const t of ins) count.set(t.asset, (count.get(t.asset) ?? 0) + 1);
  const main = [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
  const sum = (xs: readonly ChainTransfer[]) => xs.filter((t) => t.asset === main).reduce((s, t) => s + t.amount, 0);
  if (sum(outs) < 0.9 * sum(ins)) return { isDeposit: false, sweepsTo: [] };
  return { isDeposit: true, sweepsTo: [...new Set(outs.map((t) => normAddr(t.to)))] };
}

/** Behavioural fallback when no label exists: many distinct, mostly one-off counterparties → a service, not a person. */
export function looksLikeService(address: string, transfers: readonly ChainTransfer[]): boolean {
  const cps = new Set<string>();
  let n = 0;
  for (const t of transfers) {
    if (t.failed) continue;
    n++;
    cps.add(normAddr(sameAddress(t.from, address) ? t.to : t.from));
  }
  return cps.size >= SERVICE_MIN_COUNTERPARTIES && cps.size / n >= SERVICE_MIN_NEWNESS;
}

/** Any transaction within ±`windowDays` of any trace date (rule CHAIN_ACTIVE_CONSISTENT). */
export function activeNearTrace(transferTimes: readonly string[], traceDates: readonly string[], windowDays = 90): boolean {
  const win = windowDays * 86_400_000;
  const traces = traceDates.map((d) => Date.parse(d)).filter((n) => !Number.isNaN(n));
  return transferTimes.some((t) => traces.some((d) => Math.abs(Date.parse(t) - d) <= win));
}
