import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeIdentifier, type FlowEntry, type IdentifierType, type Indicators, type SearchLogEntry } from '@kropka/core';
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

const { prisma, cfg, fetched, egress, labels, registry, analysis, reports, pipeline, world, ai, api } = makeApp();
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
    // the search log: every identifier was searched in the sandbox and found something; the reverse lookup of the found addresses is summed up
    const log = (results.run.summaryJson as { searches: SearchLogEntry[] }).searches;
    expect(log.filter((l) => l.round === 1).map((l) => [l.connector, l.identifier!.type, l.outcome]).sort()).toEqual([['sandbox', 'EMAIL', 'FOUND'], ['sandbox', 'MESSENGER', 'FOUND'], ['sandbox', 'NICK', 'FOUND']]);
    expect(log.filter((l) => l.round === 1).every((l) => l.resources > 0 && l.addresses > 0)).toBe(true);
    expect(log.find((l) => l.round === 2)).toMatchObject({ connector: 'sandbox', identifier: null, outcome: 'FOUND' }); // counts every page that carries the address, also those found in round 1
    expect(log.find((l) => l.round === 2)!.resources).toBeGreaterThanOrEqual(spec.counts.evidenceFromReverseLookup);
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
      const live = new PipelineService(prisma, new RulesService(), labels, registry, new ChainAnalysisService(new ChainRegistry(new FixtureChainAdapter(), new BtcMempoolAdapter(e2), new EvmEtherscanAdapter(e2), new TronGridAdapter(e2)), new NbpService(e2), labels), ai);
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
    const broken = { id: 'broken', kind: 'web2', version: '0', policy: {}, identifiers: ['NICK', 'EMAIL', 'MESSENGER'], search: async () => { throw new Error('boom'); } };
    const stub = { pick: () => [broken], list: () => [] } as unknown as ConnectorRegistry;
    const failing = new PipelineService(prisma, new RulesService(), labels, stub, analysis, ai);
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
    expect(api.connectors().map((c) => [c.id, c.policy.method])).toEqual([['sandbox', 'synthetic'], ['github', 'official_api'], ['wayback', 'official_api'], ['gravatar', 'official_api'], ['ens', 'official_api']]);
    expect(api.connectors().find((c) => c.id === 'github')).toMatchObject({ identifiers: ['NICK', 'SOCIAL_LOGIN', 'NAME', 'ADDRESS'] });
    expect(api.connectors().find((c) => c.id === 'ens')).toMatchObject({ conditions: { NICK: 'ethName' } });
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

describe('an address typed in by the analyst is analysed on-chain even when no page mentions it', () => {
  it('D1 lives only in fixtures/chain: no evidence, no links, but a chain snapshot and a category', async () => {
    const created = await api.createCase({ title: 'Demo — adres bez śladów', identifiers: [{ type: 'ADDRESS', value: addr('D1') }] });
    caseIds.push(created.id);
    const r = await pipeline.run(created.id, runOptions);
    expect(r.evidence).toHaveLength(0);
    expect(r.links).toHaveLength(0);
    expect(r.chain.map((c) => [c.address.address, c.address.category])).toEqual([[addr('D1'), 'CEX_DEPOSIT']]);
    expect(indicatorsOf(r, 'D1').txCount).toBeGreaterThan(0);
    // the run page shows the verdict on the typed-in address itself (category + why excluded) although there is no link
    const subjects = (r.run.summaryJson as { subjects: { address: string; category: string; exclusions: { ruleId: string; pl: string }[] }[] }).subjects;
    expect(subjects.map((s) => [s.address, s.category, s.exclusions.map((e) => e.ruleId)])).toEqual([[addr('D1'), 'CEX_DEPOSIT', ['EXCL_CUSTODIAL_DEPOSIT']]]);
    expect(subjects[0]!.exclusions[0]!.pl).not.toBe('');
    // an empty search reads as "searched, found nothing", not as a failure
    const log = (r.run.summaryJson as { searches: SearchLogEntry[] }).searches;
    expect(log).toEqual([{ connector: 'sandbox', round: 1, identifier: { type: 'ADDRESS', value: addr('D1') }, outcome: 'NONE', resources: 0, addresses: 0 }]);
  });

  it('a source that cannot take the identifier, or lacks its key, says so instead of staying silent', async () => {
    const token = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
    try {
      const created = await api.createCase({ title: 'Demo — dziennik wyszukiwania', identifiers: [{ type: 'ADDRESS', value: addr('D1') }] });
      caseIds.push(created.id);
      const r = await pipeline.run(created.id, { ...runOptions, connectors: ['sandbox', 'github', 'gravatar'] });
      const log = (r.run.summaryJson as { searches: SearchLogEntry[] }).searches.map((l) => [l.connector, l.outcome, l.note?.params?.key]);
      expect(log).toEqual([['sandbox', 'NONE', undefined], ['github', 'SKIPPED_NO_KEY', 'GITHUB_TOKEN'], ['gravatar', 'UNSUPPORTED', undefined]]);
    } finally {
      if (token) process.env.GITHUB_TOKEN = token;
    }
  });
});

