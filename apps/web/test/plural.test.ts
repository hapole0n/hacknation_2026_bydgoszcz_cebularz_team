import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import pl from '../src/i18n/pl.json';

/** A separate instance with the real dictionaries (the app's own `i18n/index.ts` needs a browser). */
async function make(lng: 'pl' | 'en') {
  const i = i18next.createInstance();
  await i.init({ lng, resources: { pl: { translation: pl }, en: { translation: en } }, interpolation: { escapeValue: false } });
  return i.t.bind(i);
}

describe('Polish endings of counted nouns (i18next plural)', () => {
  it('1 transakcja / 2–4 transakcje / 5–21 transakcji / 22–24 transakcje / 12–14 transakcji', async () => {
    const t = await make('pl');
    const text = (n: number) => t('changes.txCount', { count: n });
    expect([0, 1, 2, 4, 5, 12, 14, 21, 22, 25, 112].map(text)).toEqual(['0 transakcji', '1 transakcja', '2 transakcje', '4 transakcje', '5 transakcji', '12 transakcji', '14 transakcji', '21 transakcji', '22 transakcje', '25 transakcji', '112 transakcji']);
  });

  it('the run statistics: powiązanie / powiązania / powiązań, adres z historią / adresy z historią / adresów z historią', async () => {
    const t = await make('pl');
    expect([1, 3, 5].map((n) => t('run.stats.links', { count: n }))).toEqual(['1 powiązanie', '3 powiązania', '5 powiązań']);
    expect([1, 2, 5].map((n) => t('run.stats.snapshots', { count: n }))).toEqual(['1 adres z historią', '2 adresy z historią', '5 adresów z historią']);
    expect([1, 2, 5].map((n) => t('run.stats.evidence', { count: n }))).toEqual(['1 dowód', '2 dowody', '5 dowodów']);
  });

  it('the search summary and the counts in its rows (źródło / źródła / źródeł)', async () => {
    const t = await make('pl');
    expect([1, 2, 5].map((n) => t('run.searched.summaryEmpty', { count: n }))).toEqual([
      'Przeszukano 1 źródło — nie znaleziono adresów kryptowalutowych.',
      'Przeszukano 2 źródła — nie znaleziono adresów kryptowalutowych.',
      'Przeszukano 5 źródeł — nie znaleziono adresów kryptowalutowych.',
    ]);
    expect([1, 2, 5].map((n) => t('run.searched.resourcesCount', { count: n }))).toEqual(['1 zasób', '2 zasoby', '5 zasobów']);
  });

  it('a rate limit below one request a second is a fraction: "limit 0,5 zapytania na sekundę"', async () => {
    const t = await make('pl');
    expect([1, 2, 5, 0.5].map((n) => t('form.rate', { count: n }))).toEqual(['limit 1 zapytanie na sekundę', 'limit 2 zapytania na sekundę', 'limit 5 zapytań na sekundę', 'limit 0,5 zapytania na sekundę']);
  });

  it('English keeps one / other', async () => {
    const t = await make('en');
    expect([1, 2].map((n) => t('changes.txCount', { count: n }))).toEqual(['1 transaction', '2 transactions']);
    expect([1, 3].map((n) => t('graph.others', { count: n }))).toEqual(['+1 other address', '+3 other addresses']);
  });
});
