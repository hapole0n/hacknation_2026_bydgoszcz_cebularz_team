import { normAddr } from './chain/model.js';
import type { FlowEntry, Indicators } from './chain/indicators.js';
import type { BreakdownEntry } from './scoring/score.js';

/**
 * Comparison of two runs of one case (PLAN 3.8): new / vanished addresses, score changes with the rule behind them,
 * new transactions, thresholds crossed since, new cash-out indicators, category changes and an address swap on a source.
 * Pure: the API hands in what `GET /runs/:id` serves and stores the result as RunDiff.
 */

// ---- input (structural: the API results fit) -----------------------------------------------------------------------

export interface RunParams {
  connectors: string[];
  chain: string;
}

export interface DiffRunInput {
  id: string;
  startedAt: string;
  /** Sources and chain mode of the run: a different set explains new or missing findings. */
  params: RunParams;
  links: {
    identifier: { type: string; value: string };
    address: { chain: string; address: string; category: string };
    score: number;
    band: string;
    excludedReason: string | null;
    breakdownJson: BreakdownEntry[];
  }[];
  evidence: { id: string; url: string | null; metaJson: { platform?: string | null; title?: string | null } }[];
  traces: { evidenceId: string; chain: string; address: string }[];
  chain: { address: { chain: string; address: string; category: string }; indicators: Pick<Indicators, 'tags' | 'thresholds' | 'cashOut'> & { totals?: Pick<Indicators['totals'], 'unvalued'> }; flows: FlowEntry[] }[];
}

// ---- output --------------------------------------------------------------------------------------------------------

export interface AddrRef {
  chain: string;
  address: string;
}
export interface DiffAddress extends AddrRef {
  /** From the links of the run; null when only a trace mentions the address. */
  category: string | null;
  /** Best score among the non-excluded links; null = no link. */
  bestScore: number | null;
  /** Every link of the address is an exclusion (exchange, contract, charity …). */
  excluded: boolean;
}
export interface RuleChange {
  ruleId: string;
  change: 'added' | 'removed' | 'changed';
  fromDelta: number | null;
  toDelta: number | null;
  reasonPl: string;
  reasonEn: string;
}
export interface ScoreChange extends AddrRef {
  identifier: { type: string; value: string };
  /** null = the link did not exist in that run. */
  fromScore: number | null;
  toScore: number | null;
  fromBand: string | null;
  toBand: string | null;
  rules: RuleChange[];
}
export interface CategoryChange extends AddrRef {
  from: string;
  to: string;
}
export interface NewTransactions extends AddrRef {
  /** The address had no on-chain snapshot in the previous run, so every transaction is new to us. */
  isNewAddress: boolean;
  count: number;
  firstAt: string;
  lastAt: string;
  /** The latest few (MAX_LISTED_FLOWS). */
  flows: FlowEntry[];
}
export interface NewThreshold extends AddrRef {
  thresholdEur: number;
  /** single = one transfer worth that much; cumulative = the cash-out reached it. */
  kind: 'single' | 'cumulative';
  at: string;
}
/**
 * The previous run could not value some transfers (e.g. NBP was down), this one could, and the thresholds listed here were
 * crossed BEFORE the previous run: nothing new happened, the valuation caught up ("wycena uzupełniona").
 */
export interface ValuationCompleted extends AddrRef {
  /** Transfers the previous run left without a value. */
  previouslyUnvalued: number;
  thresholds: NewThreshold[];
}
export interface NewIndicator extends AddrRef {
  tag: string;
  /** The tag means a possible exit to fiat. */
  cashOut: boolean;
}
export interface SourceChange {
  url: string;
  platform: string | null;
  title: string | null;
  /** swap = the source dropped one address and shows another. */
  kind: 'swap' | 'added' | 'removed';
  from: AddrRef[];
  to: AddrRef[];
}
export interface RunDiffDoc {
  version: 1;
  fromRunId: string;
  toRunId: string;
  fromAt: string;
  toAt: string;
  /** `same` = both runs searched the same sources in the same chain mode. */
  params: { from: RunParams; to: RunParams; same: boolean };
  addresses: { added: DiffAddress[]; removed: DiffAddress[] };
  scoreChanges: ScoreChange[];
  categoryChanges: CategoryChange[];
  newTransactions: NewTransactions[];
  newThresholds: NewThreshold[];
  /** Absent in diffs stored before this field. */
  valuationCompleted?: ValuationCompleted[];
  newIndicators: NewIndicator[];
  sourceChanges: SourceChange[];
  counts: { addressesAdded: number; addressesRemoved: number; scoreChanges: number; categoryChanges: number; newTransactions: number; newThresholds: number; newIndicators: number; sourceChanges: number; /** absent in diffs stored before this field */ valuationCompleted?: number };
  /** Nothing differs between the runs. */
  empty: boolean;
}

