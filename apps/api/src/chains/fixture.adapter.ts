import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { isChain, labelKey, parseAddress, type Chain, type ChainHistory, type ChainTransfer } from '@kropka/core';
import { repoPath } from '../paths.js';
import type { ChainAdapter } from './chain-adapter.js';

interface FixtureFile {
  chain: Chain;
  address: string;
  isContract?: boolean;
  transfers: ChainTransfer[];
}

/** Synthetic on-chain histories of the demo personas (fixtures/chain/*.json). Reads disk, never the network. */
@Injectable()
export class FixtureChainAdapter implements ChainAdapter {
  readonly id = 'fixture';
  readonly live = false;
  private readonly files = new Map<string, FixtureFile>();

  constructor() {
    const dir = repoPath(process.env.CHAIN_FIXTURES_DIR ?? 'fixtures/chain');
    if (!existsSync(dir)) return;
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json')).sort()) {
      const doc = JSON.parse(readFileSync(join(dir, f), 'utf8')) as FixtureFile;
      if (!isChain(doc.chain) || !parseAddress(doc.address).ok || !Array.isArray(doc.transfers)) {
        throw new Error(`chain fixture ${f}: needs a supported "chain", a valid "address" and a "transfers" list`);
      }
      this.files.set(labelKey(doc.chain, doc.address), doc);
    }
  }

  supports = () => true;
  unavailableReason = () => undefined;

  async history(chain: Chain, address: string): Promise<ChainHistory | null> {
    const doc = this.files.get(labelKey(chain, address));
    if (!doc) return null;
    return { chain, address, provider: this.id, fetchedAt: new Date().toISOString(), transfers: doc.transfers, isContract: doc.isContract ?? false };
  }
}
