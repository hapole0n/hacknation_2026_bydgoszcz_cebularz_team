import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { classifyContext, type IdentifierType, normalizeIdentifier } from '@kropka/core';
import { AiService } from '../src/ai/ai.service.js';
import { EgressClient, EgressConfig } from '../src/egress/egress.client.js';
import type { PrismaService } from '../src/prisma.service.js';
import { readFileSync } from 'node:fs';
import { repoPath } from '../src/paths.js';
import { makeApp } from './harness.js';

const A1: string = JSON.parse(readFileSync(repoPath('fixtures/addresses.json'), 'utf8')).A1.address;
/** A page of the persona whose context carries no keyword at all (the demo pages all do), added to the sandbox index on the fly. */
const BLOG = { path: '/test/blog-rowerowy.html', platform: 'blog.example.pl', origin: 'PUBLIC', author: { handle: 'jtestowy' }, publishedAt: '2026-11-01', title: 'Blog rowerowy' };
const BLOG_HTML = `<html><head><title>Blog rowerowy</title></head><body><p>Moje trasy po Lubelszczyźnie, zdjęcia z wyprawy i trochę map: ${A1} to wszystko na dziś.</p></body></html>`;
const withBlog = (inner: typeof fetch) =>
  (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname === 'sandbox-web' && url.pathname === '/index.json') {
      const index = JSON.parse(await (await inner(input, init)).text());
      return new Response(JSON.stringify({ ...index, pages: [...index.pages, BLOG] }), { status: 200 });
    }
    if (url.hostname === 'sandbox-web' && url.pathname === BLOG.path) return new Response(BLOG_HTML, { status: 200 });
    return inner(input, init);
  }) as typeof fetch;

const audits: { host: string; path: string; status: number }[] = [];
const prisma = { auditLog: { create: async ({ data }: { data: (typeof audits)[number] }) => void audits.push(data) } } as unknown as PrismaService;
const chat = (content: string) => new Response(JSON.stringify({ choices: [{ message: { content } }] }), { status: 200 });

function service(fetchImpl: unknown) {
  const cfg = new EgressConfig();
  cfg.fetchImpl = fetchImpl as typeof fetch;
  audits.length = 0;
  return new AiService(new EgressClient(prisma, cfg));
}

afterEach(() => {
  for (const k of ['AI_ENABLED', 'AI_MODEL', 'AI_BASE_URL']) delete process.env[k];
});

