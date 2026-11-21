import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, concatBytes, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

/**
 * ENS (Ethereum Name Service) over plain `eth_call`: the pure part — name hashing and ABI encoding / decoding.
 * No I/O: the API sends the calls through EgressClient.
 * shortcut: names are lower-cased only (no UTS-46 / ENSIP-15 normalisation) and off-chain (CCIP-read) resolvers are not
 * followed — such names simply yield nothing; add `@adraffy/ens-normalize` when names with emoji / accents matter.
 */

/** The ENS registry (same address on mainnet and testnets). */
export const ENS_REGISTRY = '0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e';
/** Text records worth reading for attribution (PLAN 3.1). */
export const ENS_TEXT_KEYS = ['com.twitter', 'com.github', 'email', 'url'] as const;
export const isEnsName = (v: string) => /^[a-z0-9-]+(\.[a-z0-9-]+)*\.eth$/.test(v.trim().toLowerCase());

const hex = (b: Uint8Array) => bytesToHex(b);
const pad32 = (b: Uint8Array) => concatBytes(new Uint8Array(32 - (b.length % 32 || 32)), b);

/** EIP-137 namehash: `namehash("") = 0x00…00`, `namehash(a.b) = keccak(namehash(b) ‖ keccak(a))`. */
export function namehash(name: string): string {
  let node = new Uint8Array(32);
  for (const label of name.trim().toLowerCase().split('.').reverse()) if (label) node = keccak_256(concatBytes(node, keccak_256(utf8ToBytes(label))));
  return `0x${hex(node)}`;
}

/** Node of the reverse record of an address: `<40 hex, lower-case>.addr.reverse`. */
export const reverseNode = (address: string) => namehash(`${address.toLowerCase().replace(/^0x/, '')}.addr.reverse`);

const selector = (signature: string) => hex(keccak_256(utf8ToBytes(signature)).slice(0, 4));
const SEL = { resolver: selector('resolver(bytes32)'), addr: selector('addr(bytes32)'), name: selector('name(bytes32)'), text: selector('text(bytes32,string)') };
const word = (n: number) => pad32(Uint8Array.of(n));

export const callResolver = (node: string) => `0x${SEL.resolver}${node.slice(2)}`;
export const callAddr = (node: string) => `0x${SEL.addr}${node.slice(2)}`;
export const callName = (node: string) => `0x${SEL.name}${node.slice(2)}`;

/** `text(bytes32 node, string key)`: selector ‖ node ‖ offset(0x40) ‖ length ‖ key padded to 32 bytes. */
export function callText(node: string, key: string): string {
  const k = utf8ToBytes(key);
  const padded = concatBytes(k, new Uint8Array((32 - (k.length % 32)) % 32));
  return `0x${SEL.text}${node.slice(2)}${hex(word(0x40))}${hex(pad32(Uint8Array.of(k.length)))}${hex(padded)}`;
}

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000';

/** An `address` return value; null for the zero address (no resolver / no record). */
export function decodeAddress(result: string): string | null {
  const h = result.replace(/^0x/, '');
  if (h.length < 64) return null;
  const a = `0x${h.slice(24, 64)}`;
  return a === ZERO_ADDRESS ? null : a;
}

/** A `string` return value (ABI: offset ‖ length ‖ data); '' for an empty result. */
export function decodeString(result: string): string {
  const h = result.replace(/^0x/, '');
  if (h.length < 128) return '';
  const offset = parseInt(h.slice(0, 64), 16) * 2;
  const length = parseInt(h.slice(offset, offset + 64), 16);
  if (!Number.isFinite(length) || length === 0 || offset + 64 + length * 2 > h.length) return '';
  return new TextDecoder('utf-8', { fatal: false }).decode(hexToBytes(h.slice(offset + 64, offset + 64 + length * 2)));
}
