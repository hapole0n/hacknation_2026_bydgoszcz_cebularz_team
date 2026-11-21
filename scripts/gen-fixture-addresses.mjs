// One-off generator of SYNTHETIC addresses for fixtures/: fresh random keys, valid checksums, belonging to nobody.
// Private keys exist only in memory and are never printed or saved. Re-running yields different addresses:
// the committed result lives in fixtures/addresses.json (pages in fixtures/sandbox-web embed the same strings).
import { freshBtc, freshEth, freshSegwit, freshTron } from './lib/fresh-addresses.mjs';

const out = {
  A1: { chain: 'ETH', address: freshEth(), note: 'Jan Testowy — current ETH address (site, GitHub-like profile, e-mail footer)' },
  A0: { chain: 'ETH', address: freshEth(), note: 'Jan Testowy — old ETH address (2021 snapshot of the site)' },
  T1: { chain: 'TRON', address: freshTron(), note: 'Jan Testowy — TRON address for USDT (P2P ad, Telegram-like post)' },
  B1: { chain: 'BTC', address: freshBtc(), note: 'Jan Testowy — BTC address mentioned in a forum thread' },
  B2: { chain: 'BTC', address: freshSegwit(), note: 'BTC address pasted in giveaway comments' },
  K1: { chain: 'TRON', address: freshTron(), note: 'Synthetic kantor "USDT ↔ gotówka" (labelled CASP_KANTOR)' },
  AB: { chain: 'ETH', address: freshEth(), note: 'Persona B (other person, same nick) — copy-pasted by several unrelated users' },
};
console.log(JSON.stringify(out, null, 2));
