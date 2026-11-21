import { describe, expect, it } from 'vitest';
import { analyseHistory, buildReport, canonicalJson, valueTransfer, type Block, type ReportInput, type ValuedTransfer } from '../src/index.js';

const ME = '0x1111111111111111111111111111111111111111';
const CEX = '0x2222222222222222222222222222222222222222';
const fx = { usdPln: 4, eurPln: 4.4 };
const tr = (tx: string, from: string, to: string, amount: number): ValuedTransfer =>
  valueTransfer({ tx, time: '2026-10-01T10:00:00Z', from, to, asset: 'USDT', amount }, fx);

function chainOf(valued: boolean) {
  const transfers = [tr('t1', '0x3333333333333333333333333333333333333333', ME, 3000), tr('t2', ME, CEX, 2900)];
  const { indicators, flows } = analyseHistory({
    chain: 'ETH',
    address: ME,
    transfers: valued ? transfers : transfers.map((t) => ({ ...t, valuePln: null, valueEur: null })),
    categoryOf: (a) => (a === CEX ? { category: 'CEX_CUSTODIAL', name: 'Binance' } : {}),
  });
  return { address: { chain: 'ETH', address: ME, category: 'UNHOSTED' }, provider: 'fixture', fetchedAt: '2026-11-21T14:44:00Z', indicators, flows };
}

const base = (): ReportInput => ({
  appName: 'KROPKA',
  case: { id: 'c', title: 'Sprawa 12/2026', createdBy: 'a', identifiers: [{ type: 'NICK', value: 'jtestowy' }] },
  run: {
    id: 'r1',
    status: 'DONE',
    startedAt: '2026-11-21T14:44:00Z',
    finishedAt: '2026-11-21T14:45:00Z',
    rulesVersion: '1.1.0',
    appVersion: '0.1.0',
    paramsJson: { connectors: ['sandbox'], asOf: '2026-11-21T00:00:00Z', chain: 'fixture' },
    summaryJson: { connectorErrors: [], chainNotes: [], chainWarnings: [], identities: [] },
  },
  links: [
    {
      id: 'l1',
      score: 95,
      band: 'VERY_HIGH',
      excludedReason: null,
      breakdownJson: [
        { ruleId: 'BASE_OFFICIAL_PROFILE', kind: 'base', delta: 85, reasonPl: 'Adres na oficjalnym profilu', reasonEn: 'Official profile', evidenceIds: ['e1'] },
        { ruleId: 'IDENT_NICK_EXACT', kind: 'identity', delta: 10, reasonPl: 'Nick zgodny', reasonEn: 'Nick matches', evidenceIds: ['e1'] },
      ],
      hintsJson: [{ pl: 'Drugie źródło podniosłoby wynik o 15 pp', en: 'A second source would add 15 pp' }],
      analystDecision: 'CONFIRMED',
      analystNote: 'Zgodne z ogłoszeniem',
      analystName: 'Anna Kowalska',
      decidedAt: '2026-11-21T15:00:00Z',
      identifier: { id: 'i1', type: 'NICK', value: 'jtestowy' },
      address: { chain: 'ETH', address: ME, category: 'UNHOSTED' },
    },
    {
      id: 'l2',
      score: 0,
      band: 'EXCLUDED',
      excludedReason: 'EXCL_CEX',
      breakdownJson: [{ ruleId: 'EXCL_CEX', kind: 'exclusion', delta: -50, reasonPl: 'Adres giełdy', reasonEn: 'Exchange address', evidenceIds: [] }],
      hintsJson: [],
      analystDecision: null,
      analystNote: null,
      analystName: null,
      decidedAt: null,
      identifier: { id: 'i1', type: 'NICK', value: 'jtestowy' },
      address: { chain: 'ETH', address: CEX, category: 'CEX_CUSTODIAL' },
    },
  ],
  evidence: [
    { id: 'e1', connectorId: 'sandbox', url: 'http://sandbox-web/p', fetchedAt: '2026-11-21T14:44:10Z', sha256: 'a'.repeat(64), snippet: 's', sourceType: 'OFFICIAL_PROFILE', archiveUrl: null, metaJson: { platform: 'site.example', origin: 'OWN_PROFILE', publishedAt: null, title: null, snapshotOf: null, round: 1 } },
  ],
  traces: [
    { evidenceId: 'e1', chain: 'ETH', address: ME, contextType: 'DONATION' },
    { evidenceId: 'e1', chain: 'ETH', address: CEX, contextType: 'DISCUSSION' },
  ],
  chain: [chainOf(true)],
  connectors: [{ id: 'sandbox', policy: { tosUrl: 'http://sandbox-web/', method: 'synthetic' } }],
});

const text = (blocks: Block[]) => JSON.stringify(blocks);
const all = (doc: ReturnType<typeof buildReport>) => JSON.stringify(doc);

