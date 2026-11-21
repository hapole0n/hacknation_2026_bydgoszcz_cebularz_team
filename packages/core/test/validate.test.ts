import { sha256 } from '@noble/hashes/sha2.js';
import { bech32, bech32m } from '@scure/base';
import { describe, expect, it } from 'vitest';
import { parseAddress, toChecksumAddress } from '../src/index.js';
import { BASE58, BECH32, corrupt, synthBtc, synthEth, synthP2sh, synthSegwit, synthTron } from './helpers.js';

const ok = (raw: string) => {
  const r = parseAddress(raw);
  if (!r.ok) throw new Error(`expected valid: ${raw} (${r.reason})`);
  return r;
};

describe('BTC', () => {
  it('accepts P2PKH (1…) and P2SH (3…) with a valid Base58Check', () => {
    expect(ok('1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).toMatchObject({ chain: 'BTC', kind: 'BTC_P2PKH' }); // genesis block
    expect(ok('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toMatchObject({ chain: 'BTC', kind: 'BTC_P2SH' });
    expect(ok(synthBtc('B1')).kind).toBe('BTC_P2PKH');
    expect(ok(synthP2sh('B2')).kind).toBe('BTC_P2SH');
  });

  it('accepts Bech32 (bc1q…) and Bech32m (bc1p…), canonical form is lowercase', () => {
    const v0 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4'; // BIP-173
    const taproot = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0'; // BIP-350
    expect(ok(v0)).toMatchObject({ kind: 'BTC_BECH32', address: v0 });
    expect(ok(taproot)).toMatchObject({ kind: 'BTC_BECH32M', address: taproot });
    expect(ok(v0.toUpperCase()).address).toBe(v0); // QR codes use upper case
    expect(ok(synthSegwit('B3')).kind).toBe('BTC_BECH32');
  });

  it('rejects broken checksums', () => {
    for (const a of ['1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa', '3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy', synthBtc('B1')]) {
      expect(parseAddress(corrupt(a, BASE58))).toEqual({ ok: false, reason: 'BAD_CHECKSUM' });
    }
    for (const a of ['bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4', 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0']) {
      expect(parseAddress(corrupt(a, BECH32))).toEqual({ ok: false, reason: 'BAD_CHECKSUM' });
    }
  });

  it('enforces the BIP-350 pairing of witness version and checksum variant', () => {
    const program = sha256(new TextEncoder().encode('p')); // 32 bytes
    const v1WithBech32 = bech32.encode('bc', [1, ...bech32.toWords(program)]);
    const v0WithBech32m = bech32m.encode('bc', [0, ...bech32m.toWords(program)]);
    const v1WithBech32m = bech32m.encode('bc', [1, ...bech32m.toWords(program)]);
    expect(parseAddress(v1WithBech32).ok).toBe(false);
    expect(parseAddress(v0WithBech32m).ok).toBe(false);
    expect(parseAddress(v1WithBech32m)).toMatchObject({ ok: true, kind: 'BTC_BECH32M' });
  });

  it('rejects mixed case Bech32, testnet and non-BTC base58 payloads', () => {
    const v0 = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
    expect(parseAddress('bc1QW508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4').ok).toBe(false);
    expect(parseAddress(v0.replace(/^bc/, 'tb')).ok).toBe(false);
    expect(parseAddress(bech32.encode('tb', [0, ...bech32.toWords(sha256(new TextEncoder().encode('t')).slice(0, 20))])).ok).toBe(false);
    expect(parseAddress('mipcBbFg9gMiCh81Kj8tqqdgoZub1ZJRfn').ok).toBe(false); // testnet P2PKH
  });
});

describe('ETH', () => {
  const EIP55 = [
    '0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed',
    '0xfB6916095ca1df60bB79Ce92cE3Ea74c37c5d359',
    '0xdbF03B407c01E7cD3CBea99509d93f8DDDC8C6FB',
    '0xD1220A0cf47c7B9Be7A2E6BA89F429762e7b9aDb',
  ];

  it('accepts the EIP-55 reference vectors', () => {
    for (const a of EIP55) expect(ok(a)).toMatchObject({ chain: 'ETH', kind: 'ETH', address: a });
    expect(ok(synthEth('A1')).kind).toBe('ETH');
  });

  it('rejects mixed-case addresses whose checksum does not match', () => {
    for (const a of EIP55) {
      const i = a.search(/[a-f]/i); // flip the case of the first letter
      const flipped = a.slice(0, i) + (a[i] === a[i]!.toUpperCase() ? a[i]!.toLowerCase() : a[i]!.toUpperCase()) + a.slice(i + 1);
      expect(parseAddress(flipped)).toEqual({ ok: false, reason: 'BAD_CHECKSUM' });
    }
  });

  it('accepts all-lower / all-upper (no checksum) and normalises to EIP-55', () => {
    const a = EIP55[0]!;
    expect(ok(a.toLowerCase()).address).toBe(a);
    expect(ok('0x' + a.slice(2).toUpperCase()).address).toBe(a);
    expect(toChecksumAddress(a.slice(2))).toBe(a);
  });

  it('rejects wrong length and non-hex', () => {
    expect(parseAddress('0x' + 'a'.repeat(39))).toEqual({ ok: false, reason: 'BAD_FORMAT' });
    expect(parseAddress('0x' + 'a'.repeat(41))).toEqual({ ok: false, reason: 'BAD_FORMAT' });
    expect(parseAddress('0x' + 'g'.repeat(40))).toEqual({ ok: false, reason: 'BAD_FORMAT' });
  });
});

describe('TRON', () => {
  it('accepts Base58Check addresses with version byte 0x41', () => {
    expect(ok('TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t')).toMatchObject({ chain: 'TRON', kind: 'TRON' }); // USDT-TRC20 contract
    expect(ok(synthTron('T1')).address).toBe(synthTron('T1'));
  });

  it('rejects broken checksums, wrong length and Bitcoin-style payloads', () => {
    expect(parseAddress(corrupt(synthTron('T1'), BASE58))).toEqual({ ok: false, reason: 'BAD_CHECKSUM' });
    expect(parseAddress(synthTron('T1').slice(0, -1)).ok).toBe(false);
    expect(parseAddress('T' + synthBtc('B1').slice(1, 34)).ok).toBe(false);
  });
});

describe('ENS', () => {
  it('accepts .eth names, canonical form is lowercase', () => {
    expect(ok('vitalik.eth')).toMatchObject({ chain: 'ETH', kind: 'ENS', address: 'vitalik.eth' });
    expect(ok('Sub.Name.ETH').address).toBe('sub.name.eth');
  });

  it('rejects names the registrar would not allow', () => {
    for (const bad of ['a.eth', 'ab.eth', '.eth', 'foo..eth', '-foo.eth', 'foo-.eth', 'foo.com']) expect(parseAddress(bad).ok).toBe(false);
  });
});

it('rejects garbage', () => {
  for (const bad of ['', 'hello', '1234', '0x', 'T', 'bc1']) expect(parseAddress(bad).ok).toBe(false);
});
