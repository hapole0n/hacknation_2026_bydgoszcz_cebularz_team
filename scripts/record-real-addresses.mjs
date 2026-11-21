// One-off RECORDER for fixtures/recorded/real-addresses.json: the answers of Etherscan (eth_getCode) and TronGrid
// (wallet/getcontract) for FIVE public institutional addresses. The tests replay this file offline
// (apps/api/test/real-addresses.test.ts), so they never touch the internet.
//
//   node scripts/record-real-addresses.mjs      (needs a built api: `pnpm --filter @kropka/api build`, and the keys in .env)
//
// The calls go through EgressClient like every other outbound request (allowlist, rate limit). Keys are read from the
// environment only and never written: the file keeps the URL without `apikey`.
// NOT recorded: transaction lists (txlist / tokentx / TRON transactions). The counterparties of an exchange wallet or a
// router are other people's pseudonymous addresses, and the rules forbid private persons in fixtures. The replay answers
// those calls with an empty history, and the file says so.
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';

process.loadEnvFile(new URL('../.env', import.meta.url));
const load = (p) => import(new URL(`../apps/api/dist/${p}`, import.meta.url).href);
const { EgressClient, EgressConfig } = await load('egress/egress.client.js');
const { EvmEtherscanAdapter } = await load('chains/evm-etherscan.adapter.js');
const { TronGridAdapter } = await load('chains/tron-grid.adapter.js');

// Every address below is public and institutional; all five are also in config/labels or the token guard (chain-adapter.ts).
const ADDRESSES = [
  { name: 'BINANCE_14', chain: 'ETH', address: '0x28C6c06298d514Db089934071355E5743bf21d60', what: 'Binance 14 — exchange hot wallet (label: config/labels/exchanges.json)' },
  { name: 'OKX_TRON_PoR', chain: 'TRON', address: 'TAX6SUmXCqA4TGmbrs5eU3spZYAnkcrVc6', what: 'OKX — USDT-TRC20 wallet from the Proof of Reserves file (label: config/labels/exchanges-tron.json)' },
  { name: 'UNISWAP_V2_ROUTER', chain: 'ETH', address: '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D', what: 'Uniswap V2: Router 02 — DEX contract (label: config/labels/dex.json)' },
  { name: 'USDT_TRC20_CONTRACT', chain: 'TRON', address: 'TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t', what: 'Tether USDT (TRC-20) token contract — NO label: only the contract check can reject it' },
  { name: 'NULL_ADDRESS', chain: 'ETH', address: '0x0000000000000000000000000000000000000000', what: 'Ethereum null address (burn) — technical address (label: config/labels/examples.json)' },
];

const strip = (url) => {
  const u = new URL(url);
  u.searchParams.delete('apikey');
  return u.href;
};
// Long bytecode / ABI strings are cut: the adapters only ask "is it 0x?" / "is there a contract?".
const trim = (v) => (typeof v === 'string' && v.length > 120 ? `${v.slice(0, 66)}…[trimmed ${v.length} chars, sha256 ${createHash('sha256').update(v).digest('hex')}]` : v);
const trimDeep = (o) => (Array.isArray(o) ? o.map(trimDeep) : o && typeof o === 'object' ? Object.fromEntries(Object.entries(o).map(([k, v]) => [k, k === 'abi' ? { trimmed: `abi omitted (${JSON.stringify(v).length} chars)` } : trimDeep(v)])) : trim(o));

const responses = [];
const cfg = new EgressConfig();
cfg.fetchImpl = async (url, init) => {
  const res = await globalThis.fetch(url, init);
  const text = await res.clone().text();
  const href = String(url);
  if (href.includes('action=eth_getCode') || href.endsWith('/wallet/getcontract')) {
    responses.push({ method: init?.method ?? 'GET', url: strip(href), ...(init?.body ? { body: init.body } : {}), status: res.status, recordedAt: new Date().toISOString(), json: trimDeep(JSON.parse(text)) });
  }
  return res;
};
const egress = new EgressClient({ auditLog: { create: async () => ({}) } }, cfg); // no database needed: the audit row is skipped
const adapters = { ETH: new EvmEtherscanAdapter(egress), TRON: new TronGridAdapter(egress) };

for (const a of ADDRESSES) {
  const reason = adapters[a.chain].unavailableReason();
  if (reason) throw new Error(`${a.name}: ${reason.code} ${JSON.stringify(reason.params)} — put the key in .env`);
  await adapters[a.chain].history(a.chain, a.address, { caseId: 'record-real-addresses' });
  console.log(`recorded ${a.name}`);
}

const doc = {
  header: {
    source: 'Etherscan API v2 (module=proxy, action=eth_getCode) and TronGrid (POST /wallet/getcontract), both public APIs, read through EgressClient',
    recordedAt: new Date().toISOString(),
    recorder: 'scripts/record-real-addresses.mjs',
    license: 'Facts read from public blockchains (bytecode present or not, contract metadata); no licence text applies to them. No API key is stored: URLs are saved without `apikey`.',
    notRecorded: 'Transaction lists (txlist, tokentx, TronGrid transactions, transactions/trc20): their counterparties are other people\'s pseudonymous addresses. The replay answers them with an empty history.',
    trimmed: 'Bytecode / ABI longer than 120 characters is cut and marked "[trimmed N chars, sha256 …]" (the sha256 is of the original string); nothing the adapters read is affected.',
  },
  addresses: ADDRESSES,
  responses,
};
writeFileSync(new URL('../fixtures/recorded/real-addresses.json', import.meta.url), JSON.stringify(doc, null, 2) + '\n');
console.log(`wrote fixtures/recorded/real-addresses.json (${responses.length} responses)`);
