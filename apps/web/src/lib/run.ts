import type { AddressDto, Band, ChainDto, EvidenceDto, LinkDto, RunResults } from '@/api/types';
import { BAND_ORDER } from '@/lib/bands';
import { addressKey } from '@/lib/format';

export const keyOf = (chain: string, address: string) => `${chain}:${addressKey(address)}`;

/** One address assigned to the person: its best link decides the score; the other identifiers that point to it are `links`. */
export interface AddressRow {
  key: string;
  address: AddressDto;
  /** All non-excluded links to this address, best first. */
  links: LinkDto[];
  best: LinkDto;
  /** Source types and platforms behind the best link, for "podstawa przypisania". */
  sourceTypes: string[];
  platforms: string[];
}

export interface RunView {
  evidence: Map<string, EvidenceDto>;
  rows: AddressRow[];
  rejected: { address: AddressDto; links: LinkDto[] }[];
  /** Addresses (all kinds) found in the sources. */
  found: number;
  /** Assigned addresses per band of their best link (EXCLUDED counts the rejected ones). */
  counts: Record<Band, number>;
  /** Snapshots with a fiat cash-out signal. */
  cashOut: ChainDto[];
  addressInfo: (key: string) => { address: AddressDto; links: LinkDto[]; traces: RunResults['traces']; chain?: ChainDto };
}

/** Everything the screens of one run share, computed once: addresses (not links) are what the analyst reads. */
export function deriveRun(data: RunResults): RunView {
  const evidence = new Map<string, EvidenceDto>(data.evidence.map((e) => [e.id, e]));
  const byAddress = new Map<string, LinkDto[]>();
  for (const l of data.links) {
    const k = keyOf(l.address.chain, l.address.address);
    byAddress.set(k, [...(byAddress.get(k) ?? []), l]);
  }

  const rows: AddressRow[] = [];
  const rejected: RunView['rejected'] = [];
  for (const [key, links] of byAddress) {
    const active = links.filter((l) => !l.excludedReason).sort((a, b) => b.score - a.score || a.identifier.value.localeCompare(b.identifier.value));
    if (active.length === 0) {
      rejected.push({ address: links[0]!.address, links });
      continue;
    }
    const best = active[0]!;
    const ids = [...new Set(best.breakdownJson.flatMap((e) => e.evidenceIds))].map((id) => evidence.get(id)).filter((e): e is EvidenceDto => !!e);
    rows.push({
      key,
      address: best.address,
      links: active,
      best,
      sourceTypes: [...new Set(ids.map((e) => e.sourceType))],
      platforms: [...new Set(ids.map((e) => e.metaJson.platform))],
    });
  }
  rows.sort((a, b) => b.best.score - a.best.score || a.address.address.localeCompare(b.address.address));

  const counts = Object.fromEntries(BAND_ORDER.map((b) => [b, 0])) as Record<Band, number>;
  for (const r of rows) counts[r.best.band]++;
  counts.EXCLUDED = rejected.length;

  const addressInfo: RunView['addressInfo'] = (key) => {
    const [chain, ...rest] = key.split(':');
    const address = rest.join(':');
    const k = keyOf(chain!, address);
    const links = data.links.filter((l) => keyOf(l.address.chain, l.address.address) === k);
    const snapshot = data.chain.find((c) => keyOf(c.address.chain, c.address.address) === k);
    const fromIdentity = data.run.summaryJson?.identities.flatMap((i) => i.otherAddresses).find((o) => keyOf(o.chain, o.address) === k);
    const subject = data.run.summaryJson?.subjects?.find((s) => keyOf(s.chain, s.address) === k);
    const dto: AddressDto = subject ?? links[0]?.address ?? {
      chain: chain as AddressDto['chain'],
      address,
      category: (snapshot?.address.category ?? fromIdentity?.category ?? 'UNHOSTED') as AddressDto['category'],
      labels: [],
      isContract: null,
    };
    return { address: dto, links, traces: data.traces.filter((tr) => keyOf(tr.chain, tr.address) === k), chain: snapshot };
  };

  return {
    evidence,
    rows,
    rejected,
    found: new Set(data.traces.map((t) => keyOf(t.chain, t.address))).size,
    counts,
    cashOut: data.chain.filter((c) => c.indicators.cashOut.detected),
    addressInfo,
  };
}

/** The sentence under the title of the result: what the analysis established. `count` goes to the plural forms of i18n. */
export function verdictOf(view: RunView, run: { status: string }, opts: { identities: number; subjects: number }): { key: string; count?: number } {
  if (run.status === 'FAILED') return { key: 'result.verdict.failed' };
  const bands: [Band, string][] = [['VERY_HIGH', 'veryHigh'], ['PROBABLE', 'probable'], ['MEDIUM', 'medium'], ['LOW', 'low']];
  for (const [band, k] of bands) if (view.counts[band] > 0) return { key: `result.verdict.${k}`, count: view.counts[band] };
  if (opts.identities > 0) return { key: 'result.verdict.identities', count: opts.identities };
  if (view.counts.EXCLUDED > 0) return { key: 'result.verdict.onlyExcluded', count: view.counts.EXCLUDED };
  if (opts.subjects > 0) return { key: 'result.verdict.subjects', count: opts.subjects };
  return { key: 'result.verdict.nothing' };
}

/** Starts a download of the PDF report without leaving the screen. */
export function downloadPdf(runId: string) {
  const a = document.createElement('a');
  a.href = `/api/runs/${runId}/report.pdf`;
  a.download = '';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

/** `22:30:41` — the time of a source's answer, in Polish time. */
export const formatTime = (iso: string | undefined | null) => (iso ? new Intl.DateTimeFormat('pl-PL', { timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso)) : '—');
