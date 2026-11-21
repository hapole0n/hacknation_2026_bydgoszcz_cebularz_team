import { describe, expect, it } from 'vitest';
import { callText, callResolver, decodeAddress, decodeString, isEnsName, namehash, reverseNode } from '../src/index.js';

describe('ENS helpers', () => {
  it('namehash matches the EIP-137 reference vectors', () => {
    expect(namehash('')).toBe('0x0000000000000000000000000000000000000000000000000000000000000000');
    expect(namehash('eth')).toBe('0x93cdeb708b7545dc668eb9280176169d1c33cfd8ed6f04690a0bcc88a93fc4ae');
    expect(namehash('foo.eth')).toBe('0xde9b09fd7c5f901e23a3f19fecc54828e9c848539801e86591bd9801b019f84f');
    expect(namehash('Foo.ETH')).toBe(namehash('foo.eth')); // case-insensitive (ASCII)
  });

  it('the reverse node is the namehash of <lower-case address without 0x>.addr.reverse', () => {
    const a = '0x65dF8FEC643203A4D0e95406a4741750BF3a5686';
    expect(reverseNode(a)).toBe(namehash('65df8fec643203a4d0e95406a4741750bf3a5686.addr.reverse'));
  });

  it('encodes the calls with the right selectors', () => {
    const node = namehash('foo.eth');
    expect(callResolver(node)).toBe(`0x0178b8bf${node.slice(2)}`); // resolver(bytes32)
    const text = callText(node, 'com.github');
    expect(text.startsWith(`0x59d1d43c${node.slice(2)}`)).toBe(true); // text(bytes32,string)
    expect(text.slice(2 + 8 + 64, 2 + 8 + 128)).toBe('40'.padStart(64, '0')); // offset of the string
    expect(text.slice(2 + 8 + 128, 2 + 8 + 192)).toBe('0a'.padStart(64, '0')); // "com.github" has 10 bytes
    expect(text.length).toBe(2 + 8 + 64 + 64 + 64 + 64); // one padded word of data
  });

  it('decodes addresses and strings; empty answers are null / empty', () => {
    expect(decodeAddress(`0x${'0'.repeat(24)}65df8fec643203a4d0e95406a4741750bf3a5686`)).toBe('0x65df8fec643203a4d0e95406a4741750bf3a5686');
    expect(decodeAddress(`0x${'0'.repeat(64)}`)).toBeNull();
    expect(decodeAddress('0x')).toBeNull();
    const text = 'jtestowy.eth';
    const data = Buffer.from(text).toString('hex').padEnd(64, '0');
    expect(decodeString(`0x${'20'.padStart(64, '0')}${text.length.toString(16).padStart(64, '0')}${data}`)).toBe(text);
    expect(decodeString('0x')).toBe('');
    expect(decodeString(`0x${'20'.padStart(64, '0')}${'0'.repeat(64)}`)).toBe('');
    expect(decodeString(`0x${'20'.padStart(64, '0')}${'ff'.padStart(64, '0')}00`)).toBe(''); // a length that points past the data is not trusted
  });

  it('recognises .eth names', () => {
    for (const ok of ['vitalik.eth', 'jtestowy.demo.eth', 'A-b.ETH']) expect(isEnsName(ok), ok).toBe(true);
    for (const bad of ['jtestowy', 'x.com', '.eth', 'a b.eth', '']) expect(isEnsName(bad), bad).toBe(false);
  });
});
