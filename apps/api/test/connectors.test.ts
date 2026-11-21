import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeIdentifier, type IdentifierType } from '@kropka/core';
import { sha256Hex, htmlToText } from '../src/connectors/connector.js';
import { GithubConnector } from '../src/connectors/github.connector.js';
import { SandboxConnector } from '../src/connectors/sandbox.connector.js';
import { EgressClient, EgressConfig } from '../src/egress/egress.client.js';
import { repoPath } from '../src/paths.js';
import type { PrismaService } from '../src/prisma.service.js';
import { sandboxFetch } from './fixture-fetch.js';

const prisma = { auditLog: { create: async () => undefined } } as unknown as PrismaService;
const ident = (type: IdentifierType, value: string) => ({ type, value, normalized: normalizeIdentifier(type, value) });
const demo = [ident('NICK', 'jtestowy'), ident('EMAIL', 'jan.testowy@example.org'), ident('MESSENGER', '@jtestowy_pl')];
const addresses = JSON.parse(readFileSync(repoPath('fixtures/addresses.json'), 'utf8'));

afterEach(() => {
  delete process.env.GITHUB_TOKEN;
});

describe('htmlToText', () => {
  it('keeps the title and block structure, drops markup and decodes entities', () => {
    const t = htmlToText('<html><head><title>A &amp; B</title><style>p{}</style></head><body><h1>Hi</h1><p>one<br>two &lt;x&gt;</p><script>evil()</script></body></html>');
    expect(t).toBe('A & B\nHi\none\ntwo <x>');
  });
});

describe('sandbox connector', () => {
  const setup = () => {
    const cfg = new EgressConfig();
    cfg.fetchImpl = sandboxFetch();
    return { connector: new SandboxConnector(new EgressClient(prisma, cfg)), fetched: cfg.fetchImpl as ReturnType<typeof sandboxFetch> };
  };

  it('has a policy and implements the connector interface', () => {
    const { connector } = setup();
    expect(connector).toMatchObject({ id: 'sandbox', kind: 'web2', policy: { method: 'synthetic' } });
  });

  it('finds the pages that mention the demo identifiers, in catalogue order, with provenance', async () => {
    const { connector, fetched } = setup();
    const found = await connector.search({ identifiers: demo });
    expect(found.map((d) => new URL(d.url!).pathname)).toEqual([
      '/jtestowy-site/index.html',
      '/archive/20210302/jtestowy-site/index.html',
      '/gitlike/jtestowy/README.html',
      '/listy/archiwum/2026-09/0042.eml',
      '/forum/post/3181.html',
      '/forum/post/3204.html',
      '/p2p/ogloszenie-1042.html',
      '/tg/s/krypto_lublin_chat/57.html',
      '/social/rozdanie-btc.html',
      '/ig/kantor_usdt_lublin/p1.html',
      '/hobby/post/771.html',
    ]);
    const site = found[0]!;
    expect(site).toMatchObject({ connectorId: 'sandbox', platform: 'jtestowy.example.org', origin: 'OWN_PROFILE', author: { handle: 'jtestowy' }, publishedAt: '2026-10-12' });
    expect(site.sha256).toBe(sha256Hex(readFileSync(repoPath('fixtures/sandbox-web/jtestowy-site/index.html'), 'utf8')));
    expect(site.text).toContain(addresses.A1.address);
    expect(found[1]!.snapshotOf).toBe('http://sandbox-web/jtestowy-site/index.html');
    expect(fetched.requested.every((u) => u.startsWith('http://sandbox-web/'))).toBe(true);
  });

  it('finds the pages that publish an address (reverse lookup)', async () => {
    const { connector } = setup();
    const found = await connector.search({ identifiers: [ident('ADDRESS', addresses.AB.address)] });
    expect(found.map((d) => d.author?.handle)).toEqual(['jtestowy', 'krypto_okazje_77', 'bonus_airdrop']);
  });

  it('returns nothing for an unknown identifier', async () => {
    const { connector } = setup();
    expect(await connector.search({ identifiers: [ident('NICK', 'nobody_here')] })).toEqual([]);
  });
});

