import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeIdentifier, type FlowEntry, type IdentifierType, type Indicators } from '@kropka/core';
import { parseCaseBody } from '../src/api.controller.js';
import type { Identity } from '../src/pipeline/identities.js';
import { BtcMempoolAdapter } from '../src/chains/btc-mempool.adapter.js';
import { ChainAnalysisService } from '../src/chains/chain-analysis.service.js';
import { ChainRegistry } from '../src/chains/chain.registry.js';
import { EvmEtherscanAdapter } from '../src/chains/evm-etherscan.adapter.js';
import { FixtureChainAdapter } from '../src/chains/fixture.adapter.js';
import { NbpService } from '../src/chains/nbp.service.js';
import { TronGridAdapter } from '../src/chains/tron-grid.adapter.js';
import { EgressClient, EgressConfig } from '../src/egress/egress.client.js';
import { PipelineService } from '../src/pipeline/pipeline.service.js';
import { RulesService } from '../src/rules.service.js';
import { repoPath } from '../src/paths.js';
import { TEMPLATE_VERSION } from '../src/report/report.service.js';
import { makeApp } from './harness.js';

/**
 * Acceptance test of the demo (task acceptance criteria): addresses found, sources linked, scores per the algorithm,
 * sources and premises presented, false attributions rejected, on-chain patterns detected, everything stored with
 * provenance. Needs the local Postgres (docker compose up -d db) — and no internet: sandbox, chain histories and NBP
 * rates are served from disk / synthetic.
 */
const spec = JSON.parse(readFileSync(repoPath('fixtures/expected.json'), 'utf8'));
const synthetic: Record<string, { chain: string; address: string }> = JSON.parse(readFileSync(repoPath('fixtures/addresses.json'), 'utf8'));
delete (synthetic as Record<string, unknown>)._comment;
const addr = (name: string): string => synthetic[name]?.address ?? spec.realAddresses[name];
const key = (type: IdentifierType, value: string) => `${type}:${normalizeIdentifier(type, value)}`;

const { prisma, fetched, egress, labels, registry, analysis, reports, pipeline, api } = makeApp();
const runOptions = { connectors: spec.run.connectors, chain: spec.run.chain, asOf: new Date(spec.run.asOf) };

type Results = Awaited<ReturnType<PipelineService['results']>>;
const ruleIds = (l: { breakdownJson: unknown }) => (l.breakdownJson as { ruleId: string }[]).map((e) => e.ruleId);
const indicatorsOf = (r: Results, name: string) => r.chain.find((c) => c.address.address === addr(name))?.indicators as unknown as Indicators;
const flowsOf = (r: Results, name: string) => r.chain.find((c) => c.address.address === addr(name))?.flows as unknown as FlowEntry[];

const caseIds: string[] = [];
let results: Results;
let addressResults: Results;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    throw new Error(`Postgres is not reachable — start it with "docker compose up -d db" and run the migrations. (${(e as Error).message})`);
  }
  const created = await api.createCase(spec.case);
  caseIds.push(created.id);
  results = await pipeline.run(created.id, runOptions);

  const identifiers = spec.addressCase.case.identifiers.map((i: { type: string; value: string }) => ({ type: i.type, value: addr(i.value) }));
  const second = await api.createCase({ title: spec.addressCase.case.title, identifiers });
  caseIds.push(second.id);
  addressResults = await pipeline.run(second.id, runOptions);
});

afterAll(async () => {
  for (const id of caseIds) {
    await prisma.case.delete({ where: { id } }); // cascades to runs, evidence, traces, links, snapshots
    await prisma.auditLog.deleteMany({ where: { caseId: id } });
  }
  const own = [...Object.values(synthetic).map((a) => a.address), ...Object.values<string>(spec.realAddresses)];
  await prisma.address.deleteMany({ where: { address: { in: own }, links: { none: {} }, snapshots: { none: {} } } });
  await prisma.$disconnect();
});

