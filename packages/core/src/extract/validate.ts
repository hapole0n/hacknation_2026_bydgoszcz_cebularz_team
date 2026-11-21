import { sha256 } from '@noble/hashes/sha2.js';
import { keccak_256 } from '@noble/hashes/sha3.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { bech32, bech32m, createBase58check } from '@scure/base';
import type { Chain } from '../chain.js';

export type AddressKind =
  | 'BTC_P2PKH'
  | 'BTC_P2SH'
  | 'BTC_BECH32' // segwit v0 (bc1q…)
  | 'BTC_BECH32M' // taproot (bc1p…)
  | 'ETH'
  | 'ENS'
  | 'TRON'
  | 'MONERO' // detect-only
  | 'LIGHTNING_INVOICE' // detect-only
  | 'LIGHTNING_ADDRESS'; // detect-only (lud16)

export interface ParsedAddress {
  chain: Chain;
  kind: AddressKind;
  /** Canonical form: ETH → EIP-55, bech32 → lowercase, ENS → lowercase, base58 → as is. */
  address: string;
}
export type ParseResult = ({ ok: true } & ParsedAddress) | { ok: false; reason: 'BAD_CHECKSUM' | 'BAD_FORMAT' };

const base58check = createBase58check(sha256);
const bad = (reason: 'BAD_CHECKSUM' | 'BAD_FORMAT'): ParseResult => ({ ok: false, reason });

/** EIP-55 mixed-case checksum of a 40-hex-digit body (without 0x). */
export function toChecksumAddress(hex40: string): string {
  const lower = hex40.toLowerCase();
  const hash = bytesToHex(keccak_256(utf8ToBytes(lower)));
  let out = '0x';
  for (let i = 0; i < lower.length; i++) out += parseInt(hash[i]!, 16) >= 8 ? lower[i]!.toUpperCase() : lower[i];
  return out;
}

function parseEth(raw: string): ParseResult {
  if (!/^0x[0-9a-fA-F]{40}$/.test(raw)) return bad('BAD_FORMAT');
  const body = raw.slice(2);
  const mixed = body !== body.toLowerCase() && body !== body.toUpperCase();
  const checksummed = toChecksumAddress(body);
  // All-lower / all-upper carries no checksum (valid per EIP-55); mixed case must match exactly.
  if (mixed && checksummed !== raw) return bad('BAD_CHECKSUM');
  return { ok: true, chain: 'ETH', kind: 'ETH', address: checksummed };
}

function parseBase58Btc(raw: string): ParseResult {
  let data: Uint8Array;
  try {
    data = base58check.decode(raw);
  } catch {
    return bad('BAD_CHECKSUM');
  }
  if (data.length !== 21) return bad('BAD_FORMAT');
  if (data[0] === 0x00) return { ok: true, chain: 'BTC', kind: 'BTC_P2PKH', address: raw };
  if (data[0] === 0x05) return { ok: true, chain: 'BTC', kind: 'BTC_P2SH', address: raw };
  return bad('BAD_FORMAT');
}

function parseSegwit(raw: string): ParseResult {
  if (raw !== raw.toLowerCase() && raw !== raw.toUpperCase()) return bad('BAD_FORMAT'); // mixed case is invalid
  const s = raw.toLowerCase();
  // BIP-350: v0 must use bech32, v1+ must use bech32m. Try both, then check the pairing.
  for (const [coder, kind] of [
    [bech32, 'BTC_BECH32'],
    [bech32m, 'BTC_BECH32M'],
  ] as const) {
    let dec;
    try {
      dec = coder.decode(s);
    } catch {
      continue;
    }
    if (dec.prefix !== 'bc') return bad('BAD_FORMAT'); // mainnet only
    const version = dec.words[0]!;
    let program: Uint8Array;
    try {
      program = coder.fromWords(dec.words.slice(1));
    } catch {
      return bad('BAD_FORMAT');
    }
    const v0 = kind === 'BTC_BECH32' && version === 0 && (program.length === 20 || program.length === 32);
    const v1 = kind === 'BTC_BECH32M' && version === 1 && program.length === 32; // taproot only
    return v0 || v1 ? { ok: true, chain: 'BTC', kind, address: s } : bad('BAD_CHECKSUM');
  }
  return bad('BAD_CHECKSUM');
}

function parseTron(raw: string): ParseResult {
  if (!/^T[1-9A-HJ-NP-Za-km-z]{33}$/.test(raw)) return bad('BAD_FORMAT');
  let data: Uint8Array;
  try {
    data = base58check.decode(raw);
  } catch {
    return bad('BAD_CHECKSUM');
  }
  return data.length === 21 && data[0] === 0x41 ? { ok: true, chain: 'TRON', kind: 'TRON', address: raw } : bad('BAD_CHECKSUM');
}

function parseEns(raw: string): ParseResult {
  const name = raw.toLowerCase();
  // 2nd-level labels must have ≥3 chars (ENS registrar rule).
  if (!/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+eth$/.test(name) || name.split('.').at(-2)!.length < 3) return bad('BAD_FORMAT');
  return { ok: true, chain: 'ETH', kind: 'ENS', address: name };
}

/** Validates one address-like string (BTC / ETH / TRON / ENS). Mainnet only. */
export function parseAddress(raw: string): ParseResult {
  if (/^0x/.test(raw)) return parseEth(raw);
  if (/^bc1/i.test(raw)) return parseSegwit(raw);
  if (/^T/.test(raw)) return parseTron(raw);
  if (/^[13]/.test(raw)) return parseBase58Btc(raw);
  if (/\.eth$/i.test(raw)) return parseEns(raw);
  return bad('BAD_FORMAT');
}

/** Case-insensitive kinds are compared lowercase, base58 is case-sensitive. */
export function addressKey(kind: AddressKind, address: string): string {
  return kind === 'ETH' || kind === 'ENS' || kind === 'BTC_BECH32' || kind === 'BTC_BECH32M' ? address.toLowerCase() : address;
}