describe('address change over time (demo button "symuluj zmianę")', () => {
  const change = spec.addressChange;
  let caseId: string;
  let before: Results;
  let after: Results;
  let diff: NonNullable<Awaited<ReturnType<typeof api.runDiff>>['diff']>;

  beforeAll(async () => {
    const created = await api.createCase({ ...spec.case, title: 'Demo — zmiana adresu' });
    caseId = created.id;
    caseIds.push(caseId);
    world.version = 1;
    before = await pipeline.run(caseId, runOptions);
    await api.demoChange({ version: 2 }); // the page of the persona now shows A2
    after = await pipeline.run(caseId, runOptions);
    world.version = 1; // other tests share nothing, but leave the world as we found it
    diff = (await api.runDiff(after.run.id)).diff!;
  });

  it('the endpoint switches the sandbox world and validates the version', async () => {
    expect(await api.demoState()).toEqual({ sandboxVersion: 1 });
    expect(await api.demoChange({ version: 2 })).toEqual({ sandboxVersion: 2 });
    expect(await api.demoChange({})).toEqual({ sandboxVersion: 2 }); // default = the change
    expect(await api.demoChange({ version: 1 })).toEqual({ sandboxVersion: 1 });
    await expect(api.demoChange({ version: 3 })).rejects.toThrow(/version/);
  });

  it('the second run finds the new address on the SAME url, scored like any official profile', () => {
    const a2 = addr(change.to);
    const links = after.links.filter((l) => l.address.address === a2);
    expect(links).toHaveLength(3); // nick, e-mail, messenger
    for (const l of links) {
      expect(l.score).toBe(change.newAddress.score);
      expect(ruleIds(l)).toEqual(expect.arrayContaining(change.newAddress.rules));
      expect(ruleIds(l)).not.toContain('SYNERGY_INDEPENDENT_SOURCES'); // one origin only
    }
    expect(before.links.some((l) => l.address.address === a2)).toBe(false);
    expect(after.evidence.find((e) => e.url === `http://sandbox-web${change.url}`)!.snippet).toContain(a2);
  });

  it('RunDiff: new address, swap on the source, new transactions, threshold crossed, cash-out signal', () => {
    expect(diff).toMatchObject({ fromRunId: before.run.id, toRunId: after.run.id, empty: false, params: { same: true } });
    expect(diff.addresses.added.map((a) => [a.address, a.bestScore])).toEqual([[addr(change.to), change.newAddress.score]]);
    expect(diff.addresses.removed).toEqual([]); // A1 is still on the README and in the e-mail footer
    // … but one of its links got weaker, and the diff says which rules made the difference
    const a1 = change.a1Change;
    const weaker = diff.scoreChanges.find((s) => `${s.identifier.type}:${s.identifier.value.replace('@', '')}` === a1.identifier && s.address === addr(a1.address))!;
    expect([weaker.fromScore, weaker.toScore]).toEqual([a1.from, a1.to]);
    expect(weaker.rules.filter((r) => r.change === 'removed').map((r) => r.ruleId).sort()).toEqual([...a1.ruleRemoved].sort());
    expect(weaker.rules.find((r) => r.change === 'added')!.ruleId).toBe(a1.ruleAdded);
    expect(diff.scoreChanges).toHaveLength(1);
    expect(diff.sourceChanges).toEqual([expect.objectContaining({ url: `http://sandbox-web${change.url}`, kind: 'swap', from: [{ chain: 'ETH', address: addr(change.from) }], to: [{ chain: 'ETH', address: addr(change.to) }] })]);
    expect(diff.newTransactions).toEqual([expect.objectContaining({ address: addr(change.to), isNewAddress: true, count: change.newTransactions })]);
    expect(diff.newThresholds.map((t) => [t.thresholdEur, t.kind]).sort()).toEqual(change.newThresholds.flatMap((t: { eur: number; kinds: string[] }) => t.kinds.map((k) => [t.eur, k])).sort());
    expect(diff.newIndicators.filter((i) => i.cashOut).map((i) => i.tag)).toEqual(change.newCashOutTags);
  });

  it('the bell rings once per finding, in codes; "mark read" works; a re-run without a change rings nothing', async () => {
    const mine = (await api.notifications('200')).items.filter((n) => n.caseId === caseId);
    expect(mine.map((n) => n.kind).sort()).toEqual(change.notifications);
    expect(mine.find((n) => n.kind === 'NEW_ADDRESS')!.params).toMatchObject({ chain: 'ETH', address: addr(change.to), score: change.newAddress.score });
    expect(mine.find((n) => n.kind === 'ADDRESS_CHANGED')!.params).toMatchObject({ from: addr(change.from), to: addr(change.to) });
    expect(mine.find((n) => n.kind === 'THRESHOLD_EXCEEDED')!.params).toMatchObject({ thresholdEur: 1000 });
    expect(mine.every((n) => n.readAt === null && n.runId === after.run.id)).toBe(true);
    await api.markRead({ ids: mine.map((n) => n.id) });

    const again = await pipeline.run(caseId, runOptions); // the world is back at version 1: the page shows A1 again
    const back = (await api.runDiff(again.run.id)).diff!;
    expect(back.sourceChanges[0]).toMatchObject({ kind: 'swap', from: [{ address: addr(change.to) }], to: [{ address: addr(change.from) }] }); // swapped back
    expect(back.addresses.removed.map((a) => a.address)).toEqual([addr(change.to)]);
    const quiet = await pipeline.run(caseId, runOptions);
    expect((await api.runDiff(quiet.run.id)).diff!.empty).toBe(true);
    expect((await api.notifications('200')).items.filter((n) => n.caseId === caseId && n.runId === quiet.run.id)).toHaveLength(0);
  });

  it('section 8 of the report names the swap, the new address and the rule behind it', async () => {
    const text = JSON.stringify((await api.report(after.run.id)).doc.sections.find((s) => s.id === 'changes'));
    expect(text).toContain('zamiana adresu');
    expect(text).toContain('Nowe adresy');
    expect(text).toMatch(/1[\s ]000 EUR/);
    expect(text).toContain('do adresu depozytowego giełdy');
  });
});

