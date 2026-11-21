import { type Chain, type ChainHistory } from '@olcys/core';

/** A live adapter that cannot run (typically: its API key is missing from .env). */
export class ChainUnavailableError extends Error {}

export interface AdapterCtx {
  caseId?: string;
  runId?: string;
}

/** Plug-in interface for blockchain data sources (PLAN §3.5). Live adapters go through EgressClient only. */
export interface ChainAdapter {
  readonly id: string;
  readonly live: boolean;
  supports(chain: Chain): boolean;
  /** Why the adapter cannot be used right now (e.g. a missing API key); undefined = ready. */
  unavailableReason(): string | undefined;
  /** null = this adapter has no data for the address (the next one is tried). */
  history(chain: Chain, address: string, ctx: AdapterCtx): Promise<ChainHistory | null>;
}

/**
 * Well-known stablecoin contracts. A token only counts as a stablecoin when symbol AND contract match —
 * anyone can deploy a token called "USDT". Other stablecoin symbols stay unverified (and unvalued).
 */
export const STABLE_CONTRACTS: Partial<Record<Chain, Record<string, string>>> = {
  ETH: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    DAI: '0x6B175474E89094C44Da98b954EedeAC495271d0F',
  },
  TRON: { USDT: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t' },
};
const STABLE_SYMBOLS = ['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD', 'USDD', 'PYUSD'];

export function tokenAsset(chain: Chain, symbol: string, contract: string): string {
  const s = symbol.toUpperCase();
  if (!STABLE_SYMBOLS.includes(s)) return s;
  return STABLE_CONTRACTS[chain]?.[s]?.toLowerCase() === contract.toLowerCase() ? s : `${s}(?)`;
}

export const toIso = (ms: number) => new Date(ms).toISOString().replace('.000Z', 'Z');
export const scaled = (raw: string, decimals: number) => Number(BigInt(raw)) / 10 ** decimals;