describe('github connector (mocked API, no network)', () => {
  const user = { id: 1, login: 'synth-dev', html_url: 'https://github.com/synth-dev', name: 'Synth Dev', bio: 'Synthetic profile', blog: 'https://synth.example', updated_at: '2026-10-01T00:00:00Z' };
  const mock = (routes: Record<string, unknown>) => {
    const calls: { url: string; headers: Record<string, string> }[] = [];
    const f = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, headers: init?.headers as Record<string, string> });
      const hit = Object.entries(routes).find(([prefix]) => url.startsWith(prefix));
      if (!hit) return new Response('not found', { status: 404 });
      return new Response(typeof hit[1] === 'string' ? hit[1] : JSON.stringify(hit[1]), { status: 200 });
    });
    const cfg = new EgressConfig();
    cfg.fetchImpl = f as unknown as typeof fetch;
    cfg.allowlist = [{ host: 'api.github.com' }, { host: 'raw.githubusercontent.com' }];
    return { connector: new GithubConnector(new EgressClient(prisma, cfg)), calls };
  };

  it('has a policy', () => {
    expect(mock({}).connector.policy).toMatchObject({ method: 'official_api', rateLimitPerSec: 1, tosUrl: expect.stringContaining('docs.github.com') });
  });

  it('without a token: profile + profile README only, no code search', async () => {
    const { connector, calls } = mock({ 'https://api.github.com/users/synth-dev': user, 'https://raw.githubusercontent.com/synth-dev/synth-dev/HEAD/README.md': 'Hello! ETH: 0xabc' });
    const found = await connector.search({ identifiers: [ident('NICK', 'synth-dev'), ident('ADDRESS', addresses.A1.address)] });
    expect(found.map((d) => [d.url, d.origin, d.author?.handle])).toEqual([
      ['https://github.com/synth-dev', 'OWN_PROFILE', 'synth-dev'],
      ['https://github.com/synth-dev/synth-dev', 'OWN_PROFILE', 'synth-dev'],
    ]);
    expect(found[0]!.text).toContain('Synthetic profile');
    expect(found[1]!.text).toBe('Hello! ETH: 0xabc');
    expect(calls.some((c) => c.url.includes('/search/code'))).toBe(false);
    expect(calls.every((c) => !c.headers?.Authorization)).toBe(true);
  });

  it('skips unknown accounts and accounts without a profile README', async () => {
    const { connector } = mock({ 'https://api.github.com/users/synth-dev': user });
    expect(await connector.search({ identifiers: [ident('NICK', 'ghost-user')] })).toEqual([]);
    expect((await connector.search({ identifiers: [ident('SOCIAL_LOGIN', '@synth-dev')] })).map((d) => d.title)).toEqual(['GitHub profile synth-dev']);
  });

  it('with GITHUB_TOKEN: authenticated code search for address identifiers', async () => {
    process.env.GITHUB_TOKEN = 'test-token';
    const hit = { html_url: 'https://github.com/o/r/blob/main/f.md', path: 'f.md', repository: { full_name: 'o/r', owner: { login: 'o' } }, text_matches: [{ fragment: `donate to ${addresses.A1.address}` }] };
    const { connector, calls } = mock({ 'https://api.github.com/search/code': { items: [hit] } });
    const found = await connector.search({ identifiers: [ident('ADDRESS', addresses.A1.address)] });
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ origin: 'PUBLIC', author: { handle: 'o' }, platform: 'github.com' });
    expect(found[0]!.text).toContain(addresses.A1.address);
    expect(calls[0]!.headers.Authorization).toBe('Bearer test-token');
    expect(calls[0]!.headers.Accept).toContain('text-match');
  });

  it('name identifiers: searches users and follows the top candidates', async () => {
    const { connector, calls } = mock({ 'https://api.github.com/search/users': { items: [{ login: 'Synth-Dev' }] }, 'https://api.github.com/users/synth-dev': user });
    const found = await connector.search({ identifiers: [ident('NAME', 'Synth Dev')] });
    expect(calls[0]!.url).toContain('q=fullname%3A%22synth%20dev%22');
    expect(found.map((d) => d.author?.name)).toEqual(['Synth Dev']);
  });
});
