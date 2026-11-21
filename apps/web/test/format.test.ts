import { describe, expect, it } from 'vitest';
import { addressKey, formatDate, formatPln, shortAddress, signed } from '../src/lib/format';

describe('format', () => {
  it('shortens addresses but never short strings', () => {
    expect(shortAddress('0x8ae181fBc9E8Ce4f43cd993F03fDbD25070b3A47')).toBe('0x8ae181…b3A47');
    expect(shortAddress('bc1qshort')).toBe('bc1qshort');
  });

  it('uses a real minus sign so the sign survives without colour', () => {
    expect([signed(85), signed(-10), signed(0)]).toEqual(['+85', '−10', '0']);
  });

  it('formats PLN per language and shows a dash for unknown values', () => {
    expect(formatPln(70440, 'pl').replace(/\s/g, ' ')).toBe('70 440,00 zł');
    expect(formatPln(70440, 'en').replace(/\s/g, ' ')).toBe('PLN 70,440.00');
    expect(formatPln(null, 'pl')).toBe('—');
  });

  it('shows dates in Polish time whatever the machine zone is', () => {
    expect(formatDate('2026-11-04T23:30:00Z', 'pl')).toMatch(/5 lis 2026/); // already the 5th in Warsaw
    expect(formatDate(null, 'pl')).toBe('—');
  });

  it('keys addresses like the backend: EVM and bech32 case-insensitively, base58 exactly', () => {
    expect(addressKey('0xABCdef')).toBe('0xabcdef');
    expect(addressKey('BC1QABC')).toBe('bc1qabc');
    expect(addressKey('TEonzwFMXhEWwoxNLdM13MBs99T9xAGZey')).toBe('TEonzwFMXhEWwoxNLdM13MBs99T9xAGZey');
  });
});
