import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { BANDS_PL, CATEGORIES_PL, CHAINS_PL, CHAIN_MODES_PL, CONTEXT_TYPES_PL, DECISIONS_PL, IDENTIFIER_TYPES_PL, METHODS_PL, NOTES_PL, RELATIONS_PL, SOURCE_TYPES_PL, TAGS_PL } from '@kropka/core';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import pl from '../src/i18n/pl.json';

const flatten = (o: unknown, prefix = ''): string[] =>
  typeof o === 'object' && o !== null ? Object.entries(o).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k)) : [prefix];
const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
const valueAt = (dict: unknown, key: string) => key.split('.').reduce<unknown>((o, p) => (o as Record<string, unknown>)[p], dict);

describe('i18n', () => {
  it('the report wording in core matches the UI dictionary (pl)', () => {
    expect(pl.identifierTypes).toEqual(IDENTIFIER_TYPES_PL);
    expect(pl.bands).toEqual(BANDS_PL);
    expect(pl.categories).toEqual(CATEGORIES_PL);
    expect(pl.sourceTypes).toEqual(SOURCE_TYPES_PL);
    expect(pl.contextTypes).toEqual(CONTEXT_TYPES_PL);
    expect(pl.tags).toEqual(TAGS_PL);
    expect(pl.notes).toEqual(NOTES_PL);
    expect(pl.run.chainModes).toEqual(CHAIN_MODES_PL);
    expect(pl.form.methods).toEqual(METHODS_PL);
    expect(pl.identities.relation).toEqual(RELATIONS_PL);
    expect(pl.chains).toMatchObject(CHAINS_PL);
    expect({ CONFIRMED: pl.decision.state.CONFIRMED, REJECTED: pl.decision.state.REJECTED }).toEqual(DECISIONS_PL);
  });

  it('pl and en have exactly the same keys, none empty', () => {
    expect(flatten(en).sort()).toEqual(flatten(pl).sort());
    for (const dict of [pl, en]) for (const k of flatten(dict)) expect(valueAt(dict, k), k).not.toBe('');
  });

  it('every literal t("…") key used in the source exists', () => {
    const known = new Set(flatten(pl));
    const missing: string[] = [];
    for (const file of walk('src').filter((f) => /\.tsx?$/.test(f))) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) if (!known.has(m[1]!)) missing.push(`${file}: ${m[1]}`);
    }
    expect(missing).toEqual([]);
  });

  it('every dynamic key family has all its members (types, categories, tags, bands, …)', () => {
    const keys = new Set(flatten(pl));
    const types = ['NAME', 'NICK', 'MESSENGER', 'SOCIAL_LOGIN', 'EMAIL', 'ADDRESS'];
    const bands = ['VERY_HIGH', 'PROBABLE', 'MEDIUM', 'LOW', 'EXCLUDED'];
    const families: Record<string, string[]> = {
      identifierTypes: types,
      identifierHints: types,
      identifierPlaceholders: types,
      bands,
      bandHints: bands,
      categories: ['UNHOSTED', 'CEX_CUSTODIAL', 'CEX_DEPOSIT', 'CONTRACT', 'DEX', 'CASP_KANTOR', 'PAYMENT_GATEWAY', 'CRYPTO_CARD', 'MIXER', 'CHARITY', 'SANCTIONED', 'EXAMPLE_BURN', 'UNKNOWN_SERVICE'],
      sourceTypes: ['OFFICIAL_PROFILE', 'SALE_AD', 'P2P_OFFER', 'EMAIL_FOOTER', 'MESSENGER_SETTLEMENT', 'FORUM_DISCUSSION', 'MASS_COMMENT', 'GIVEAWAY'],
      contextTypes: ['SALE', 'P2P', 'DONATION', 'GIVEAWAY', 'SETTLEMENT', 'DISCUSSION'],
      tags: ['SWAP_DEX', 'STABLECOIN_CONVERSION', 'TO_CEX', 'TO_CEX_DEPOSIT', 'FROM_CEX', 'TO_KANTOR', 'FROM_KANTOR', 'TO_GATEWAY', 'TO_CARD', 'MIXER', 'SANCTIONED', 'TO_AD_ADDRESS', 'USDT_TO_CASH', 'STABLECOIN_TO_CASH', 'OVER_1000_EUR', 'OVER_10000_EUR', 'OVER_15000_EUR'],
      'score.kinds': ['base', 'identity', 'synergy', 'chain', 'recency', 'conflict', 'clamp', 'exclusion'],
      'common.status': ['PENDING', 'RUNNING', 'DONE', 'FAILED'],
      'decision.state': ['CONFIRMED', 'REJECTED', 'none'],
      'run.chainModes': ['fixture', 'live', 'off'],
      'form.chain': ['fixture', 'live', 'off'],
      'evidence.rounds': ['1', '2', '3'],
      'identities.relation': ['PUBLISHER', 'SAME_NICK_OTHER_PLATFORM'],
      'form.methods': ['official_api', 'public_page', 'synthetic'],
      'audit.columns': ['time', 'case', 'source', 'host', 'path', 'status', 'duration'],
      'audit.status': ['blocked', 'error'],
      notes: ['ERROR', 'CHAIN_KEY_MISSING', 'PROVIDER_HTTP', 'PROVIDER_ERROR', 'NBP_HTTP', 'NBP_NO_RATE', 'HISTORY_TRUNCATED', 'UNVALUED_TRANSFERS', 'EGRESS_BLOCKED', 'ALL_CONNECTORS_FAILED'],
      'graph.kind': ['identifier', 'identity', 'source', 'address', 'counterparty', 'others'],
      'graph.legendItems': ['identifier', 'identity', 'source', 'address', 'counterparty', 'linked', 'mentioned', 'transfer', 'excluded'],
    };
    for (const [family, members] of Object.entries(families)) for (const m of members) expect(keys.has(`${family}.${m}`), `${family}.${m}`).toBe(true);
  });
});