/** Flow tags that mean a possible way out to fiat (PLAN 3.5). */
export const CASH_OUT_TAGS: readonly string[] = ['TO_CEX', 'TO_CEX_DEPOSIT', 'TO_KANTOR', 'TO_GATEWAY', 'TO_CARD', 'TO_AD_ADDRESS', 'USDT_TO_CASH', 'STABLECOIN_TO_CASH'];
export const MAX_LISTED_FLOWS = 20;

// ---- the comparison ------------------------------------------------------------------------------------------------

const key = (chain: string, address: string) => `${chain}:${normAddr(address)}`;
const ref = (a: AddrRef): AddrRef => ({ chain: a.chain, address: a.address });
const byAddress = (a: AddrRef, b: AddrRef) => a.chain.localeCompare(b.chain) || a.address.localeCompare(b.address);
const time = (iso: string) => Date.parse(iso);

function addressesOf(run: DiffRunInput): Map<string, DiffAddress> {
  const out = new Map<string, DiffAddress>();
  for (const t of run.traces) if (!out.has(key(t.chain, t.address))) out.set(key(t.chain, t.address), { chain: t.chain, address: t.address, category: null, bestScore: null, excluded: false });
  for (const c of run.chain) {
    const a = out.get(key(c.address.chain, c.address.address));
    if (a) a.category = c.address.category;
  }
  const seenLink = new Set<string>();
  for (const l of run.links) {
    const k = key(l.address.chain, l.address.address);
    const a = out.get(k) ?? { chain: l.address.chain, address: l.address.address, category: null, bestScore: null, excluded: false };
    out.set(k, a);
    a.category = l.address.category;
    const live = l.band !== 'EXCLUDED' && l.excludedReason === null;
    a.excluded = seenLink.has(k) ? a.excluded && !live : !live;
    seenLink.add(k);
    if (live) a.bestScore = Math.max(a.bestScore ?? 0, l.score);
  }
  return out;
}

function ruleChanges(from: BreakdownEntry[], to: BreakdownEntry[]): RuleChange[] {
  const f = new Map(from.filter((e) => e.kind !== 'clamp').map((e) => [e.ruleId, e]));
  const t = new Map(to.filter((e) => e.kind !== 'clamp').map((e) => [e.ruleId, e]));
  const out: RuleChange[] = [];
  for (const [id, e] of t) {
    const old = f.get(id);
    if (!old) out.push({ ruleId: id, change: 'added', fromDelta: null, toDelta: e.delta, reasonPl: e.reasonPl, reasonEn: e.reasonEn });
    else if (old.delta !== e.delta) out.push({ ruleId: id, change: 'changed', fromDelta: old.delta, toDelta: e.delta, reasonPl: e.reasonPl, reasonEn: e.reasonEn });
  }
  for (const [id, e] of f) if (!t.has(id)) out.push({ ruleId: id, change: 'removed', fromDelta: e.delta, toDelta: null, reasonPl: e.reasonPl, reasonEn: e.reasonEn });
  return out;
}

function sourcesOf(run: DiffRunInput) {
  const byEvidence = new Map<string, Map<string, AddrRef>>();
  for (const t of run.traces) {
    const set = byEvidence.get(t.evidenceId) ?? new Map<string, AddrRef>();
    set.set(key(t.chain, t.address), { chain: t.chain, address: t.address });
    byEvidence.set(t.evidenceId, set);
  }
  const out = new Map<string, { platform: string | null; title: string | null; addresses: Map<string, AddrRef> }>();
  for (const e of run.evidence) {
    if (!e.url) continue;
    const entry = out.get(e.url) ?? { platform: e.metaJson.platform ?? null, title: e.metaJson.title ?? null, addresses: new Map<string, AddrRef>() };
    for (const [k, a] of byEvidence.get(e.id) ?? []) entry.addresses.set(k, a);
    out.set(e.url, entry);
  }
  return out;
}

