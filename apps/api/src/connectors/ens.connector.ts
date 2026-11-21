import { Injectable } from '@nestjs/common';
import {
  ENS_REGISTRY,
  ENS_TEXT_KEYS,
  callAddr,
  callName,
  callResolver,
  callText,
  decodeAddress,
  decodeString,
  isEnsName,
  namehash,
  parseAddress,
  reverseNode,
  toChecksumAddress,
} from '@kropka/core';
import { EgressClient } from '../egress/egress.client.js';
import { NoteError } from '../notes.js';
import { sha256Hex, type ConnectorPolicy, type EvidenceDraft, type SearchInput, type SourceConnector } from './connector.js';

const DEFAULT_RPC = 'https://ethereum-rpc.publicnode.com';

interface Resolved {
  name: string;
  address: string;
  texts: Record<string, string>;
  /** Where the answer came from (a sandbox fixture URL for synthetic subjects). */
  fixtureUrl?: string;
}

/**
 * ENS over a public Ethereum RPC (ETH_RPC_URL, `eth_call` only, through EgressClient):
 *   - address → primary name (reverse record, accepted only when the name resolves back to the same address) + text records
 *   - name.eth → address + text records (com.github, com.twitter, email, url)
 * Records are set by the holder of the name, so a match is a strong, self-published trace. The synthetic sandbox answers
 * first (its own ENS fixtures); anything it does not know goes to the RPC.
 */
@Injectable()
export class EnsConnector implements SourceConnector {
  readonly id = 'ens';
  readonly kind = 'web2' as const;
  readonly version = '1.0.0';
  readonly policy: ConnectorPolicy = { tosUrl: 'https://docs.ens.domains/', method: 'official_api', rateLimitPerSec: 2, weightHint: 1 };

  constructor(private readonly egress: EgressClient) {}

  async search(input: SearchInput): Promise<EvidenceDraft[]> {
    const ctx = { connectorId: this.id, caseId: input.caseId, runId: input.runId };
    const out: EvidenceDraft[] = [];
    for (const i of input.identifiers) {
      let found: Resolved | null = null;
      if (i.type === 'ADDRESS') {
        const p = parseAddress(i.normalized);
        if (p.ok && p.chain === 'ETH') found = await this.reverse(p.address, ctx);
      } else if ((i.type === 'NICK' || i.type === 'SOCIAL_LOGIN') && isEnsName(i.normalized)) {
        found = await this.forward(i.normalized, ctx);
      }
      if (found) out.push(this.draft(found));
    }
    return out;
  }

  private draft(r: Resolved): EvidenceDraft {
    const github = r.texts['com.github'];
    const twitter = r.texts['com.twitter'];
    const text = [
      `ENS: ${r.name}`,
      `Adres: ${toChecksumAddress(r.address.replace(/^0x/i, ''))}`,
      ...Object.entries(r.texts).map(([k, v]) => `${k}: ${k === 'com.twitter' && !v.startsWith('@') ? '@' : ''}${v}`),
    ].join('\n');
    return {
      connectorId: this.id,
      url: r.fixtureUrl ?? `https://app.ens.domains/${r.name}`,
      resourceId: `ens:${r.name}`,
      fetchedAt: new Date(),
      sha256: sha256Hex(JSON.stringify({ name: r.name, address: r.address.toLowerCase(), texts: r.texts })),
      text,
      platform: 'ens.domains',
      origin: 'OWN_PROFILE',
      author: github || twitter ? { handle: (github ?? twitter)!.replace(/^@/, '') } : undefined,
      title: `ENS ${r.name}`,
    };
  }

  // ---- the synthetic sandbox answers first ---------------------------------------------------------------------------

  private async fixture(path: string, ctx: { connectorId: string; caseId?: string; runId?: string }): Promise<{ doc: { name?: string; address?: string; texts?: Record<string, string> }; url: string } | null> {
    const url = `${(process.env.SANDBOX_BASE_URL ?? 'http://localhost:8088').replace(/\/$/, '')}/ens/${path}`;
    try {
      const res = await this.egress.get(url, ctx);
      return res.ok ? { doc: JSON.parse(res.text), url } : null;
    } catch {
      return null; // no sandbox reachable: the RPC is asked instead
    }
  }

  async reverse(address: string, ctx: { connectorId: string; caseId?: string; runId?: string }): Promise<Resolved | null> {
    const fx = await this.fixture(`reverse/${address.toLowerCase()}.json`, ctx);
    if (fx?.doc.name) return { name: fx.doc.name, address, texts: fx.doc.texts ?? {}, fixtureUrl: fx.url };
    const node = reverseNode(address);
    const resolver = await this.resolverOf(node, ctx);
    if (!resolver) return null;
    const name = decodeString(await this.call(resolver, callName(node), ctx));
    if (!name || !isEnsName(name)) return null;
    // A reverse record is claimed by the address holder; it only counts when the name points back to the address.
    const fwd = await this.forward(name, ctx);
    return fwd && fwd.address.toLowerCase() === address.toLowerCase() ? fwd : null;
  }

  async forward(name: string, ctx: { connectorId: string; caseId?: string; runId?: string }): Promise<Resolved | null> {
    const fx = await this.fixture(`name/${name.toLowerCase()}.json`, ctx);
    if (fx?.doc.address) return { name, address: fx.doc.address, texts: fx.doc.texts ?? {}, fixtureUrl: fx.url };
    const node = namehash(name);
    const resolver = await this.resolverOf(node, ctx);
    if (!resolver) return null;
    const address = decodeAddress(await this.call(resolver, callAddr(node), ctx));
    if (!address) return null;
    const texts: Record<string, string> = {};
    for (const key of ENS_TEXT_KEYS) {
      const v = decodeString(await this.call(resolver, callText(node, key), ctx));
      if (v) texts[key] = v;
    }
    return { name, address, texts };
  }

  // ---- JSON-RPC (eth_call) -------------------------------------------------------------------------------------------

  private resolverOf = async (node: string, ctx: { connectorId: string; caseId?: string; runId?: string }) => decodeAddress(await this.call(ENS_REGISTRY, callResolver(node), ctx));

  /** One `eth_call`; a revert (no such record, off-chain resolver) is an empty answer, a transport problem is an error. */
  private async call(to: string, data: string, ctx: { connectorId: string; caseId?: string; runId?: string }): Promise<string> {
    const res = await this.egress.post(process.env.ETH_RPC_URL ?? DEFAULT_RPC, { jsonrpc: '2.0', id: 1, method: 'eth_call', params: [{ to, data }, 'latest'] }, { ...ctx, cacheTtlMs: 300_000 });
    if (!res.ok) throw new NoteError({ code: 'PROVIDER_HTTP', params: { provider: 'Ethereum RPC', status: res.status } }, `RPC HTTP ${res.status}`);
    const body = JSON.parse(res.text) as { result?: string; error?: unknown };
    return typeof body.result === 'string' ? body.result : '0x';
  }
}
