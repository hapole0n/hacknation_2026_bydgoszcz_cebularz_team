import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { cdxTimeToIso, spread, WaybackConnector, MAX_SNAPSHOTS } from '../src/connectors/wayback.connector.js';
import { sha256Hex } from '../src/connectors/connector.js';
import { EgressClient, EgressConfig } from '../src/egress/egress.client.js';
import { repoPath } from '../src/paths.js';
import type { PrismaService } from '../src/prisma.service.js';
import { sandboxFetch } from './fixture-fetch.js';

const audits: { host: string; path: string; status: number }[] = [];
const prisma = { auditLog: { create: async ({ data }: { data: (typeof audits)[number] }) => void audits.push(data) } } as unknown as PrismaService;
const addresses = JSON.parse(readFileSync(repoPath('fixtures/addresses.json'), 'utf8'));
const SITE = 'http://sandbox-web/jtestowy-site/index.html';
const source = { url: SITE, platform: 'jtestowy.example.org', origin: 'OWN_PROFILE' as const, author: { handle: 'jtestowy' }, title: 'Strona osobista' };

function connector(fetchImpl: typeof fetch = sandboxFetch()) {
  const cfg = new EgressConfig();
  cfg.fetchImpl = fetchImpl;
  cfg.allowlist = [...cfg.allowlist.map((h) => ({ ...h, rateLimitPerSec: undefined }))];
  audits.length = 0;
  return new WaybackConnector(new EgressClient(prisma, cfg));
}

describe('helpers', () => {
  it('CDX timestamps become ISO instants; snapshots are spread evenly, oldest and newest always included', () => {
    expect(cdxTimeToIso('20210302101500')).toBe('2021-03-02T10:15:00Z');
    expect(spread([1, 2, 3], 5)).toEqual([1, 2, 3]);
    const twenty = Array.from({ length: 20 }, (_, i) => i);
    const picked = spread(twenty, MAX_SNAPSHOTS);
    expect(picked).toHaveLength(MAX_SNAPSHOTS);
    expect([picked[0], picked.at(-1)]).toEqual([0, 19]);
  });
});

describe('Wayback connector (sandbox archive)', () => {
  it('finds the snapshots of a sandbox page in the sandbox archive: which address was on the page, and when', async () => {
    const found = await connector().archive([source], { identifiers: [] });
    expect(found.map((d) => [d.publishedAt, d.snapshotOf])).toEqual([
      ['2021-03-02T10:15:00Z', SITE],
      ['2026-09-25T08:30:00Z', SITE],
    ]);
    expect(found[0]!.text).toContain(addresses.A0.address); // the old address of 2021 …
    expect(found[1]!.text).toContain(addresses.A1.address); // … and the one of September 2026
    expect(found[0]).toMatchObject({
      connectorId: 'wayback',
      url: 'http://sandbox-web/wayback/web/20210302101500id_/jtestowy-site/index.html',
      archiveUrl: 'http://sandbox-web/wayback/web/20210302101500id_/jtestowy-site/index.html',
      platform: 'jtestowy.example.org', // a copy of the same site: not an independent origin
      origin: 'OWN_PROFILE',
      author: { handle: 'jtestowy' },
    });
    expect(found[0]!.sha256).toBe(sha256Hex(readFileSync(repoPath('fixtures/sandbox-web/wayback/web/20210302101500id_/jtestowy-site/index.html'), 'utf8')));
    // nothing but the sandbox was asked — a synthetic page is never looked up at the real archive
    expect(audits.every((a) => a.host === 'sandbox-web')).toBe(true);
    expect(audits.map((a) => a.path)).toEqual(['/wayback/cdx/search/cdx', '/wayback/web/20210302101500id_/jtestowy-site/index.html', '/wayback/web/20260925083000id_/jtestowy-site/index.html']);
  });

  it('keeps only the CDX rows of the requested page; a page without snapshots gives nothing', async () => {
    const none = await connector().archive([{ ...source, url: 'http://sandbox-web/forum/post/3204.html' }], { identifiers: [] });
    expect(none).toEqual([]);
  });

  it('is a source that does not search by identifier', async () => {
    expect(await connector().search({ identifiers: [] })).toEqual([]);
  });
});

describe('Wayback connector (live web.archive.org, mocked)', () => {
  const CDX = JSON.stringify([
    ['timestamp', 'original', 'statuscode', 'digest'],
    ['20230105120000', 'https://github.com/someone', '200', 'AAAA'],
    ['20240601120000', 'https://github.com/someone', '200', 'BBBB'],
  ]);

  it('queries the CDX API and fetches the raw capture (id_) of each snapshot, through the egress client only', async () => {
    const f = vi.fn(async (input: string | URL | Request) => {
      const url = new URL(String(input));
      if (url.pathname === '/cdx/search/cdx') return new Response(CDX, { status: 200 });
      return new Response(`profile as of ${url.pathname.split('/')[2]}`, { status: 200 });
    });
    const found = await connector(f as unknown as typeof fetch).archive([{ url: 'https://github.com/someone', platform: 'github.com', origin: 'OWN_PROFILE' }], { identifiers: [] });
    const cdxUrl = new URL(String(f.mock.calls[0]![0]));
    expect(cdxUrl.origin).toBe('https://web.archive.org');
    expect(Object.fromEntries(cdxUrl.searchParams)).toMatchObject({ url: 'https://github.com/someone', output: 'json', filter: 'statuscode:200', collapse: 'digest' });
    expect(found.map((d) => d.url)).toEqual([
      'https://web.archive.org/web/20230105120000id_/https://github.com/someone',
      'https://web.archive.org/web/20240601120000id_/https://github.com/someone',
    ]);
    expect(found[1]).toMatchObject({ publishedAt: '2024-06-01T12:00:00Z', snapshotOf: 'https://github.com/someone', text: 'profile as of 20240601120000id_' });
    expect(audits.every((a) => a.host === 'web.archive.org')).toBe(true);
  });

  it('an empty answer, an HTTP error or a dead snapshot just means "nothing found", not a failure', async () => {
    const page = { url: 'https://github.com/someone', platform: 'github.com', origin: 'OWN_PROFILE' as const };
    expect(await connector((async () => new Response('', { status: 200 })) as unknown as typeof fetch).archive([page], { identifiers: [] })).toEqual([]);
    expect(await connector((async () => new Response('busy', { status: 503 })) as unknown as typeof fetch).archive([page], { identifiers: [] })).toEqual([]);
    const deadSnapshot = (async (input: string | URL | Request) => (new URL(String(input)).pathname === '/cdx/search/cdx' ? new Response(CDX, { status: 200 }) : new Response('gone', { status: 404 }))) as unknown as typeof fetch;
    expect(await connector(deadSnapshot).archive([page], { identifiers: [] })).toEqual([]);
  });
});
