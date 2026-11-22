import { describe, expect, it } from 'vitest';
import { deriveTitle, parseIdentifiers } from '../src/lib/identifiers';

describe('parseIdentifiers (the one field of the new-case form)', () => {
  it('splits on commas, semicolons and new lines and detects the kind of each', () => {
    const p = parseIdentifiers('jan.testowy@example.org, jtestowy; @jtestowy_pl\nJan Testowy');
    expect(p.map((x) => [x.value, x.type])).toEqual([['jan.testowy@example.org', 'EMAIL'], ['jtestowy', 'NICK'], ['@jtestowy_pl', 'MESSENGER'], ['Jan Testowy', 'NAME']]);
    expect(p.every((x) => !x.error)).toBe(true);
  });

  it('the analyst can override the detected kind (a nick that is a social-network login); the detected kind is kept', () => {
    const [p] = parseIdentifiers('kantor_usdt_lublin', { kantor_usdt_lublin: 'SOCIAL_LOGIN' });
    expect(p).toMatchObject({ type: 'SOCIAL_LOGIN', detected: 'NICK' });
  });

  it('flags what cannot be an identifier of that kind: an address with a broken checksum, a nick that is too short', () => {
    const bad = parseIdentifiers('0x8ae181fBc9E8Ce4f43cd993F03fDbD25070b3A48, a');
    expect(bad.map((x) => [x.type, x.error])).toEqual([['ADDRESS', 'address'], ['NICK', 'format']]);
  });

  it('drops empty entries and repeats (also when only the case differs)', () => {
    expect(parseIdentifiers(' , jtestowy,, JTestowy ;').map((x) => x.value)).toEqual(['jtestowy']);
    expect(parseIdentifiers('')).toEqual([]);
  });

  it('the case title is the first name, else the first identifier', () => {
    expect(deriveTitle(parseIdentifiers('jtestowy, Jan Testowy'))).toBe('Jan Testowy');
    expect(deriveTitle(parseIdentifiers('jtestowy, jan.testowy@example.org'))).toBe('jtestowy');
    expect(deriveTitle([])).toBe('');
  });
});