describe('demo case — the seven stages', () => {
  it('1. input: the case keeps normalised identifiers of three types', async () => {
    const kase = await api.getCase(caseIds[0]!);
    expect(kase.identifiers.map((i) => key(i.type as IdentifierType, i.value)).sort()).toEqual(['EMAIL:jan.testowy@example.org', 'MESSENGER:jtestowy_pl', 'NICK:jtestowy']);
    expect(kase.runs.map((r) => r.id)).toEqual([results.run.id]);
  });

  it('2. OSINT search: evidence from the sandbox (11 pages) plus 2 found by reverse lookup of an address', () => {
    expect(results.run).toMatchObject({ status: 'DONE', rulesVersion: spec.run.rulesVersion, paramsJson: { chain: 'fixture' } });
    expect(results.evidence).toHaveLength(spec.counts.evidence);
    const meta = (e: Results['evidence'][number]) => e.metaJson as { round: number };
    expect(results.evidence.filter((e) => meta(e).round === 2)).toHaveLength(spec.counts.evidenceFromReverseLookup);
    // nothing but the sandbox and the (synthetic) NBP API was contacted
    expect(fetched.requested.every((u) => u.startsWith('http://sandbox-web/') || u.startsWith('https://api.nbp.pl/'))).toBe(true);
  });

  it('3–6. every expected link: address, score, band, rule-by-rule breakdown (incl. on-chain rules), exclusions', () => {
    expect(results.links).toHaveLength(spec.counts.links);
    expect(results.links.filter((l) => l.excludedReason)).toHaveLength(spec.counts.excludedLinks);

    for (const exp of spec.links) {
      const link = results.links.find((l) => key(l.identifier.type as IdentifierType, l.identifier.value) === exp.identifier && l.address.address === addr(exp.address));
      const where = `${exp.identifier} → ${exp.address}`;
      expect(link, where).toBeDefined();
      expect({ score: link!.score, band: link!.band }, where).toEqual({ score: exp.score, band: exp.band });
      expect(ruleIds(link!), where).toEqual(exp.rules);
      expect(link!.excludedReason ?? undefined, where).toBe(exp.excluded);
      if (exp.category) expect(link!.address.category, where).toBe(exp.category);
      expect((link!.hintsJson as unknown[]).length, where).toBe(exp.hints ?? 0);
    }
  });

  it('5. false attributions are rejected: exchange, DEX router, charity, kantor → 0, interaction still recorded', () => {
    for (const name of ['BINANCE_14', 'UNISWAP_V2_ROUTER', 'UKRAINE_DONATION', 'K1']) {
      const links = results.links.filter((l) => l.address.address === addr(name));
      expect(links.length, name).toBeGreaterThan(0);
      expect(links.every((l) => l.score === 0 && l.band === 'EXCLUDED'), name).toBe(true);
      expect(results.traces.some((t) => t.address === addr(name)), `${name} trace kept`).toBe(true);
    }
  });

  it('breakdowns add up to the score and carry PL/EN reasons and evidence ids of this run', () => {
    const evidenceIds = new Set(results.evidence.map((e) => e.id));
    for (const l of results.links) {
      const entries = l.breakdownJson as { delta: number; reasonPl: string; reasonEn: string; evidenceIds: string[] }[];
      expect(entries.reduce((s, e) => s + e.delta, 0)).toBe(l.score);
      for (const e of entries) {
        expect(e.reasonPl && e.reasonEn).toBeTruthy();
        for (const id of e.evidenceIds) expect(evidenceIds.has(id)).toBe(true);
      }
    }
  });

  it('7. sources: every piece of evidence has URL, time, SHA-256 of the real content, a snippet and reproduction metadata', () => {
    for (const e of results.evidence) {
      const path = new URL(e.url!).pathname;
      const content = readFileSync(repoPath(`fixtures/sandbox-web${path}`), 'utf8');
      expect(e.sha256, path).toBe(createHash('sha256').update(content).digest('hex'));
      expect(e.fetchedAt).toBeInstanceOf(Date);
      expect(e.snippet.length, path).toBeGreaterThan(0);
      expect(e.snippet.length, path).toBeLessThanOrEqual(2 * 200 + 120); // data minimisation: a window, not the page
      expect(e.metaJson).toMatchObject({ platform: expect.any(String), origin: expect.any(String), round: expect.any(Number) });
    }
    for (const t of results.traces) expect(t.contextSnippet).toContain(t.address);
  });
});