export function diffRuns(prev: DiffRunInput, next: DiffRunInput): RunDiffDoc {
  const before = addressesOf(prev);
  const after = addressesOf(next);

  const added = [...after].filter(([k]) => !before.has(k)).map(([, a]) => a).sort((a, b) => (b.bestScore ?? -1) - (a.bestScore ?? -1) || byAddress(a, b));
  const removed = [...before].filter(([k]) => !after.has(k)).map(([, a]) => a).sort(byAddress);

  // Scores: only for addresses that exist in both runs (a brand-new address is reported as such).
  const linkKey = (l: DiffRunInput['links'][number]) => `${l.identifier.type}:${l.identifier.value}|${key(l.address.chain, l.address.address)}`;
  const prevLinks = new Map(prev.links.map((l) => [linkKey(l), l]));
  const nextLinks = new Map(next.links.map((l) => [linkKey(l), l]));
  const scoreChanges: ScoreChange[] = [];
  for (const k of new Set([...prevLinks.keys(), ...nextLinks.keys()])) {
    const a = prevLinks.get(k);
    const b = nextLinks.get(k);
    const any = (a ?? b)!;
    if (!before.has(key(any.address.chain, any.address.address)) || !after.has(key(any.address.chain, any.address.address))) continue;
    if (a && b && a.score === b.score && a.band === b.band) continue;
    scoreChanges.push({
      ...ref(any.address),
      identifier: { type: any.identifier.type, value: any.identifier.value },
      fromScore: a?.score ?? null,
      toScore: b?.score ?? null,
      fromBand: a?.band ?? null,
      toBand: b?.band ?? null,
      rules: ruleChanges(a?.breakdownJson ?? [], b?.breakdownJson ?? []),
    });
  }
  scoreChanges.sort((x, y) => byAddress(x, y) || `${x.identifier.type}${x.identifier.value}`.localeCompare(`${y.identifier.type}${y.identifier.value}`));

  const categoryChanges: CategoryChange[] = [];
  for (const [k, a] of after) {
    const old = before.get(k);
    if (old?.category && a.category && old.category !== a.category) categoryChanges.push({ ...ref(a), from: old.category, to: a.category });
  }

  // On-chain: transactions and thresholds that were not there before, tags that appeared.
  const prevChain = new Map(prev.chain.map((c) => [key(c.address.chain, c.address.address), c]));
  const newTransactions: NewTransactions[] = [];
  const newThresholds: NewThreshold[] = [];
  const valuationCompleted: ValuationCompleted[] = [];
  const newIndicators: NewIndicator[] = [];
  for (const c of next.chain) {
    const old = prevChain.get(key(c.address.chain, c.address.address));
    const seenTx = new Set((old?.flows ?? []).map((f) => f.tx));
    const fresh = c.flows.filter((f) => !seenTx.has(f.tx)).sort((a, b) => time(a.time) - time(b.time) || a.tx.localeCompare(b.tx));
    if (fresh.length > 0) {
      newTransactions.push({ ...ref(c.address), isNewAddress: !old, count: new Set(fresh.map((f) => f.tx)).size, firstAt: fresh[0]!.time, lastAt: fresh[fresh.length - 1]!.time, flows: fresh.slice(-MAX_LISTED_FLOWS) });
    }
    const unvaluedBefore = old?.indicators.totals?.unvalued ?? 0;
    const caughtUp: NewThreshold[] = [];
    for (const th of c.indicators.thresholds) {
      const was = old?.indicators.thresholds.find((x) => x.eur === th.eur);
      for (const [kind, at, before] of [['single', th.singleCrossedAt, was?.singleCrossedAt], ['cumulative', th.cumulativeCrossedAt, was?.cumulativeCrossedAt]] as const) {
        if (!at || before) continue;
        const entry: NewThreshold = { ...ref(c.address), thresholdEur: th.eur, kind, at };
        // crossed before the previous run, which could not value everything: the valuation caught up, nothing new happened
        if (old && unvaluedBefore > 0 && time(at) <= time(prev.startedAt)) caughtUp.push(entry);
        else newThresholds.push(entry);
      }
    }
    if (caughtUp.length > 0) valuationCompleted.push({ ...ref(c.address), previouslyUnvalued: unvaluedBefore, thresholds: caughtUp });
    const had = new Set(old?.indicators.tags ?? []);
    for (const tag of c.indicators.tags) if (!had.has(tag) && !tag.startsWith('OVER_')) newIndicators.push({ ...ref(c.address), tag, cashOut: CASH_OUT_TAGS.includes(tag) });
  }
  newTransactions.sort(byAddress);
  newThresholds.sort((a, b) => byAddress(a, b) || a.thresholdEur - b.thresholdEur || a.kind.localeCompare(b.kind));
  valuationCompleted.sort(byAddress);
  newIndicators.sort((a, b) => byAddress(a, b) || a.tag.localeCompare(b.tag));

  // Address swap: the same URL carried address X before and carries Y now.
  const sourcesBefore = sourcesOf(prev);
  const sourceChanges: SourceChange[] = [];
  for (const [url, now] of sourcesOf(next)) {
    const was = sourcesBefore.get(url);
    if (!was) continue;
    const gone = [...was.addresses].filter(([k]) => !now.addresses.has(k)).map(([, a]) => a).sort(byAddress);
    const appeared = [...now.addresses].filter(([k]) => !was.addresses.has(k)).map(([, a]) => a).sort(byAddress);
    if (gone.length === 0 && appeared.length === 0) continue;
    sourceChanges.push({ url, platform: now.platform, title: now.title, kind: gone.length > 0 && appeared.length > 0 ? 'swap' : appeared.length > 0 ? 'added' : 'removed', from: gone, to: appeared });
  }
  sourceChanges.sort((a, b) => a.url.localeCompare(b.url));

  const counts = {
    addressesAdded: added.length,
    addressesRemoved: removed.length,
    scoreChanges: scoreChanges.length,
    categoryChanges: categoryChanges.length,
    newTransactions: newTransactions.reduce((n, t) => n + t.count, 0),
    newThresholds: newThresholds.length,
    newIndicators: newIndicators.length,
    sourceChanges: sourceChanges.length,
    valuationCompleted: valuationCompleted.length,
  };
  return {
    version: 1,
    fromRunId: prev.id,
    toRunId: next.id,
    fromAt: prev.startedAt,
    toAt: next.startedAt,
    params: { from: prev.params, to: next.params, same: prev.params.chain === next.params.chain && [...prev.params.connectors].sort().join() === [...next.params.connectors].sort().join() },
    addresses: { added, removed },
    scoreChanges,
    categoryChanges,
    newTransactions,
    newThresholds,
    valuationCompleted,
    newIndicators,
    sourceChanges,
    counts,
    empty: Object.values(counts).every((n) => n === 0),
  };
}

