import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Injectable } from '@nestjs/common';
import { ADDRESS_CATEGORIES, isChain, labelKey, parseAddress, type Chain, type LabelEntry } from '@olcys/core';
import { repoPath } from '../paths.js';

export interface LabelSource {
  file: string;
  source: string;
  license: string;
  retrieved: string;
  entries: number;
}

/** Static label sets from config/labels/*.json. Each file must open with a header: source, licence, retrieval date. */
@Injectable()
export class LabelService {
  private readonly byKey = new Map<string, LabelEntry>();
  readonly sources: LabelSource[] = [];

  constructor() {
    const dir = repoPath(process.env.LABELS_DIR ?? 'config/labels');
    for (const file of readdirSync(dir).filter((f) => f.endsWith('.json')).sort()) {
      const doc = JSON.parse(readFileSync(join(dir, file), 'utf8'));
      const fail = (msg: string): never => {
        throw new Error(`labels/${file}: ${msg}`);
      };
      const h = doc.header ?? {};
      for (const k of ['source', 'license', 'retrieved']) if (typeof h[k] !== 'string' || !h[k]) fail(`header.${k} is required`);
      for (const [i, e] of (doc.entries ?? []).entries() as Iterable<[number, LabelEntry]>) {
        if (!isChain(e.chain)) fail(`entries[${i}].chain "${e.chain}" is not supported`);
        if (!(ADDRESS_CATEGORIES as readonly string[]).includes(e.category)) fail(`entries[${i}].category "${e.category}" is unknown`);
        if (!parseAddress(e.address).ok) fail(`entries[${i}].address is not a valid address`);
        this.byKey.set(labelKey(e.chain, e.address), e);
      }
      this.sources.push({ file, source: h.source, license: h.license, retrieved: h.retrieved, entries: (doc.entries ?? []).length });
    }
  }

  lookup(chain: Chain, address: string): LabelEntry | undefined {
    return this.byKey.get(labelKey(chain, address));
  }

  /** Documentation / burn addresses, handed to the extractor so it flags them. */
  exampleAddresses(): string[] {
    return [...this.byKey.values()].filter((e) => e.category === 'EXAMPLE_BURN').map((e) => e.address);
  }
}