describe('on-chain indicators (stage 6)', () => {
  it('stores one snapshot per address that has a history, with provider and fetch time', () => {
    expect(results.chain.map((c) => c.address.address).sort()).toEqual(spec.chain.snapshots.map(addr).sort());
    expect(results.chain.length).toBe(spec.counts.chainSnapshots);
    for (const c of results.chain) expect(c).toMatchObject({ provider: 'fixture', fetchedAt: expect.any(Date) });
  });

  it.each(Object.keys(spec.chain.indicators))('%s: volume, activity, assets, swaps, interactions, cash-out, thresholds', (name) => {
    const exp = spec.chain.indicators[name];
    const ind = indicatorsOf(results, name);
    expect(ind, name).toBeDefined();
    expect({ txCount: ind.txCount, firstActivity: ind.firstActivity, lastActivity: ind.lastActivity }).toEqual({ txCount: exp.txCount, firstActivity: exp.firstActivity, lastActivity: exp.lastActivity });
    expect(ind.byAsset).toEqual(exp.byAsset);
    expect(ind.totals).toMatchObject(exp.totals);
    expect(ind.swaps.map((s) => ({ time: s.time, via: s.via, sold: s.sold, bought: s.bought, valuePln: s.valuePln }))).toEqual(exp.swaps);
    expect(Object.fromEntries(Object.entries(ind.interactions).map(([k, v]) => [k, v!.count]))).toEqual(exp.interactions);
    expect(ind.tags).toEqual(exp.tags);
    expect({ detected: ind.cashOut.detected, patterns: ind.cashOut.patterns, totalEur: ind.cashOut.totalEur }).toEqual(exp.cashOut);
    expect(Object.fromEntries(ind.thresholds.map((t) => [t.eur, { single: t.singleCrossedAt, cumulative: t.cumulativeCrossedAt }]))).toEqual(exp.thresholds);
    expect(ind.note.pl).toMatch(/nie kwalifikacja prawna/); // premises, not a legal qualification
    expect(flowsOf(results, name)).toHaveLength(exp.flows);
  });

  it('A1: ETH → Uniswap swap → USDT → exchange deposit address, as a chronology with labels, PLN and tags', () => {
    const flows = flowsOf(results, 'A1');
    expect(flows.map((f) => [f.time.slice(0, 10), f.direction, f.asset, f.amount, f.valuePln])).toEqual([
      ['2026-09-20', 'in', 'ETH', 3, 24000],
      ['2026-10-05', 'in', 'ETH', 3, 24000],
      ['2026-10-12', 'out', 'ETH', 6, 48000],
      ['2026-10-12', 'in', 'USDT', 11900, 47600],
      ['2026-10-14', 'out', 'USDT', 5900, 23600],
      ['2026-10-20', 'out', 'USDT', 5900, 23600],
    ]);
    expect(flows[2]).toMatchObject({ counterparty: { address: addr('UNISWAP_V2_ROUTER'), category: 'DEX', name: 'Uniswap V2: Router 02' }, tags: ['OVER_1000_EUR', 'OVER_10000_EUR', 'SWAP_DEX'] });
    expect(flows[3]!.tags).toContain('STABLECOIN_CONVERSION');
    expect(flows[4]).toMatchObject({ counterparty: { address: addr('D1'), category: 'CEX_DEPOSIT' }, tags: ['OVER_1000_EUR', 'TO_CEX_DEPOSIT'], valueEur: 5363.64 });
  });

  it('T1: many small USDT in, then USDT → cash through the kantor K1 (labelled, and published in an ad)', () => {
    const ind = indicatorsOf(results, 'T1');
    expect(ind.cashOut.endpoints).toEqual([expect.objectContaining({ address: addr('K1'), kind: 'CASP_KANTOR', count: 3, totalEur: 15909.1 })]);
    const flows = flowsOf(results, 'T1');
    expect(flows.filter((f) => f.direction === 'in')).toHaveLength(27);
    expect(flows.filter((f) => f.tags.includes('USDT_TO_CASH')).map((f) => f.time.slice(0, 10))).toEqual(['2026-11-04', '2026-11-05', '2026-11-07']);
  });

  it('a counterparty that only sweeps to an exchange is stored as a CEX deposit address (heuristic, not a label)', async () => {
    const d1 = await prisma.address.findFirst({ where: { chain: 'ETH', address: addr('D1') } });
    expect(d1).toMatchObject({ category: 'CEX_DEPOSIT' });
    expect(d1!.labelsJson).toEqual([expect.objectContaining({ source: spec.chain.classifiedCounterparties.D1.source })]);
  });

  it('PLN valuation comes from NBP through EgressClient, every request audited', async () => {
    const rows = await prisma.auditLog.findMany({ where: { runId: results.run.id } });
    const nbp = rows.filter((r) => r.host === 'api.nbp.pl');
    expect(nbp.length).toBeGreaterThan(0);
    expect(nbp.every((r) => /^\/api\/exchangerates\/rates\/a\/(usd|eur)\/\d{4}-\d{2}-\d{2}\/\d{4}-\d{2}-\d{2}\/$/.test(r.path) && r.status === 200 && r.connectorId === 'nbp')).toBe(true);
    const sandbox = rows.filter((r) => r.host === 'sandbox-web');
    expect(sandbox.length).toBe(new Set(fetched.requested.filter((u) => u.startsWith('http://sandbox-web/'))).size); // cache: each URL once
    expect(rows.every((r) => r.status === 200 && r.caseId === caseIds[0])).toBe(true); // none blocked, none failed
  });

  it('chain = off skips the on-chain step; no history means no on-chain rule', async () => {
    const off = await pipeline.run(caseIds[0]!, { ...runOptions, chain: 'off' });
    expect(off.chain).toEqual([]);
    const a1 = off.links.find((l) => l.address.address === addr('A1') && l.identifier.type === 'NICK')!;
    expect(ruleIds(a1)).toEqual(['BASE_OFFICIAL_PROFILE', 'IDENT_EXACT_SAME_PLATFORM', 'SYNERGY_INDEPENDENT_SOURCES', 'CLAMP']);
  });

  it('live mode without keys degrades to a clear note and never fails the run', async () => {
    const keys = { e: process.env.ETHERSCAN_API_KEY, t: process.env.TRONGRID_API_KEY };
    delete process.env.ETHERSCAN_API_KEY;
    delete process.env.TRONGRID_API_KEY;
    try {
      const noFetch = new EgressConfig();
      noFetch.fetchImpl = fetched; // live adapters still only see the offline stub
      const e2 = new EgressClient(prisma, noFetch);
      const live = new PipelineService(prisma, new RulesService(), labels, registry, new ChainAnalysisService(new ChainRegistry(new FixtureChainAdapter(), new BtcMempoolAdapter(e2), new EvmEtherscanAdapter(e2), new TronGridAdapter(e2)), new NbpService(e2), labels));
      const r = await live.run(caseIds[0]!, { ...runOptions, chain: 'live' });
      const summary = r.run.summaryJson as { chainNotes: { address: string; notes: { code: string }[] }[] };
      // B1 (BTC) is attempted through mempool.space (the stub has no network → failure noted), AB (ETH) needs the key
      expect(summary.chainNotes.find((n) => n.address === addr('AB'))?.notes).toContainEqual(expect.objectContaining({ code: 'CHAIN_KEY_MISSING' }));
      expect(r.run.status).toBe('DONE');
    } finally {
      if (keys.e) process.env.ETHERSCAN_API_KEY = keys.e;
      if (keys.t) process.env.TRONGRID_API_KEY = keys.t;
    }
  });

  it('9. reproducible: the same run again gives the same scores and rule ids; stored results are retrievable', async () => {
    const again = await api.startRun(caseIds[0]!, { connectors: spec.run.connectors });
    const shape = (r: Results) => r.links.map((l) => [l.identifier.value, l.address.address, l.band, ruleIds(l)]).sort();
    expect(again.run.id).not.toBe(results.run.id);
    expect(shape(again)).toEqual(shape(results)); // the second run uses "now" as asOf; nothing in the demo depends on it
    expect(await api.getRun(results.run.id)).toEqual(results);
  });
});

