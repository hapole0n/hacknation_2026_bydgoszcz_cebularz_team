// Fresh synthetic addresses from random keys (in memory only, never printed or saved): valid checksums, owned by nobody.
import { secp256k1 } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { ripemd160 } from '@noble/hashes/legacy.js';
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js';
import { bech32, createBase58check } from '@scure/base';

const base58check = createBase58check(sha256);
const evmHash20 = (sk) => keccak_256(secp256k1.getPublicKey(sk, false).slice(1)).slice(-20);
const hash160 = (sk) => ripemd160(sha256(secp256k1.getPublicKey(sk, true)));
const key = () => secp256k1.utils.randomSecretKey();

export function freshEth() {
  const lower = bytesToHex(evmHash20(key()));
  const hash = bytesToHex(keccak_256(new TextEncoder().encode(lower)));
  return '0x' + [...lower].map((c, i) => (parseInt(hash[i], 16) >= 8 ? c.toUpperCase() : c)).join('');
}
export const freshTron = () => base58check.encode(concatBytes(Uint8Array.of(0x41), evmHash20(key())));
export const freshBtc = () => base58check.encode(concatBytes(Uint8Array.of(0x00), hash160(key())));
export const freshSegwit = () => bech32.encode('bc', [0, ...bech32.toWords(hash160(key()))]);
/** Deterministic pseudo transaction id from a label. */
export const txid = (label, prefix = '') => prefix + bytesToHex(sha256(new TextEncoder().encode(label)));
