import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  ADDRESS_CATEGORIES,
  IDENTIFIER_TYPES,
  analyseHistory,
  exclusionForCategory,
  extractAddresses,
  normalizeIdentifier,
  parseAddress,
  valueTransfer,
  type AddressCategory,
  type ChainTransfer,
  type IdentifierType,
  type SearchLogEntry,
} from '@kropka/core';
import { parseCaseBody, parseScheduleBody } from '../src/api.controller.js';
import type { ChainAdapter } from '../src/chains/chain-adapter.js';
import { EgressBlockedError } from '../src/egress/egress.client.js';
import { isReservedEmailDomain } from '../src/connectors/gravatar.connector.js';
import { SchedulerService } from '../src/schedule/scheduler.service.js';
import type { EvidenceDraft, SourceConnector } from '../src/connectors/connector.js';
import { repoPath } from '../src/paths.js';
import { makeApp } from './harness.js';

/**
 * Acceptance tests mapped to the requirements of the task (docs/OLCyS_zadanie.pdf) — ONE test per requirement, named `Z-nn`.
 * The table "wymaganie → miejsce realizacji → test → status" is docs/ZGODNOSC.md; the ids are the same.
 * Synthetic data only (fixtures/); no internet (sandbox from disk, synthetic NBP rates). Needs the local Postgres.
 * Deeper variants of several requirements live in the other test files; ZGODNOSC.md names them.
 */
const spec = JSON.parse(readFileSync(repoPath('fixtures/expected.json'), 'utf8'));
const synthetic: Record<string, { chain: string; address: string }> = JSON.parse(readFileSync(repoPath('fixtures/addresses.json'), 'utf8'));
delete (synthetic as Record<string, unknown>)._comment;
const addr = (name: string): string => synthetic[name]?.address ?? spec.realAddresses[name];
const key = (type: IdentifierType, value: string) => `${type}:${normalizeIdentifier(type, value)}`;

const app = makeApp();
const { prisma, cfg, fetched, egress, registry, chains, pipeline, reports, scheduler, world, api } = app;
const runOptions = { connectors: spec.run.connectors, chain: spec.run.chain, asOf: new Date(spec.run.asOf) };
type Results = Awaited<ReturnType<typeof pipeline.results>>;
const ruleIds = (l: { breakdownJson: unknown }) => (l.breakdownJson as { ruleId: string }[]).map((e) => e.ruleId);
const indicators = (r: Results, name: string) => r.chain.find((c) => c.address.address === addr(name))!.indicators as unknown as { tags: string[]; cashOut: { detected: boolean; patterns: string[] }; swaps: unknown[]; thresholds: { eur: number; cumulativeCrossedAt: string | null }[] };
const filesUnder = (dir: string) => (readdirSync(repoPath(dir), { recursive: true }) as string[]).map((f) => join(repoPath(dir), f)).filter((f) => statSync(f).isFile());
const searchLog = (r: Results) => (r.run.summaryJson as { searches: SearchLogEntry[] }).searches;

const caseIds: string[] = [];
const newCase = async (title: string, identifiers: { type: string; value: string }[]) => {
  const c = await api.createCase({ title, identifiers });
  caseIds.push(c.id);
  return c;
};

let demo: Results; // the demo case of expected.json, run once
let first: Results; // the same case before and after the address on the persona's site changes (Z-05, Z-06, Z-14)
let second: Results;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    throw new Error(`Postgres is not reachable — start it with "docker compose up -d db" and run the migrations. (${(e as Error).message})`);
  }
  demo = await pipeline.run((await newCase(spec.case.title, spec.case.identifiers)).id, runOptions);
  const monitored = await newCase('Test — zmiany w czasie', spec.case.identifiers);
  world.version = 1;
  first = await pipeline.run(monitored.id, runOptions);
  world.version = 2; // the persona's page now shows another address (same URL)
  second = await pipeline.run(monitored.id, runOptions);
  world.version = 1;
});

afterAll(async () => {
  for (const id of caseIds) {
    await prisma.case.delete({ where: { id } });
    await prisma.auditLog.deleteMany({ where: { caseId: id } });
  }
  const own = [...Object.values(synthetic).map((a) => a.address), ...Object.values<string>(spec.realAddresses), PLUGIN_ADDRESS];
  await prisma.address.deleteMany({ where: { address: { in: own }, links: { none: {} }, snapshots: { none: {} } } });
  await prisma.$disconnect();
});

// ───────────────────────── section 2 of the task: the challenge ─────────────────────────

