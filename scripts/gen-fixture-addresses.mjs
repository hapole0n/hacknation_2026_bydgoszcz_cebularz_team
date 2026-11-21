// One-off generator of SYNTHETIC addresses for fixtures/: fresh random keys, valid checksums, belonging to nobody.
// Private keys exist only in memory and are never printed or saved. Re-running yields different addresses:
// the committed result lives in fixtures/addresses.json (pages in fixtures/sandbox-web embed the same strings).
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js';
import { bech32, createBase58check } from '@scure/base';

const base58check = createBase58check(sha256);
const newKey = () => secp256k1.utils.randomSecretKey();

function evmHash20(sk) {
  const pub = secp256k1.getPublicKey(sk, false); // 65 bytes, 0x04 || X || Y
  return keccak_256(pub.slice(1)).slice(-20);
}
function eth(sk) {
  const lower = bytesToHex(evmHash20(sk));
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lower)));
  return '0x' + [...lower].map((c, i) => (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
}
const tron = (sk) => base58check.encode(concatBytes(Uint8Array.of(0x41), evmHash20(sk)));
const hash160 = (sk) => ripemd160(sha256(secp256k1.getPublicKey(sk, true)));
const btcP2pkh = (sk) => base58check.encode(concatBytes(Uint8Array.of(0x00), hash160(sk)));
const btcSegwit = (sk) => bech32.encode('bc', [0, ...bech32.toWords(hash160(sk))]);

const out = {
  A1: { chain: 'ETH', address: eth(newKey()), note: 'Jan Testowy — current ETH address (site, GitHub-like profile, e-mail footer)' },
  A0: { chain: 'ETH', address: eth(newKey()), note: 'Jan Testowy — old ETH address (2021 snapshot of the site)' },
  T1: { chain: 'TRON', address: tron(newKey()), note: 'Jan Testowy — TRON address for USDT (P2P ad, Telegram-like post)' },
  B1: { chain: 'BTC', address: btcP2pkh(newKey()), note: 'Jan Testowy — BTC address mentioned in a forum thread' },
  B2: { chain: 'BTC', address: btcSegwit(newKey()), note: 'BTC address pasted in giveaway comments' },
  K1: { chain: 'TRON', address: tron(newKey()), note: 'Synthetic kantor "USDT ↔ gotówka" (labelled CASP_KANTOR)' },
  AB: { chain: 'ETH', address: eth(newKey()), note: 'Persona B (other person, same nick) — copy-pasted by several unrelated users' },
};
console.log(JSON.stringify(out, null, 2));