describe('address case — who is behind A1?', () => {
  const identities = () => (addressResults.run.summaryJson as { identities: Identity[] }).identities;
  const byKey = (k: string) => identities().find((i) => i.key === k)!;

  it('shows the accounts that published the address, scored by source type and on-chain activity', () => {
    expect(addressResults.links).toHaveLength(spec.addressCase.links); // an address input has nothing to link to
    expect(identities().map((i) => i.key).sort()).toEqual(spec.addressCase.identities.map((i: { key: string }) => i.key).sort());
    for (const exp of spec.addressCase.identities) {
      const id = byKey(exp.key);
      expect(id.relation, exp.key).toBe(exp.relation);
      expect(id.score?.score ?? null, exp.key).toBe(exp.score);
      if (exp.band) expect(id.score?.band, exp.key).toBe(exp.band);
      if (exp.rules) expect(id.score!.breakdown.map((e) => e.ruleId), exp.key).toEqual(exp.rules);
      expect(id.otherAddresses.map((o) => o.address).sort(), exp.key).toEqual(exp.other.map(addr).sort());
    }
  });

  it('lists the other addresses of the profiles, with their category and whether they are excluded', () => {
    expect(byKey('jtestowy.example.org|jtestowy').otherAddresses).toEqual([expect.objectContaining({ address: addr('A0'), category: 'UNHOSTED', excluded: false })]);
    expect(byKey('forum.krypto-lublin.example|jtestowy').otherAddresses.map((o) => [o.category, o.excluded]).sort()).toEqual([
      ['CEX_CUSTODIAL', true],
      ['CHARITY', true],
      ['DEX', true],
    ]);
  });

  it('flags the same nick on another platform as a possible different person (no score)', () => {
    expect(byKey('forum-hobby.example.pl|jtestowy')).toMatchObject({ relation: 'SAME_NICK_OTHER_PLATFORM', score: null, name: 'Janusz Kowalczyk' });
  });

  it('keeps every source: evidence of all three rounds is stored with its round number', () => {
    const rounds = addressResults.evidence.map((e) => (e.metaJson as { round: number }).round);
    expect(new Set(rounds)).toEqual(new Set([1, 3]));
    expect(addressResults.evidence.every((e) => e.sha256.length === 64 && e.url)).toBe(true);
  });
});

