import { describe, expect, it } from 'vitest';
import {
  ADDRESS_CATEGORIES,
  countClaimants,
  detectIdentifierType,
  evaluateIdentity,
  exclusionForCategory,
  findIdentifierInText,
  labelKey,
  normalizeIdentifier,
  parseRules,
  type IdentifierRef,
} from '../src/index.js';
import { RULES_YAML, synthEth } from './helpers.js';

const nick: IdentifierRef = { type: 'NICK', normalized: 'jtestowy' };
const email: IdentifierRef = { type: 'EMAIL', normalized: 'jan.testowy@example.org' };
const tg: IdentifierRef = { type: 'MESSENGER', normalized: 'jtestowy_pl' };
const name: IdentifierRef = { type: 'NAME', normalized: 'jan testowy' };
const demoCase = [nick, email, tg];

describe('normalizeIdentifier', () => {
  it('normalises each type', () => {
    expect(normalizeIdentifier('EMAIL', '  Jan.Testowy@Example.ORG ')).toBe('jan.testowy@example.org');
    expect(normalizeIdentifier('NICK', ' JTestowy ')).toBe('jtestowy');
    expect(normalizeIdentifier('MESSENGER', '@JTestowy_PL')).toBe('jtestowy_pl');
    expect(normalizeIdentifier('MESSENGER', 'https://t.me/jtestowy_pl')).toBe('jtestowy_pl');
    expect(normalizeIdentifier('SOCIAL_LOGIN', '@jtestowy')).toBe('jtestowy');
    expect(normalizeIdentifier('NAME', '  Jan   TESTOWY ')).toBe('jan testowy');
  });

  it('canonicalises addresses and rejects invalid ones', () => {
    const a = synthEth('A1');
    expect(normalizeIdentifier('ADDRESS', a.toLowerCase())).toBe(a);
    expect(() => normalizeIdentifier('ADDRESS', '0x123')).toThrow(RangeError);
  });

  it('rejects input that cannot be an identifier', () => {
    expect(() => normalizeIdentifier('EMAIL', 'not-an-email')).toThrow(/e-mail/);
    expect(() => normalizeIdentifier('NICK', 'a')).toThrow(RangeError);
    expect(() => normalizeIdentifier('NICK', 'two words')).toThrow(RangeError);
    expect(() => normalizeIdentifier('NAME', 'Jo')).toThrow(RangeError);
  });
});

describe('findIdentifierInText (token boundaries)', () => {
  it.each([
    [nick, 'Pytałem jtestowy o adres.', true],
    [nick, 'Pozdrawiam, jtestowy.', true],
    [nick, '@JTestowy napisał', true],
    [nick, 'login: jtestowy, hasło', true],
    [nick, 'kontakt @jtestowy_pl', false], // a different token
    [nick, 'strona jtestowy.example.org', false], // a domain, not a nick
    [nick, 'napisz na mail@jtestowy.pl', false],
    [nick, 'pl.jtestowy', false],
    [nick, 'jtestowy2', false],
    [tg, 'Kontakt Telegram @jtestowy_pl.', true],
    [tg, 'https://t.me/jtestowy_pl', true],
    [tg, 'jtestowy_pl2', false],
    [email, 'Kontakt: Jan.Testowy@example.org, tel.', true],
    [email, 'x-jan.testowy@example.org', false],
    [email, 'jan.testowy@example.org.evil.com', false],
    [name, 'Autor: Jan  Testowy, Lublin', true],
    [name, 'Janusz Testowy', false],
  ] as const)('%j in "%s" → %s', (id, text, expected) => {
    expect(findIdentifierInText(id, text)).toBe(expected);
  });
});

describe('evaluateIdentity', () => {
  const ev = (text: string, authorHandle?: string, authorName?: string) => ({ text, authorHandle, authorName });

  it('e-mail present → IDENT_EMAIL_EXACT', () => {
    expect(evaluateIdentity(email, ev('Kontakt: jan.testowy@example.org'), demoCase)).toEqual({ matched: true, rules: ['IDENT_EMAIL_EXACT'] });
  });

  it('messenger handle present (declared contact) or author → IDENT_EXACT_SAME_PLATFORM', () => {
    expect(evaluateIdentity(tg, ev('Sprzedam USDT, kontakt @jtestowy_pl'), demoCase).rules).toEqual(['IDENT_EXACT_SAME_PLATFORM']);
    expect(evaluateIdentity(tg, ev('Rozliczenie', 'jtestowy_pl'), demoCase).rules).toEqual(['IDENT_EXACT_SAME_PLATFORM']);
  });

  it('nick = author handle, corroborated by another identifier → exact', () => {
    const r = evaluateIdentity(nick, ev('Jan. Kontakt: jan.testowy@example.org', 'jtestowy'), demoCase);
    expect(r).toEqual({ matched: true, rules: ['IDENT_EXACT_SAME_PLATFORM'] });
  });

  it('nick = author handle with no corroboration → same nick on another platform (persona B)', () => {
    const r = evaluateIdentity(nick, ev('Janusz K., Gdańsk. Wsparcie: 0xabc', 'jtestowy', 'Janusz Kowalczyk'), demoCase);
    expect(r).toEqual({ matched: true, rules: ['IDENT_NICK_OTHER_PLATFORM'] });
  });

  it('the same value as another identifier does not count as corroboration', () => {
    const login: IdentifierRef = { type: 'SOCIAL_LOGIN', normalized: 'jtestowy' };
    expect(evaluateIdentity(nick, ev('hello', 'jtestowy'), [nick, login]).rules).toEqual(['IDENT_NICK_OTHER_PLATFORM']);
  });

  it('author handle equal up to separators / case → nick variant', () => {
    const r = evaluateIdentity({ type: 'NICK', normalized: 'jan_kowalski' }, ev('post', 'JanKowalski'), []);
    expect(r).toEqual({ matched: true, rules: ['IDENT_NICK_VARIANT'] });
  });

  it('nick only mentioned by someone else → matched, no modifier', () => {
    expect(evaluateIdentity(nick, ev('Pytałem jtestowy o adres', 'krypto_lublin'), demoCase)).toEqual({ matched: true, rules: [] });
  });

  it('name → IDENT_NAME_ONLY; address identifiers never link; absent identifiers do not match', () => {
    expect(evaluateIdentity(name, ev('Autor: Jan Testowy'), [name]).rules).toEqual(['IDENT_NAME_ONLY']);
    expect(evaluateIdentity(name, ev('x', undefined, 'Jan Testowy'), [name]).rules).toEqual(['IDENT_NAME_ONLY']);
    expect(evaluateIdentity({ type: 'ADDRESS', normalized: synthEth('A1') }, ev(synthEth('A1')), demoCase).matched).toBe(false);
    expect(evaluateIdentity(email, ev('nothing here'), demoCase).matched).toBe(false);
  });
});

