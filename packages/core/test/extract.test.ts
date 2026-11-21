import { describe, expect, it } from 'vitest';
import { extractAddresses, normalizeText } from '../src/index.js';
import { BASE58, corrupt, synthBtc, synthEth, synthSegwit, synthTron } from './helpers.js';

const A1 = synthEth('A1');
const T1 = synthTron('T1');
const B1 = synthBtc('B1');
const SEGWIT = synthSegwit('B3');
const TAPROOT = 'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0';

describe('extraction of valid addresses', () => {
  it('finds BTC, ETH, TRON and ENS in one Polish text, with positions', () => {
    const text = `Wesprzyj projekt: ETH ${A1}, USDT TRC20 ${T1}. BTC: ${B1} lub ${SEGWIT} lub ${TAPROOT}. ENS: jtestowy.eth`;
    const { addresses, rejected } = extractAddresses(text);
    expect(rejected).toEqual([]);
    expect(addresses.map((a) => [a.kind, a.address])).toEqual([
      ['ETH', A1],
      ['TRON', T1],
      ['BTC_P2PKH', B1],
      ['BTC_BECH32', SEGWIT],
      ['BTC_BECH32M', TAPROOT],
      ['ENS', 'jtestowy.eth'],
    ]);
    for (const a of addresses) {
      expect(text.slice(a.position, a.end)).toBe(a.raw);
      expect(a.analyzable).toBe(true);
      expect(a.isExample).toBe(false);
      expect(a.repaired).toBe(false);
    }
    expect(addresses.map((a) => a.chain)).toEqual(['ETH', 'TRON', 'BTC', 'BTC', 'BTC', 'ETH']);
  });

  it('normalises lower-case ETH to EIP-55 and upper-case Bech32 to lower case', () => {
    const { addresses } = extractAddresses(`${A1.toLowerCase()} ${SEGWIT.toUpperCase()}`);
    expect(addresses.map((a) => a.address)).toEqual([A1, SEGWIT]);
  });

  it('reports every occurrence, sorted by position', () => {
    const { addresses } = extractAddresses(`${T1} i jeszcze raz ${T1}`);
    expect(addresses).toHaveLength(2);
    expect(addresses[0]!.position).toBeLessThan(addresses[1]!.position);
  });

  it('finds addresses next to punctuation, in URLs and in payment URIs', () => {
    const text = `(${A1}), https://example.org/address/${T1}?x=1 bitcoin:${SEGWIT}?amount=0.1 "${B1}"`;
    expect(extractAddresses(text).addresses.map((a) => a.address)).toEqual([A1, T1, SEGWIT, B1]);
  });

  it('does not match an address glued to other letters or digits', () => {
    expect(extractAddresses(`adres${A1}`).addresses).toEqual([]);
    expect(extractAddresses(`${A1}00`).addresses).toEqual([]);
  });

  it('finds nothing in ordinary prose', () => {
    const prose = 'Tomorrow 1 2 3 Test This is a normal sentence about Bitcoin, Ethereum and 3 kantors in Lublin. Total: 1 000 EUR. 0x is a prefix.';
    expect(extractAddresses(prose)).toMatchObject({ addresses: [], rejected: [] });
  });
});

describe('context window', () => {
  it('keeps ±200 characters around the match', () => {
    const left = 'a '.repeat(250);
    const right = ' b'.repeat(250);
    const { addresses } = extractAddresses(`${left}${A1}${right}`);
    expect(addresses[0]!.context).toHaveLength(200 + A1.length + 200);
    expect(addresses[0]!.context).toContain(A1);
  });

  it('is cut at the text boundaries and the radius is configurable', () => {
    const { addresses } = extractAddresses(`Sprzedam USDT ${T1}`);
    expect(addresses[0]!.context).toBe(`Sprzedam USDT ${T1}`);
    const small = extractAddresses(`${'x '.repeat(50)}${T1}${' y'.repeat(50)}`, { contextRadius: 10 });
    expect(small.addresses[0]!.context).toHaveLength(10 + T1.length + 10);
  });
});

