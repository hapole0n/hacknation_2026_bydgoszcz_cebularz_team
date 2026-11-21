import { Injectable } from '@nestjs/common';
import { evaluateIdentity, findIdentifierInText, type TraceOrigin } from '@kropka/core';
import { EgressClient } from '../egress/egress.client.js';
import { SandboxWorld } from './sandbox-world.js';
import { htmlToText, sha256Hex, type ConnectorPolicy, type EvidenceDraft, type SearchInput, type SourceConnector } from './connector.js';

interface IndexPage {
  path: string;
  platform: string;
  origin: TraceOrigin;
  author?: { handle?: string; name?: string };
  publishedAt?: string;
  snapshotOf?: string;
  title?: string;
  /** What the page shows in another world version (same URL, other content). */
  variants?: Record<string, { path: string; publishedAt?: string }>;
}

/** Synthetic "mini-internet" (fixtures/sandbox-web): a search index plus pages, fetched like any other web source. */
@Injectable()
export class SandboxConnector implements SourceConnector {
  readonly id = 'sandbox';
  readonly kind = 'web2' as const;
  readonly version = '1.0.0';
  readonly policy: ConnectorPolicy = {
    tosUrl: 'https://github.com/hapole0n/hacknation_2026_bydgoszcz_cebularz_team/tree/main/fixtures/sandbox-web',
    method: 'synthetic',
    rateLimitPerSec: 0,
    weightHint: 1,
  };

  constructor(
    private readonly egress: EgressClient,
    private readonly world: SandboxWorld,
  ) {}

  async search(input: SearchInput): Promise<EvidenceDraft[]> {
    const base = (process.env.SANDBOX_BASE_URL ?? 'http://localhost:8088').replace(/\/$/, '');
    const ctx = { connectorId: this.id, caseId: input.caseId, runId: input.runId };

    const index = await this.egress.get(`${base}/index.json`, ctx);
    if (!index.ok) throw new Error(`sandbox index: HTTP ${index.status}`);
    const pages: IndexPage[] = JSON.parse(index.text).pages;
    const version = String(await this.world.get());

    const found: EvidenceDraft[] = [];
    for (const page of pages) {
      const url = `${base}${page.path}`;
      const variant = page.variants?.[version];
      const res = await this.egress.get(`${base}${variant?.path ?? page.path}`, ctx);
      if (!res.ok) continue;
      const text = page.path.endsWith('.html') ? htmlToText(res.text) : res.text;
      const signals = { text, authorHandle: page.author?.handle, authorName: page.author?.name };
      const relevant = input.identifiers.some((i) => (i.type === 'ADDRESS' ? findIdentifierInText(i, text) : evaluateIdentity(i, signals, input.identifiers).matched));
      if (!relevant) continue;
      found.push({
        connectorId: this.id,
        url,
        fetchedAt: new Date(),
        sha256: sha256Hex(res.text),
        text,
        platform: page.platform,
        origin: page.origin,
        author: page.author,
        publishedAt: variant?.publishedAt ?? page.publishedAt,
        title: page.title,
        snapshotOf: page.snapshotOf ? `${base}${page.snapshotOf}` : undefined,
      });
    }
    return found;
  }
}
