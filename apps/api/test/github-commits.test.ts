import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GithubConnector } from '../src/connectors/github.connector.js';
import { EgressClient, EgressConfig } from '../src/egress/egress.client.js';
import { repoPath } from '../src/paths.js';
import type { PrismaService } from '../src/prisma.service.js';
import { sandboxFetch } from './fixture-fetch.js';

const prisma = { auditLog: { create: async () => undefined } } as unknown as PrismaService;
const A1: string = JSON.parse(readFileSync(repoPath('fixtures/addresses.json'), 'utf8')).A1.address;
const email = (value: string) => ({ type: 'EMAIL' as const, value, normalized: value.toLowerCase() });

function egress(fetchImpl: unknown) {
  const cfg = new EgressConfig();
  cfg.fetchImpl = fetchImpl as typeof fetch;
  cfg.allowlist = cfg.allowlist.map((h) => ({ ...h, rateLimitPerSec: undefined }));
  return new EgressClient(prisma, cfg);
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  delete process.env.GITHUB_TOKEN;
});

describe('GitHub: e-mail → commits by author-email', () => {
  it('a synthetic e-mail (reserved domain) is answered by the sandbox, never by api.github.com; the token never goes to the sandbox', async () => {
    process.env.GITHUB_TOKEN = 'secret-token';
    const sandbox = sandboxFetch();
    const seen: [string, unknown][] = [];
    const f = vi.fn(async (url: string, init?: RequestInit) => {
      seen.push([url, (init?.headers as Record<string, string> | undefined)?.Authorization]);
      return sandbox(url);
    });
    const [d] = await new GithubConnector(egress(f)).search({ identifiers: [email('jan.testowy@example.org')] });
    expect(seen).toEqual([['http://sandbox-web/github/search/commits/jan.testowy%40example.org.json', undefined]]);
    expect(d).toMatchObject({ connectorId: 'github', platform: 'github.com', origin: 'PUBLIC', author: { handle: 'jtestowy', name: 'Jan Testowy' }, via: ['EMAIL:jan.testowy@example.org'] });
    expect(d!.text).toContain('E-mail: jan.testowy@example.org');
    expect(d!.text).toContain(A1); // the address in a commit message
    expect(d!.text).toContain('2 commitów');
  });

  it('any other e-mail is searched at api.github.com without a token (public commit metadata)', async () => {
    const f = vi.fn(async () =>
      json({ total_count: 1, items: [{ sha: 'abcdef1234567', html_url: 'https://github.com/x/y/commit/abcdef1', commit: { message: 'fix', author: { name: 'Ala', email: 'ala@gmail.com', date: '2025-01-02T03:04:05Z' } }, author: null, repository: { full_name: 'x/y' } }] }),
    );
    const [d] = await new GithubConnector(egress(f)).search({ identifiers: [email('ala@gmail.com')] });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.github.com/search/commits?q=author-email%3Aala%40gmail.com&per_page=30&sort=author-date');
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
    expect(d).toMatchObject({ url: 'https://github.com/search?q=author-email%3Aala%40gmail.com&type=commits', author: undefined });
    expect(d!.text).toContain('x/y@abcdef1 (2025-01-02): fix');
  });

  it('a token, when set, goes to api.github.com only (higher rate limit)', async () => {
    process.env.GITHUB_TOKEN = 'secret-token';
    const f = vi.fn(async () => json({ total_count: 0, items: [] }));
    await new GithubConnector(egress(f)).search({ identifiers: [email('ala@gmail.com')] });
    expect(((f.mock.calls[0] as unknown as [string, RequestInit])[1].headers as Record<string, string>).Authorization).toBe('Bearer secret-token');
  });

  it('no commits is an empty answer; a rate limit is an error the run reports', async () => {
    expect(await new GithubConnector(egress(vi.fn(async () => json({ total_count: 0, items: [] })))).search({ identifiers: [email('nobody@gmail.com')] })).toEqual([]);
    expect(await new GithubConnector(egress(vi.fn(async () => json({ message: 'Validation Failed' }, 422)))).search({ identifiers: [email('nobody@gmail.com')] })).toEqual([]);
    await expect(new GithubConnector(egress(vi.fn(async () => json({ message: 'rate limit' }, 403)))).search({ identifiers: [email('nobody@gmail.com')] })).rejects.toMatchObject({ note: { code: 'PROVIDER_HTTP', params: { provider: 'GitHub', status: 403 } } });
  });
});
