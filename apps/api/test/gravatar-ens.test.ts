import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { callName, callResolver, callText, decodeAddress, namehash, reverseNode } from '@kropka/core';
import { sha256Hex } from '../src/connectors/connector.js';
import { EnsConnector } from '../src/connectors/ens.connector.js';
import { GravatarConnector, isReservedEmailDomain } from '../src/connectors/gravatar.connector.js';
import { EgressClient, EgressConfig } from '../src/egress/egress.client.js';
import { repoPath } from '../src/paths.js';
import type { PrismaService } from '../src/prisma.service.js';
import { sandboxFetch } from './fixture-fetch.js';

const audits: { host: string; path: string; status: number }[] = [];
const prisma = { auditLog: { create: async ({ data }: { data: (typeof audits)[number] }) => void audits.push(data) } } as unknown as PrismaService;
const addresses = JSON.parse(readFileSync(repoPath('fixtures/addresses.json'), 'utf8'));
const A1: string = addresses.A1.address;
/** An address that is NOT a synthetic persona's: only such an address may reach the (fake) RPC node. */
const LIVE = '0x2222222222222222222222222222222222222222';
const email = (value: string) => ({ type: 'EMAIL' as const, value, normalized: value.toLowerCase() });
const address = (value: string) => ({ type: 'ADDRESS' as const, value, normalized: value });

