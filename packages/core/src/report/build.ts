import type { FlowEntry, Indicators } from '../chain/indicators.js';
import type { RunDiffDoc } from '../diff.js';
import { diffSection } from './diff-section.js';
import { THRESHOLD_NOTE } from '../chain/indicators.js';
import type { BreakdownEntry } from '../scoring/score.js';
import type { Localized, SearchLogEntry } from '../types.js';
import {
  BANDS_PL,
  CATEGORIES_PL,
  CHAINS_PL,
  CHAIN_MODES_PL,
  CONTEXT_TYPES_PL,
  DASH,
  DECISIONS_PL,
  IDENTIFIER_TYPES_PL,
  METHODS_PL,
  RELATIONS_PL,
  SOURCE_TYPES_PL,
  TAGS_PL,
  fmtDate,
  fmtDateTime,
  fmtEur,
  fmtNum,
  fmtPln,
  host,
  label,
  noteTextPl,
  plural,
  searchOutcomePl,
  searchQueryPl,
  searchSummaryPl,
  shortAddr,
  type NoteLike,
} from './pl.js';

// ---- input (structural: the API results and the web DTOs both fit) ----------------------------------------------

export interface ReportLink {
  id: string;
  score: number;
  band: string;
  excludedReason: string | null;
  breakdownJson: BreakdownEntry[];
  hintsJson: Localized[];
  analystDecision: string | null;
  analystNote: string | null;
  analystName: string | null;
  decidedAt: string | null;
  identifier: { id: string; type: string; value: string };
  address: { chain: string; address: string; category: string };
}
export interface ReportEvidence {
  id: string;
  connectorId: string;
  url: string | null;
  fetchedAt: string;
  sha256: string;
  snippet: string;
  sourceType: string;
  archiveUrl: string | null;
  metaJson: { platform: string; origin: string; publishedAt: string | null; title: string | null; snapshotOf: string | null; round: number };
}
export interface ReportTrace {
  evidenceId: string;
  chain: string;
  address: string;
  contextType: string;
}
export interface ReportChain {
  address: { chain: string; address: string; category: string };
  provider: string;
  fetchedAt: string;
  indicators: Indicators;
  flows: FlowEntry[];
}
export interface ReportIdentity {
  key: string;
  platform: string;
  handle: string | null;
  name: string | null;
  relation: string;
  evidenceIds: string[];
  targetAddress: string | null;
  score: { score: number; band: string } | null;
  otherAddresses: { chain: string; address: string; category: string; excluded: boolean }[];
}
export interface ReportSubject {
  chain: string;
  address: string;
  category: string;
  labels: { name: string | null; source: string; sourceUrl?: string | null }[];
  isContract: boolean | null;
  exclusions: { ruleId: string; pl: string; en: string }[];
}
export interface ReportInput {
  appName: string;
  case: { id: string; title: string; createdBy: string; identifiers: { type: string; value: string }[] };
  run: {
    id: string;
    status: string;
    startedAt: string;
    finishedAt: string | null;
    rulesVersion: string;
    appVersion: string;
    paramsJson: { connectors: string[]; asOf: string; chain: string };
    summaryJson: {
      connectorErrors: { connector: string; round: number; note: NoteLike }[];
      connectorNotes?: { connector: string; round: number; note: NoteLike }[];
      chainNotes: { address: string; notes: NoteLike[] }[];
      chainWarnings: { address: string; warnings: NoteLike[] }[];
      identities: ReportIdentity[];
      /** Addresses typed in as identifiers, with the verdict on the address itself (absent in runs made before this field). */
      subjects?: ReportSubject[];
      /** What each source did with each identifier (absent in runs made before this field). */
      searches?: SearchLogEntry[];
      error?: NoteLike;
    } | null;
  };
  links: ReportLink[];
  evidence: ReportEvidence[];
  traces: ReportTrace[];
  chain: ReportChain[];
  connectors: { id: string; policy: { tosUrl: string; method: string } }[];
  /** Comparison with the previous run of the case; null / absent for the first run. */
  diff?: RunDiffDoc | null;
}

// ---- output -----------------------------------------------------------------------------------------------------

/** FAKT = what a source or the chain says; OBLICZENIE = what the rules computed; WNIOSEK = what we infer, with a confidence level. */
export type StatementKind = 'FAKT' | 'OBLICZENIE' | 'WNIOSEK';
export type Block =
  | { type: 'text'; text: string; kind?: StatementKind; basis?: string }
  | { type: 'heading'; text: string }
  | { type: 'list'; items: string[] }
  | { type: 'table'; kind?: StatementKind; columns: string[]; rows: string[][]; weights?: number[]; mono?: number[] };
export interface ReportSection {
  id: string;
  number: number;
  title: string;
  kind?: StatementKind;
  blocks: Block[];
}
export interface ReportDoc {
  appName: string;
  title: string;
  caseTitle: string;
  meta: [string, string][];
  summary: string[];
  legend: { kind: StatementKind; text: string }[];
  sections: ReportSection[];
  glossary: { term: string; definition: string }[];
}

const LEGEND: ReportDoc['legend'] = [
  { kind: 'FAKT', text: 'to, co mówi źródło albo blockchain — z podaniem źródła, odnośnika i czasu pobrania.' },
  { kind: 'OBLICZENIE', text: 'wynik reguł programu — z podaniem reguły, danych wejściowych i wyniku. Da się go odtworzyć.' },
  { kind: 'WNIOSEK', text: 'wniosek wyciągnięty z faktów i obliczeń — z poziomem pewności. Wymaga weryfikacji przez człowieka.' },
];

