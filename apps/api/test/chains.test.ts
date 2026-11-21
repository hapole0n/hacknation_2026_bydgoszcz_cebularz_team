import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { createBase58check } from '@scure/base';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseAddress, tronAddressFromHex, type ChainHistory } from '@kropka/core';
import { BtcMempoolAdapter } from '../src/chains/btc-mempool.adapter.js';
import { ChainUnavailableError, STABLE_CONTRACTS, tokenAsset } from '../src/chains/chain-adapter.js';
import { ChainAnalysisService, MAX_COUNTERPARTY_LOOKUPS } from '../src/chains/chain-analysis.service.js';
import { ChainRegistry } from '../src/chains/chain.registry.js';
import { EvmEtherscanAdapter } from '../src/chains/evm-etherscan.adapter.js';
import { FixtureChainAdapter } from '../src/chains/fixture.adapter.js';
import { NbpService, NbpUnavailableError } from '../src/chains/nbp.service.js';
import { TronGridAdapter } from '../src/chains/tron-grid.adapter.js';
import { EgressClient, EgressConfig, type AllowedHost } from '../src/egress/egress.client.js';
import { LabelService } from '../src/labels/label.service.js';
import type { PrismaService } from '../src/prisma.service.js';
import { sandboxFetch } from './fixture-fetch.js';

const audits: { host: string; path: string; status: number; connectorId: string }[] = [];
const prisma = { auditLog: { create: async ({ data }: { data: (typeof audits)[number] }) => void audits.push(data) } } as unknown as PrismaService;
const NO_LIMITS: AllowedHost[] = ['api.etherscan.io', 'api.trongrid.io', 'mempool.space', 'api.nbp.pl'].map((host) => ({ host }));
function egressWith(fetchImpl: unknown) {
  const cfg = new EgressConfig();
  cfg.fetchImpl = fetchImpl as typeof fetch;
  cfg.allowlist = NO_LIMITS;
  return new EgressClient(prisma, cfg);
}
const reply = (body: unknown, status = 200) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
const hexOf = (tron: string) => bytesToHex(createBase58check(sha256).decode(tron));

const ME = '0x1111111111111111111111111111111111111111';
const PEER = '0x2222222222222222222222222222222222222222';
const USDT_ETH = STABLE_CONTRACTS.ETH!.USDT!;

afterEach(() => {
  delete process.env.ETHERSCAN_API_KEY;
  delete process.env.TRONGRID_API_KEY;
  audits.length = 0;
});