describe('countClaimants', () => {
  it('collapses all of the subject\'s own handles into one identity', () => {
    const authors = [
      { platform: 'site', handle: 'jtestowy' },
      { platform: 'git', handle: 'JTestowy' },
      { platform: 'chat', handle: 'jtestowy_pl' },
      { platform: 'mail' },
    ];
    expect(countClaimants(authors, demoCase)).toBe(1);
  });

  it('counts every other (platform, handle) once', () => {
    const authors = [
      { platform: 'forum', handle: 'jtestowy' },
      { platform: 'social', handle: 'krypto_okazje_77' },
      { platform: 'social', handle: 'Krypto_Okazje_77' },
      { platform: 'blog', handle: 'bonus_airdrop' },
      { platform: 'blog', handle: 'bonus_airdrop' },
    ];
    expect(countClaimants(authors, demoCase)).toBe(3);
  });
});

describe('labels', () => {
  it('maps every category to the scoring exclusion that fits (or none)', () => {
    const rules = parseRules(RULES_YAML);
    const mapped = ADDRESS_CATEGORIES.map((c) => [c, exclusionForCategory(c)] as const);
    expect(Object.fromEntries(mapped)).toEqual({
      UNHOSTED: undefined,
      CEX_CUSTODIAL: 'EXCL_CEX',
      CEX_DEPOSIT: 'EXCL_CUSTODIAL_DEPOSIT',
      CONTRACT: 'EXCL_CONTRACT',
      DEX: 'EXCL_CONTRACT',
      CASP_KANTOR: 'EXCL_SERVICE',
      PAYMENT_GATEWAY: 'EXCL_SERVICE',
      CRYPTO_CARD: 'EXCL_SERVICE',
      MIXER: 'EXCL_MIXER',
      CHARITY: 'EXCL_CHARITY',
      SANCTIONED: undefined,
      EXAMPLE_BURN: 'EXCL_EXAMPLE',
      UNKNOWN_SERVICE: 'EXCL_SERVICE',
    });
    for (const [, id] of mapped) if (id) expect(rules.exclusions[id]).toBeDefined();
  });

  it('keys ignore EVM / bech32 case but not base58 case', () => {
    const a = synthEth('A1');
    expect(labelKey('ETH', a)).toBe(labelKey('ETH', a.toLowerCase()));
    expect(labelKey('BTC', '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa')).not.toBe(labelKey('BTC', '1a1zp1ep5qgefi2dmptftl5slmv7divfna'));
  });
});

describe('detectIdentifierType', () => {
  it('guesses address, e-mail, messenger handle, name or nick — and never a social login', () => {
    expect(detectIdentifierType(synthEth('A1'))).toBe('ADDRESS');
    expect(detectIdentifierType('jtestowy.eth')).toBe('ADDRESS');
    expect(detectIdentifierType('jan.testowy@example.org')).toBe('EMAIL');
    expect(detectIdentifierType('@jtestowy_pl')).toBe('MESSENGER');
    expect(detectIdentifierType('t.me/jtestowy_pl')).toBe('MESSENGER');
    expect(detectIdentifierType('Jan Testowy')).toBe('NAME');
    expect(detectIdentifierType('jtestowy')).toBe('NICK');
  });

  it('an address with a broken checksum is still an address (the error is raised when it is normalised)', () => {
    const broken = `${synthEth('A1').slice(0, -1)}${synthEth('A1').endsWith('a') ? 'b' : 'a'}`;
    expect(detectIdentifierType(broken)).toBe('ADDRESS');
    expect(() => normalizeIdentifier('ADDRESS', broken)).toThrow(/invalid address/);
  });

  it('ignores surrounding whitespace', () => {
    expect(detectIdentifierType('  jan.testowy@example.org ')).toBe('EMAIL');
  });
});