describe('web archive (Wayback): earlier copies of the pages that carry addresses', () => {
  it('adds snapshots with their dates as evidence (round 4) and changes no score: a copy of the same site is no second source', async () => {
    const created = await api.createCase({ ...spec.case, title: 'Demo — Wayback' });
    caseIds.push(created.id);
    const withArchive = await pipeline.run(created.id, { ...runOptions, connectors: ['sandbox', 'wayback'] });
    const snapshots = withArchive.evidence.filter((e) => e.connectorId === 'wayback');
    expect(snapshots.map((e) => [(e.metaJson as { publishedAt: string }).publishedAt, (e.metaJson as { round: number }).round, (e.metaJson as { snapshotOf: string }).snapshotOf])).toEqual([
      ['2021-03-02T10:15:00Z', 4, 'http://sandbox-web/jtestowy-site/index.html'],
      ['2026-09-25T08:30:00Z', 4, 'http://sandbox-web/jtestowy-site/index.html'],
    ]);
    expect(snapshots[0]!.archiveUrl).toContain('/wayback/web/20210302101500id_/');
    expect(withArchive.evidence).toHaveLength(spec.counts.evidence + 2);
    expect(withArchive.traces.filter((t) => snapshots.some((e) => e.id === t.evidenceId)).map((t) => t.address).sort()).toEqual([addr('A0'), addr('A1')].sort());

    const score = (r: Results) => r.links.map((l) => [key(l.identifier.type as IdentifierType, l.identifier.value), l.address.address, l.score] as const).sort().join('|');
    expect(score(withArchive)).toBe(score(results)); // same links, same scores as the sandbox-only run
    expect(fetched.requested.filter((u) => u.includes('web.archive.org'))).toEqual([]); // the real archive was never asked about a synthetic page
  });
});