describe('analyst decisions and demo cases (UI)', () => {
  it('confirm / reject stores who, when and why — and never changes the computed score', async () => {
    const link = results.links.find((l) => l.address.address === addr('B1') && l.identifier.type === 'NICK')!;
    const out = await api.decide(link.id, { decision: 'CONFIRMED', analyst: 'A. Kowalska', note: 'Potwierdzone w rozmowie' });
    expect(out).toMatchObject({ analystDecision: 'CONFIRMED', analystName: 'A. Kowalska', analystNote: 'Potwierdzone w rozmowie', decidedAt: expect.any(Date) });
    const after = (await api.getRun(results.run.id)).links.find((l) => l.id === link.id)!;
    expect({ score: after.score, band: after.band, breakdown: after.breakdownJson }).toEqual({ score: link.score, band: link.band, breakdown: link.breakdownJson });
    expect(after).toMatchObject({ analystDecision: 'CONFIRMED', analystName: 'A. Kowalska' });

    expect(await api.decide(link.id, { decision: 'REJECTED', analyst: 'B. Nowak' })).toMatchObject({ analystDecision: 'REJECTED', analystName: 'B. Nowak', analystNote: null });
    expect(await api.decide(link.id, { decision: null })).toEqual({ id: link.id, analystDecision: null, analystNote: null, analystName: null, decidedAt: null });
  });

  it('validates the decision and the link', async () => {
    const link = results.links[0]!;
    await expect(api.decide(link.id, { decision: 'MAYBE', analyst: 'x' })).rejects.toThrow(/decision/);
    await expect(api.decide(link.id, { decision: 'CONFIRMED' })).rejects.toThrow(/analyst/);
    await expect(api.decide(link.id, { decision: 'CONFIRMED', analyst: 'x', note: 'n'.repeat(1001) })).rejects.toThrow(/note/);
    await expect(api.decide('00000000-0000-0000-0000-000000000000', { decision: null })).rejects.toThrow(/not found/);
  });

  it('the demo cases are created once, match the fixtures, and are not duplicated', async () => {
    const demo = JSON.parse(readFileSync(repoPath('fixtures/demo-case.json'), 'utf8'));
    expect(demo.identifiers.identifiers).toEqual(spec.case.identifiers);
    expect(demo.address.identifiers).toEqual([{ type: 'ADDRESS', value: addr('A1') }]);
    const existed = (await prisma.case.count({ where: { createdBy: 'demo' } })) > 0; // never delete a demo case somebody loaded by hand
    const a = await api.demoCase();
    const b = await api.demoCase();
    const c = await api.demoCase('address');
    if (!existed) caseIds.push(a.id, c.id);
    expect(b.id).toBe(a.id);
    expect(a).toMatchObject({ title: 'Demo — Jan Testowy', createdBy: 'demo' });
    expect(c.identifiers.map((i) => i.type)).toEqual(['ADDRESS']);
    await expect(api.demoCase('other')).rejects.toThrow(/variant/);
    const listed = (await api.listCases()).find((k) => k.id === a.id)!;
    expect(listed).toMatchObject({ identifiers: expect.any(Array), _count: { runs: existed ? expect.any(Number) : 0 }, runs: existed ? expect.any(Array) : [] }); // a demo case loaded by hand may already have runs
  });
});

