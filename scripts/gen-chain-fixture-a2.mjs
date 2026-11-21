// One-off generator of the SYNTHETIC address A2 and its on-chain history (fixtures/chain/A2.json) for the "address swap" demo:
// in sandbox world version 2 the personal site of Jan Testowy shows A2 instead of A1 (see fixtures/sandbox-web/jtestowy-site/v2).
// A2 is a fresh random address (key never kept) that belongs to nobody. Amounts and dates are fixed, so the expectations in
// fixtures/expected.json ("addressChange") do not depend on the random counterparty. Safe to re-run only if you also update the v2 page.
import { readFileSync, writeFileSync } from 'node:fs';
import { freshEth, txid } from './lib/fresh-addresses.mjs';

const addrPath = new URL('../fixtures/addresses.json', import.meta.url);
const addresses = JSON.parse(readFileSync(addrPath, 'utf8'));
if (addresses.A2) {
  console.log('A2 already exists in fixtures/addresses.json — nothing to do (delete it first to regenerate, then update the v2 page)');
  process.exit(0);
}
addresses.A2 = { chain: 'ETH', address: freshEth(), note: 'Jan Testowy — NEW ETH address shown on the personal site in sandbox world version 2 ("symuluj zmianę"); history in fixtures/chain/A2.json' };
writeFileSync(addrPath, JSON.stringify(addresses, null, 2) + '\n');

const A2 = addresses.A2.address;
const D1 = addresses.D1.address; // synthetic exchange deposit address (see gen-chain-fixtures.mjs)
const eth = (label, time, from, to, amount) => ({ tx: txid(label, '0x'), time, from, to, asset: 'USDT', amount });
writeFileSync(
  new URL('../fixtures/chain/A2.json', import.meta.url),
  JSON.stringify(
    {
      _comment: 'SYNTHETIC history of the NEW address A2 (ETH): 3,000 USDT in, then 2,900 USDT to the exchange deposit address D1 (a cash-out signal and the 1,000 EUR threshold).',
      chain: 'ETH',
      address: A2,
      isContract: false,
      transfers: [eth('A2-in-1', '2026-11-10T09:00:00Z', freshEth(), A2, 3000), eth('A2-dep-1', '2026-11-14T11:00:00Z', A2, D1, 2900)],
    },
    null,
    2,
  ) + '\n',
);
console.log('A2 =', A2);
