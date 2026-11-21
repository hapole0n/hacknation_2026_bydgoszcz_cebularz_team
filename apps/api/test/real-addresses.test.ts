import { readdirSync, readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { ChainAnalysisService } from '../src/chains/chain-analysis.service.js';
import { NbpService } from '../src/chains/nbp.service.js';
import { LabelService } from '../src/labels/label.service.js';
import { repoPath } from '../src/paths.js';
import { makeApp } from './harness.js';

/**
 * False-attribution rejection on FIVE REAL public institutional addresses, on RECORDED answers of Etherscan and TronGrid
 * (fixtures/recorded/real-addresses.json, made by scripts/record-real-addresses.mjs). No network: the recording is replayed
 * through the real adapters and EgressClient. Transaction lists were not recorded (their counterparties are private persons'
 * addresses), so every history is empty here — what is tested is the classification: label, bytecode / contract check.
 */
interface Recorded {
  addresses: { name: string; chain: 'ETH' | 'TRON'; address: string }[];
  responses: { method: string; url: string; body?: string; status: number; json: unknown }[];
}
const rec: Recorded = JSON.parse(readFileSync(repoPath('fixtures/recorded/real-addresses.json'), 'utf8'));
const addressOf = (name: string) => rec.addresses.find((a) => a.name === name)!;

/** The expected verdict per address, written by hand (not derived from the recording). `via`: which step rejects it. */
const EXPECTED = [
  { name: 'BINANCE_14', category: 'CEX_CUSTODIAL', exclusion: 'EXCL_CEX', via: 'label', isContract: false },
  { name: 'OKX_TRON_PoR', category: 'CEX_CUSTODIAL', exclusion: 'EXCL_CEX', via: 'label', isContract: false },
  { name: 'UNISWAP_V2_ROUTER', category: 'DEX', exclusion: 'EXCL_CONTRACT', via: 'label', isContract: true },
  { name: 'USDT_TRC20_CONTRACT', category: 'CONTRACT', exclusion: 'EXCL_CONTRACT', via: 'heuristic', isContract: true }, // no label: only the TRON contract check
  { name: 'NULL_ADDRESS', category: 'EXAMPLE_BURN', exclusion: 'EXCL_EXAMPLE', via: 'label', isContract: null },
] as const;

// The sandbox pages that quote a real address also quote synthetic persona addresses, and their synthetic histories have synthetic
// counterparties; in live mode the run asks about those too. They belong to nobody (no code, no history), so the replay answers for
// them without a recording — and for no other address.
const synthetic = new Set<string>();
for (const f of ['fixtures/addresses.json', ...readdirSync(repoPath('fixtures/chain')).map((n) => `fixtures/chain/${n}`)]) {
  for (const m of readFileSync(repoPath(f), 'utf8').matchAll(/\b(0x[0-9a-fA-F]{40}|T[1-9A-HJ-NP-Za-km-z]{33})\b/g)) synthetic.add(m[1]!.toLowerCase());
}
const EMPTY_ETHERSCAN = { status: '0', message: 'No transactions found', result: [] };

/** Replays the recording for Etherscan / TronGrid; anything else goes to the next fetch (the offline sandbox / NBP of the harness). */
function replay(next: typeof fetch) {
  const served: string[] = [];
  const fn = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (url.hostname !== 'api.etherscan.io' && url.hostname !== 'api.trongrid.io') return next(input, init);
    url.searchParams.delete('apikey'); // the recording was made without it
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? init.body : undefined;
    const hit = rec.responses.find((r) => r.method === method && r.url === url.href && r.body === body);
    const asked = (url.searchParams.get('address') ?? (body && (JSON.parse(body) as { value?: string }).value) ?? url.pathname.split('/')[3] ?? '').toLowerCase();
    served.push(`${method} ${url.hostname}${url.pathname} ${asked}`);
    if (hit) return new Response(JSON.stringify(hit.json), { status: hit.status });
    const action = url.searchParams.get('action');
    if (synthetic.has(asked) && action === 'eth_getCode') return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result: '0x' }), { status: 200 });
    if (synthetic.has(asked) && url.pathname === '/wallet/getcontract') return new Response('{}', { status: 200 });
    if (action === 'txlist' || action === 'tokentx') return new Response(JSON.stringify(EMPTY_ETHERSCAN), { status: 200 }); // history: not recorded
    if (/^\/v1\/accounts\/[^/]+\/transactions(\/trc20)?$/.test(url.pathname)) return new Response(JSON.stringify({ success: true, data: [] }), { status: 200 });
    served.push(`NOT RECORDED ${method} ${url.href} ${body ?? ''}`); // asserted below; the adapters swallow errors into run notes
    throw new Error(`not in the recording: ${method} ${url.href} ${body ?? ''} — re-run scripts/record-real-addresses.mjs`);
  }) as typeof fetch & { served: string[] };
  fn.served = served;
  return fn;
}