describe('buildReport', () => {
  it('opens with a five-sentence summary and ends with the glossary', () => {
    const doc = buildReport(base());
    expect(doc.summary).toHaveLength(5);
    expect(doc.summary[2]).toMatch(/95%.*bardzo wysokie/);
    expect(doc.summary[4]).toMatch(/przesłanką do dalszej weryfikacji, a nie dowodem/);
    expect(doc.glossary.some((g) => g.term === 'SHA-256')).toBe(true);
    expect(doc.legend.map((l) => l.kind)).toEqual(['FAKT', 'OBLICZENIE', 'WNIOSEK']);
  });

  it('has the sections of PLAN 3.7 in order, plus decisions and limitations', () => {
    const doc = buildReport(base());
    expect(doc.sections.map((s) => s.id)).toEqual(['input', 'sources', 'links', 'rejected', 'chain', 'chronology', 'decisions', 'conclusions', 'next', 'limits', 'meta']);
    expect(doc.sections.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });

  it('every claim is labelled: sources are FAKT, scores OBLICZENIE, conclusions WNIOSEK', () => {
    const doc = buildReport(base());
    const kinds = Object.fromEntries(doc.sections.map((s) => [s.id, s.kind]));
    expect(kinds).toMatchObject({ sources: 'FAKT', links: 'OBLICZENIE', rejected: 'OBLICZENIE', chain: 'OBLICZENIE', conclusions: 'WNIOSEK', next: 'WNIOSEK' });
    const conclusions = doc.sections.find((s) => s.id === 'conclusions')!.blocks;
    expect(conclusions.every((b) => b.type !== 'text' || b.kind === 'WNIOSEK')).toBe(true);
    expect(text(conclusions)).toMatch(/Poziom pewności: bardzo wysoki/);
  });

  it('shows the rule ledger with signed points and evidence refs, and the hint', () => {
    const links = text(buildReport(base()).sections.find((s) => s.id === 'links')!.blocks);
    expect(links).toContain('BASE_OFFICIAL_PROFILE');
    expect(links).toContain('+85');
    expect(links).toContain('D1');
    expect(links).toContain('Drugie źródło podniosłoby wynik o 15 pp');
  });

  it('keeps analyst decisions apart from the algorithm score', () => {
    const doc = buildReport(base());
    const decisions = text(doc.sections.find((s) => s.id === 'decisions')!.blocks);
    expect(decisions).toContain('Potwierdzone');
    expect(decisions).toContain('Anna Kowalska');
    expect(decisions).toContain('nie zmieniają wyniku');
    expect(text(doc.sections.find((s) => s.id === 'links')!.blocks)).not.toContain('Anna Kowalska');
    const none = base();
    none.links[0]!.analystDecision = null;
    expect(text(buildReport(none).sections.find((s) => s.id === 'decisions')!.blocks)).toContain('nie zapisał jeszcze żadnej decyzji');
  });

  it('explains rejected attributions with the rule reason', () => {
    const rejected = text(buildReport(base()).sections.find((s) => s.id === 'rejected')!.blocks);
    expect(rejected).toContain('Adres giełdy');
    expect(rejected).toContain('Giełda (powiernicza)');
  });

  it('recommends asking the exchange for KYC when funds went to a labelled exchange', () => {
    const next = text(buildReport(base()).sections.find((s) => s.id === 'next')!.blocks);
    expect(next).toMatch(/zapytanie do giełdy \(Binance\) o dane KYC/);
  });

  it('shows a dash and "brak wyceny" instead of 0,00 zł when nothing could be valued', () => {
    const r = base();
    r.chain = [chainOf(false)];
    const chain = text(buildReport(r).sections.find((s) => s.id === 'chain')!.blocks);
    expect(chain).toContain('— (brak wyceny)');
    expect(chain).not.toContain('0,00 zł');
  });

  it('translates run notes from codes into Polish', () => {
    const r = base();
    r.run.summaryJson!.chainWarnings = [{ address: ME, warnings: [{ code: 'NBP_HTTP', params: { status: 500 } }] }];
    const meta = text(buildReport(r).sections.find((s) => s.id === 'meta')!.blocks);
    expect(meta).toContain('serwer NBP zwrócił błąd HTTP 500');
  });

  it('lists the evidence hashes in full and states the limitations', () => {
    const doc = buildReport(base());
    expect(text(doc.sections.find((s) => s.id === 'meta')!.blocks)).toContain('a'.repeat(64));
    expect(text(doc.sections.find((s) => s.id === 'limits')!.blocks)).toMatch(/nie jest dowodem/);
  });

  it('has no leftover template or undefined text and is deterministic', () => {
    const doc = buildReport(base());
    expect(all(doc)).not.toMatch(/undefined|\{\{|NaN|\[object/);
    expect(canonicalJson(buildReport(base()))).toBe(canonicalJson(doc));
  });

  it('an empty run still gives a readable report', () => {
    const r = base();
    Object.assign(r, { links: [], evidence: [], traces: [], chain: [] });
    const doc = buildReport(r);
    expect(doc.summary).toHaveLength(5);
    expect(doc.summary[2]).toMatch(/Żaden adres nie osiągnął/);
    expect(all(doc)).not.toMatch(/undefined|NaN/);
  });
});

describe('canonicalJson', () => {
  it('ignores key order', () => {
    expect(canonicalJson({ b: 1, a: [{ d: 2, c: 3 }] })).toBe(canonicalJson({ a: [{ c: 3, d: 2 }], b: 1 }));
  });
});
