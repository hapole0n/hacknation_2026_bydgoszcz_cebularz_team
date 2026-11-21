import { Injectable } from '@nestjs/common';
import { sameAddress, type Chain, type ChainHistory, type ChainTransfer } from '@kropka/core';
import { EgressClient } from '../egress/egress.client.js';
import { toIso, type AdapterCtx, type ChainAdapter } from './chain-adapter.js';

const BASE = 'https://mempool.space/api';
const MAX_PAGES = 2; // 25 confirmed transactions per page

interface Tx {
  txid: string;
  vin: { prevout?: { scriptpubkey_address?: string; value: number } }[];
  vout: { scriptpubkey_address?: string; value: number }[];
  status: { confirmed: boolean; block_time?: number };
}

/**
 * Bitcoin via the public mempool.space REST API (no key). Response shape taken from the mempool.space API docs
 * (/address/:address/txs, /txs/chain/:last_seen_txid); not verified against the live service in this repo's tests.
 * UTXO flows are reduced to per-recipient transfers; no clustering.
 */
@Injectable()
export class BtcMempoolAdapter implements ChainAdapter {
  readonly id = 'mempool.space';
  readonly live = true;

  constructor(private readonly egress: EgressClient) {}

  supports = (chain: Chain) => chain === 'BTC';
  unavailableReason = () => undefined;

  async history(chain: Chain, address: string, ctx: AdapterCtx): Promise<ChainHistory> {
    const txs: Tx[] = [];
    let url = `${BASE}/address/${address}/txs`;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await this.egress.get(url, { connectorId: this.id, ...ctx });
      if (!res.ok) throw new Error(`mempool.space HTTP ${res.status}`);
      const batch = (JSON.parse(res.text) as Tx[]).filter((t) => t.status.confirmed && t.status.block_time);
      txs.push(...batch);
      if (batch.length < 25) break;
      url = `${BASE}/address/${address}/txs/chain/${batch.at(-1)!.txid}`;
    }

    const transfers: ChainTransfer[] = txs.flatMap((t): ChainTransfer[] => {
      const time = toIso(t.status.block_time! * 1000);
      const spends = t.vin.some((i) => i.prevout?.scriptpubkey_address && sameAddress(i.prevout.scriptpubkey_address, address));
      if (spends) {
        // outgoing: every output that is not change back to the address
        return t.vout
          .filter((o) => o.scriptpubkey_address && !sameAddress(o.scriptpubkey_address, address))
          .map((o) => ({ tx: t.txid, time, from: address, to: o.scriptpubkey_address!, asset: 'BTC', amount: o.value / 1e8 }));
      }
      const sender = t.vin.find((i) => i.prevout?.scriptpubkey_address)?.prevout?.scriptpubkey_address ?? 'unknown';
      return t.vout.filter((o) => o.scriptpubkey_address && sameAddress(o.scriptpubkey_address, address)).map((o) => ({ tx: t.txid, time, from: sender, to: address, asset: 'BTC', amount: o.value / 1e8 }));
    });
    return { chain, address, provider: this.id, fetchedAt: new Date().toISOString(), transfers, isContract: false, truncated: txs.length >= 25 * MAX_PAGES };
  }
}