function egress(fetchImpl: unknown) {
  const cfg = new EgressConfig();
  cfg.fetchImpl = fetchImpl as typeof fetch;
  cfg.allowlist = cfg.allowlist.map((h) => ({ ...h, rateLimitPerSec: undefined }));
  audits.length = 0;
  return new EgressClient(prisma, cfg);
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

afterEach(() => {
  delete process.env.GRAVATAR_API_KEY;
});

describe('Gravatar connector', () => {
  const hash = sha256Hex('jan.testowy@example.org');

  it('reserved domains (RFC 2606) are synthetic subjects', () => {
    for (const e of ['a@example.org', 'a@example.com', 'a@sub.example.net', 'a@host.test', 'a@x.invalid', 'a@local.localhost']) expect(isReservedEmailDomain(e), e).toBe(true);
    for (const e of ['a@gmail.com', 'a@example.org.evil.pl', 'a@notexample.org']) expect(isReservedEmailDomain(e), e).toBe(false);
  });

  it('a synthetic e-mail is answered by the sandbox (never by api.gravatar.com): profile, verified account, wallet', async () => {
    const f = sandboxFetch();
    const notes: unknown[] = [];
    const [d] = await new GravatarConnector(egress(f)).search({ identifiers: [email('jan.testowy@example.org')], notify: (n) => notes.push(n) });
    expect(f.requested).toEqual([`http://sandbox-web/gravatar/v3/profiles/${hash}`]);
    expect(audits.map((a) => a.host)).toEqual(['sandbox-web']);
    expect(d).toMatchObject({ connectorId: 'gravatar', platform: 'gravatar.com', origin: 'OWN_PROFILE', author: { name: 'Jan Testowy' }, resourceId: `gravatar:${hash}` });
    expect(d!.url).toBe(`http://sandbox-web/gravatar/v3/profiles/${hash}`);
    expect(d!.text).toContain('E-mail: jan.testowy@example.org');
    expect(d!.text).toContain('GitHub: https://github.com/jtestowy');
    expect(d!.text).toContain(`ETH: ${A1}`); // the wallet the owner published
    expect(notes).toEqual([]); // nothing to apologise for in the sandbox
  });

  it('a real e-mail without a key: profile read, wallets skipped WITH a note; the key goes out as a header, never into the log', async () => {
    const profile = { display_name: 'Ala', profile_url: 'https://gravatar.com/ala', verified_accounts: [{ service_label: 'GitHub', url: 'https://github.com/ala' }], payments: { crypto_wallets: [{ label: 'ETH', address: A1 }] } };
    const f = vi.fn(async () => json(profile));
    const notes: { code: string }[] = [];
    const [noKey] = await new GravatarConnector(egress(f)).search({ identifiers: [email('ala@gmail.com')], notify: (n) => notes.push(n) });
    expect(String((f.mock.calls[0] as unknown[])[0])).toBe(`https://api.gravatar.com/v3/profiles/${sha256Hex('ala@gmail.com')}`);
    expect(noKey!.text).not.toContain(A1);
    expect(notes).toEqual([{ code: 'GRAVATAR_WALLETS_SKIPPED', params: { key: 'GRAVATAR_API_KEY' } }]);
    expect(noKey!.url).toBe('https://gravatar.com/ala');

    process.env.GRAVATAR_API_KEY = 'grav-secret';
    notes.length = 0;
    const [keyed] = await new GravatarConnector(egress(f)).search({ identifiers: [email('ala@gmail.com')], notify: (n) => notes.push(n) });
    expect(keyed!.text).toContain(`ETH: ${A1}`);
    expect(notes).toEqual([]);
    const init = (f.mock.calls.at(-1) as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer grav-secret');
    expect(JSON.stringify(audits)).not.toContain('grav-secret');
    expect(audits.map((a) => a.path)).toEqual([`/v3/profiles/${sha256Hex('ala@gmail.com')}`]); // the audit log holds the path as sent (the hash, never the e-mail)
    expect(JSON.stringify(audits)).not.toContain('ala@gmail.com');
  });

  it('no profile (404) is no evidence; other HTTP errors are reported; other identifier types are ignored', async () => {
    expect(await new GravatarConnector(egress(vi.fn(async () => new Response('', { status: 404 })))).search({ identifiers: [email('x@gmail.com')] })).toEqual([]);
    await expect(new GravatarConnector(egress(vi.fn(async () => new Response('', { status: 429 })))).search({ identifiers: [email('x@gmail.com')] })).rejects.toMatchObject({ note: { code: 'PROVIDER_HTTP', params: { provider: 'Gravatar', status: 429 } } });
    const f = vi.fn();
    expect(await new GravatarConnector(egress(f)).search({ identifiers: [{ type: 'NICK', value: 'a', normalized: 'a' }] })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
  });
});

describe('ENS connector', () => {
  it('the sandbox answers for the synthetic persona: reverse name + text records, and forward from the name', async () => {
    const f = sandboxFetch();
    const c = new EnsConnector(egress(f));
    const [byAddress] = await c.search({ identifiers: [address(A1)] });
    expect(f.requested).toEqual([`http://sandbox-web/ens/reverse/${A1.toLowerCase()}.json`]); // no RPC call
    expect(byAddress).toMatchObject({ connectorId: 'ens', platform: 'ens.domains', origin: 'OWN_PROFILE', author: { handle: 'jtestowy' }, resourceId: 'ens:jtestowy.demo.eth', title: 'ENS jtestowy.demo.eth' });
    for (const line of ['ENS: jtestowy.demo.eth', `Adres: ${A1}`, 'com.github: jtestowy', 'com.twitter: @jtestowy_pl', 'email: jan.testowy@example.org', 'url: https://jtestowy.example.org']) expect(byAddress!.text, line).toContain(line);

    const [byName] = await c.search({ identifiers: [{ type: 'NICK', value: 'jtestowy.demo.eth', normalized: 'jtestowy.demo.eth' }] });
    expect(byName!.text).toContain(`Adres: ${A1}`);
  });

  it('the address of a synthetic persona the sandbox has no name for is NOT sent to the RPC: only fixtures answer', async () => {
    const f = sandboxFetch();
    const out = await new EnsConnector(egress(f)).search({ identifiers: [address(addresses.A0.address)] });
    expect(out).toEqual([]);
    expect(f.requested).toEqual([`http://sandbox-web/ens/reverse/${addresses.A0.address.toLowerCase()}.json`]);
    expect(f.requested.some((u) => u.includes('ethereum-rpc'))).toBe(false);
  });

  /** A fake Ethereum node: the registry, a resolver, and the records of `alice.eth` ↔ LIVE. */
  function node(opts: { reverseName?: string; forwardAddress?: string; texts?: Record<string, string> } = {}) {
    const REGISTRY = '0x00000000000c2e074ec69a0dfb2997ba6c7d2e1e';
    const RESOLVER = '0x4976fb03c32e5b8cfe2b6ccb31c09ba78ebaba41';
    const word = (hex: string) => `0x${hex.replace(/^0x/, '').padStart(64, '0')}`;
    const str = (s: string) => {
      const data = Buffer.from(s).toString('hex');
      return `0x${'20'.padStart(64, '0')}${s.length.toString(16).padStart(64, '0')}${data.padEnd(Math.ceil(data.length / 64) * 64 || 64, '0')}`;
    };
    const aliceNode = namehash('alice.eth');
    const revNode = reverseNode(LIVE);
    return vi.fn(async (_url: string, init?: RequestInit) => {
      const { params } = JSON.parse(String(init?.body)) as { params: [{ to: string; data: string }] };
      const { to, data } = params[0];
      const ok = (result: string) => json({ jsonrpc: '2.0', id: 1, result });
      if (to.toLowerCase() === REGISTRY) return ok(data === callResolver(revNode) || data === callResolver(aliceNode) ? word(RESOLVER) : word('0'));
      if (data === callName(revNode)) return ok(opts.reverseName ? str(opts.reverseName) : '0x');
      if (data.startsWith('0x3b3b57de')) return ok(opts.forwardAddress ? word(opts.forwardAddress) : word('0'));
      for (const [k, v] of Object.entries(opts.texts ?? {})) if (data === callText(aliceNode, k)) return ok(str(v));
      return json({ jsonrpc: '2.0', id: 1, error: { code: 3, message: 'execution reverted' } }); // no such record
    });
  }
  const live = (rpc: ReturnType<typeof node>) => new EnsConnector(egress((async (url: string, init?: RequestInit) => (String(url).includes('sandbox-web') ? new Response('nope', { status: 404 }) : rpc(String(url), init))) as unknown as typeof fetch));

  it('live: reverse record + forward check + text records through a public RPC (eth_call only), POSTed via the egress client', async () => {
    const rpc = node({ reverseName: 'alice.eth', forwardAddress: LIVE, texts: { 'com.github': 'alice-dev', email: 'alice@example.com' } });
    const [d] = await live(rpc).search({ identifiers: [address(LIVE)] });
    expect(d).toMatchObject({ url: 'https://app.ens.domains/alice.eth', author: { handle: 'alice-dev' }, platform: 'ens.domains' });
    expect(d!.text).toContain(`Adres: ${LIVE}`);
    expect(d!.text).toContain('com.github: alice-dev');
    expect(d!.text).not.toContain('com.twitter'); // empty records are left out
    const posts = rpc.mock.calls.map(([u, init]) => [u, init?.method, JSON.parse(String(init?.body)).method]);
    expect(posts.every((p) => p[0] === 'https://ethereum-rpc.publicnode.com' && p[1] === 'POST' && p[2] === 'eth_call')).toBe(true);
    expect(audits.filter((a) => a.host === 'ethereum-rpc.publicnode.com').every((a) => a.path === '/')).toBe(true); // path only, never the address or the call data
  });

  it('a reverse record that does not resolve back to the address is not believed (anyone can claim any name)', async () => {
    const other = '0x1111111111111111111111111111111111111111';
    expect(decodeAddress(`0x${'0'.repeat(24)}${other.slice(2)}`)).toBe(other);
    expect(await live(node({ reverseName: 'alice.eth', forwardAddress: other })).search({ identifiers: [address(LIVE)] })).toEqual([]);
    expect(await live(node({ reverseName: 'alice.eth' })).search({ identifiers: [address(LIVE)] })).toEqual([]); // the name does not resolve at all
    expect(await live(node({})).search({ identifiers: [address(LIVE)] })).toEqual([]); // no reverse record
  });

  it('only EVM addresses and .eth names are looked up; an HTTP error from the node is reported', async () => {
    const f = vi.fn();
    expect(await new EnsConnector(egress(f)).search({ identifiers: [address('TEonzwFMXhEWwoxNLdM13MBs99T9xAGZey'), { type: 'NICK', value: 'jtestowy', normalized: 'jtestowy' }, email('a@example.org')] })).toEqual([]);
    expect(f).not.toHaveBeenCalled();
    const down = new EnsConnector(egress((async (url: string) => (String(url).includes('sandbox-web') ? new Response('', { status: 404 }) : new Response('busy', { status: 503 }))) as unknown as typeof fetch));
    await expect(down.search({ identifiers: [address(LIVE)] })).rejects.toMatchObject({ note: { code: 'PROVIDER_HTTP', params: { provider: 'Ethereum RPC', status: 503 } } });
  });
});
