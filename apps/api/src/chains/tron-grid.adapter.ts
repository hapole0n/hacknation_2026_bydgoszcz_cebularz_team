import { Injectable } from '@nestjs/common';
import { tronAddressFromHex, type Chain, type ChainHistory, type ChainTransfer } from '@kropka/core';
import { EgressClient } from '../egress/egress.client.js';
import { ChainUnavailableError, scaled, tokenAsset, toIso, type AdapterCtx, type ChainAdapter } from './chain-adapter.js';

const BASE = 'https://api.trongrid.io';
const LIMIT = 200;

interface Page<T> {
  success?: boolean;
  data: T[];
}
interface NativeTx {
  txID: string;
  block_timestamp: number;
  ret?: { contractRet?: string }[];
  raw_data: { contract: { type: string; parameter: { value: { owner_address?: string; to_address?: string; amount?: number } } }[] };
}
interface Trc20Tx {
  transaction_id: string;
  block_timestamp: number;
  from: string;
  to: string;
  type: string;
  value: string;
  token_info: { symbol: string; address: string; decimals: number };
}

/** TronGrid v1: TRX transfers and TRC-20 (USDT) transfers. TronGrid throttles keyless callers hard, so TRONGRID_API_KEY is required. */
@Injectable()
export class TronGridAdapter implements ChainAdapter {
  readonly id = 'trongrid';
  readonly live = true;

  constructor(private readonly egress: EgressClient) {}

  supports = (chain: Chain) => chain === 'TRON';
  unavailableReason = () => (process.env.TRONGRID_API_KEY ? undefined : 'TRONGRID_API_KEY is not set in .env — TRON on-chain lookups are disabled');

  async history(chain: Chain, address: string, ctx: AdapterCtx): Promise<ChainHistory> {
    const key = process.env.TRONGRID_API_KEY;
    if (!key) throw new ChainUnavailableError(this.unavailableReason()!);
    const get = async <T>(path: string): Promise<T[]> => {
      const q = new URLSearchParams({ only_confirmed: 'true', limit: String(LIMIT), order_by: 'block_timestamp,desc' });
      const res = await this.egress.get(`${BASE}/v1/accounts/${address}/${path}?${q}`, { connectorId: this.id, ...ctx, headers: { 'TRON-PRO-API-KEY': key } });
      if (!res.ok) throw new Error(`TronGrid HTTP ${res.status}`);
      return (JSON.parse(res.text) as Page<T>).data ?? [];
    };
    const [native, trc20] = await Promise.all([get<NativeTx>('transactions'), get<Trc20Tx>('transactions/trc20')]);

    const transfers: ChainTransfer[] = [
      ...native.flatMap((t): ChainTransfer[] => {
        const c = t.raw_data.contract[0];
        const v = c?.parameter.value;
        if (c?.type !== 'TransferContract' || !v?.owner_address || !v.to_address || !v.amount) return [];
        return [{ tx: t.txID, time: toIso(t.block_timestamp), from: tronAddressFromHex(v.owner_address), to: tronAddressFromHex(v.to_address), asset: 'TRX', amount: v.amount / 1e6, failed: t.ret?.[0]?.contractRet !== 'SUCCESS' }];
      }),
      ...trc20
        .filter((t) => t.type === 'Transfer')
        .map((t): ChainTransfer => ({
          tx: t.transaction_id,
          time: toIso(t.block_timestamp),
          from: t.from,
          to: t.to,
          asset: tokenAsset('TRON', t.token_info.symbol, t.token_info.address),
          amount: scaled(t.value, t.token_info.decimals),
        })),
    ];
    // isContract: not checked on TRON (TronGrid needs a POST for that); heuristics classify instead
    return { chain, address, provider: this.id, fetchedAt: new Date().toISOString(), transfers, isContract: null, truncated: native.length >= LIMIT || trc20.length >= LIMIT };
  }
}