describe('Z-01…Z-08 — what the tool must do (task section 2)', () => {
  it('Z-01 input: at least one identifier — name, nick, messenger ID, social login, e-mail, crypto address — each type works alone', async () => {
    const samples: Record<IdentifierType, string> = { NAME: 'Jan Testowy', NICK: 'jtestowy', MESSENGER: '@jtestowy_pl', SOCIAL_LOGIN: 'kantor_usdt_lublin', EMAIL: 'jan.testowy@example.org', ADDRESS: addr('A1') };
    expect(Object.keys(samples).sort()).toEqual([...IDENTIFIER_TYPES].sort()); // exactly the six kinds of the task
    for (const type of IDENTIFIER_TYPES) {
      const r = await pipeline.run((await newCase(`Test — ${type}`, [{ type, value: samples[type] }])).id, runOptions);
      expect(r.run.status, type).toBe('DONE');
      const log = searchLog(r).find((l) => l.round === 1 && l.identifier?.type === type);
      expect(log?.outcome, `${type} was searched`).toBe('FOUND'); // the sandbox knows each of them
    }
    expect(() => parseCaseBody({ title: 'x', identifiers: [] })).toThrow(); // zero identifiers are refused
    expect(() => parseCaseBody({ title: 'x', identifiers: [{ type: 'PHONE', value: '1' }] })).toThrow();
  });

  it('Z-02 automatic search of public Web2 sources: forums, developer services, P2P ads, messengers, social profiles; every source declares its policy', () => {
    const platforms = new Set(demo.evidence.map((e) => (e.metaJson as { platform: string }).platform));
    expect(demo.evidence.length).toBe(spec.counts.evidence);
    expect(platforms.size).toBeGreaterThanOrEqual(9); // personal site, GitHub-like, e-mail archive, forum ×2, P2P ad, messenger, social ×3 …
    const sources = api.connectors();
    expect(sources.map((c) => c.id)).toEqual(expect.arrayContaining(['ens', 'github', 'gravatar', 'sandbox', 'telegram_public', 'wayback']));
    for (const c of sources) expect(c.policy, c.id).toMatchObject({ tosUrl: expect.stringMatching(/^https?:\/\//), method: expect.stringMatching(/^(official_api|public_page|synthetic)$/), rateLimitPerSec: expect.any(Number), weightHint: expect.any(Number) });
  });

  it('Z-03 only public information: every outbound request goes through the allowlist; an unlisted host is blocked and logged; no source needs a login', async () => {
    expect(fetched.requested.every((u) => /^https?:\/\/(sandbox-web|api\.nbp\.pl)\//.test(u))).toBe(true); // the demo run touched nothing else
    await expect(egress.get('https://example.com/private', { connectorId: 'test', caseId: caseIds[0] })).rejects.toBeInstanceOf(EgressBlockedError);
    expect(await prisma.auditLog.count({ where: { caseId: caseIds[0], host: 'example.com', status: 0 } })).toBe(1);
    expect(cfg.allowlist.every((h) => h.host !== '*')).toBe(true);
    expect(api.connectors().every((c) => c.policy.method !== ('login' as string))).toBe(true); // methods: official API, public page, synthetic — never an account
  });

  it('Z-04 cyclic analyses: a case has a stored schedule (15 min / 1 h / 24 h); a due case is re-run by the scheduler with the options of its last run', async () => {
    const c = await newCase('Test — monitoring', spec.case.identifiers);
    await pipeline.run(c.id, { connectors: ['sandbox'], chain: 'off' });
    const t0 = new Date('2026-11-21T12:00:00Z');
    await scheduler.setSchedule(c.id, 15, t0);
    const restarted = new SchedulerService(prisma, pipeline); // a new process: the schedule is in the database
    expect(await restarted.tick(new Date(t0.getTime() + 14 * 60_000), [c.id])).toEqual([]);
    expect(await restarted.tick(new Date(t0.getTime() + 16 * 60_000), [c.id])).toEqual([c.id]);
    expect((await prisma.run.findMany({ where: { caseId: c.id }, orderBy: { startedAt: 'asc' } })).map((r) => r.trigger)).toEqual(['manual', 'scheduled']);
    expect(() => parseScheduleBody({ everyMinutes: 7 })).toThrow(); // only the three intervals (or off)
  });

  it('Z-05 results of subsequent analyses are saved: both runs of one case stay retrievable, each with its own data', async () => {
    const kase = await api.getCase(second.run.caseId);
    expect(kase.runs.map((r) => r.id).sort()).toEqual([first.run.id, second.run.id].sort());
    const a1 = await pipeline.results(first.run.id);
    const a2 = await pipeline.results(second.run.id);
    expect(a1.links.some((l) => l.address.address === addr('A2'))).toBe(false); // the first run does not know the new address …
    expect(a2.links.some((l) => l.address.address === addr('A2'))).toBe(true); // … the second does
    expect(await prisma.run.count({ where: { id: { in: [first.run.id, second.run.id] }, status: 'DONE' } })).toBe(2);
  });

  it('Z-06 comparison of results: the diff of a run against the previous one lists new / gone addresses, score changes with their rules, new transactions and thresholds', async () => {
    const { diff } = await api.runDiff(second.run.id);
    expect(diff).toMatchObject({ fromRunId: first.run.id, toRunId: second.run.id, empty: false });
    expect(diff!.addresses.added.map((a) => a.address)).toEqual([addr('A2')]);
    expect(diff!.scoreChanges.length).toBeGreaterThan(0);
    expect(diff!.scoreChanges[0]!.rules.length).toBeGreaterThan(0);
    expect(diff!.newTransactions.length + diff!.newThresholds.length).toBeGreaterThan(0);
    expect((await api.runDiff(first.run.id)).diff).toBeNull(); // the first run has nothing to compare with
  });

  it('Z-07 extensible: a NEW source and a NEW blockchain data source plug in through the interfaces, with no change to the pipeline', async () => {
    const plugin: SourceConnector = {
      id: 'plugin_demo',
      kind: 'web2',
      version: '0.0.1',
      policy: { tosUrl: 'https://example.org/terms', method: 'synthetic', rateLimitPerSec: 1, weightHint: 1 },
      identifiers: ['NICK'],
      async search({ identifiers }) {
        const text = `Wpłaty BTC na: ${addr('B1')} — pozdrawiam, plugin_nick`;
        return identifiers.map((i): EvidenceDraft => ({ connectorId: 'plugin_demo', url: 'https://plugin.example/post/1', fetchedAt: new Date(), sha256: createHash('sha256').update(text).digest('hex'), text, platform: 'plugin.example', origin: 'PUBLIC', author: { handle: i.normalized } }));
      },
    };
    registry.register(plugin);
    const viaPlugin = await pipeline.run((await newCase('Test — wtyczka źródła', [{ type: 'NICK', value: 'plugin_nick' }])).id, { connectors: ['plugin_demo'], chain: 'off' });
    expect(viaPlugin.evidence.map((e) => e.connectorId)).toEqual(['plugin_demo']);
    expect(viaPlugin.links.map((l) => l.address.address)).toEqual([addr('B1')]);
    expect(api.connectors().map((c) => c.id)).toContain('plugin_demo');

    const adapter: ChainAdapter = {
      id: 'plugin_chain',
      live: false,
      supports: (chain) => chain === 'ETH',
      unavailableReason: () => undefined,
      history: async (chain, address) => ({ chain, address, provider: 'plugin_chain', fetchedAt: new Date().toISOString(), isContract: false, transfers: [{ tx: '0xplugin', time: '2026-11-01T10:00:00Z', from: PLUGIN_COUNTERPARTY, to: address, asset: 'ETH', amount: 1, usdPrice: 2000 }] }),
    };
    chains.register(adapter);
    const viaChain = await pipeline.run((await newCase('Test — wtyczka sieci', [{ type: 'ADDRESS', value: PLUGIN_ADDRESS }])).id, runOptions);
    expect(viaChain.chain.map((c) => [c.address.address, c.provider])).toEqual([[PLUGIN_ADDRESS, 'plugin_chain']]);
    expect(api.chainAdapters().map((a) => a.id)).toContain('plugin_chain');
  });

  it('Z-08 readable presentation: a plain-language report (summary, legend, glossary, sections) in HTML data, PDF and JSON, for people without IT knowledge', async () => {
    const { doc } = await api.report(demo.run.id);
    expect(doc.summary).toHaveLength(5);
    expect(doc.legend.map((l) => l.kind)).toEqual(['FAKT', 'OBLICZENIE', 'WNIOSEK']);
    expect(doc.glossary.length).toBeGreaterThan(5);
    expect(doc.sections.map((s) => s.title)).toContain('Powiązane adresy i Wskaźnik Pewności');
    expect((await reports.file(demo.run.id, 'PDF')).content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(JSON.parse((await reports.file(demo.run.id, 'JSON')).content.toString('utf8')).doc.sections).toHaveLength(12);
  });
});

const PLUGIN_ADDRESS = '0x1111111111111111111111111111111111111111'; // an arbitrary synthetic number
const PLUGIN_COUNTERPARTY = '0x2222222222222222222222222222222222222222';

// ───────────────────────── section 3: mandatory criteria ─────────────────────────

describe('Z-09…Z-14 — mandatory and optional criteria (task section 3)', () => {
  it('Z-09 links OSINT traces to crypto addresses, on the basis of what open sources say', () => {
    const link = demo.links.find((l) => key(l.identifier.type as IdentifierType, l.identifier.value) === 'NICK:jtestowy' && l.address.address === addr('A1'))!;
    expect(link).toBeDefined();
    const evidenceIds = new Set((link.breakdownJson as { evidenceIds: string[] }[]).flatMap((b) => b.evidenceIds));
    expect(evidenceIds.size).toBeGreaterThanOrEqual(2);
    for (const e of demo.evidence.filter((e) => evidenceIds.has(e.id))) expect(demo.traces.some((t) => t.evidenceId === e.id && t.address === addr('A1'))).toBe(true); // a real trace on a real page
  });

  it('Z-10 categorises the links and computes a Confidence Score with OUR algorithm: versioned rules, bands, rule-by-rule breakdown that adds up', () => {
    const version = /^version:\s*"([^"]+)"/m.exec(readFileSync(repoPath('config/scoring-rules.v1.yaml'), 'utf8'))![1];
    expect(demo.run.rulesVersion).toBe(version);
    expect(new Set(demo.links.map((l) => l.band))).toEqual(new Set(['VERY_HIGH', 'MEDIUM', 'LOW', 'EXCLUDED']));
    for (const l of demo.links) {
      expect(l.score).toBeGreaterThanOrEqual(0);
      expect(l.score).toBeLessThanOrEqual(100);
      expect((ADDRESS_CATEGORIES as readonly string[]).includes(l.address.category)).toBe(true);
      expect((l.breakdownJson as { delta: number }[]).reduce((s, b) => s + b.delta, 0)).toBe(l.score);
    }
    expect(new Set(demo.links.map((l) => l.address.category)).size).toBeGreaterThanOrEqual(5); // UNHOSTED, CEX_CUSTODIAL, DEX, CHARITY, CASP_KANTOR, …
  });

  it('Z-11 recognises, validates and extracts BTC, ETH, TRON and ENS addresses from published text (and refuses look-alikes)', () => {
    const { addresses, rejected } = extractAddresses(
      `Wpłaty: ETH ${addr('A1')}, USDT TRC20 ${addr('T1')}, BTC ${addr('B1')}, ENS jtestowy.eth. Tx: 0x${'ab'.repeat(32)}. Zepsuty: ${addr('A1').slice(0, -1)}${addr('A1').endsWith('a') ? 'b' : 'a'}`,
    );
    expect(addresses.map((a) => a.kind).sort()).toEqual(['BTC_P2PKH', 'ENS', 'ETH', 'TRON']);
    for (const a of addresses.filter((a) => a.kind !== 'ENS')) expect(parseAddress(a.address).ok).toBe(true);
    expect(rejected.length).toBeGreaterThanOrEqual(1); // the transaction hash is not an address
    expect(extractAddresses('Zwykły tekst o kryptowalutach, bez żadnego adresu.').addresses).toEqual([]);
  });

  it('Z-12 fiat cash-out indicators: P2P ad, kantor, payment gateway, crypto card, large stablecoin swap', () => {
    // P2P ad + kantor (fixture persona T1) and a big swap into a stablecoin (persona A1)
    expect(indicators(demo, 'T1')).toMatchObject({ cashOut: { detected: true } });
    expect(indicators(demo, 'T1').tags).toEqual(expect.arrayContaining(['USDT_TO_CASH', 'TO_AD_ADDRESS', 'TO_KANTOR']));
    expect(indicators(demo, 'A1').tags).toEqual(expect.arrayContaining(['SWAP_DEX', 'STABLECOIN_CONVERSION', 'TO_CEX_DEPOSIT', 'OVER_10000_EUR']));
    // payment gateway and crypto-card issuer: synthetic categories, so the indicators are exercised on a synthetic history
    const fx = { usdPln: 4, eurPln: 4, usdDate: '2026-01-01', eurDate: '2026-01-01' };
    const [GATEWAY, CARD] = [PLUGIN_COUNTERPARTY, '0x3333333333333333333333333333333333333333'];
    const out = (tx: string, to: string, amount: number): ChainTransfer => valueTransfer({ tx, time: '2026-10-01T10:00:00Z', from: PLUGIN_ADDRESS, to, asset: 'USDT', amount }, fx);
    const cat = (a: string) => ({ category: (a === GATEWAY ? 'PAYMENT_GATEWAY' : a === CARD ? 'CRYPTO_CARD' : undefined) as AddressCategory | undefined });
    const { indicators: i } = analyseHistory({ chain: 'ETH', address: PLUGIN_ADDRESS, transfers: [out('g', GATEWAY, 500), out('c', CARD, 700)], categoryOf: cat });
    expect(i.tags).toEqual(expect.arrayContaining(['TO_GATEWAY', 'TO_CARD', 'USDT_TO_CASH']));
    expect(i.cashOut.detected).toBe(true);
  });

  it('Z-13 rejects addresses that must not be attributed to a person: exchanges, custodial / deposit addresses, contracts, institutional, mixers, examples, services', () => {
    const rejected: Record<string, string> = { BINANCE_14: 'EXCL_CEX', UNISWAP_V2_ROUTER: 'EXCL_CONTRACT', UKRAINE_DONATION: 'EXCL_CHARITY', K1: 'EXCL_SERVICE' };
    for (const [name, rule] of Object.entries(rejected)) {
      const links = demo.links.filter((l) => l.address.address === addr(name));
      expect(links.length, name).toBeGreaterThan(0);
      expect(links.every((l) => l.score === 0 && l.band === 'EXCLUDED' && l.excludedReason === rule), name).toBe(true);
    }
    expect(demo.chain.find((c) => c.address.address === addr('D1')) ?? null).toBeNull(); // D1 was not on a page, so it only shows as a counterparty …
    expect(JSON.stringify(demo.chain.find((c) => c.address.address === addr('A1'))!.flows)).toContain(addr('D1')); // … of A1's flows, classified as an exchange deposit address
    // the remaining categories map to their exclusion rule (mixer, example/burn, …); the real-address proof is real-addresses.test.ts
    expect(exclusionForCategory('MIXER')).toBe('EXCL_MIXER');
    expect(exclusionForCategory('EXAMPLE_BURN')).toBe('EXCL_EXAMPLE');
    expect(exclusionForCategory('CEX_DEPOSIT')).toBe('EXCL_CUSTODIAL_DEPOSIT');
    expect(exclusionForCategory('UNHOSTED')).toBeUndefined(); // a personal wallet is the one thing that is NOT rejected
  });

  it('Z-14 (optional) change over time: the address published on the same page changed — the swap is detected and the old and new address are named', async () => {
    const { diff } = await api.runDiff(second.run.id);
    const swap = diff!.sourceChanges.find((s) => s.kind === 'swap')!;
    expect(swap.url).toBe(`http://sandbox-web${spec.addressChange.url}`);
    expect(swap.from).toEqual([{ chain: 'ETH', address: addr('A1') }]);
    expect(swap.to).toEqual([{ chain: 'ETH', address: addr('A2') }]);
    expect((await api.notifications('200')).items.some((n) => n.runId === second.run.id && n.kind === 'ADDRESS_CHANGED')).toBe(true);
  });
});

// ───────────────────────── acceptance criteria of the task (section 3, last list) ─────────────────────────

describe('Z-15…Z-20 — acceptance criteria (task section 3)', () => {
  it('Z-15 finds the crypto addresses correctly: exactly the addresses on the synthetic pages, nothing else', () => {
    const expected = new Set<string>(spec.links.map((l: { address: string }) => addr(l.address)));
    expect(new Set(demo.traces.map((t) => t.address))).toEqual(expected);
  });

  it('Z-16 combines information from different sources: the same address on independent services earns the synergy bonus; repeats on one service do not', () => {
    const a1 = demo.links.find((l) => l.identifier.value === 'jtestowy' && l.address.address === addr('A1'))!;
    expect(ruleIds(a1)).toContain('SYNERGY_INDEPENDENT_SOURCES');
    const evidenceIds = new Set((a1.breakdownJson as { evidenceIds: string[] }[]).flatMap((b) => b.evidenceIds));
    const platforms = new Set(demo.evidence.filter((e) => evidenceIds.has(e.id)).map((e) => (e.metaJson as { platform: string }).platform));
    expect(platforms.size).toBeGreaterThanOrEqual(2);
    const single = demo.links.find((l) => l.identifier.value === 'jtestowy' && l.address.address === addr('A0'))!; // the old address: one page only
    expect(ruleIds(single)).not.toContain('SYNERGY_INDEPENDENT_SOURCES');
  });

  it('Z-17 computes the score according to the adopted algorithm: every expected link has exactly the expected score, band and rules (fixtures/expected.json)', () => {
    expect(demo.links).toHaveLength(spec.counts.links);
    for (const exp of spec.links) {
      const l = demo.links.find((x) => key(x.identifier.type as IdentifierType, x.identifier.value) === exp.identifier && x.address.address === addr(exp.address))!;
      expect([l.score, l.band, ruleIds(l)], `${exp.identifier} → ${exp.address}`).toEqual([exp.score, exp.band, exp.rules]);
    }
  });

  it('Z-18 presents the sources and premises behind every link: reasons in PL/EN, the pages they come from, and a hint what would change the score', async () => {
    const evidenceById = new Map(demo.evidence.map((e) => [e.id, e]));
    for (const l of demo.links.filter((l) => !l.excludedReason)) {
      const base = (l.breakdownJson as { reasonPl: string; reasonEn: string; evidenceIds: string[] }[])[0]!;
      expect(base.reasonPl && base.reasonEn).toBeTruthy();
      expect(base.evidenceIds.length).toBeGreaterThan(0);
      for (const id of base.evidenceIds) expect(evidenceById.get(id)!.url).toMatch(/^http:\/\/sandbox-web\//);
    }
    expect(demo.links.find((l) => l.address.address === addr('B1'))!.hintsJson).toHaveLength(1); // "a second independent source would add 15 pp"
    const { doc } = await api.report(demo.run.id);
    const sources = JSON.stringify(doc.sections.find((s) => s.id === 'sources'));
    for (const e of demo.evidence) expect(sources).toContain(e.url);
  });

  it('Z-19 detects the selected blockchain activity patterns: ETH → DEX swap → USDT → exchange deposit; USDT in → kantor / ad address (USDT → cash); thresholds crossed on known dates', () => {
    const a1 = spec.chain.indicators.A1;
    const t1 = spec.chain.indicators.T1;
    expect(indicators(demo, 'A1').tags).toEqual(a1.tags);
    expect(indicators(demo, 'A1').swaps).toHaveLength(a1.swaps.length);
    expect(indicators(demo, 'T1').tags).toEqual(t1.tags);
    expect(indicators(demo, 'T1').thresholds.map((t) => [t.eur, t.cumulativeCrossedAt])).toEqual([[1000, t1.thresholds['1000'].cumulative], [10000, t1.thresholds['10000'].cumulative], [15000, t1.thresholds['15000'].cumulative]]);
  });

  it('Z-20 stores every result with its source, URL, time and the metadata needed to reproduce and verify it — and the same input gives the same result', async () => {
    for (const e of demo.evidence) {
      const content = readFileSync(repoPath(`fixtures/sandbox-web${new URL(e.url!).pathname}`), 'utf8');
      expect(e.sha256).toBe(createHash('sha256').update(content).digest('hex')); // the hash of the real page content
      expect(e.fetchedAt).toBeInstanceOf(Date);
      expect(e.connectorId).toBe('sandbox');
      expect(e.snippet.length).toBeGreaterThan(0);
    }
    expect(demo.run).toMatchObject({ rulesVersion: spec.run.rulesVersion, appVersion: expect.any(String), paramsJson: { connectors: ['sandbox'], chain: 'fixture' }, startedAt: expect.any(Date), finishedAt: expect.any(Date) });
    const again = await pipeline.run(demo.run.caseId, runOptions);
    const brief = (r: Results) => r.links.map((l) => [l.identifier.value, l.address.address, l.score, ruleIds(l).join()]).sort();
    expect(brief(again)).toEqual(brief(demo));
    expect((await api.report(again.run.id)).evidenceSha256).toBe((await api.report(demo.run.id)).evidenceSha256);
  });
});

// ───────────────────────── sections 5–7: technical, scenario, report, OSINT ─────────────────────────

describe('Z-21…Z-28 — technical requirements (task section 5)', () => {
  const read = (p: string) => readFileSync(repoPath(p), 'utf8');
  const deps = (p: string) => Object.keys({ ...JSON.parse(read(p)).dependencies, ...JSON.parse(read(p)).devDependencies });

  it('Z-21 licences of the Open Source components are documented: every dependency of every workspace package, every label list and the fonts are in LICENSES.md; no strong copyleft', () => {
    const licenses = read('LICENSES.md');
    const names = new Set(['package.json', 'apps/api/package.json', 'apps/web/package.json', 'packages/core/package.json'].flatMap(deps).filter((n) => !n.startsWith('@kropka/')));
    expect(names.size).toBeGreaterThan(30);
    for (const n of names) expect(licenses, `${n} is in LICENSES.md (run pnpm licenses:report)`).toContain(`| ${n} |`);
    const npmRows = licenses.slice(licenses.indexOf('## Pakiety npm')).split('\n').filter((l) => /^\| [^|]+ \| [^|]+ \| [^|]+ \|/.test(l)).slice(1); // without the header row
    expect(npmRows.length).toBeGreaterThan(500);
    for (const row of npmRows) expect(row.split('|')[3]!.trim(), row).toMatch(/^[^\s]+.*$/); // every package has a licence …
    expect(npmRows.filter((r) => /\|\s*\(?(A?GPL|SSPL|UNKNOWN|UNLICENSED|SEE LICENSE)/i.test(r.split('|')[3]!))).toEqual([]); // … and none is strong copyleft or unknown
    for (const s of app.labels.sources) expect(licenses, s.file).toContain(`\`${s.file}\``);
    for (const font of ['Roboto', 'IBM Plex Sans', 'Source Serif 4']) expect(licenses, font).toContain(font);
  });

  it('Z-22 stack: Node.js + TypeScript backend (NestJS), React front-end, PostgreSQL', () => {
    expect(deps('apps/api/package.json')).toEqual(expect.arrayContaining(['@nestjs/core', '@prisma/client']));
    expect(deps('apps/web/package.json')).toEqual(expect.arrayContaining(['react', 'react-dom', 'vite']));
    expect(read('apps/api/prisma/schema.prisma')).toMatch(/provider\s*=\s*"postgresql"/);
    expect(read('docker-compose.yml')).toMatch(/image:\s*postgres:16/);
    expect(read('tsconfig.base.json')).toMatch(/"strict":\s*true/);
  });

  it('Z-23 AI is optional, local, off by default and swappable through a universal (OpenAI-compatible) API: only base URL and model name are configuration', async () => {
    expect(app.ai.enabled()).toBe(false); // off without AI_ENABLED
    const env = read('.env.example');
    expect(env).toMatch(/AI_ENABLED=false/);
    expect(env).toMatch(/AI_BASE_URL=/);
    expect(env).toMatch(/AI_MODEL=/);
    expect(read('apps/api/src/ai/ai.service.ts')).toContain('/chat/completions'); // the OpenAI-compatible endpoint (Ollama, vLLM, LM Studio …)
    expect(deps('apps/api/package.json').filter((d) => /openai|anthropic|langchain|google|cohere/i.test(d))).toEqual([]); // no vendor SDK
  });

  it('Z-24 no unapproved external services: the allowlist is the only way out, the web app loads nothing from a CDN and carries no telemetry', () => {
    const webFiles = [...filesUnder('apps/web/src'), repoPath('apps/web/index.html')];
    for (const f of webFiles.filter((f) => /\.(html|css|tsx?)$/.test(f) && !f.includes('.test.'))) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/<(script|link)[^>]+(src|href)=["']https?:/i); // no remote script / stylesheet / font
      expect(text, f).not.toMatch(/@import\s+url\(["']?https?:/i);
      expect(text, f).not.toMatch(/fonts\.(googleapis|gstatic)\.com|cdn\.|unpkg\.com|jsdelivr/i);
    }
    expect([...deps('apps/web/package.json'), ...deps('apps/api/package.json')].filter((d) => /sentry|analytics|posthog|mixpanel|segment|gtag|datadog|newrelic|amplitude|hotjar|bugsnag|logrocket/i.test(d))).toEqual([]);
    expect(cfg.allowlist.length).toBeGreaterThan(0);
  });

  it('Z-25 one monorepo, runnable with docker-compose (db, sandbox, api, web)', () => {
    expect(read('pnpm-workspace.yaml')).toMatch(/apps\/\*/);
    expect(read('pnpm-workspace.yaml')).toMatch(/packages\/\*/);
    expect(existsSync(repoPath('apps/api/package.json')) && existsSync(repoPath('apps/web/package.json')) && existsSync(repoPath('packages/core/package.json'))).toBe(true);
    const compose = read('docker-compose.yml');
    for (const service of ['db', 'sandbox', 'api', 'web']) expect(compose, service).toMatch(new RegExp(`^  ${service}:`, 'm'));
  });

  it('Z-26 label lists carry their provenance: source, licence and retrieval date', () => {
    for (const s of app.labels.sources) expect([s.file, s.source && s.license && s.retrieved]).toEqual([s.file, expect.any(String)]);
    expect(app.labels.sources.length).toBeGreaterThanOrEqual(6);
  });

  it('Z-27 the repository has no secrets: .env is ignored, the template holds no values', () => {
    expect(read('.gitignore')).toMatch(/^\.env$/m);
    const template = read('.env.example');
    for (const line of template.split('\n').filter((l) => /(KEY|TOKEN|SECRET|PASSWORD)=/.test(l) && !l.startsWith('#'))) expect(line, line).toMatch(/=\s*$/);
  });

  it('Z-28 README.md has the required sections in order (description, assumptions, search parameters, architecture, installation, scenario, examples, compliance, licences, resources, documentation), no placeholders, and lists every allowlisted host', () => {
    const readme = read('README.md');
    const headings = [...readme.matchAll(/^## (.+)$/gm)].map((m) => m[1]!);
    const required = ['Opis projektu', 'Założenia projektu', 'Parametry wyszukiwania', 'Architektura', 'Instalacja i uruchomienie', 'Scenariusz demonstracyjny', 'Przykłady', 'Zgodność i bezpieczeństwo', 'Licencje wykorzystanych komponentów', 'Wykorzystane zasoby', 'Dokumentacja techniczna'];
    const at = required.map((r) => headings.findIndex((h) => h.startsWith(r)));
    expect(at.every((i) => i >= 0), `missing: ${required.filter((_, i) => at[i]! < 0)}`).toBe(true);
    expect(at).toEqual([...at].sort((a, b) => a - b)); // in the order of the task
    expect(readme).not.toMatch(/TODO|TBD|XXX/);
    for (const h of cfg.allowlist) expect(readme, `allowlist host ${h.host} is described in "Zgodność i bezpieczeństwo"`).toContain(h.host);
    for (const link of ['LICENSES.md', 'docs/ZGODNOSC.md', 'docs/research-notes.md']) expect(existsSync(repoPath(link)) && readme.includes(link), link).toBe(true);
  });
});

describe('Z-29…Z-31 — scenario, report and legality (task sections 6–7)', () => {
  it('Z-29 the mandatory scenario, all seven stages in one run: input → search → addresses found and verified → score → rejected → on-chain indicators → sources and result', async () => {
    const kase = await api.getCase(demo.run.caseId);
    expect(kase.identifiers).toHaveLength(3); // 1 input
    expect(demo.evidence.length).toBeGreaterThan(0); // 2 OSINT search
    expect(demo.traces.length).toBeGreaterThan(0);
    expect(demo.traces.every((t) => parseAddress(t.address).ok)).toBe(true); // 3 detected AND verified (format, checksum)
    expect(demo.links.some((l) => l.score >= 80)).toBe(true); // 4 Confidence Score
    expect(demo.links.some((l) => l.band === 'EXCLUDED')).toBe(true); // 5 false attributions rejected
    expect(demo.chain.length).toBe(spec.counts.chainSnapshots); // 6 on-chain indicators
    const { doc, sha256 } = await api.report(demo.run.id); // 7 sources and the final result
    expect(sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(doc.sections.length).toBe(12);
  });

  it('Z-30 the report separates facts from sources (FAKT), results of computation (OBLICZENIE) and conclusions to verify (WNIOSEK), and describes the flow of funds chronologically', async () => {
    const { doc } = await api.report(demo.run.id);
    const kind = Object.fromEntries(doc.sections.map((s) => [s.id, s.kind]));
    expect(kind).toMatchObject({ sources: 'FAKT', links: 'OBLICZENIE', chain: 'OBLICZENIE', chronology: 'FAKT', conclusions: 'WNIOSEK', next: 'WNIOSEK' }); // the chronology lists transactions read from the chain: facts
    const chronology = JSON.stringify(doc.sections.find((s) => s.id === 'chronology'));
    expect(chronology).toMatch(/\d{1,2} (wrz|paź|lis) 2026/); // dated entries ("12 paź 2026") …
    expect(chronology).toContain('Uniswap'); // … with labelled counterparties
    expect(JSON.stringify(doc.sections.find((s) => s.id === 'limits'))).toMatch(/.{20,}/); // the limits are stated, not hidden
  });

  it('Z-31 only synthetic data in fixtures: every e-mail is on a reserved domain or a fictional sandbox host; every address is synthetic or a labelled public institutional one', () => {
    const hosts = new Set<string>((JSON.parse(readFileSync(repoPath('fixtures/sandbox-web/index.json'), 'utf8')).pages as { platform: string }[]).map((p) => p.platform));
    const emails = new Set(filesUnder('fixtures').filter((f) => !f.includes('recorded')).flatMap((f) => readFileSync(f, 'utf8').match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) ?? []));
    expect(emails.size).toBeGreaterThan(0);
    for (const e of emails) expect(isReservedEmailDomain(e) || hosts.has(e.split('@')[1]!), e).toBe(true);
    const labelled = new Set(Object.values<string>(spec.realAddresses).map((a) => a.toLowerCase()));
    const known = new Set([...Object.values(synthetic).map((a) => a.address.toLowerCase()), ...labelled]);
    for (const t of demo.traces) expect(known.has(t.address.toLowerCase()), t.address).toBe(true);
  });
});

// Formal part of the submission (task section 4) — not code. Tracked here so that they show up as open until done (docs/ZGODNOSC.md).
describe('Z-32 — submission package (task section 4)', () => {
  it.todo('Z-32a title and detailed description including the search parameters (HackTribe entry)');
  it.todo('Z-32b presentation in PDF, at most 10 slides');
  it.todo('Z-32c video of at most 3 minutes in the open repository');
  it.todo('Z-32d link to the repository (set to public)');
});
