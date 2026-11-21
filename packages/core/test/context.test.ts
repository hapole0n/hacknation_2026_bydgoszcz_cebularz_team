import { describe, expect, it } from 'vitest';
import { classifyContext, parseRules, SOURCE_TYPES, sourceTypeFor, type ContextType } from '../src/index.js';
import { RULES_YAML } from './helpers.js';

const type = (s: string) => classifyContext(s).contextType;

describe('classifyContext', () => {
  it.each<[string, ContextType]>([
    ['Sprzedam USDT za gotówkę, Lublin, kontakt @jtestowy_pl', 'P2P'],
    ['Oferta P2P: odbiór osobisty w Lublinie', 'P2P'],
    ['Kantor internetowy USDT ↔ gotówka', 'P2P'],
    ['Sprzedam laptopa, cena 2000 PLN, płatność BTC', 'SALE'],
    ['Wesprzyj projekt — Wsparcie projektu / donate', 'DONATION'],
    ['Buy me a coffee', 'DONATION'],
    ['KONKURS! Wygraj 1 BTC — giveaway, zostaw komentarz', 'GIVEAWAY'],
    ['Rozdajemy nagrody w promocji', 'GIVEAWAY'],
    ['Proszę o rozliczenie faktury, przelew na ten adres', 'SETTLEMENT'],
    ['Please send it to this address, invoice 12/2026', 'SETTLEMENT'],
    ['W wątku na forum pytanie o portfele', 'DISCUSSION'],
  ])('%s → %s', (text, expected) => {
    expect(type(text)).toBe(expected);
  });

  it('ignores case and Polish diacritics', () => {
    expect(type('SPRZEDAM ZA GOTÓWKĘ — Łódź')).toBe('P2P');
    expect(type('wpłata na zaliczkę')).toBe('SETTLEMENT');
  });

  it('reports the matched keywords as provenance', () => {
    expect(classifyContext('Sprzedam USDT za gotówkę')).toMatchObject({
      contextType: 'P2P',
      matchedKeywords: ['za gotowke', 'gotowke'],
      fallback: false,
    });
  });

  it('falls back to DISCUSSION (flagged) when no keyword matches', () => {
    expect(classifyContext('Lorem ipsum dolor sit amet')).toEqual({ contextType: 'DISCUSSION', matchedKeywords: [], fallback: true });
  });

  it('prefers the more specific type on a tie', () => {
    expect(type('Sprzedam, odbiór osobisty')).toBe('P2P'); // 1 SALE hit vs 1 P2P hit → P2P first
    expect(type('giveaway: sprzedam')).toBe('GIVEAWAY');
  });
});

describe('sourceTypeFor', () => {
  it.each([
    ['DONATION', 'OWN_PROFILE', 'OFFICIAL_PROFILE'],
    ['SALE', 'OWN_PROFILE', 'OFFICIAL_PROFILE'],
    ['DISCUSSION', 'EMAIL', 'EMAIL_FOOTER'],
    ['SETTLEMENT', 'MESSENGER', 'MESSENGER_SETTLEMENT'],
    ['SETTLEMENT', 'PUBLIC', 'FORUM_DISCUSSION'],
    ['P2P', 'PUBLIC', 'P2P_OFFER'],
    ['SALE', 'PUBLIC', 'SALE_AD'],
    ['DISCUSSION', 'PUBLIC', 'FORUM_DISCUSSION'],
    ['DONATION', 'PUBLIC', 'FORUM_DISCUSSION'],
    ['GIVEAWAY', 'PUBLIC', 'GIVEAWAY'],
    ['DISCUSSION', 'COMMENT_THREAD', 'MASS_COMMENT'],
    ['GIVEAWAY', 'COMMENT_THREAD', 'GIVEAWAY'],
  ] as const)('%s on %s → %s', (ctx, origin, expected) => {
    expect(sourceTypeFor(ctx, origin)).toBe(expected);
  });

  it('defaults to a public origin', () => {
    expect(sourceTypeFor('SALE')).toBe('SALE_AD');
  });

  it('only returns tiers that exist in config/scoring-rules.v1.yaml', () => {
    const tiers = Object.keys(parseRules(RULES_YAML).base);
    expect([...SOURCE_TYPES].sort()).toEqual(tiers.sort());
  });
});
