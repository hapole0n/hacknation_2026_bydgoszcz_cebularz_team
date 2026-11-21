import { readFileSync } from 'node:fs';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, concatBytes } from '@noble/hashes/utils.js';
import { bech32, createBase58check } from '@scure/base';
import { toChecksumAddress } from '../src/index.js';

// Synthetic addresses: derived from a seed string, so they are valid (checksums) but belong to nobody.
const base58check = createBase58check(sha256);
const h20 = (seed: string) => sha256(new TextEncoder().encode(seed)).slice(0, 20);

export const synthEth = (seed: string) => toChecksumAddress(bytesToHex(h20(seed)));
export const synthTron = (seed: string) => base58check.encode(concatBytes(Uint8Array.of(0x41), h20(seed)));
export const synthBtc = (seed: string) => base58check.encode(concatBytes(Uint8Array.of(0x00), h20(seed)));
export const synthP2sh = (seed: string) => base58check.encode(concatBytes(Uint8Array.of(0x05), h20(seed)));
export const synthSegwit = (seed: string) => bech32.encode('bc', [0, ...bech32.toWords(h20(seed))]);

export const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export const BECH32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';

/** Replaces the last character with a different one from the same alphabet (breaks the checksum). */
export function corrupt(address: string, alphabet: string): string {
  const last = address.at(-1)!;
  const other = alphabet[(alphabet.indexOf(last) + 1) % alphabet.length]!;
  return address.slice(0, -1) + other;
}

export const RULES_YAML = readFileSync(new URL('../../../config/scoring-rules.v1.yaml', import.meta.url), 'utf8');