describe('rejections', () => {
  it('rejects transaction hashes (64 hex, with and without 0x) and shortens them', () => {
    const hash = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f90';
    const { addresses, rejected } = extractAddresses(`tx: 0x${hash} oraz ${hash}`);
    expect(addresses).toEqual([]);
    expect(rejected.map((r) => r.reason)).toEqual(['TX_HASH', 'TX_HASH']);
    expect(rejected[0]!.raw).toBe(`0xa1b2c3…${hash.slice(-6)}`);
    expect(rejected[0]!.raw).not.toContain(hash);
  });

  it('rejects look-alikes with a broken checksum and reports why', () => {
    const i = A1.search(/[a-f]/i); // flip the case of the first hex letter (digits have no case)
    const badEth = A1.slice(0, i) + (A1[i] === A1[i]!.toUpperCase() ? A1[i]!.toLowerCase() : A1[i]!.toUpperCase()) + A1.slice(i + 1);
    const { addresses, rejected } = extractAddresses(`${badEth} ${corrupt(T1, BASE58)} ${corrupt(B1, BASE58)}`);
    expect(addresses).toEqual([]);
    expect(rejected.map((r) => r.reason)).toEqual(['BAD_CHECKSUM', 'BAD_CHECKSUM', 'BAD_CHECKSUM']);
  });
});

describe('example / burn addresses', () => {
  const BURN_ETH = '0x000000000000000000000000000000000000dEaD';
  const BURN_BTC = '1BitcoinEaterAddressDontSendf59kuE';
  const text = `burn ${BURN_ETH} i ${BURN_BTC} oraz ${A1}`;

  it('flags the ones from the examples list (they still reach scoring as EXCL_EXAMPLE)', () => {
    const { addresses } = extractAddresses(text, { examples: [BURN_ETH.toLowerCase(), BURN_BTC] });
    expect(addresses.map((a) => [a.address, a.isExample])).toEqual([
      [BURN_ETH, true],
      [BURN_BTC, true],
      [A1, false],
    ]);
  });

  it('flags nothing without a list', () => {
    expect(extractAddresses(text).addresses.every((a) => !a.isExample)).toBe(true);
  });
});

describe('normalisation, split lines and obfuscation', () => {
  it('strips zero-width characters; offsets refer to the normalised text', () => {
    const noisy = `Adres:​ ${A1.slice(0, 20)}​‍${A1.slice(20)}﻿.`;
    const res = extractAddresses(noisy);
    expect(res.text).toBe(`Adres: ${A1}.`);
    expect(res.addresses[0]).toMatchObject({ address: A1, position: 7 });
    expect(normalizeText('a\r\nb​c')).toBe('a\nbc');
  });

  it('re-joins "0x 12ab…" style obfuscation', () => {
    const { addresses } = extractAddresses(`ETH: 0x ${A1.slice(2)}`);
    expect(addresses[0]).toMatchObject({ address: A1, repaired: true });
    expect(extractAddresses(`ETH: 0x ${A1.slice(2)}`, { handleObfuscation: false }).addresses).toEqual([]);
  });

  it('re-joins addresses grouped by spaces', () => {
    const grouped = T1.match(/.{1,6}/g)!.join(' ');
    expect(extractAddresses(grouped).addresses[0]).toMatchObject({ address: T1, repaired: true, raw: T1 });
  });

  it('re-joins addresses broken by a line wrap, only when the checksum validates', () => {
    const wrapped = `${SEGWIT.slice(0, 20)}\n${SEGWIT.slice(20)}`;
    expect(extractAddresses(`BTC:\n${wrapped}\nDzięki`).addresses[0]).toMatchObject({ address: SEGWIT, repaired: true });
    expect(extractAddresses(`${T1.slice(0, 15)}\r\n${T1.slice(15)}`).addresses[0]!.address).toBe(T1);
    expect(extractAddresses(wrapped, { joinSplitLines: false, handleObfuscation: false }).addresses).toEqual([]);
    // a wrap that does not form a valid address is not joined
    expect(extractAddresses(`${T1.slice(0, 15)}\n${corrupt(T1, BASE58).slice(15)}`).addresses).toEqual([]);
  });
});

describe('detect-only kinds', () => {
  it('flags Monero and Lightning invoices as not analysable', () => {
    const xmr = '4' + 'A'.repeat(94);
    const ln = 'lnbc1' + 'q'.repeat(60);
    const { addresses } = extractAddresses(`XMR ${xmr} oraz ${ln}`);
    expect(addresses.map((a) => [a.kind, a.chain, a.analyzable])).toEqual([
      ['MONERO', null, false],
      ['LIGHTNING_INVOICE', null, false],
    ]);
  });

  it('reports a Lightning address (lud16) only next to a Lightning keyword', () => {
    expect(extractAddresses('⚡ Jan@Example.org').addresses[0]).toMatchObject({ kind: 'LIGHTNING_ADDRESS', address: 'jan@example.org', analyzable: false });
    expect(extractAddresses('Napisz na jan@example.org').addresses).toEqual([]);
  });
});