describe('failure handling and input validation', () => {
  it('a run whose connectors all fail is stored as FAILED with the reason', async () => {
    const broken = { id: 'broken', kind: 'web2', version: '0', policy: {}, search: async () => { throw new Error('boom'); } };
    const stub = { pick: () => [broken], list: () => [] } as unknown as ConnectorRegistry;
    const failing = new PipelineService(prisma, new RulesService(), labels, stub, analysis);
    await expect(failing.run(caseIds[0]!, { connectors: ['broken'] })).rejects.toThrow(/all connectors failed.*boom/);
    const failed = await prisma.run.findFirst({ where: { caseId: caseIds[0], status: 'FAILED' } });
    expect(failed?.finishedAt).not.toBeNull();
    expect(JSON.stringify(failed?.summaryJson)).toContain('boom');
  });

  it('unknown connector / chain mode → 400, unknown case → 404', async () => {
    await expect(pipeline.run(caseIds[0]!, { connectors: ['nope'] })).rejects.toThrow(/unknown connector/);
    expect(() => api.startRun(caseIds[0]!, { chain: 'everything' })).toThrow(/chain: expected/);
    await expect(pipeline.run('00000000-0000-0000-0000-000000000000')).rejects.toThrow(/not found/);
    await expect(api.getRun('00000000-0000-0000-0000-000000000000')).rejects.toThrow(/not found/);
  });

  it('POST /cases validation', () => {
    const ok = { title: 'x', identifiers: [{ type: 'NICK', value: ' JTestowy ' }, { type: 'NICK', value: 'jtestowy' }] };
    expect(parseCaseBody(ok).identifiers).toEqual([{ type: 'NICK', value: 'JTestowy', normalized: 'jtestowy' }]); // trimmed, de-duplicated
    for (const bad of [
      null,
      { title: 'x', identifiers: [] },
      { title: '', identifiers: [{ type: 'NICK', value: 'abc' }] },
      { title: 'x', identifiers: [{ type: 'PHONE', value: '123' }] },
      { title: 'x', identifiers: [{ type: 'EMAIL', value: 'nope' }] },
      { title: 'x', identifiers: [{ type: 'ADDRESS', value: '0x123' }] },
      { title: 'x', identifiers: [{ type: 'NICK', value: 'abc' }], retentionDays: -1 },
    ]) expect(() => parseCaseBody(bad)).toThrow();
  });

  it('GET /connectors and /chain-adapters list sources, policies and readiness', () => {
    expect(api.connectors().map((c) => [c.id, c.policy.method])).toEqual([['sandbox', 'synthetic'], ['github', 'official_api']]);
    expect(api.chainAdapters().map((a) => [a.id, a.live])).toEqual([['fixture', false], ['mempool.space', true], ['etherscan', true], ['trongrid', true]]);
    expect(api.chainAdapters().find((a) => a.id === 'mempool.space')).toMatchObject({ available: true, reason: null });
  });
});