describe('Gravatar and ENS bridges (synthetic persona)', () => {
  it('e-mail → Gravatar profile with a wallet; address → ENS name and records; both add independent origins to A1, no other score moves', async () => {
    const created = await api.createCase({ ...spec.case, title: 'Demo — Gravatar i ENS' });
    caseIds.push(created.id);
    const bridged = await pipeline.run(created.id, { ...runOptions, connectors: ['sandbox', 'gravatar', 'ens'] });
    const round = (e: Results['evidence'][number]) => (e.metaJson as { round: number }).round;
    const gravatar = bridged.evidence.filter((e) => e.connectorId === 'gravatar');
    const ens = bridged.evidence.filter((e) => e.connectorId === 'ens');
    expect(gravatar.map((e) => [round(e), (e.metaJson as { platform: string }).platform])).toEqual([[1, 'gravatar.com']]); // found by the e-mail
    expect(ens.map((e) => [round(e), e.resourceId])).toEqual([[2, 'ens:jtestowy.demo.eth']]); // found by reverse lookup of A1
    expect(bridged.traces.filter((t) => t.evidenceId === gravatar[0]!.id).map((t) => t.address)).toEqual([addr('A1')]);
    expect(bridged.traces.filter((t) => t.evidenceId === ens[0]!.id).map((t) => t.address)).toEqual([addr('A1')]);

    const nickA1 = (r: Results) => r.links.find((l) => l.identifier.type === 'NICK' && l.address.address === addr('A1'))!;
    const synergy = nickA1(bridged).breakdownJson as { ruleId: string; evidenceIds: string[] }[];
    const ids = synergy.find((b) => b.ruleId === 'SYNERGY_INDEPENDENT_SOURCES')!.evidenceIds;
    expect(ids).toEqual(expect.arrayContaining([gravatar[0]!.id, ens[0]!.id]));

    const score = (r: Results) => r.links.map((l) => [key(l.identifier.type as IdentifierType, l.identifier.value), l.address.address, l.score] as const).sort().join('|');
    expect(score(bridged)).toBe(score(results)); // A1 was already at 100; nothing else moved
    // synthetic subjects only ever reached the sandbox; the public RPC saw eth_calls for other addresses, never the real Gravatar
    expect(fetched.requested.some((u) => u.includes('api.gravatar.com'))).toBe(false);
  });

  it('a real e-mail on a run without GRAVATAR_API_KEY: the profile is read, the wallets are skipped and the run says so (a note, not an error)', async () => {
    const live = cfg.fetchImpl;
    cfg.fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
      return url.hostname === 'api.gravatar.com'
        ? new Response(JSON.stringify({ display_name: 'Ala Syntetyczna', profile_url: 'https://gravatar.com/ala', payments: { crypto_wallets: [{ label: 'ETH', address: addr('A1') }] } }), { status: 200 })
        : live(input, init);
    }) as typeof fetch;
    try {
      const created = await api.createCase({ title: 'Demo — Gravatar bez klucza', identifiers: [{ type: 'EMAIL', value: 'ala.syntetyczna@gmail.example.pl' }, { type: 'NICK', value: 'jtestowy' }] });
      caseIds.push(created.id);
      const r = await pipeline.run(created.id, { ...runOptions, connectors: ['sandbox', 'gravatar'] });
      const summary = r.run.summaryJson as { connectorNotes: { connector: string; note: { code: string } }[]; connectorErrors: unknown[] };
      expect(summary.connectorNotes).toEqual([expect.objectContaining({ connector: 'gravatar', note: { code: 'GRAVATAR_WALLETS_SKIPPED', params: { key: 'GRAVATAR_API_KEY' } } })]);
      expect(summary.connectorErrors).toEqual([]);
      expect(r.evidence.find((e) => e.connectorId === 'gravatar')!.snippet).not.toContain(addr('A1')); // wallets skipped
      expect(JSON.stringify((await api.report(r.run.id)).doc)).toContain('portfele kryptowalutowe pominięte'); // the report says it too
    } finally {
      cfg.fetchImpl = live;
    }
  });
});

