import type { RunDiffDoc, RuleChange } from '../diff.js';
import type { Block, ReportSection } from './build.js';
import { CATEGORIES_PL, CHAINS_PL, IDENTIFIER_TYPES_PL, TAGS_PL, DASH, fmtDateTime, fmtNum, label, plural, shortAddr } from './pl.js';

const signed = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${Math.abs(n)}` : '0');
const addr = (chain: string, address: string) => `${label(CHAINS_PL, chain)}: ${shortAddr(address)}`;
const cat = (c: string | null) => (c ? label(CATEGORIES_PL, c) : DASH);
const table = (columns: string[], rows: string[][], weights?: number[]): Block => ({ type: 'table', kind: 'OBLICZENIE', columns, rows, weights });
const sources = (xs: { chain: string; address: string }[]) => xs.map((x) => addr(x.chain, x.address)).join('; ') || DASH;

/** One rule that moved the score, with the rule id so it can be looked up in the scoring file. */
const ruleText = (r: RuleChange) =>
  r.change === 'added'
    ? `${r.reasonPl} (${r.ruleId}: ${signed(r.toDelta!)})`
    : r.change === 'removed'
      ? `przestała obowiązywać: ${r.reasonPl} (${r.ruleId}: ${signed(r.fromDelta!)})`
      : `${r.reasonPl} (${r.ruleId}: ${signed(r.fromDelta!)} → ${signed(r.toDelta!)})`;

/** Section 8 of the report: what changed since the previous run of the case. `diff` is null for the first run. */
export function diffSection(diff: RunDiffDoc | null | undefined): Omit<ReportSection, 'number'> {
  const id = 'changes';
  const title = 'Zmiany od poprzedniego przebiegu';
  if (!diff) return { id, title, kind: 'OBLICZENIE', blocks: [{ type: 'text', text: 'To pierwsza analiza tej sprawy (albo nie zapisano porównania), więc nie ma z czym porównywać. Kolejne analizy pokażą tu, co się zmieniło.', kind: 'OBLICZENIE', basis: 'porównanie analiz tej samej sprawy' }] };

  const blocks: Block[] = [
    { type: 'text', text: `Porównanie z analizą z ${fmtDateTime(diff.fromAt)} (numer ${diff.fromRunId}). Różnice wyliczył program, porównując zapisane wyniki obu analiz.`, kind: 'OBLICZENIE', basis: 'zapisane wyniki obu analiz; reguły i dowody jak w sekcjach 2–5' },
  ];
  if (!diff.params.same) {
    blocks.push({ type: 'text', text: `Analizy przeszukały różne źródła lub użyły innego trybu danych z blockchaina (poprzednia: ${diff.params.from.connectors.join(', ')}, blockchain: ${diff.params.from.chain}; ta: ${diff.params.to.connectors.join(', ')}, blockchain: ${diff.params.to.chain}). Część różnic może wynikać z tego, a nie ze zmian w świecie.` });
  }
  if (diff.empty) {
    blocks.push({ type: 'text', text: 'Nie wykryto zmian: te same adresy, te same oceny, brak nowych transakcji.' });
    return { id, title, kind: 'OBLICZENIE', blocks };
  }

  const c = diff.counts;
  blocks.push({
    type: 'text',
    text: `Podsumowanie: ${c.addressesAdded} ${plural(c.addressesAdded, 'nowy adres', 'nowe adresy', 'nowych adresów')}, ${c.addressesRemoved} ${plural(c.addressesRemoved, 'adres, który zniknął', 'adresy, które zniknęły', 'adresów, które zniknęły')}, ${c.sourceChanges} ${plural(c.sourceChanges, 'zmiana adresu w źródle', 'zmiany adresu w źródle', 'zmian adresu w źródle')}, ${c.scoreChanges} ${plural(c.scoreChanges, 'zmiana oceny', 'zmiany oceny', 'zmian oceny')}, ${c.newTransactions} ${plural(c.newTransactions, 'nowa transakcja', 'nowe transakcje', 'nowych transakcji')}, ${c.newThresholds} ${plural(c.newThresholds, 'nowe przekroczenie progu', 'nowe przekroczenia progów', 'nowych przekroczeń progów')}.`,
  });

  if (diff.sourceChanges.length > 0) {
    blocks.push({ type: 'heading', text: 'Zmiana adresu w tym samym źródle' });
    blocks.push(table(['Źródło', 'Rodzaj', 'Był', 'Jest'], diff.sourceChanges.map((s) => [`${s.title ?? s.platform ?? DASH} — ${s.url}`, s.kind === 'swap' ? 'zamiana adresu' : s.kind === 'added' ? 'dodany adres' : 'usunięty adres', sources(s.from), sources(s.to)]), [6, 2.5, 4, 4]));
  }
  if (diff.addresses.added.length > 0) {
    blocks.push({ type: 'heading', text: 'Nowe adresy' });
    blocks.push(table(['Adres', 'Kategoria', 'Najwyższy wynik'], diff.addresses.added.map((a) => [addr(a.chain, a.address), cat(a.category), a.excluded ? 'wykluczony (0%)' : a.bestScore === null ? DASH : `${a.bestScore}%`]), [6, 4, 3]));
  }
  if (diff.addresses.removed.length > 0) {
    blocks.push({ type: 'heading', text: 'Adresy, których już nie ma w wynikach' });
    blocks.push(table(['Adres', 'Kategoria'], diff.addresses.removed.map((a) => [addr(a.chain, a.address), cat(a.category)]), [6, 4]));
  }
  if (diff.scoreChanges.length > 0) {
    blocks.push({ type: 'heading', text: 'Zmiany Wskaźnika Pewności i ich powód' });
    blocks.push(
      table(
        ['Adres', 'Identyfikator', 'Było → jest', 'Powód (reguła)'],
        diff.scoreChanges.map((s) => [addr(s.chain, s.address), `${label(IDENTIFIER_TYPES_PL, s.identifier.type)}: ${s.identifier.value}`, `${s.fromScore === null ? DASH : `${s.fromScore}%`} → ${s.toScore === null ? DASH : `${s.toScore}%`}`, s.rules.map(ruleText).join('; ') || (s.fromScore === null ? 'nowe powiązanie' : s.toScore === null ? 'powiązanie zniknęło' : DASH)]),
        [4, 4, 2.5, 8],
      ),
    );
  }
  if (diff.categoryChanges.length > 0) {
    blocks.push({ type: 'heading', text: 'Zmiana kategorii adresu' });
    blocks.push(table(['Adres', 'Było', 'Jest'], diff.categoryChanges.map((x) => [addr(x.chain, x.address), cat(x.from), cat(x.to)]), [6, 4, 4]));
  }
  if (diff.newTransactions.length > 0) {
    blocks.push({ type: 'heading', text: 'Nowe transakcje' });
    blocks.push(table(['Adres', 'Liczba', 'Pierwsza', 'Ostatnia'], diff.newTransactions.map((t) => [`${addr(t.chain, t.address)}${t.isNewAddress ? ' (nowy adres)' : ''}`, String(t.count), fmtDateTime(t.firstAt), fmtDateTime(t.lastAt)]), [6, 2, 4, 4]));
  }
  if (diff.newThresholds.length > 0) {
    blocks.push({ type: 'heading', text: 'Nowe przekroczenia progów (przesłanka analityczna, nie kwalifikacja prawna)' });
    blocks.push(table(['Adres', 'Próg', 'Rodzaj', 'Od'], diff.newThresholds.map((t) => [addr(t.chain, t.address), `${fmtNum(t.thresholdEur)} EUR`, t.kind === 'single' ? 'pojedynczy transfer' : 'łączne wyjście do gotówki', fmtDateTime(t.at)]), [6, 3, 5, 4]));
  }
  const indicators = diff.newIndicators.filter((i) => i.cashOut);
  if (indicators.length > 0) {
    blocks.push({ type: 'heading', text: 'Nowe wskaźniki wyjścia do gotówki' });
    blocks.push({ type: 'list', items: indicators.map((i) => `${addr(i.chain, i.address)}: ${label(TAGS_PL, i.tag)}`) });
  }
  return { id, title, kind: 'OBLICZENIE', blocks };
}
