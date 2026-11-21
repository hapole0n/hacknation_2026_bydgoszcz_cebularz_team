import { Injectable } from '@nestjs/common';
import type { Chain, ChainHistory } from '@olcys/core';
import { BtcMempoolAdapter } from './btc-mempool.adapter.js';
import { ChainUnavailableError, type AdapterCtx, type ChainAdapter } from './chain-adapter.js';
import { EvmEtherscanAdapter } from './evm-etherscan.adapter.js';
import { FixtureChainAdapter } from './fixture.adapter.js';
import { TronGridAdapter } from './tron-grid.adapter.js';

/** `fixture`: synthetic histories only (offline). `live`: fixtures first, then the live adapters. `off`: no on-chain step. */
export type ChainMode = 'fixture' | 'live' | 'off';
export const DEFAULT_CHAIN_MODE: ChainMode = 'fixture';
export const isChainMode = (v: unknown): v is ChainMode => v === 'fixture' || v === 'live' || v === 'off';

export interface HistoryResult {
  history: ChainHistory | null;
  /** Why there is no history: a missing key or a provider failure (shown to the analyst, never fatal). */
  note?: string;
}

@Injectable()
export class ChainRegistry {
  private readonly adapters: ChainAdapter[];

  // New chains: implement ChainAdapter and add it here.
  constructor(fixture: FixtureChainAdapter, btc: BtcMempoolAdapter, evm: EvmEtherscanAdapter, tron: TronGridAdapter) {
    this.adapters = [fixture, btc, evm, tron];
  }

  list() {
    return this.adapters.map((a) => ({ id: a.id, live: a.live, available: a.unavailableReason() === undefined, reason: a.unavailableReason() ?? null }));
  }

  async history(mode: ChainMode, chain: Chain, address: string, ctx: AdapterCtx): Promise<HistoryResult> {
    if (mode === 'off') return { history: null };
    const notes: string[] = [];
    for (const a of this.adapters) {
      if ((a.live && mode !== 'live') || !a.supports(chain)) continue;
      const reason = a.unavailableReason();
      if (reason) {
        notes.push(reason);
        continue;
      }
      try {
        const history = await a.history(chain, address, ctx);
        if (history) return { history };
      } catch (e) {
        notes.push(`${a.id}: ${e instanceof ChainUnavailableError ? e.message : e instanceof Error ? e.message : String(e)}`);
      }
    }
    return { history: null, note: notes.length > 0 ? notes.join('; ') : undefined };
  }
}
