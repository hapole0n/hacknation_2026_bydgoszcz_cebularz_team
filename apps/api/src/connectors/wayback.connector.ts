import { Injectable } from '@nestjs/common';
import { EgressClient } from '../egress/egress.client.js';
import { htmlToText, sha256Hex, type ArchiveSource, type ConnectorPolicy, type EvidenceDraft, type SearchInput, type SourceConnector } from './connector.js';

const LIVE_BASE = 'https://web.archive.org';
/** Snapshots read per page; picked evenly over time, always including the oldest and the newest. */
export const MAX_SNAPSHOTS = 5;

interface CdxRow {
  timestamp: string;
  original: string;
}

/** `20210302101500` → `2021-03-02T10:15:00Z`. */
export const cdxTimeToIso = (ts: string) => `${ts.slice(0, 4)}-${ts.slice(4, 6)}-${ts.slice(6, 8)}T${ts.slice(8, 10)}:${ts.slice(10, 12)}:${ts.slice(12, 14)}Z`;

/** At most `n` items spread evenly over the list, first and last included. */
export function spread<T>(items: T[], n: number): T[] {
  if (items.length <= n) return items;
  return Array.from({ length: n }, (_, i) => items[Math.round((i * (items.length - 1)) / (n - 1))]!);
}

/**
 * Internet Archive (Wayback Machine), CDX API — which addresses were on a page, and when (address-swap detection, PLAN 3.1).
 * It works on pages other sources found (`archive`), not on identifiers. A page of the synthetic sandbox is looked up in the
 * sandbox's own archive (fixtures/sandbox-web/wayback), never at the real service; any other page goes to web.archive.org.
 */
@Injectable()
export class WaybackConnector implements SourceConnector {
  readonly id = 'wayback';
  readonly kind = 'web2' as const;
  readonly version = '1.0.0';
  readonly policy: ConnectorPolicy = { tosUrl: 'https://archive.org/about/terms.php', method: 'official_api', rateLimitPerSec: 1, weightHint: 1 };

  constructor(private readonly egress: EgressClient) {}

  /** Nothing to look up by identifier: the archive is consulted for pages found by the other sources. */
  async search(): Promise<EvidenceDraft[]> {
    return [];
  }

  async archive(sources: ArchiveSource[], input: SearchInput): Promise<EvidenceDraft[]> {
    const sandbox = new URL((process.env.SANDBOX_BASE_URL ?? 'http://localhost:8088').replace(/\/$/, ''));
    const ctx = { connectorId: this.id, caseId: input.caseId, runId: input.runId };
    const out: EvidenceDraft[] = [];

    for (const src of sources) {
      const target = new URL(src.url);
      const synthetic = target.host === sandbox.host;
      const base = synthetic ? `${sandbox.origin}/wayback` : LIVE_BASE;
      const query = new URLSearchParams({ url: src.url, output: 'json', fl: 'timestamp,original,statuscode,digest', filter: 'statuscode:200', collapse: 'digest', limit: '50' });
      const cdx = await this.egress.get(`${base}/cdx/search/cdx?${query}`, ctx);
      if (!cdx.ok || cdx.text.trim() === '') continue;

      const [, ...rows] = JSON.parse(cdx.text) as string[][]; // first row = field names
      const snapshots: CdxRow[] = rows.map(([timestamp, original]) => ({ timestamp: timestamp!, original: original! })).filter((r) => new URL(r.original).pathname === target.pathname);

      for (const snap of spread(snapshots, MAX_SNAPSHOTS)) {
        // Live: the raw capture (`id_`) of the original URL. Sandbox: the same scheme with a path only (a colon is not a legal directory name everywhere).
        const url = synthetic ? `${base}/web/${snap.timestamp}id_${target.pathname}` : `${base}/web/${snap.timestamp}id_/${snap.original}`;
        const res = await this.egress.get(url, ctx);
        if (!res.ok) continue;
        const iso = cdxTimeToIso(snap.timestamp);
        out.push({
          connectorId: this.id,
          url,
          resourceId: `wayback:${snap.timestamp}:${src.url}`,
          fetchedAt: new Date(),
          sha256: sha256Hex(res.text),
          text: /<(html|!doctype)/i.test(res.text) ? htmlToText(res.text) : res.text,
          // The same site as the page it is a copy of: a snapshot is no independent confirmation.
          platform: src.platform,
          origin: src.origin,
          author: src.author,
          publishedAt: iso,
          title: `${src.title ?? src.url} (Wayback ${iso.slice(0, 10)})`,
          archiveUrl: url,
          snapshotOf: src.url,
        });
      }
    }
    return out;
  }
}