describe('report (HTML view data, PDF, JSON) — stored with the run', () => {
  it('the report document: five-sentence summary, every section, evidence hashes, deterministic SHA-256', async () => {
    const a = await api.report(results.run.id);
    const b = await api.report(results.run.id);
    expect(a.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(b.sha256).toBe(a.sha256); // same data → same hash (the time of generation is not part of it)
    expect(a.doc.summary).toHaveLength(5);
    expect(a.doc.sections.map((s) => s.id)).toEqual(['input', 'sources', 'links', 'rejected', 'chain', 'chronology', 'decisions', 'changes', 'conclusions', 'next', 'limits', 'meta']);
    const text = JSON.stringify(a.doc);
    for (const e of results.evidence) expect(text).toContain(e.sha256);
    expect(text).toContain('Giełda (powiernicza)'); // rejected attributions carry their reason
    expect(text).not.toMatch(/undefined|NaN|\{\{/);
    expect(a.evidenceSha256).toBe(createHash('sha256').update(results.evidence.map((e) => e.sha256).sort().join('\n')).digest('hex'));
  });

  it('an analyst decision shows in its own section, never in the score, and changes the report hash', async () => {
    const before = await api.report(results.run.id);
    const link = results.links.find((l) => l.score >= 80)!;
    await api.decide(link.id, { decision: 'CONFIRMED', analyst: 'Anna Kowalska', note: 'Zgodne z ogłoszeniem' });
    try {
      const after = await api.report(results.run.id);
      expect(after.sha256).not.toBe(before.sha256);
      const decisions = JSON.stringify(after.doc.sections.find((s) => s.id === 'decisions'));
      expect(decisions).toContain('Anna Kowalska');
      expect(JSON.stringify(after.doc.sections.find((s) => s.id === 'links'))).not.toContain('Anna Kowalska');
      expect(JSON.stringify(after.doc.sections.find((s) => s.id === 'links'))).toBe(JSON.stringify(before.doc.sections.find((s) => s.id === 'links')));
    } finally {
      await api.decide(link.id, { decision: null });
    }
  });

  it('PDF: a real PDF with embedded fonts, stored in the database once per data hash', async () => {
    const f = await reports.file(results.run.id, 'PDF');
    expect(f.content.subarray(0, 5).toString()).toBe('%PDF-');
    expect(f.content.length).toBeGreaterThan(10_000);
    expect(f.content.toString('latin1')).toContain('/FontFile2'); // TrueType embedded (Polish letters need it)
    const rows = await prisma.report.findMany({ where: { runId: results.run.id, format: 'PDF' } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.sha256).toBe((await api.report(results.run.id)).sha256);
    expect(Buffer.from(rows[0]!.content!).equals(f.content)).toBe(true);
    const again = await reports.file(results.run.id, 'PDF');
    expect(again.content.equals(f.content)).toBe(true);
    expect(await prisma.report.count({ where: { runId: results.run.id, format: 'PDF' } })).toBe(1);
  });

  it('a stored file made by another version of the renderer is not reused (cache key = data hash + template version)', async () => {
    const [stored] = await prisma.report.findMany({ where: { runId: results.run.id, format: 'PDF' } });
    expect(stored!.templateVersion).toBe(TEMPLATE_VERSION);
    await prisma.report.update({ where: { id: stored!.id }, data: { templateVersion: 'older-renderer' } });
    await reports.file(results.run.id, 'PDF');
    const versions = (await prisma.report.findMany({ where: { runId: results.run.id, format: 'PDF' } })).map((r) => r.templateVersion).sort();
    expect(versions).toEqual([TEMPLATE_VERSION, 'older-renderer'].sort());
  });

  it('JSON: the same data as the report document, with its hash', async () => {
    const f = await reports.file(results.run.id, 'JSON');
    const json = JSON.parse(f.content.toString('utf8'));
    expect(json.sha256).toBe((await api.report(results.run.id)).sha256);
    expect(json.doc.sections).toHaveLength(12);
    expect(f.fileName).toMatch(/^kropka-raport-[0-9a-f]{8}\.json$/);
  });

  it('an address case also gets a report; an unknown run is a 404', async () => {
    const r = await api.report(addressResults.run.id);
    expect(JSON.stringify(r.doc.sections.find((s) => s.id === 'links'))).toContain('Konta, które opublikowały badany adres');
    await expect(api.report('00000000-0000-0000-0000-000000000000')).rejects.toThrow(/not found/);
  });
});

describe('audit log page (PLAN 3.9)', () => {
  it('lists outbound requests with the case title and path without query; blocked ones are counted and marked', async () => {
    await expect(egress.get('https://not-allowed.example/secret/path?token=abc', { connectorId: 'test', caseId: caseIds[0] })).rejects.toThrow(/allowlist/);
    const log = await api.auditLog('1000', undefined);
    expect(log.total).toBeGreaterThan(0);
    const ours = log.rows.filter((r) => r.caseId === caseIds[0]);
    expect(ours.length).toBeGreaterThan(0);
    expect(ours.every((r) => r.caseTitle === spec.case.title)).toBe(true);
    expect(log.rows.some((r) => r.path.includes('?') || r.path.includes('token'))).toBe(false);
    const blocked = log.rows.find((r) => r.host === 'not-allowed.example');
    expect(blocked).toMatchObject({ status: 0, path: '/secret/path', connectorId: 'test' });
    expect(log.blocked).toBeGreaterThanOrEqual(1);
  });

  it('can show only the problems (blocked or failed) and limits the page size', async () => {
    const problems = await api.auditLog('1000', 'true');
    expect(problems.rows.length).toBeGreaterThanOrEqual(1);
    expect(problems.rows.every((r) => r.status <= 0)).toBe(true);
    expect((await api.auditLog('1', undefined)).rows).toHaveLength(1);
    expect((await api.auditLog('abc', undefined)).rows.length).toBeLessThanOrEqual(200);
  });
});

describe('monitoring: comparison of runs (PLAN 3.8)', () => {
  let monitored: { id: string; first: Results; second: Results };

  beforeAll(async () => {
    const created = await api.createCase({ ...spec.case, title: 'Demo — monitoring' });
    caseIds.push(created.id);
    const first = await pipeline.run(created.id, runOptions);
    monitored = { id: created.id, first, second: await pipeline.run(created.id, runOptions) };
  });

  it('the first run has no comparison; a re-run on unchanged sources differs in nothing and rings no bell', async () => {
    expect((await api.runDiff(monitored.first.run.id)).diff).toBeNull();
    const { diff } = await api.runDiff(monitored.second.run.id);
    expect(diff).toMatchObject({ fromRunId: monitored.first.run.id, toRunId: monitored.second.run.id, empty: true, params: { same: true } });
    expect(await prisma.notification.count({ where: { caseId: monitored.id } })).toBe(0);
    // the case page lists the runs with the counts of each comparison
    const kase = await api.getCase(monitored.id);
    expect(kase.runs.map((r) => [r.id, r.changes === null])).toEqual([[monitored.second.run.id, false], [monitored.first.run.id, true]]);
  });

  it('section 8 of the report: first run "nothing to compare", the second "no changes"', async () => {
    const section = async (runId: string) => JSON.stringify((await api.report(runId)).doc.sections.find((s) => s.id === 'changes'));
    expect(await section(monitored.first.run.id)).toContain('To pierwsza analiza');
    expect(await section(monitored.second.run.id)).toContain('Nie wykryto zmian');
  });

  it('notifications: listed newest first with the case title and unread count; marking by id leaves the others unread', async () => {
    // rows are test fixtures here; real ones come from the swap scenario (sandbox v2). "Mark all" is not exercised: it would touch the analyst's own notifications.
    const [a, b] = await Promise.all(['NEW_ADDRESS', 'THRESHOLD_EXCEEDED'].map((kind, i) => prisma.notification.create({ data: { caseId: monitored.id, runId: monitored.second.run.id, kind, paramsJson: { n: i }, createdAt: new Date(Date.now() + i * 1000) } })));
    const before = await api.notifications('100');
    const ours = before.items.filter((n) => n.caseId === monitored.id);
    expect(ours.map((n) => n.id)).toEqual([b!.id, a!.id]); // newest first
    expect(ours[0]).toMatchObject({ kind: 'THRESHOLD_EXCEEDED', caseTitle: 'Demo — monitoring', readAt: null, params: { n: 1 } });

    expect(await api.markRead({ ids: [a!.id] })).toEqual({ updated: 1 });
    const after = await api.notifications('100');
    expect(after.unread).toBe(before.unread - 1);
    expect(after.items.find((n) => n.id === a!.id)!.readAt).not.toBeNull();
    expect(after.items.find((n) => n.id === b!.id)!.readAt).toBeNull();
    await expect(api.markRead({ ids: [1] })).rejects.toThrow(/ids/);
  });
});