describe('token guard', () => {
  it('well-known stablecoin contracts are valid addresses', () => {
    for (const [chain, tokens] of Object.entries(STABLE_CONTRACTS)) for (const a of Object.values(tokens)) expect(parseAddress(a), `${chain} ${a}`).toMatchObject({ ok: true });
  });

  it('a token named USDT counts as a stablecoin only at the real contract', () => {
    expect(tokenAsset('ETH', 'usdt', USDT_ETH.toLowerCase())).toBe('USDT');
    expect(tokenAsset('ETH', 'USDT', PEER)).toBe('USDT(?)');
    expect(tokenAsset('ETH', 'BUSD', PEER)).toBe('BUSD(?)'); // no verified contract on file
    expect(tokenAsset('ETH', 'PEPE', PEER)).toBe('PEPE');
    expect(tokenAsset('TRON', 'USDT', 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toBe('USDT');
  });
});

describe('Etherscan adapter', () => {
  const route = (answers: Record<string, unknown>) =>
    vi.fn(async (url: string) => {
      const action = new URL(url).searchParams.get('action')!;
      return reply(answers[action]);
    });
  const tx = (o: object) => ({ hash: '0xabc', timeStamp: '1760000000', from: PEER, to: ME, value: '1000000000000000000', isError: '0', ...o });

  it('without a key it says so, clearly', async () => {
    const adapter = new EvmEtherscanAdapter(egressWith(vi.fn()));
    expect(adapter.unavailableReason()).toEqual({ code: 'CHAIN_KEY_MISSING', params: { key: 'ETHERSCAN_API_KEY', chain: 'Ethereum' } });
    await expect(adapter.history('ETH', ME, {})).rejects.toBeInstanceOf(ChainUnavailableError);
  });

  it('reads transactions, token transfers and bytecode, normalised; the key never reaches the audit log', async () => {
    process.env.ETHERSCAN_API_KEY = 'secret-key-123';
    const f = route({
      txlist: { status: '1', message: 'OK', result: [tx({}), tx({ hash: '0xdef', from: ME, to: PEER, value: '500000000000000000', isError: '1' }), tx({ hash: '0xzero', value: '0' })] },
      tokentx: {
        status: '1',
        message: 'OK',
        result: [
          { hash: '0xt1', timeStamp: '1760000100', from: PEER, to: ME, value: '2500000', tokenSymbol: 'USDT', tokenDecimal: '6', contractAddress: USDT_ETH },
          { hash: '0xt2', timeStamp: '1760000200', from: PEER, to: ME, value: '1000000', tokenSymbol: 'USDT', tokenDecimal: '6', contractAddress: PEER },
        ],
      },
      eth_getCode: { jsonrpc: '2.0', id: 1, result: '0x' },
    });
    const h = await new EvmEtherscanAdapter(egressWith(f)).history('ETH', ME, { runId: 'r1' });
    expect(h).toMatchObject({ chain: 'ETH', address: ME, provider: 'etherscan', isContract: false, truncated: false });
    expect(h.transfers).toEqual([
      { tx: '0xabc', time: '2025-10-09T08:53:20Z', from: PEER, to: ME, asset: 'ETH', amount: 1, failed: false },
      { tx: '0xdef', time: '2025-10-09T08:53:20Z', from: ME, to: PEER, asset: 'ETH', amount: 0.5, failed: true },
      { tx: '0xt1', time: '2025-10-09T08:55:00Z', from: PEER, to: ME, asset: 'USDT', amount: 2.5 },
      { tx: '0xt2', time: '2025-10-09T08:56:40Z', from: PEER, to: ME, asset: 'USDT(?)', amount: 1 },
    ]);
    const urls = f.mock.calls.map((c) => new URL(c[0]));
    expect(urls.every((u) => u.origin + u.pathname === 'https://api.etherscan.io/v2/api' && u.searchParams.get('chainid') === '1' && u.searchParams.get('apikey') === 'secret-key-123')).toBe(true);
    expect(urls.map((u) => u.searchParams.get('action')).sort()).toEqual(['eth_getCode', 'tokentx', 'txlist']);
    expect(urls.find((u) => u.searchParams.get('action') === 'eth_getCode')!.searchParams.get('module')).toBe('proxy');
    expect(audits).toHaveLength(3);
    expect(audits.every((a) => a.host === 'api.etherscan.io' && a.path === '/v2/api' && a.connectorId === 'etherscan' && a.status === 200)).toBe(true);
    expect(JSON.stringify(audits)).not.toContain('secret-key-123');
  });

  it('bytecode other than 0x means a contract; "no transactions" is an empty history, not an error', async () => {
    process.env.ETHERSCAN_API_KEY = 'k';
    const empty = { status: '0', message: 'No transactions found', result: [] };
    const h = await new EvmEtherscanAdapter(egressWith(route({ txlist: empty, tokentx: empty, eth_getCode: { jsonrpc: '2.0', id: 1, result: '0x6080604052' } }))).history('ETH', ME, {});
    expect(h).toMatchObject({ isContract: true, transfers: [] });
  });

  it('surfaces provider errors such as the rate limit', async () => {
    process.env.ETHERSCAN_API_KEY = 'k';
    const limited = { status: '0', message: 'NOTOK', result: 'Max rate limit reached' };
    await expect(new EvmEtherscanAdapter(egressWith(route({ txlist: limited, tokentx: limited, eth_getCode: { jsonrpc: '2.0', id: 1, result: '0x' } }))).history('ETH', ME, {})).rejects.toThrow('Max rate limit reached');
  });
});

describe('TronGrid adapter', () => {
  const T_ME = 'TEonzwFMXhEWwoxNLdM13MBs99T9xAGZey';
  const T_PEER = 'TVj7M6fz1ToN76KaRB9ayzC6zqkn7NJvSp';

  it('without a key it says so, clearly', () => {
    expect(new TronGridAdapter(egressWith(vi.fn())).unavailableReason()).toMatchObject({ code: 'CHAIN_KEY_MISSING', params: { key: 'TRONGRID_API_KEY' } });
  });

  it('reads TRX and TRC-20 transfers (hex → base58), sends the key as a header', async () => {
    process.env.TRONGRID_API_KEY = 'tron-secret';
    const f = vi.fn(async (url: string) =>
      url.includes('/trc20')
        ? reply({ success: true, data: [
            { transaction_id: 'tt1', block_timestamp: 1760000000000, from: T_PEER, to: T_ME, type: 'Transfer', value: '5000000', token_info: { symbol: 'USDT', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', decimals: 6 } },
            { transaction_id: 'tt2', block_timestamp: 1760000001000, from: T_PEER, to: T_ME, type: 'Transfer', value: '1000000', token_info: { symbol: 'USDT', address: T_PEER, decimals: 6 } },
          ] })
        : reply({ success: true, data: [
            { txID: 'n1', block_timestamp: 1760000002000, ret: [{ contractRet: 'SUCCESS' }], raw_data: { contract: [{ type: 'TransferContract', parameter: { value: { owner_address: hexOf(T_ME), to_address: hexOf(T_PEER), amount: 2_500_000 } } }] } },
            { txID: 'n2', block_timestamp: 1760000003000, ret: [{ contractRet: 'OUT_OF_ENERGY' }], raw_data: { contract: [{ type: 'TransferContract', parameter: { value: { owner_address: hexOf(T_ME), to_address: hexOf(T_PEER), amount: 1_000_000 } } }] } },
            { txID: 'n3', block_timestamp: 1760000004000, raw_data: { contract: [{ type: 'TriggerSmartContract', parameter: { value: {} } }] } },
          ] }),
    );
    const h = await new TronGridAdapter(egressWith(f)).history('TRON', T_ME, {});
    expect(h.transfers).toEqual([
      { tx: 'n1', time: '2025-10-09T08:53:22Z', from: T_ME, to: T_PEER, asset: 'TRX', amount: 2.5, failed: false },
      { tx: 'n2', time: '2025-10-09T08:53:23Z', from: T_ME, to: T_PEER, asset: 'TRX', amount: 1, failed: true },
      { tx: 'tt1', time: '2025-10-09T08:53:20Z', from: T_PEER, to: T_ME, asset: 'USDT', amount: 5 },
      { tx: 'tt2', time: '2025-10-09T08:53:21Z', from: T_PEER, to: T_ME, asset: 'USDT(?)', amount: 1 },
    ]);
    expect(h.isContract).toBeNull(); // not checked on TRON
    const init = f.mock.calls[0] as unknown as [string, RequestInit];
    expect((init[1].headers as Record<string, string>)['TRON-PRO-API-KEY']).toBe('tron-secret');
    expect(init[0]).toContain('only_confirmed=true');
    expect(JSON.stringify(audits)).not.toContain('tron-secret');
    expect(tronAddressFromHex(hexOf(T_ME))).toBe(T_ME);
  });
});

describe('mempool.space adapter', () => {
  const ADDR = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
  const OTHER = '1BitcoinEaterAddressDontSendf59kuE';
  const conf = (txid: string, vin: string, vout: [string, number][], time = 1760000000) => ({
    txid,
    vin: [{ prevout: { scriptpubkey_address: vin, value: 1 } }],
    vout: vout.map(([a, v]) => ({ scriptpubkey_address: a, value: v })),
    status: { confirmed: true, block_time: time },
  });

  it('is keyless and reduces UTXO transactions to transfers (change is ignored)', async () => {
    const f = vi.fn(async () => reply([
      conf('in1', OTHER, [[ADDR, 150_000_000]]),
      conf('out1', ADDR, [[OTHER, 40_000_000], [ADDR, 9_000_000]]), // 0.4 BTC out, change back to ADDR
      { ...conf('mp', OTHER, [[ADDR, 1]]), status: { confirmed: false } },
    ]));
    const adapter = new BtcMempoolAdapter(egressWith(f));
    expect(adapter.unavailableReason()).toBeUndefined();
    const h = await adapter.history('BTC', ADDR, {});
    expect(h.transfers).toEqual([
      { tx: 'in1', time: '2025-10-09T08:53:20Z', from: OTHER, to: ADDR, asset: 'BTC', amount: 1.5 },
      { tx: 'out1', time: '2025-10-09T08:53:20Z', from: ADDR, to: OTHER, asset: 'BTC', amount: 0.4 },
    ]);
    expect(f.mock.calls[0]![0]).toBe(`https://mempool.space/api/address/${ADDR}/txs`);
  });

  it('pages through confirmed transactions with the last seen txid', async () => {
    const page1 = Array.from({ length: 25 }, (_, i) => conf(`t${i}`, OTHER, [[ADDR, 1000]], 1760000000 - i));
    const f = vi.fn(async (url: string) => reply(url.includes('/txs/chain/') ? [conf('t25', OTHER, [[ADDR, 1000]])] : page1));
    const h = await new BtcMempoolAdapter(egressWith(f)).history('BTC', ADDR, {});
    expect(f.mock.calls[1]![0]).toBe(`https://mempool.space/api/address/${ADDR}/txs/chain/t24`);
    expect(h.transfers).toHaveLength(26);
  });
});

describe('ChainRegistry modes', () => {
  const registry = () => {
    const e = egressWith(vi.fn(async () => reply([])));
    return new ChainRegistry(new FixtureChainAdapter(), new BtcMempoolAdapter(e), new EvmEtherscanAdapter(e), new TronGridAdapter(e));
  };
  const A1 = '0x8ae181fBc9E8Ce4f43cd993F03fDbD25070b3A47';

  it('lists adapters with their readiness', () => {
    expect(registry().list()).toEqual([
      { id: 'fixture', live: false, available: true, reason: null },
      { id: 'mempool.space', live: true, available: true, reason: null },
      { id: 'etherscan', live: true, available: false, reason: { code: 'CHAIN_KEY_MISSING', params: { key: 'ETHERSCAN_API_KEY', chain: 'Ethereum' } } },
      { id: 'trongrid', live: true, available: false, reason: { code: 'CHAIN_KEY_MISSING', params: { key: 'TRONGRID_API_KEY', chain: 'TRON' } } },
    ]);
  });

  it('fixture mode never touches a live adapter; live mode prefers fixtures, then reports the missing key', async () => {
    const r = registry();
    expect((await r.history('fixture', 'ETH', A1, {})).history?.provider).toBe('fixture');
    expect(await r.history('fixture', 'ETH', ME, {})).toEqual({ history: null });
    expect((await r.history('live', 'ETH', A1, {})).history?.provider).toBe('fixture');
    expect((await r.history('live', 'ETH', ME, {})).notes).toEqual([{ code: 'CHAIN_KEY_MISSING', params: { key: 'ETHERSCAN_API_KEY', chain: 'Ethereum' } }]);
    expect((await r.history('off', 'ETH', A1, {})).history).toBeNull();
  });
});

describe('NBP rates (art. 11a PIT: last business day BEFORE the transaction)', () => {
  // distinct rate per business day so the chosen day is visible: EUR = 4 + dayOfMonth/100
  const varying = (code: 'USD' | 'EUR', day: string) => {
    const dow = new Date(`${day}T00:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6 || day === '2026-11-11') return undefined;
    return (code === 'EUR' ? 4 : 3.5) + Number(day.slice(8)) / 100;
  };
  const setup = () => {
    const f = sandboxFetch({ nbpMid: varying });
    return { nbp: new NbpService(egressWith(f)), f };
  };

  it('picks the previous business day: Monday → Friday, after a holiday → the day before it', async () => {
    const { nbp } = setup();
    const fx = await nbp.fxFor(['2026-11-09T10:00:00Z', '2026-11-12T10:00:00Z', '2026-11-11T10:00:00Z', '2026-11-10T09:00:00Z'], {});
    expect(fx.get('2026-11-09T10:00:00Z')).toEqual({ usdPln: 3.5 + 0.06, eurPln: 4.06, usdDate: '2026-11-06', eurDate: '2026-11-06' });
    expect(fx.get('2026-11-12T10:00:00Z')?.eurDate).toBe('2026-11-10'); // 11-11 is a holiday
    expect(fx.get('2026-11-11T10:00:00Z')?.eurDate).toBe('2026-11-10');
    expect(fx.get('2026-11-10T09:00:00Z')?.eurDate).toBe('2026-11-09'); // a rate is not used on its own day
  });

  it('uses the Polish calendar day (late evening UTC is already tomorrow in Warsaw)', async () => {
    const { nbp } = setup();
    const fx = await nbp.fxFor(['2026-11-09T23:30:00Z'], {}); // = 2026-11-10 00:30 CET → previous business day is 11-09
    expect(fx.get('2026-11-09T23:30:00Z')?.eurDate).toBe('2026-11-09');
  });

  it('caches: a second lookup in a covered range makes no request; one range request per currency', async () => {
    const { nbp, f } = setup();
    await nbp.fxFor(['2026-10-05T10:00:00Z', '2026-10-20T10:00:00Z'], {});
    const first = f.requested.length;
    expect(f.requested.filter((u) => u.includes('/rates/a/eur/'))).toHaveLength(1);
    expect(f.requested[0]).toMatch(/^https:\/\/api\.nbp\.pl\/api\/exchangerates\/rates\/a\/(usd|eur)\/2026-09-25\/2026-10-19\/\?format=json$/);
    await nbp.fxFor(['2026-10-07T10:00:00Z'], {});
    expect(f.requested).toHaveLength(first);
    await nbp.fxFor(['2021-03-01T10:00:00Z'], {}); // far away: its own request, not a five-year range
    expect(f.requested.slice(first).every((u) => u.includes('/2021-02-'))).toBe(true);
  });

  it('long histories are fetched in chunks of at most 90 days (the NBP API limit)', async () => {
    const f = sandboxFetch({ nbpMid: (_code, day) => (day >= '2026-01-01' ? 4.2 : undefined) });
    const fx = await new NbpService(egressWith(f)).fxFor(['2026-02-10T10:00:00Z', '2026-09-01T10:00:00Z'], {});
    const ranges = f.requested.filter((u) => u.includes('/rates/a/usd/')).map((u) => new URL(u).pathname.split('/').slice(-3, -1));
    expect(ranges.length).toBe(3);
    for (const [a, b] of ranges) expect((Date.parse(b!) - Date.parse(a!)) / 86_400_000).toBeLessThanOrEqual(90);
    expect(fx.get('2026-09-01T10:00:00Z')?.eurPln).toBe(4.2);
  });

  it('a day with no earlier published rate cannot be valued (chunks without quotations answer 404)', async () => {
    const f = sandboxFetch({ nbpMid: (_code, day) => (day >= '2026-06-01' ? 4.2 : undefined) });
    await expect(new NbpService(egressWith(f)).fxFor(['2026-03-01T10:00:00Z'], {})).rejects.toBeInstanceOf(NbpUnavailableError);
  });

  it('reports an NBP outage as NbpUnavailableError', async () => {
    const nbp = new NbpService(egressWith(vi.fn(async () => reply('boom', 500))));
    await expect(nbp.fxFor(['2026-10-05T10:00:00Z'], {})).rejects.toBeInstanceOf(NbpUnavailableError);
  });
});

describe('ChainAnalysisService (stubbed histories)', () => {
  const labels = new LabelService();
  const tr = (tx: string, from: string, to: string, asset: string, amount: number, time = '2026-10-10T10:00:00Z') => ({ tx, time, from, to, asset, amount });
  const hist = (address: string, transfers: ReturnType<typeof tr>[], extra: Partial<ChainHistory> = {}): ChainHistory => ({ chain: 'ETH', address, provider: 'stub', fetchedAt: '2026-11-21T00:00:00Z', transfers, ...extra });
  const eth = (n: number) => `0x${n.toString(16).padStart(40, '0')}`;
  const BINANCE = '0x28C6c06298d514Db089934071355E5743bf21d60';
  const nbp = () => new NbpService(egressWith(sandboxFetch()));
  const service = (histories: Record<string, ChainHistory>, nbpService = nbp()) => {
    const stub = { history: vi.fn(async (_m: string, _c: string, a: string) => ({ history: histories[a.toLowerCase()] ?? null })) } as unknown as ChainRegistry;
    return { svc: new ChainAnalysisService(stub, nbpService, labels), history: (stub as unknown as { history: ReturnType<typeof vi.fn> }).history };
  };
  const run = (svc: ChainAnalysisService, address: string) => svc.analyse({ mode: 'fixture', chain: 'ETH', address, adAddresses: new Set(), ctx: {} });

  it('bytecode ≠ 0x → CONTRACT', async () => {
    const { svc } = service({ [eth(1)]: hist(eth(1), [tr('a', eth(2), eth(1), 'ETH', 1)], { isContract: true }) });
    expect((await run(svc, eth(1))).analysis).toMatchObject({ category: 'CONTRACT', basis: expect.stringContaining('bytecode') });
  });

  it('only forwards to an exchange wallet → CEX_DEPOSIT (custodial, a KYC lead)', async () => {
    const dep = eth(3);
    const { svc } = service({ [dep]: hist(dep, [tr('a', eth(9), dep, 'USDT', 1000), tr('b', dep, BINANCE, 'USDT', 999)]) });
    expect((await run(svc, dep)).analysis).toMatchObject({ category: 'CEX_DEPOSIT' });
  });

  it('a crowd of one-off counterparties → UNKNOWN_SERVICE; an ordinary wallet stays UNHOSTED', async () => {
    const crowd = hist(eth(4), Array.from({ length: 120 }, (_, i) => tr(`c${i}`, eth(1000 + i), eth(4), 'ETH', 1)));
    const quiet = hist(eth(5), [tr('q', eth(6), eth(5), 'ETH', 1)]);
    const { svc } = service({ [eth(4)]: crowd, [eth(5)]: quiet });
    expect((await run(svc, eth(4))).analysis?.category).toBe('UNKNOWN_SERVICE');
    expect((await run(svc, eth(5))).analysis).toMatchObject({ category: 'UNHOSTED', everUsed: true });
  });

  it('looks up at most a few unlabelled recipients, and classifies them by their own history', async () => {
    const subject = eth(7);
    const recipients = Array.from({ length: 8 }, (_, i) => eth(100 + i));
    const subjectHistory = hist(subject, [tr('in', eth(50), subject, 'USDT', 8000), ...recipients.map((r, i) => tr(`o${i}`, subject, r, 'USDT', 1000))]);
    const deposit = hist(recipients[0]!, [tr('o0', subject, recipients[0]!, 'USDT', 1000), tr('s0', recipients[0]!, BINANCE, 'USDT', 999)]);
    const { svc, history } = service({ [subject]: subjectHistory, [recipients[0]!]: deposit });
    const { analysis } = await run(svc, subject);
    expect(history.mock.calls.length).toBe(1 + MAX_COUNTERPARTY_LOOKUPS); // the subject + the capped lookups
    expect(analysis?.counterparties).toEqual([expect.objectContaining({ address: recipients[0], category: 'CEX_DEPOSIT', source: 'heuristic' })]);
    expect(analysis?.indicators.tags).toContain('TO_CEX_DEPOSIT');
  });

  it('degrades to unvalued transfers with a warning when NBP is down', async () => {
    const down = new NbpService(egressWith(vi.fn(async () => reply('x', 503))));
    const { svc } = service({ [eth(8)]: hist(eth(8), [tr('a', eth(9), eth(8), 'USDT', 500)]) }, down);
    const { analysis } = await run(svc, eth(8));
    expect(analysis?.warnings).toContainEqual({ code: 'NBP_HTTP', params: { status: 503 } });
    expect(analysis?.indicators.totals).toMatchObject({ inPln: 0, unvalued: 1 });
  });

  it('returns the registry note when there is no history', async () => {
    const stub = { history: async () => ({ history: null, notes: [{ code: 'CHAIN_KEY_MISSING' }] }) } as unknown as ChainRegistry;
    expect(await new ChainAnalysisService(stub, nbp(), labels).analyse({ mode: 'live', chain: 'ETH', address: ME, adAddresses: new Set(), ctx: {} })).toEqual({ notes: [{ code: 'CHAIN_KEY_MISSING' }] });
  });
});