// ---- notifications -------------------------------------------------------------------------------------------------

/** A new address scoring at least this much is worth the analyst's attention (the lower edge of the "probable" band). */
export const NOTIFY_MIN_SCORE = 60;

export type NotificationKind = 'NEW_ADDRESS' | 'ADDRESS_CHANGED' | 'THRESHOLD_EXCEEDED' | 'NEW_CASH_OUT';
/** A notification as code + params; the web and the report put the words in (backend messages are codes). */
export interface NotificationDraft {
  kind: NotificationKind;
  params: Record<string, string | number>;
}

const list = (xs: AddrRef[]) => xs.map((x) => x.address).join(', ');

/** What deserves a bell: a new address with a high score, a changed address, a threshold crossed, a new cash-out indicator. */
export function notificationsFor(diff: RunDiffDoc): NotificationDraft[] {
  const out: NotificationDraft[] = [];
  for (const a of diff.addresses.added) {
    if (!a.excluded && a.bestScore !== null && a.bestScore >= NOTIFY_MIN_SCORE) out.push({ kind: 'NEW_ADDRESS', params: { chain: a.chain, address: a.address, score: a.bestScore } });
  }
  for (const s of diff.sourceChanges) {
    if (s.kind === 'swap') out.push({ kind: 'ADDRESS_CHANGED', params: { url: s.url, platform: s.platform ?? s.url, from: list(s.from), to: list(s.to) } });
  }
  const crossed = new Map<string, NotificationDraft>();
  for (const t of diff.newThresholds) {
    const k = `${t.chain}:${t.address}:${t.thresholdEur}`;
    if (!crossed.has(k)) crossed.set(k, { kind: 'THRESHOLD_EXCEEDED', params: { chain: t.chain, address: t.address, thresholdEur: t.thresholdEur, at: t.at } });
  }
  out.push(...crossed.values());
  const cash = new Map<string, string[]>();
  for (const i of diff.newIndicators) if (i.cashOut) cash.set(`${i.chain}:${i.address}`, [...(cash.get(`${i.chain}:${i.address}`) ?? []), i.tag]);
  for (const [k, tags] of cash) {
    const [chain, ...rest] = k.split(':');
    out.push({ kind: 'NEW_CASH_OUT', params: { chain: chain!, address: rest.join(':'), tags: tags.join(',') } });
  }
  return out;
}