const app = makeApp();
const { prisma, cfg, pipeline, api, chains, egress } = app;
const replayed = replay(cfg.fetchImpl);
cfg.fetchImpl = replayed;
const keys = { ETHERSCAN_API_KEY: process.env.ETHERSCAN_API_KEY, TRONGRID_API_KEY: process.env.TRONGRID_API_KEY };
const caseIds: string[] = [];

beforeAll(() => {
  // the adapters insist on a key; the replay ignores it (and never sees a real one)
  process.env.ETHERSCAN_API_KEY = 'replayed-no-real-key';
  process.env.TRONGRID_API_KEY = 'replayed-no-real-key';
});

afterAll(async () => {
  for (const [k, v] of Object.entries(keys)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  for (const id of caseIds) {
    await prisma.case.delete({ where: { id } });
    await prisma.auditLog.deleteMany({ where: { caseId: id } });
  }
  await prisma.address.deleteMany({ where: { address: { in: rec.addresses.map((a) => a.address) }, links: { none: {} }, snapshots: { none: {} } } });
  await prisma.$disconnect();
});

describe('five real public addresses: exchanges, contracts and a technical address are rejected (recorded answers, no network)', () => {
  it.each(EXPECTED)('$name → $category, $exclusion (via $via)', async (exp) => {
    const a = addressOf(exp.name);
    const created = await api.createCase({ title: `Test — odrzucenie ${exp.name}`, identifiers: [{ type: 'ADDRESS', value: a.address }] });
    caseIds.push(created.id);
    const r = await pipeline.run(created.id, { connectors: ['sandbox'], chain: 'live', asOf: new Date('2026-11-21T12:00:00Z') });

    const [subject] = (r.run.summaryJson as { subjects: { address: string; category: string; isContract: boolean | null; labels: { source: string }[]; exclusions: { ruleId: string }[] }[] }).subjects;
    expect(r.run.status).toBe('DONE');
    expect(subject).toMatchObject({ address: a.address, category: exp.category });
    expect(subject!.exclusions.map((e) => e.ruleId)).toEqual([exp.exclusion]);
    expect(subject!.labels.map((l) => l.source)).toEqual([exp.via]);
    expect(subject!.isContract).toBe(exp.isContract);
    expect(r.links).toHaveLength(0); // nothing to attribute: a typed-in address with no page
  });

  it('only the unlabelled contract needed the network: labelled addresses are rejected before any request; every request is audited, path only, no key', async () => {
    expect(replayed.served.filter((s) => s.startsWith('NOT RECORDED'))).toEqual([]);
    const about = (name: string) => replayed.served.filter((s) => s.endsWith(` ${addressOf(name).address.toLowerCase()}`));
    for (const name of ['BINANCE_14', 'OKX_TRON_PoR', 'UNISWAP_V2_ROUTER', 'NULL_ADDRESS']) expect(about(name), `${name} was rejected by its label, with no request`).toEqual([]);
    expect(about('USDT_TRC20_CONTRACT').map((s) => s.split(' ').slice(0, 2).join(' '))).toContain('POST api.trongrid.io/wallet/getcontract'); // the contract check, answered by the recording
    const rows = await prisma.auditLog.findMany({ where: { caseId: { in: caseIds }, host: { in: ['api.etherscan.io', 'api.trongrid.io'] } } });
    expect(rows.length).toBe(replayed.served.length);
    expect(rows.every((r) => r.status === 200 && !r.path.includes('?') && r.connectorId !== 'sandbox')).toBe(true);
    expect(JSON.stringify(rows)).not.toContain('replayed-no-real-key');
    expect(app.fetched.requested.every((u) => /^https?:\/\/(sandbox-web|api\.nbp\.pl|ethereum-rpc\.publicnode\.com)\//.test(u))).toBe(true); // the harness' own offline hosts
  });

  it('the bytecode check alone rejects a real contract even when no label exists; an exchange wallet with no label and no history is NOT caught (documented limit)', async () => {
    const noLabels = { lookup: () => undefined } as unknown as LabelService; // ChainAnalysisService only calls lookup()
    const bare = new ChainAnalysisService(chains, new NbpService(egress), noLabels);
    const run = (name: string) => {
      const a = addressOf(name);
      return bare.analyse({ mode: 'live', chain: a.chain, address: a.address, adAddresses: new Set(), ctx: {} });
    };
    const router = await run('UNISWAP_V2_ROUTER');
    expect(router.analysis).toMatchObject({ category: 'CONTRACT', isContract: true, basis: 'bytecode is not 0x' });
    expect(replayed.served).toContain(`GET api.etherscan.io/v2/api ${addressOf('UNISWAP_V2_ROUTER').address.toLowerCase()}`); // the recorded eth_getCode
    const hot = await run('BINANCE_14');
    expect(hot.analysis).toMatchObject({ category: 'UNHOSTED', isContract: false }); // without the label (or a visible history) a hot wallet looks like any account
  });
});