describe('AiService (OpenAI-compatible local model, mocked)', () => {
  it('is off by default', () => {
    expect(service(vi.fn()).enabled()).toBe(false);
    process.env.AI_ENABLED = 'true';
    expect(service(vi.fn()).enabled()).toBe(true);
  });

  it('asks the configured model at the configured base URL (chat/completions, temperature 0) and accepts only a known context type', async () => {
    process.env.AI_MODEL = 'bielik-4.5b-q4';
    process.env.AI_BASE_URL = 'http://ollama:11434/v1/';
    const f = vi.fn(async () => chat(' p2p.\n'));
    const s = await service(f).suggestContext('Odbiór osobisty, Lublin');
    expect(s).toEqual({ contextType: 'P2P', model: 'bielik-4.5b-q4' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://ollama:11434/v1/chat/completions');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ model: 'bielik-4.5b-q4', temperature: 0, messages: [{ role: 'system' }, { role: 'user', content: 'Odbiór osobisty, Lublin' }] });
    expect(JSON.stringify(audits)).not.toContain('Lublin'); // the text never reaches the audit log

    expect(await service(async () => chat('I think this is a recipe')).suggestContext('x')).toBeNull(); // not a type
    expect(await service(async () => chat('')).suggestContext('x')).toBeNull();
  });

  it('cannot be reached or misconfigured: a clear AI_UNAVAILABLE note, not a crash', async () => {
    await expect(service(vi.fn()).suggestContext('x')).rejects.toMatchObject({ note: { code: 'AI_UNAVAILABLE', params: { detail: 'AI_MODEL' } } });
    process.env.AI_MODEL = 'm';
    await expect(service(async () => Promise.reject(new Error('connect ECONNREFUSED 127.0.0.1:11434'))).suggestContext('x')).rejects.toMatchObject({ note: { code: 'AI_UNAVAILABLE' } });
    await expect(service(async () => new Response('no', { status: 503 })).suggestContext('x')).rejects.toMatchObject({ note: { code: 'AI_UNAVAILABLE', params: { detail: 'HTTP 503' } } });
    process.env.AI_BASE_URL = 'https://api.openai.example/v1'; // a cloud host is not on the allowlist: blocked, never called
    const f = vi.fn();
    await expect(service(f).suggestContext('x')).rejects.toMatchObject({ note: { code: 'AI_UNAVAILABLE' } });
    expect(f).not.toHaveBeenCalled();
  });
});

describe('the run with the local model (pipeline)', () => {
  const { prisma: db, cfg, pipeline, api } = makeApp();
  const caseIds: string[] = [];
  const demo = [{ type: 'NICK', value: 'jtestowy' }, { type: 'EMAIL', value: 'jan.testowy@example.org' }, { type: 'MESSENGER', value: '@jtestowy_pl' }] as const;
  const options = { connectors: ['sandbox'], chain: 'off' as const, asOf: new Date('2026-11-21T12:00:00Z') };
  const score = (r: Awaited<ReturnType<typeof pipeline.run>>) => r.links.map((l) => [`${l.identifier.type as IdentifierType}:${normalizeIdentifier(l.identifier.type as IdentifierType, l.identifier.value)}`, l.address.address, l.score] as const).sort().join('|');

  afterAll(async () => {
    for (const id of caseIds) {
      await db.case.delete({ where: { id } });
      await db.auditLog.deleteMany({ where: { caseId: id } });
    }
    await db.$disconnect();
  });

  it('suggests a type where the keywords found none, marks the model, and changes no score, no context, no source type', async () => {
    const created = await api.createCase({ title: 'AI test', identifiers: demo });
    caseIds.push(created.id);
    const original = cfg.fetchImpl;
    cfg.fetchImpl = withBlog(original);
    const plain = await pipeline.run(created.id, options); // AI off: nothing is asked

    process.env.AI_ENABLED = 'true';
    process.env.AI_MODEL = 'test-model';
    const asked: string[] = [];
    const before = cfg.fetchImpl; // sandbox + the blog page
    cfg.fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      if (url.hostname !== 'localhost') return before(input, init);
      asked.push(JSON.parse(String(init?.body)).messages[1].content);
      return chat('SALE');
    }) as typeof fetch;
    try {
      const withAi = await pipeline.run(created.id, options);
      const unsure = plain.traces.filter((t) => classifyContext(t.contextSnippet).fallback);
      expect(unsure.map((t) => t.address)).toEqual([A1]); // only the blog page has a context without any keyword
      expect(asked.sort()).toEqual(unsure.map((t) => t.contextSnippet).sort());
      const suggestions = withAi.evidence.flatMap((e) => (e.metaJson as { aiSuggestions: { address: string; contextType: string; model: string }[] }).aiSuggestions);
      expect(suggestions).toHaveLength(unsure.length);
      expect(suggestions.every((s) => s.contextType === 'SALE' && s.model === 'test-model')).toBe(true);
      // the suggestion is advice: contexts, source types and scores are those of the rules
      expect(score(withAi)).toBe(score(plain));
      const contexts = (r: typeof plain) => r.traces.map((t) => `${t.address}|${t.contextSnippet}|${t.contextType}`).sort();
      const sources = (r: typeof plain) => r.evidence.map((e) => `${e.url}|${e.sourceType}`).sort();
      expect(contexts(withAi)).toEqual(contexts(plain));
      expect(sources(withAi)).toEqual(sources(plain));
      expect(plain.evidence.every((e) => (e.metaJson as { aiSuggestions: unknown[] }).aiSuggestions.length === 0)).toBe(true);

      // the model goes down: the run still finishes, once, with a note
      cfg.fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
        if (new URL(typeof input === 'string' || input instanceof URL ? input : input.url).hostname === 'localhost') throw new Error('connect ECONNREFUSED');
        return before(input, init);
      }) as typeof fetch;
      const down = await pipeline.run(created.id, options);
      const notes = (down.run.summaryJson as { connectorNotes: { connector: string; note: { code: string } }[] }).connectorNotes;
      expect(down.run.status).toBe('DONE');
      expect(notes).toEqual([expect.objectContaining({ connector: 'ai', note: expect.objectContaining({ code: 'AI_UNAVAILABLE' }) })]);
      expect(score(down)).toBe(score(plain));
    } finally {
      cfg.fetchImpl = original;
    }
  });
});
