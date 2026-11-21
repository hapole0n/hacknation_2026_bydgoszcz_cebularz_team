// One-off generator of the SYNTHETIC on-chain histories in fixtures/chain/ (PLAN §5).
// Persona addresses come from fixtures/addresses.json; counterparties are fresh random addresses (keys never kept).
// Amounts, dates and prices are fixed here, so the expectations in fixtures/expected.json do not change when you
// re-run it — only the (meaningless) counterparty addresses do. The committed output is the source of truth.
import { readFileSync, writeFileSync } from 'node:fs';
import { freshEth, freshTron, txid } from './lib/fresh-addresses.mjs';

const addrPath = new URL('../fixtures/addresses.json', import.meta.url);
const addresses = JSON.parse(readFileSync(addrPath, 'utf8'));
if (!addresses.D1) {
  addresses.D1 = { chain: 'ETH', address: freshEth(), onPages: false, note: 'Synthetic exchange DEPOSIT address: only receives from A1 and sweeps to Binance 14 (chain fixture only)' };
  writeFileSync(addrPath, JSON.stringify(addresses, null, 2) + '\n');
}
const A1 = addresses.A1.address, A0 = addresses.A0.address, T1 = addresses.T1.address, K1 = addresses.K1.address, D1 = addresses.D1.address;
const ROUTER = '0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D'; // Uniswap V2 Router 02 (public, see config/labels/dex.json)
const BINANCE_14 = '0x28C6c06298d514Db089934071355E5743bf21d60'; // exchange hot wallet (public, see config/labels/exchanges.json)
const ETH_USD = 2000; // synthetic price, the same for the whole story
const write = (name, doc) => writeFileSync(new URL(`../fixtures/chain/${name}.json`, import.meta.url), JSON.stringify(doc, null, 2) + '\n');
const eth = (label, time, from, to, asset, amount, usdPrice) => ({ tx: txid(label, '0x'), time, from, to, asset, amount, ...(usdPrice ? { usdPrice } : {}) });

// A1: receives ETH -> swaps it for USDT through Uniswap -> sends USDT to an exchange deposit address (D1).
write('A1', {
  _comment: 'SYNTHETIC history of persona A1 (ETH): ETH in, swap to USDT via a DEX router, USDT to an exchange deposit address. Prices are synthetic.',
  chain: 'ETH', address: A1, isContract: false,
  transfers: [
    eth('A1-in-1', '2026-09-20T09:00:00Z', freshEth(), A1, 'ETH', 3, ETH_USD),
    eth('A1-in-2', '2026-10-05T14:30:00Z', freshEth(), A1, 'ETH', 3, ETH_USD),
    eth('A1-swap', '2026-10-12T10:00:00Z', A1, ROUTER, 'ETH', 6, ETH_USD),
    eth('A1-swap', '2026-10-12T10:00:00Z', ROUTER, A1, 'USDT', 11900),
    eth('A1-dep-1', '2026-10-14T08:00:00Z', A1, D1, 'USDT', 5900),
    eth('A1-dep-2', '2026-10-20T08:00:00Z', A1, D1, 'USDT', 5900),
  ],
});

// D1: a per-user deposit address of an exchange: receives from A1 and sweeps everything to the exchange hot wallet.
write('D1', {
  _comment: 'SYNTHETIC exchange deposit address: forwards what it receives to Binance 14 (a public hot wallet).',
  chain: 'ETH', address: D1, isContract: false,
  transfers: [
    eth('A1-dep-1', '2026-10-14T08:00:00Z', A1, D1, 'USDT', 5900),
    eth('D1-sweep-1', '2026-10-14T10:00:00Z', D1, BINANCE_14, 'USDT', 5899),
    eth('A1-dep-2', '2026-10-20T08:00:00Z', A1, D1, 'USDT', 5900),
    eth('D1-sweep-2', '2026-10-20T10:00:00Z', D1, BINANCE_14, 'USDT', 5899),
  ],
});

// A0: the old address of the 2021 snapshot: active around the snapshot date.
write('A0', {
  _comment: 'SYNTHETIC history of the OLD address A0 (ETH), active around the 2021-03-02 snapshot of the personal site.',
  chain: 'ETH', address: A0, isContract: false,
  transfers: [
    eth('A0-in-1', '2021-02-20T10:00:00Z', freshEth(), A0, 'ETH', 0.5, 1900),
    eth('A0-out-1', '2021-03-10T16:20:00Z', A0, freshEth(), 'ETH', 0.2, 1850),
  ],
});

// B2: a BTC address pasted in giveaway comments that was never used.
write('B2', { _comment: 'SYNTHETIC: this BTC address was never used on-chain.', chain: 'BTC', address: addresses.B2.address, isContract: false, transfers: [] });

// T1: many small USDT payments in (24 senders + 3 larger), then USDT to the kantor K1 in three steps.
const tron = (label, time, from, to, amount) => ({ tx: txid(label), time, from, to, asset: 'USDT', amount });
const small = Array.from({ length: 24 }, (_, i) => {
  const day = new Date(Date.UTC(2026, 9, 10 + i, 12)); // 2026-10-10 .. 2026-11-02
  return tron(`T1-small-${i}`, day.toISOString().replace('.000Z', 'Z'), freshTron(), T1, 150 + ((i * 7) % 11) * 30);
});
write('T1', {
  _comment: 'SYNTHETIC history of persona T1 (TRON): many small USDT-TRC20 payments, three larger ones, then USDT to the kantor K1 (USDT -> cash pattern).',
  chain: 'TRON', address: T1, isContract: null,
  transfers: [
    ...small,
    tron('T1-big-1', '2026-11-01T12:00:00Z', freshTron(), T1, 4000),
    tron('T1-big-2', '2026-11-02T18:00:00Z', freshTron(), T1, 3500),
    tron('T1-big-3', '2026-11-03T09:00:00Z', freshTron(), T1, 3000),
    tron('T1-kantor-1', '2026-11-04T10:00:00Z', T1, K1, 6000),
    tron('T1-kantor-2', '2026-11-05T10:00:00Z', T1, K1, 6000),
    tron('T1-kantor-3', '2026-11-07T10:00:00Z', T1, K1, 5500),
  ],
});
console.log('written: A1 D1 A0 B2 T1 (+ D1 in addresses.json if it was missing)');
