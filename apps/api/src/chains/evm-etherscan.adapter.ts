import { Injectable } from '@nestjs/common';
import type { Chain, ChainHistory, ChainTransfer } from '@kropka/core';
import { EgressClient } from '../egress/egress.client.js';
import { ChainUnavailableError, scaled, toIso, tokenAsset, type AdapterCtx, type ChainAdapter } from './chain-adapter.js';

const BASE = 'https://api.etherscan.io/v2/api';
const PAGE = 200;

interface Envelope<T> {
  status: string;
  message: string;
  result: T;
}
interface EthTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  isError: string;
}
interface TokenTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  tokenSymbol: string;
  tokenDecimal: string;
  contractAddress: string;
}

/** Etherscan API v2 (Ethereum mainnet): normal transactions, ERC-20 transfers and bytecode (eth_getCode). Needs ETHERSCAN_API_KEY. */
@Injectable()
export class EvmEtherscanAdapter implements ChainAdapter {
  readonly id = 'etherscan';
  readonly live = true;

  constructor(private readonly egress: EgressClient) {}

  supports = (chain: Chain) => chain === 'ETH';
  unavailableReason = () => (process.env.ETHERSCAN_API_KEY ? undefined : 'ETHERSCAN_API_KEY is not set in .env — Ethereum on-chain lookups are disabled');

  async history(chain: Chain, address: string, ctx: AdapterCtx): Promise<ChainHistory> {
    const apikey = process.env.ETHERSCAN_API_KEY;
    if (!apikey) throw new ChainUnavailableError(this.unavailableReason()!);
    const call = async <T>(params: Record<string, string>, emptyOk = false): Promise<T> => {
      const url = `${BASE}?${new URLSearchParams({ chainid: '1', ...params, apikey })}`;
      const res = await this.egress.get(url, { connectorId: this.id, ...ctx });
      if (!res.ok) throw new Error(`Etherscan HTTP ${res.status}`);
      const body = JSON.parse(res.text) as Envelope<T> & { jsonrpc?: string };
      if (body.jsonrpc) return body.result; // proxy module answers JSON-RPC
      if (body.status === '1') return body.result;
      if (emptyOk && Array.isArray(body.result)) return body.result; // "No transactions found"
      throw new Error(`Etherscan: ${typeof body.result === 'string' ? body.result : body.message}`);
    };

    const list = { address, sort: 'desc', page: '1', offset: String(PAGE) };
    const [txs, tokens, code] = await Promise.all([
      call<EthTx[]>({ module: 'account', action: 'txlist', startblock: '0', endblock: '99999999', ...list }, true),
      call<TokenTx[]>({ module: 'account', action: 'tokentx', ...list }, true),
      call<string>({ module: 'proxy', action: 'eth_getCode', address, tag: 'latest' }),
    ]);

    const transfers: ChainTransfer[] = [
      ...txs
        .filter((t) => t.to && t.value !== '0')
        .map((t): ChainTransfer => ({ tx: t.hash, time: toIso(Number(t.timeStamp) * 1000), from: t.from, to: t.to, asset: 'ETH', amount: scaled(t.value, 18), failed: t.isError === '1' })),
      ...tokens.map((t): ChainTransfer => ({
        tx: t.hash,
        time: toIso(Number(t.timeStamp) * 1000),
        from: t.from,
        to: t.to,
        asset: tokenAsset('ETH', t.tokenSymbol, t.contractAddress),
        amount: scaled(t.value, Number(t.tokenDecimal)),
      })),
    ];
    // shortcut: one page per list (latest 200); `truncated` tells the report the history is partial
    return { chain, address, provider: this.id, fetchedAt: new Date().toISOString(), transfers, isContract: code !== '0x', truncated: txs.length >= PAGE || tokens.length >= PAGE };
  }
}