const GLOSSARY: ReportDoc['glossary'] = [
  { term: 'OSINT', definition: 'Biały wywiad: zbieranie informacji wyłącznie z jawnych, legalnych źródeł.' },
  { term: 'Identyfikator', definition: 'Dane, od których zaczyna się analiza: imię i nazwisko, nick, e-mail, login, komunikator lub adres kryptowalutowy.' },
  { term: 'Ślad', definition: 'Miejsce w źródle (np. na stronie internetowej), w którym znaleziono adres kryptowalutowy.' },
  { term: 'Dowód', definition: 'Zapisany fragment źródła z adresem URL, czasem pobrania i skrótem SHA-256 pozwalającym sprawdzić, że treść nie została zmieniona.' },
  { term: 'Wskaźnik Pewności', definition: 'Liczba od 0 do 100%: jak mocno dowody wiążą adres z identyfikatorem. Liczą go jawne reguły, a każdy punkt ma uzasadnienie.' },
  { term: 'Pasmo oceny', definition: 'Słowny opis Wskaźnika Pewności: bardzo wysokie (80–100%), prawdopodobne (60–79%), średnie (40–59%), niskie (poniżej 40%), wykluczone (0%).' },
  { term: 'Wykluczenie', definition: 'Adres, którego nie przypisujemy osobie (0%), bo należy do giełdy, usługi, kontraktu albo jest znanym adresem zbiórki lub przykładem.' },
  { term: 'Adres niehostowany', definition: 'Portfel, którym zarządza sama osoba (a nie giełda).' },
  { term: 'Giełda (CEX)', definition: 'Scentralizowana giełda kryptowalut. Prowadzi dane klientów (KYC), o które można wystąpić z zapytaniem.' },
  { term: 'Adres depozytowy', definition: 'Adres nadany klientowi przez giełdę; środki są z niego przekazywane na portfel giełdy.' },
  { term: 'Kantor / punkt wymiany', definition: 'Usługa wymieniająca kryptowaluty na gotówkę.' },
  { term: 'DEX', definition: 'Zdecentralizowana giełda: wymiana kryptowalut bez pośrednika.' },
  { term: 'Mikser', definition: 'Usługa utrudniająca śledzenie środków. Adres miksera nie jest przypisywany osobie (0%), ale jego użycie jest wskaźnikiem ryzyka.' },
  { term: 'Stablecoin (np. USDT)', definition: 'Kryptowaluta o stałej wartości, powiązana z walutą, najczęściej z dolarem.' },
  { term: 'Wyjście do gotówki', definition: 'Wzorzec przepływu środków, który kończy się w giełdzie, kantorze, bramce płatniczej lub na karcie.' },
  { term: 'Progi 1 000 / 10 000 / 15 000 EUR', definition: 'Kwoty z przepisów AML. W raporcie są przesłanką analityczną, a nie kwalifikacją prawną.' },
  { term: 'Kurs NBP', definition: 'Średni kurs z tabeli A NBP z ostatniego dnia roboczego przed dniem transakcji (art. 11a ustawy o PIT).' },
  { term: 'SHA-256', definition: 'Skrót kryptograficzny: „odcisk palca” danych. Zmiana choćby jednego znaku zmienia skrót.' },
  { term: 'KYC', definition: 'Dane identyfikacyjne klienta, które posiada giełda lub inny podmiot obowiązany.' },
];

// ---- helpers ----------------------------------------------------------------------------------------------------

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const pct = (n: number) => `${n}%`;
const unique = <T>(xs: T[]) => [...new Set(xs)];
const addrKey = (chain: string, address: string) => `${chain}:${address}`;
const confidence = (band: string) =>
  ({ VERY_HIGH: 'bardzo wysoki', PROBABLE: 'wysoki', MEDIUM: 'średni (wymaga potwierdzenia drugim źródłem)', LOW: 'niski' })[band] ?? 'niski';
const table = (columns: string[], rows: string[][], extra: { kind?: StatementKind; weights?: number[]; mono?: number[] } = {}): Block => ({ type: 'table', columns, rows, ...extra });
const kv = (rows: [string, string][], kind?: StatementKind): Block => table(['Pozycja', 'Wartość'], rows, { kind, weights: [2, 5] });
const chainName = (c: string) => label(CHAINS_PL, c);

/** A counterparty by name (label list) or by its category, with a short address; plain address when nothing is known. */
const party = (f: FlowEntry) => {
  const name = f.counterparty.name ?? (f.counterparty.category ? label(CATEGORIES_PL, f.counterparty.category) : undefined);
  return name ? `${name} (${shortAddr(f.counterparty.address)})` : shortAddr(f.counterparty.address);
};

/** Money that could not be valued is a dash, never 0,00 zł. */
const money = (pln: number, eur: number, unvalued: number) =>
  unvalued === 0 ? `${fmtPln(pln)} (${fmtEur(eur)})` : pln === 0 ? `${DASH} (brak wyceny)` : `${fmtPln(pln)} (${fmtEur(eur)}) — częściowo: brak wyceny części transferów`;

// ---- builder ----------------------------------------------------------------------------------------------------

