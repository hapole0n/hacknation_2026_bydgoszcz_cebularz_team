import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { classifyContext } from '@kropka/core';
import { TelegramConnector, parseTgPosts, parseTgProfile } from '../src/connectors/telegram.connector.js';
import { EgressClient, EgressConfig } from '../src/egress/egress.client.js';
import { repoPath } from '../src/paths.js';
import type { PrismaService } from '../src/prisma.service.js';
import { sandboxFetch } from './fixture-fetch.js';

const prisma = { auditLog: { create: async () => undefined } } as unknown as PrismaService;
const addresses = JSON.parse(readFileSync(repoPath('fixtures/addresses.json'), 'utf8'));
const T1: string = addresses.T1.address;
const BINANCE_14 = '0x28C6c06298d514Db089934071355E5743bf21d60';
const handle = (value: string) => ({ type: 'MESSENGER' as const, value, normalized: value.replace(/^@/, '').toLowerCase() });

function egress(fetchImpl: unknown) {
  const cfg = new EgressConfig();
  cfg.fetchImpl = fetchImpl as typeof fetch;
  cfg.allowlist = cfg.allowlist.map((h) => ({ ...h, rateLimitPerSec: undefined }));
  return new EgressClient(prisma, cfg);
}

afterEach(() => {
  delete process.env.TELEGRAM_LIVE;
});

describe('Telegram public pages: parsers', () => {
  it('reads the card of an account and ignores the generic "Contact @name" page', () => {
    const card = readFileSync(repoPath('fixtures/sandbox-web/tme/jtestowy_pl.html'), 'utf8');
    expect(parseTgProfile(card)).toEqual({ name: 'Jan Testowy', description: `OTC USDT w Lublinie. Rozliczenia na TRON: ${T1}` });
    expect(parseTgProfile('<html><head><meta property="og:title" content="Telegram: Contact @nobody_here"></head><body><div class="tgme_page_extra">@nobody_here</div></body></html>')).toBeNull();
  });

  it('reads the posts of a channel preview: id, text, time', () => {
    const page = readFileSync(repoPath('fixtures/sandbox-web/tme/s/krypto_lublin_chat.html'), 'utf8');
    const posts = parseTgPosts(page, 'krypto_lublin_chat');
    expect(posts.map((p) => [p.id, p.time])).toEqual([['58', '2026-11-06T09:30:00+00:00'], ['59', '2026-11-07T08:00:00+00:00']]);
    expect(posts[0]!.text).toContain(BINANCE_14);
    expect(parseTgPosts(page, 'some_other_channel')).toEqual([]);
  });
});

describe('Telegram connector', () => {
  const meta = { identifiers: ['MESSENGER'], policy: { method: 'public_page', rateLimitPerSec: 0.5 } };

  it('declares what it looks up and its terms', () => {
    expect(new TelegramConnector(egress(vi.fn()))).toMatchObject({ id: 'telegram_public', ...meta });
  });

  it('a synthetic handle is answered by the sandbox, never by t.me: the card, with the address of its bio', async () => {
    const f = sandboxFetch();
    const out = await new TelegramConnector(egress(f)).search({ identifiers: [handle('@jtestowy_pl')] });
    expect(f.requested.every((u) => u.startsWith('http://sandbox-web/'))).toBe(true);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ connectorId: 'telegram_public', platform: 't.me', origin: 'OWN_PROFILE', author: { handle: 'jtestowy_pl', name: 'Jan Testowy' }, via: ['MESSENGER:jtestowy_pl'] });
    expect(out[0]!.text).toContain(T1);
  });

  it('a synthetic channel: only the posts that carry an address are kept, each with its time and a context', async () => {
    const out = await new TelegramConnector(egress(sandboxFetch())).search({ identifiers: [handle('krypto_lublin_chat')] });
    expect(out.map((d) => d.resourceId)).toEqual(['telegram:post:krypto_lublin_chat/58']);
    expect(out[0]).toMatchObject({ origin: 'PUBLIC', publishedAt: '2026-11-06T09:30:00+00:00', author: { handle: 'krypto_lublin_chat' } });
    expect(out[0]!.text).toContain(BINANCE_14);
    expect(classifyContext(out[0]!.text).contextType).toBeDefined();
  });

  it('with live access off (the default) an unknown handle is skipped and says why: no request reaches t.me', async () => {
    const f = sandboxFetch();
    const skipped: [string, string][] = [];
    const out = await new TelegramConnector(egress(f)).search({ identifiers: [handle('some_real_person')], skip: (i, key) => skipped.push([i.normalized, key]) });
    expect(out).toEqual([]);
    expect(skipped).toEqual([['some_real_person', 'TELEGRAM_LIVE']]);
    expect(f.requested.every((u) => u.startsWith('http://sandbox-web/'))).toBe(true);
  });

  it('with TELEGRAM_LIVE=true it asks t.me for the card and the preview, nothing else; a missing account is an empty answer', async () => {
    process.env.TELEGRAM_LIVE = 'true';
    const seen: string[] = [];
    const f = vi.fn(async (url: string) => {
      seen.push(url);
      if (url.startsWith('http://sandbox-web/')) return new Response('', { status: 404 });
      return new Response('<html><head><meta property="og:title" content="Telegram: Contact @no_such_user"></head></html>', { status: 200 });
    });
    const out = await new TelegramConnector(egress(f)).search({ identifiers: [handle('no_such_user')] });
    expect(out).toEqual([]);
    expect(seen.filter((u) => u.startsWith('https://'))).toEqual(['https://t.me/no_such_user', 'https://t.me/s/no_such_user']);
  });

  it('a value that is not a Telegram username is not accepted', () => {
    const c = new TelegramConnector(egress(vi.fn()));
    expect(c.accepts(handle('jtestowy_pl'))).toBe(true);
    expect(c.accepts({ ...handle('x'), normalized: '+48 600 100 200' })).toBe(false);
    expect(c.accepts({ ...handle('x'), normalized: 'ab' })).toBe(false);
  });
});
