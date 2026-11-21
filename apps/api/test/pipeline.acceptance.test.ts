import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { normalizeIdentifier, type IdentifierType } from '@olcys/core';
import { ApiController, parseCaseBody } from '../src/api.controller.js';
import { ConnectorRegistry } from '../src/connectors/connector.registry.js';
import { GithubConnector } from '../src/connectors/github.connector.js';
import { SandboxConnector } from '../src/connectors/sandbox.connector.js';
import { EgressClient, EgressConfig } from '../src/egress/egress.client.js';
import { LabelService } from '../src/labels/label.service.js';
import { repoPath } from '../src/paths.js';
import { PipelineService } from '../src/pipeline/pipeline.service.js';
import { PrismaService } from '../src/prisma.service.js';
import { RulesService } from '../src/rules.service.js';
import { sandboxFetch } from './fixture-fetch.js';

/**
 * Acceptance test of the demo case (task acceptance criteria): addresses found, sources linked, scores per the
 * algorithm, sources and premises presented, false attributions rejected, everything stored with provenance.
 * Needs the local Postgres (docker compose up -d db) — and no internet: the sandbox is served from disk.
 */
const spec = JSON.parse(readFileSync(repoPath('fixtures/expected.json'), 'utf8'));
const synthetic: Record<string, { chain: string; address: string }> = JSON.parse(readFileSync(repoPath('fixtures/addresses.json'), 'utf8'));
const addr = (name: string): string => synthetic[name]?.address ?? spec.realAddresses[name];
const key = (type: IdentifierType, value: string) => `${type}:${normalizeIdentifier(type, value)}`;

const prisma = new PrismaService();
const cfg = new EgressConfig();
const fetched = sandboxFetch();
cfg.fetchImpl = fetched;
const egress = new EgressClient(prisma, cfg);
const registry = new ConnectorRegistry(new SandboxConnector(egress), new GithubConnector(egress));
const pipeline = new PipelineService(prisma, new RulesService(), new LabelService(), registry);
const api = new ApiController(prisma, pipeline, registry);
const asOf = new Date(spec.run.asOf);

type Results = Awaited<ReturnType<PipelineService['results']>>;
let caseId: string;
let results: Results;

beforeAll(async () => {
  try {
    await prisma.$queryRaw`SELECT 1`;
  } catch (e) {
    throw new Error(`Postgres is not reachable — start it with "docker compose up -d db" and run the migrations. (${(e as Error).message})`);
  }
  const created = await api.createCase(spec.case);
  caseId = created.id;
  results = await pipeline.run(caseId, { connectors: spec.run.connectors, asOf });
});

afterAll(async () => {
  if (caseId) {
    await prisma.case.delete({ where: { id: caseId } }); // cascades to runs, evidence, traces, links
    await prisma.auditLog.deleteMany({ where: { caseId } });
  }
  const names = [...Object.keys(synthetic).filter((k) => k !== '_comment').map((k) => synthetic[k]!.address), ...Object.values<string>(spec.realAddresses)];
  await prisma.address.deleteMany({ where: { address: { in: names }, links: { none: {} } } });
  await prisma.$disconnect();
});