export function buildReport(input: ReportInput): ReportDoc {
  const { run, case: kase } = input;
  const summary = run.summaryJson;
  const ref = new Map(input.evidence.map((e, i) => [e.id, `D${i + 1}`]));
  const refs = (ids: string[]) => unique(ids.map((id) => ref.get(id) ?? id)).sort((a, b) => a.localeCompare(b, 'en', { numeric: true })).join(', ') || DASH;

  const tracesByAddress = new Map<string, ReportInput['traces']>();
  for (const t of input.traces) tracesByAddress.set(addrKey(t.chain, t.address), [...(tracesByAddress.get(addrKey(t.chain, t.address)) ?? []), t]);

  const active = input.links.filter((l) => l.band !== 'EXCLUDED' && l.score > 0).sort((a, b) => b.score - a.score || a.address.address.localeCompare(b.address.address));
  const excluded = input.links.filter((l) => !(l.band !== 'EXCLUDED' && l.score > 0));
  const identities = summary?.identities ?? [];
  const identityLabel = (l: ReportLink) => `${label(IDENTIFIER_TYPES_PL, l.identifier.type)}: ${l.identifier.value}`;
  const addresses = unique(input.traces.map((t) => addrKey(t.chain, t.address)));

  const sections: Omit<ReportSection, 'number'>[] = [];

  // The verdict on each address typed in as an identifier (shown even when no source mentions it).
  const subjects = summary?.subjects ?? [];
  const searches = summary?.searches ?? [];
  const subjectChain = (s: ReportSubject) => input.chain.find((c) => addrKey(c.address.chain, c.address.address) === addrKey(s.chain, s.address));
  const subjectBlocks: Block[] =
    subjects.length === 0
      ? []
      : [
          { type: 'heading', text: 'Analizowane adresy' },
          table(
            ['Adres', 'Sieć', 'Rodzaj', 'Wykluczenie', 'Etykieta (źródło)', 'Transakcje', 'Wpływy', 'Wypływy'],
            subjects.map((s) => {
              const c = subjectChain(s);
              const lab = s.labels[0];
              const notes = (summary?.chainNotes ?? []).filter((n) => n.address.toLowerCase() === s.address.toLowerCase()).flatMap((n) => n.notes);
              const noData = notes.length > 0 ? `brak danych: ${noteTextPl(notes[0]!)}` : lab ? 'nie pobrano (adres z etykietą)' : 'brak danych z blockchaina';
              return [
                s.address,
                chainName(s.chain),
                label(CATEGORIES_PL, s.category),
                s.exclusions.length > 0 ? `wykluczony: ${s.exclusions.map((e) => `${e.pl} (${e.ruleId})`).join('; ')}` : 'nie wykluczony',
                lab ? `${lab.name ?? DASH}${lab.source === 'heuristic' ? ' (heurystyka)' : lab.sourceUrl ? ` — ${lab.sourceUrl}` : ''}` : DASH,
                c ? String(c.indicators.txCount) : noData,
                c ? money(c.indicators.totals.inPln, c.indicators.totals.inEur, c.indicators.totals.unvalued) : DASH,
                c ? money(c.indicators.totals.outPln, c.indicators.totals.outEur, c.indicators.totals.unvalued) : DASH,
              ];
            }),
            { kind: 'OBLICZENIE', weights: [6, 2, 3, 6, 5, 2, 3, 3], mono: [0] },
          ),
        ];

  // 1 — inputs
  sections.push({
    id: 'input',
    title: 'Dane wejściowe i parametry wyszukiwania',
    kind: 'FAKT',
    blocks: [
      { type: 'text', text: 'Dane wprowadzone przez analityka oraz ustawienia, z jakimi uruchomiono analizę.', kind: 'FAKT', basis: 'dane z formularza sprawy' },
      table(['Typ identyfikatora', 'Wartość'], kase.identifiers.map((i) => [label(IDENTIFIER_TYPES_PL, i.type), i.value]), { kind: 'FAKT', weights: [2, 5] }),
      ...subjectBlocks,
      kv(
        [
          ['Sprawa', kase.title],
          ['Numer analizy', run.id],
          ['Analiza uruchomiona', fmtDateTime(run.startedAt)],
          ['Stan na dzień', fmtDate(run.paramsJson.asOf)],
          [
            'Przeszukane źródła',
            run.paramsJson.connectors
              .map((c) => `${c} (${label(METHODS_PL, input.connectors.find((x) => x.id === c)?.policy.method ?? '')})`)
              .join('; '),
          ],
          ['Dane z blockchaina', label(CHAIN_MODES_PL, run.paramsJson.chain)],
        ],
        'FAKT',
      ),
    ],
  });

  // 2 — sources and traces
  sections.push({
    id: 'sources',
    title: 'Źródła i ślady',
    kind: 'FAKT',
    blocks: [
      { type: 'text', text: `Znaleziono ${input.evidence.length} ${plural(input.evidence.length, 'dowód', 'dowody', 'dowodów')} i ${input.traces.length} ${plural(input.traces.length, 'ślad', 'ślady', 'śladów')}. Każdy dowód ma adres, czas pobrania i skrót SHA-256 (pełne skróty — w ostatnim rozdziale).`, kind: 'FAKT', basis: 'treść źródeł zapisana w momencie analizy' },
      ...(searches.length > 0
        ? ([
            { type: 'text', text: searchSummaryPl(searches, input.traces.length > 0), kind: 'FAKT', basis: 'dziennik wyszukiwania tej analizy' },
            table(['Źródło', 'Czego szukano', 'Wynik'], searches.map((e) => [e.connector, searchQueryPl(e), searchOutcomePl(e)]), { kind: 'FAKT', weights: [2, 6, 6] }),
          ] as Block[])
        : []),
      input.evidence.length === 0
        ? { type: 'text', text: searches.length > 0 ? 'Żaden z przeszukanych serwisów nie zwrócił materiału.' : 'Nie znaleziono żadnych źródeł dla podanych identyfikatorów.' }
        : table(
            ['Nr', 'Serwis', 'Rodzaj źródła', 'Adres URL', 'Pobrano', 'SHA-256 (początek)'],
            input.evidence.map((e) => [ref.get(e.id)!, e.metaJson.platform || host(e.url), label(SOURCE_TYPES_PL, e.sourceType), e.url ?? DASH, fmtDateTime(e.fetchedAt), e.sha256.slice(0, 16)]),
            { kind: 'FAKT', weights: [1, 3, 3, 6, 3, 3], mono: [5] },
          ),
      ...(input.traces.length === 0
        ? []
        : [
            { type: 'heading', text: 'Ślady: adresy znalezione w źródłach' } as Block,
            table(
              ['Adres', 'Sieć', 'Kontekst', 'Dowód'],
              input.traces.map((t) => [t.address, chainName(t.chain), label(CONTEXT_TYPES_PL, t.contextType), refs([t.evidenceId])]),
              { kind: 'FAKT', weights: [8, 2, 4, 1.5], mono: [0] },
            ),
          ]),
    ],
  });

  // 3 — linked addresses and the score
  const sec3: Block[] = [
    { type: 'text', text: 'Wskaźnik Pewności (0–100%) mówi, jak mocno zebrane dowody wiążą adres z identyfikatorem. Wynik to suma punktów z jawnych reguł; poniżej każdy punkt ma uzasadnienie. To nie jest rozstrzygnięcie.', kind: 'OBLICZENIE', basis: `reguły w wersji ${run.rulesVersion}` },
  ];
  if (active.length === 0 && identities.length === 0) sec3.push({ type: 'text', text: 'Żaden adres nie został powiązany z podanymi identyfikatorami.' });
  if (active.length > 0) {
    sec3.push(
      table(
        ['Adres', 'Sieć', 'Identyfikator', 'Wynik', 'Pasmo', 'Dowody'],
        active.map((l) => [l.address.address, chainName(l.address.chain), identityLabel(l), pct(l.score), label(BANDS_PL, l.band), refs(l.breakdownJson.flatMap((b) => b.evidenceIds))]),
        { kind: 'OBLICZENIE', weights: [7, 2, 5, 1.5, 3, 2], mono: [0] },
      ),
    );
    const MAX_DETAILED = 12;
    for (const l of active.slice(0, MAX_DETAILED)) {
      sec3.push({ type: 'heading', text: `Adres ${shortAddr(l.address.address)} (${chainName(l.address.chain)}) — ${identityLabel(l)}: ${pct(l.score)}, ${label(BANDS_PL, l.band).toLowerCase()}` });
      sec3.push(
        table(
          ['Reguła', 'Uzasadnienie', 'Dowody', 'Punkty'],
          [
            ...l.breakdownJson.map((b) => [b.ruleId, b.reasonPl, b.evidenceIds.length > 0 ? refs(b.evidenceIds) : DASH, signed(b.delta)]),
            ['WYNIK', `Suma punktów (reguły w wersji ${run.rulesVersion})`, DASH, pct(l.score)],
          ],
          { kind: 'OBLICZENIE', weights: [6, 8, 2, 1.5] },
        ),
      );
      if (l.hintsJson.length > 0) sec3.push({ type: 'list', items: l.hintsJson.map((h) => `Co zmieniłoby wynik: ${h.pl}`) });
    }
    if (active.length > MAX_DETAILED) sec3.push({ type: 'text', text: `Rozbicie punktów pokazano dla ${MAX_DETAILED} najwyższych wyników; pozostałe są w tabeli powyżej i w pliku JSON.` });
  }
  if (identities.length > 0) {
    sec3.push({ type: 'heading', text: 'Konta, które opublikowały badany adres, i ich inne adresy' });
    sec3.push(
      table(
        ['Konto', 'Serwis', 'Relacja', 'Wynik', 'Inne adresy tego konta', 'Dowody'],
        identities.map((i) => [
          i.handle ?? i.name ?? DASH,
          i.platform,
          label(RELATIONS_PL, i.relation),
          i.score ? `${pct(i.score.score)}, ${label(BANDS_PL, i.score.band).toLowerCase()}` : DASH,
          i.otherAddresses.length === 0 ? 'brak' : i.otherAddresses.map((a) => `${shortAddr(a.address)} (${label(CATEGORIES_PL, a.category)}${a.excluded ? ', wykluczony' : ''})`).join('; '),
          refs(i.evidenceIds),
        ]),
        { kind: 'OBLICZENIE', weights: [2.5, 3, 4, 3, 6, 1.5] },
      ),
    );
  }
  sections.push({ id: 'links', title: 'Powiązane adresy i Wskaźnik Pewności', kind: 'OBLICZENIE', blocks: sec3 });

  // 4 — rejected attributions
  const rejectedRows = new Map<string, string[]>();
  for (const l of excluded) {
    const k = addrKey(l.address.chain, l.address.address);
    const reason = l.breakdownJson.find((b) => b.kind === 'exclusion')?.reasonPl ?? l.excludedReason ?? DASH;
    const prev = rejectedRows.get(k);
    const mentions = refs((tracesByAddress.get(k) ?? []).map((t) => t.evidenceId));
    rejectedRows.set(k, prev ? [prev[0]!, prev[1]!, prev[2]!, unique([...prev[3]!.split('; '), identityLabel(l)]).join('; '), prev[4]!] : [l.address.address, label(CATEGORIES_PL, l.address.category), reason, identityLabel(l), mentions]);
  }
  const hasMixer = excluded.some((l) => l.address.category === 'MIXER');
  sections.push({
    id: 'rejected',
    title: 'Odrzucone przypisania',
    kind: 'OBLICZENIE',
    blocks: [
      { type: 'text', text: 'Tych adresów nie przypisujemy osobie (0%). Kontakt z nimi jest jednak zapisany i może być tropem — np. kontakt z giełdą to podstawa do zapytania o dane KYC.', kind: 'OBLICZENIE', basis: 'reguły wykluczeń (EXCL_*)' },
      rejectedRows.size === 0
        ? { type: 'text', text: 'Brak odrzuconych przypisań.' }
        : table(['Adres', 'Rodzaj', 'Powód odrzucenia', 'Identyfikator', 'Dowody'], [...rejectedRows.values()], { kind: 'OBLICZENIE', weights: [9, 3, 5, 4, 1.5], mono: [0] }),
      ...(hasMixer ? [{ type: 'text', text: 'Mikser ma 0% jako przypisanie osobie, ale jego użycie jest wskaźnikiem ryzyka i zasługuje na uwagę analityka.' } as Block] : []),
    ],
  });

  // 5 — on-chain
  const sec5: Block[] = [{ type: 'text', text: 'Wskaźniki liczone z historii transakcji. Kwoty w PLN: kurs średni NBP (tabela A) z ostatniego dnia roboczego przed transakcją. Pozycji bez wyceny nie wliczamy do sum — są oznaczone.', kind: 'OBLICZENIE', basis: 'historia transakcji z blockchaina + kursy NBP' }];
  if (input.chain.length === 0) sec5.push({ type: 'text', text: 'Brak danych z blockchaina dla adresów w tej analizie.' });
  for (const c of input.chain) {
    const i = c.indicators;
    sec5.push({ type: 'heading', text: `${c.address.address} (${chainName(c.address.chain)}; ${label(CATEGORIES_PL, c.address.category).toLowerCase()})` });
    sec5.push(
      kv(
        [
          ['Transakcje', String(i.txCount)],
          ['Pierwsza aktywność', fmtDate(i.firstActivity)],
          ['Ostatnia aktywność', fmtDate(i.lastActivity)],
          ['Wpływy', money(i.totals.inPln, i.totals.inEur, i.totals.unvalued)],
          ['Wypływy', money(i.totals.outPln, i.totals.outEur, i.totals.unvalued)],
          ['Stablecoiny: wpływy / wypływy', `${fmtNum(i.stablecoin.inUsd)} USD / ${fmtNum(i.stablecoin.outUsd)} USD`],
          ['Kontrahenci', `${i.counterparties.total} (w tym rozpoznanych: ${i.counterparties.known})`],
          ['Źródło danych', `${c.provider}, pobrano ${fmtDateTime(c.fetchedAt)}`],
        ],
        'OBLICZENIE',
      ),
    );
    const inter = Object.entries(i.interactions);
    if (inter.length > 0)
      sec5.push(table(['Kontakt z', 'Liczba', 'Wpływy (PLN)', 'Wypływy (PLN)'], inter.map(([cat, v]) => [label(CATEGORIES_PL, cat), String(v!.count), fmtPln(v!.inPln), fmtPln(v!.outPln)]), { kind: 'OBLICZENIE', weights: [5, 1.5, 3, 3] }));
    sec5.push({
      type: 'text',
      kind: 'OBLICZENIE',
      text: i.cashOut.detected
        ? `Wykryto wzorzec wyjścia do gotówki (${i.cashOut.patterns.map((p) => label(TAGS_PL, p)).join(', ')}): łącznie ${fmtPln(i.cashOut.totalPln)} (${fmtEur(i.cashOut.totalEur)}), od ${fmtDate(i.cashOut.firstAt)} do ${fmtDate(i.cashOut.lastAt)}.`
        : 'Nie wykryto wzorca wyjścia do gotówki.',
      basis: 'reguły wskaźników cash-out',
    });
    sec5.push(
      table(
        ['Próg', 'Największy pojedynczy transfer', 'Pierwszy pojedynczy ≥ próg', 'Pierwsze przekroczenie łączne'],
        i.thresholds.map((t) => [`${fmtNum(t.eur)} EUR`, fmtEur(t.maxSingleEur), fmtDate(t.singleCrossedAt), fmtDate(t.cumulativeCrossedAt)]),
        { kind: 'OBLICZENIE', weights: [2, 4, 4, 4] },
      ),
    );
  }
  if (input.chain.length > 0) sec5.push({ type: 'text', text: THRESHOLD_NOTE.pl });
  sections.push({ id: 'chain', title: 'Aktywność w blockchainie i wskaźniki cash-out', kind: 'OBLICZENIE', blocks: sec5 });

  // 6 — chronology
  const MAX_FLOWS = 40;
  const sec6: Block[] = [{ type: 'text', text: 'Najważniejsze przepływy w kolejności czasu. Etykiety kontrahentów pochodzą z jawnych list (źródło etykiety — w karcie adresu w programie).', kind: 'FAKT', basis: 'historia transakcji z blockchaina; wartości PLN wg NBP' }];
  if (input.chain.every((c) => c.flows.length === 0)) sec6.push({ type: 'text', text: 'Brak przepływów do pokazania.' });
  for (const c of input.chain.filter((x) => x.flows.length > 0)) {
    sec6.push({ type: 'heading', text: `${shortAddr(c.address.address)} (${chainName(c.address.chain)})` });
    sec6.push(
      table(
        ['Data', 'Kierunek', 'Kontrahent', 'Kwota', 'Wartość', 'Znaczniki'],
        c.flows.slice(0, MAX_FLOWS).map((f) => [
          fmtDate(f.time),
          f.direction === 'in' ? 'wpływ' : 'wypływ',
          party(f),
          `${fmtNum(f.amount)} ${f.asset}`,
          fmtPln(f.valuePln),
          f.tags.map((t) => label(TAGS_PL, t)).join(', ') || DASH,
        ]),
        { kind: 'FAKT', weights: [2.5, 2, 5, 3, 3, 5] },
      ),
    );
    if (c.flows.length > MAX_FLOWS) sec6.push({ type: 'text', text: `Pokazano ${MAX_FLOWS} z ${c.flows.length} przepływów; pełna lista jest w pliku JSON.` });
  }
  sections.push({ id: 'chronology', title: 'Chronologia przepływu środków', kind: 'FAKT', blocks: sec6 });

  // 7 — analyst decisions (kept apart from the algorithm)
  const decided = input.links.filter((l) => l.analystDecision);
  sections.push({
    id: 'decisions',
    title: 'Decyzje analityka',
    kind: 'FAKT',
    blocks: [
      { type: 'text', text: 'Decyzje analityka są zapisane osobno i nie zmieniają wyniku obliczonego przez program. Ocena algorytmu i decyzja człowieka są pokazane obok siebie.', kind: 'FAKT', basis: 'zapis w programie: kto, kiedy, komentarz' },
      decided.length === 0
        ? { type: 'text', text: 'Analityk nie zapisał jeszcze żadnej decyzji.' }
        : table(
            ['Adres', 'Identyfikator', 'Wynik algorytmu', 'Decyzja analityka', 'Kto i kiedy', 'Komentarz'],
            decided.map((l) => [shortAddr(l.address.address), identityLabel(l), `${pct(l.score)}, ${label(BANDS_PL, l.band).toLowerCase()}`, label(DECISIONS_PL, l.analystDecision!), `${l.analystName ?? DASH}, ${fmtDateTime(l.decidedAt)}`, l.analystNote ?? DASH]),
            { kind: 'FAKT', weights: [3, 6, 3, 2.5, 4, 5] },
          ),
    ],
  });

  // 8 — what changed since the previous run
  sections.push(diffSection(input.diff));

  // 9 — conclusions needing verification
  const groups = new Map<string, ReportLink[]>();
  for (const l of active.filter((x) => x.score >= 40)) groups.set(addrKey(l.address.chain, l.address.address), [...(groups.get(addrKey(l.address.chain, l.address.address)) ?? []), l]);
  const sec8: Block[] = [];
  for (const g of groups.values()) {
    const best = g[0]!;
    const how = best.band === 'MEDIUM' ? 'możliwe, że jest powiązany' : best.band === 'PROBABLE' ? 'prawdopodobnie jest powiązany' : 'bardzo prawdopodobnie jest powiązany';
    sec8.push({
      type: 'text',
      kind: 'WNIOSEK',
      text: `Adres ${best.address.address} (${chainName(best.address.chain)}) ${how} z: ${unique(g.map(identityLabel)).join('; ')}.`,
      basis: `Wskaźnik Pewności ${pct(best.score)} (reguły ${run.rulesVersion}); dowody: ${refs(g.flatMap((l) => l.breakdownJson.flatMap((b) => b.evidenceIds)))}. Poziom pewności: ${confidence(best.band)}.`,
    });
  }
  for (const i of identities.filter((x) => x.score && x.score.score >= 40)) {
    sec8.push({
      type: 'text',
      kind: 'WNIOSEK',
      text: `Konto „${i.handle ?? i.name}” (${i.platform}) ${label(RELATIONS_PL, i.relation)} ${i.targetAddress ? shortAddr(i.targetAddress) : ''}.`.replace(/ \.$/, '.'),
      basis: `Wynik ${pct(i.score!.score)}; dowody: ${refs(i.evidenceIds)}. Poziom pewności: ${confidence(i.score!.band)}.`,
    });
  }
  for (const c of input.chain) {
    const i = c.indicators;
    const cashOutSource = `historia transakcji (${c.provider}, pobrano ${fmtDateTime(c.fetchedAt)}); wartości PLN wg NBP`;
    if (i.cashOut.detected)
      sec8.push({
        type: 'text',
        kind: 'WNIOSEK',
        text: `Przepływy z adresu ${shortAddr(c.address.address)} wskazują na możliwe wyjście do gotówki (${i.cashOut.patterns.map((p) => label(TAGS_PL, p)).join(', ')}): ${fmtPln(i.cashOut.totalPln)} (${fmtEur(i.cashOut.totalEur)}).`,
        basis: `${cashOutSource}. Poziom pewności: średni — to przesłanka, a nie dowód wypłaty gotówki.`,
      });
    const crossed = i.thresholds.filter((x) => x.singleCrossedAt || x.cumulativeCrossedAt);
    if (crossed.length > 0)
      sec8.push({
        type: 'text',
        kind: 'WNIOSEK',
        text: `Dla adresu ${shortAddr(c.address.address)} przekroczono progi: ${crossed.map((t) => `${fmtNum(t.eur)} EUR (${[t.singleCrossedAt ? `pojedynczy transfer ${fmtDate(t.singleCrossedAt)}` : '', t.cumulativeCrossedAt ? `łącznie od ${fmtDate(t.cumulativeCrossedAt)}` : ''].filter(Boolean).join('; ')})`).join(', ')}.`,
        basis: `${THRESHOLD_NOTE.pl} Poziom pewności: średni.`,
      });
  }
  const institutions = unique(excluded.filter((l) => ['CEX_CUSTODIAL', 'CEX_DEPOSIT', 'CASP_KANTOR'].includes(l.address.category)).map((l) => `${shortAddr(l.address.address)} (${label(CATEGORIES_PL, l.address.category)})`));
  if (institutions.length > 0)
    sec8.push({ type: 'text', kind: 'WNIOSEK', text: `Adresy ${institutions.join('; ')} należą do podmiotów, które mogą mieć dane klientów. Nie przypisujemy ich osobie, ale kontakt z nimi jest tropem.`, basis: 'wykluczenia (EXCL_*) i etykiety adresów. Poziom pewności: wysoki co do rodzaju adresu.' });
  if (sec8.length === 0) sec8.push({ type: 'text', text: 'Zebrane dane nie pozwalają na wniosek o powiązaniu adresu z osobą. To także wynik analizy.' });
  sections.push({ id: 'conclusions', title: 'Wnioski wymagające weryfikacji', kind: 'WNIOSEK', blocks: sec8 });

  // 10 — recommended next steps
  const steps: string[] = [];
  for (const c of input.chain) {
    const cexFlows = c.flows.filter((f) => f.counterparty.category === 'CEX_CUSTODIAL' || f.counterparty.category === 'CEX_DEPOSIT');
    const cex = unique(cexFlows.flatMap((f) => (f.counterparty.name ? [f.counterparty.name] : [])));
    if (cex.length > 0) steps.push(`Rozważyć zapytanie do giełdy (${cex.join(', ')}) o dane KYC dotyczące wpłat z adresu ${shortAddr(c.address.address)}.`);
    else if (cexFlows.length > 0) steps.push(`Ustalić, do której giełdy należy adres depozytowy ${unique(cexFlows.map((f) => shortAddr(f.counterparty.address))).join(', ')}, i rozważyć zapytanie o dane KYC.`);
    const kantor = unique(c.flows.filter((f) => f.counterparty.category === 'CASP_KANTOR').map((f) => f.counterparty.name ?? shortAddr(f.counterparty.address)));
    if (kantor.length > 0) steps.push(`Ustalić operatora kantoru (${kantor.join(', ')}) i zbadać rozliczenia z adresem ${shortAddr(c.address.address)}.`);
  }
  for (const l of active.filter((x) => x.band === 'MEDIUM')) steps.push(`Potwierdzić powiązanie adresu ${shortAddr(l.address.address)} drugim, niezależnym źródłem (${identityLabel(l)}).`);
  if (input.chain.some((c) => c.indicators.totals.unvalued > 0)) steps.push('Powtórzyć analizę, gdy kursy NBP będą dostępne, aby uzupełnić wyceny w PLN.');
  steps.push('Zachować dowody razem z ich skrótami SHA-256 i powtórzyć analizę bezpośrednio przed użyciem wyniku w postępowaniu.');
  sections.push({ id: 'next', title: 'Rekomendowane dalsze czynności', kind: 'WNIOSEK', blocks: [{ type: 'list', items: steps }] });

  // 11 — limitations
  sections.push({
    id: 'limits',
    title: 'Ograniczenia',
    blocks: [
      { type: 'text', text: 'Wynik analizy OSINT nie jest dowodem w rozumieniu postępowania, tylko podstawą do dalszej weryfikacji.' },
      {
        type: 'list',
        items: [
          'Wskaźnik Pewności jest wynikiem reguł, a nie oceną człowieka. Nie rozstrzyga, kto faktycznie włada adresem.',
          'Program korzysta wyłącznie z jawnych źródeł. Brak śladu w źródłach nie oznacza, że adres nie należy do osoby.',
          'Ten sam nick lub imię na innej platformie nie dowodzi, że to ta sama osoba.',
          'Etykiety adresów (giełdy, usługi) pochodzą z jawnych list i mogą być niepełne lub nieaktualne.',
          'Progi 1 000 / 10 000 / 15 000 EUR to przesłanki analityczne, a nie kwalifikacja prawna.',
          'Wartości w PLN zależą od dostępności kursów NBP i cen; pozycje bez wyceny są oznaczone i nie wchodzą do sum.',
          'Historia transakcji może być niepełna (limity dostawców); zachowaj ostrożność przy sumach.',
        ],
      },
    ],
  });

  // 12 — metadata and reproducibility
  const noteLines = [
    ...(summary?.connectorErrors ?? []).map((e) => `Źródło „${e.connector}”${e.round > 1 ? ` (runda ${e.round})` : ''}: ${noteTextPl(e.note)}`),
    ...(summary?.connectorNotes ?? []).map((e) => `Źródło „${e.connector}”: ${noteTextPl(e.note)}`),
    ...(summary?.chainNotes ?? []).flatMap((n) => n.notes.map((x) => `Adres ${shortAddr(n.address)}: ${noteTextPl(x)}`)),
    ...(summary?.chainWarnings ?? []).flatMap((w) => w.warnings.map((x) => `Adres ${shortAddr(w.address)}: ${noteTextPl(x)}`)),
  ];
  sections.push({
    id: 'meta',
    title: 'Metadane i odtwarzalność',
    kind: 'FAKT',
    blocks: [
      kv(
        [
          ['Wersja reguł oceny', run.rulesVersion],
          ['Wersja aplikacji', `${input.appName} ${run.appVersion}`],
          ['Status analizy', run.status === 'DONE' ? 'zakończona' : run.status],
          ['Analiza: początek – koniec', `${fmtDateTime(run.startedAt)} – ${fmtDateTime(run.finishedAt)}`],
          ['Źródła i ich zasady', input.connectors.filter((c) => run.paramsJson.connectors.includes(c.id)).map((c) => `${c.id} (${label(METHODS_PL, c.policy.method)}; regulamin: ${c.policy.tosUrl})`).join('; ') || DASH],
          ['Dostawcy danych z blockchaina', unique(input.chain.map((c) => `${c.provider} (pobrano ${fmtDateTime(c.fetchedAt)})`)).join('; ') || DASH],
          ['Kursy walut', 'NBP, tabela A, kurs średni z ostatniego dnia roboczego przed transakcją (art. 11a ustawy o PIT)'],
          ['Adresy w analizie', String(addresses.length)],
        ],
        'FAKT',
      ),
      ...(noteLines.length > 0 ? ([{ type: 'heading', text: 'Uwagi do analizy' }, { type: 'list', items: noteLines }] as Block[]) : []),
      ...(input.evidence.length > 0
        ? ([
            { type: 'heading', text: 'Skróty SHA-256 dowodów' },
            table(['Nr', 'Adres URL', 'SHA-256'], input.evidence.map((e) => [ref.get(e.id)!, e.url ?? DASH, e.sha256]), { kind: 'FAKT', weights: [1, 6, 11], mono: [2] }),
          ] as Block[])
        : []),
    ],
  });

  // ---- header and the five-sentence summary --------------------------------------------------------------------
  const best = active[0];
  const detected = input.chain.filter((c) => c.indicators.cashOut.detected).length;
  const topIdentity = identities.filter((i) => i.score).sort((a, b) => b.score!.score - a.score!.score)[0];
  const s2 = `Znaleziono ${addresses.length} ${plural(addresses.length, 'adres kryptowalutowy', 'adresy kryptowalutowe', 'adresów kryptowalutowych')} w ${input.evidence.length} ${plural(input.evidence.length, 'dowodzie', 'dowodach', 'dowodach')}.`;
  const s3 = best
    ? `Najwyższy Wskaźnik Pewności (${pct(best.score)}, ${label(BANDS_PL, best.band).toLowerCase()}) ma adres ${shortAddr(best.address.address)} w sieci ${chainName(best.address.chain)}.`
    : topIdentity
      ? `Badany adres opublikowało ${identities.filter((i) => i.relation === 'PUBLISHER').length} ${plural(identities.filter((i) => i.relation === 'PUBLISHER').length, 'konto', 'konta', 'kont')}; najwyższy wynik to ${pct(topIdentity.score!.score)}.`
      : 'Żaden adres nie osiągnął wysokiego Wskaźnika Pewności.';
  const s4 = `Wykluczono ${rejectedRows.size} ${plural(rejectedRows.size, 'adres', 'adresy', 'adresów')} z przypisania osobie (giełdy, usługi, kontrakty lub znane zbiórki); sygnały wyjścia do gotówki wykryto dla ${detected} z ${input.chain.length} ${plural(input.chain.length, 'adresu', 'adresów', 'adresów')} z historią.`;

  return {
    appName: input.appName,
    title: 'Raport z analizy',
    caseTitle: kase.title,
    meta: [
      ['Sprawa', kase.title],
      ['Numer analizy', run.id],
      ['Data analizy', fmtDateTime(run.startedAt)],
      ['Wersja reguł', run.rulesVersion],
    ],
    summary: [
      `Dla sprawy „${kase.title}” przeanalizowano ${kase.identifiers.length} ${plural(kase.identifiers.length, 'identyfikator', 'identyfikatory', 'identyfikatorów')}, przeszukując źródła: ${run.paramsJson.connectors.join(', ')} (analiza z ${fmtDate(run.startedAt)}).`,
      ...(subjects.length > 0
        ? [`${subjects.length === 1 ? 'Badany adres' : 'Badane adresy'}: ${subjects.map((s) => `${shortAddr(s.address)} (${chainName(s.chain)}) — ${s.exclusions.length > 0 ? 'wykluczony' : 'nie wykluczony'}, ${label(CATEGORIES_PL, s.category).toLowerCase()}`).join('; ')}.`]
        : []),
      s2,
      s3,
      s4,
      'Wynik jest przesłanką do dalszej weryfikacji, a nie dowodem w sprawie.',
    ],
    legend: LEGEND,
    sections: sections.map((s, n) => ({ ...s, number: n + 1 })),
    glossary: GLOSSARY,
  };
}
