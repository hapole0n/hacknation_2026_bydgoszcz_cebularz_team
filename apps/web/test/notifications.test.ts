import i18next from 'i18next';
import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import pl from '../src/i18n/pl.json';
import { notificationText } from '../src/lib/notifications';

const ADDR = '0x1234567890abcdef1234567890abcdef12345678';
const make = async (lng: 'pl' | 'en') => {
  const i = i18next.createInstance();
  await i.init({ lng, resources: { pl: { translation: pl }, en: { translation: en } }, interpolation: { escapeValue: false } });
  return i.t.bind(i);
};

describe('notificationText', () => {
  it('turns every kind into a sentence in both languages, with short addresses and translated tags', async () => {
    const cases: { kind: string; params: Record<string, string | number> }[] = [
      { kind: 'NEW_ADDRESS', params: { chain: 'ETH', address: ADDR, score: 82 } },
      { kind: 'ADDRESS_CHANGED', params: { platform: 'jtestowy.example.org', from: ADDR, to: `${ADDR.slice(0, -1)}9` } },
      { kind: 'THRESHOLD_EXCEEDED', params: { chain: 'ETH', address: ADDR, thresholdEur: 10000, at: '2026-11-20T10:00:00Z' } },
      { kind: 'NEW_CASH_OUT', params: { chain: 'TRON', address: ADDR, tags: 'TO_KANTOR,USDT_TO_CASH' } },
    ];
    for (const lng of ['pl', 'en'] as const) {
      const t = await make(lng);
      for (const c of cases) {
        const text = notificationText(t, lng, c);
        expect(text, `${lng} ${c.kind}`).not.toMatch(/\{\{|undefined|NaN/);
        expect(text).not.toContain(ADDR); // never the whole address
      }
    }
    const t = await make('pl');
    expect(notificationText(t, 'pl', cases[0]!)).toBe('Nowy adres ETH 0x123456…45678 z oceną 82%.');
    expect(notificationText(t, 'pl', cases[3]!)).toContain('do kantoru, USDT na gotówkę');
    expect(notificationText(t, 'pl', cases[2]!)).toMatch(/10[\s ]000 EUR/);
  });
});