describe('demo case — the seven stages', () => {
  it('1. input: the case keeps normalised identifiers of three types', async () => {
    const kase = await api.getCase(caseId);
    expect(kase.identifiers.map((i) => key(i.type as IdentifierType, i.value)).sort()).toEqual(['EMAIL:jan.testowy@example.org', 'MESSENGER:jtestowy_pl', 'NICK:jtestowy']);
    expect(kase.runs.map((r) => r.id)).toEqual([results.run.id]);
  });

  it('2. OSINT search: evidence from the sandbox (11 pages) plus 2 found by reverse lookup of an address', () => {
    expect(results.run).toMatchObject({ status: 'DONE', rulesVersion: spec.run.rulesVersion });
    expect(results.evidence).toHaveLength(spec.counts.evidence);
    const meta = (e: Results['evidence'][number]) => e.metaJson as { round: number };
    expect(results.evidence.filter((e) => meta(e).round === 2)).toHaveLength(spec.counts.evidenceFromReverseLookup);
    expect(fetched.requested.every((u) => u.startsWith('http://sandbox-web/'))).toBe(true); // nothing else was contacted
  });

  it('3–6. every expected link: address, score, band, rule-by-rule breakdown, exclusions', () => {
    expect(results.links).toHaveLength(spec.counts.links);
    expect(results.links.filter((l) => l.excludedReason)).toHaveLength(spec.counts.excludedLinks);

    for (const exp of spec.links) {
      const [type, ...rest] = exp.identifier.split(':');
      const link = results.links.find((l) => key(l.identifier.type as IdentifierType, l.identifier.value) === exp.identifier && l.address.address === addr(exp.address));
      expect(link, `${exp.identifier} → ${exp.address}`).toBeDefined();
      const where = `${exp.identifier} → ${exp.address} (${type} ${rest.join(':')})`;
      expect({ score: link!.score, band: link!.band }, where).toEqual({ score: exp.score, band: exp.band });
      expect((link!.breakdownJson as { ruleId: string }[]).map((e) => e.ruleId), where).toEqual(exp.rules);
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
    for (const t of results.traces) expect(t.contextSnippet).toContain(t.address.length > 0 ? t.address : '');
  });

  it('all outbound requests are in the audit log (sandbox only, no secrets, none blocked)', async () => {
    const rows = await prisma.auditLog.findMany({ where: { runId: results.run.id } });
    expect(rows.length).toBe(new Set(fetched.requested).size); // cache: each URL once
    expect(rows.every((r) => r.host === 'sandbox-web' && r.connectorId === 'sandbox' && r.status === 200 && r.caseId === caseId)).toBe(true);
    expect(rows.some((r) => r.path === '/index.json')).toBe(true);
  });

  it('9. reproducible: the same run again gives the same scores and rule ids; stored results are retrievable', async () => {
    const again = await api.startRun(caseId, { connectors: spec.run.connectors });
    const shape = (r: Results) => r.links.map((l) => [l.identifier.value, l.address.address, l.band, (l.breakdownJson as { ruleId: string }[]).map((e) => e.ruleId)]).sort();
    expect(again.run.id).not.toBe(results.run.id);
    // the second run uses "now" as asOf, so only the 2021 snapshot / recency rules could differ — they do not
    expect(shape(again)).toEqual(shape(results));
    expect(await api.getRun(results.run.id)).toEqual(results);
    expect((await api.getCase(caseId)).runs).toHaveLength(2);
  });
});

describe('failure handling and input validation', () => {
  it('a run whose connectors all fail is stored as FAILED with the reason', async () => {
    const broken = { id: 'broken', kind: 'web2', version: '0', policy: {}, search: async () => { throw new Error('boom'); } };
    const stub = { pick: () => [broken], list: () => [] } as unknown as ConnectorRegistry;
    const failing = new PipelineService(prisma, new RulesService(), new LabelService(), stub);
    await expect(failing.run(caseId, { connectors: ['broken'] })).rejects.toThrow(/all connectors failed.*boom/);
    const failed = await prisma.run.findFirst({ where: { caseId, status: 'FAILED' } });
    expect(failed?.finishedAt).not.toBeNull();
    expect(JSON.stringify(failed?.paramsJson)).toContain('boom');
  });

  it('unknown connector → 400, unknown case → 404', async () => {
    await expect(pipeline.run(caseId, { connectors: ['nope'] })).rejects.toThrow(/unknown connector/);
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

  it('GET /connectors lists sources with their policies', () => {
    expect(api.connectors().map((c) => [c.id, c.policy.method])).toEqual([['sandbox', 'synthetic'], ['github', 'official_api']]);
  });
});
