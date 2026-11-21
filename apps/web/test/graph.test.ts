import { describe, expect, it } from 'vitest';
import type { LinkDto, RunResults } from '../src/api/types';
import { buildGraph } from '../src/lib/graph';

const labels = { others: (n: number) => `+${n} others`, pln: (v: number) => `${v} PLN` };
const all = { showExcluded: true, showCounterparties: true, showSources: true };
const A = '0x1111111111111111111111111111111111111111';
const B = '0x2222222222222222222222222222222222222222';
const K = 'TKantorKantorKantorKantorKantorKant1';

const link = (id: string, identifier: string, type: 'NICK' | 'EMAIL', address: string, score: number, extra: Partial<LinkDto> = {}): LinkDto =>
  ({
    id,
    runId: 'r',
    identifierId: identifier,
    score,
    band: score >= 80 ? 'VERY_HIGH' : score === 0 ? 'EXCLUDED' : 'LOW',
    breakdownJson: [],
    hintsJson: [],
    excludedReason: null,
    analystDecision: null,
    analystNote: null,
    analystName: null,
    decidedAt: null,
    identifier: { id: identifier, type, value: identifier },
    address: { chain: 'ETH', address, category: 'UNHOSTED', labels: [], isContract: null },
    ...extra,
  }) as LinkDto;

let n = 0;
const flow = (direction: 'in' | 'out', address: string, valuePln: number, category?: string, name?: string) => ({
  time: '2026-10-01T00:00:00Z',
  tx: `t${n++}`,
  direction,
  counterparty: { address, category, name },
  asset: 'USDT',
  amount: 1,
  valuePln,
  valueEur: null,
  tags: [],
});

const base = (): RunResults =>
  ({
    run: { id: 'r', caseId: 'c', status: 'DONE', startedAt: '', finishedAt: '', rulesVersion: '1.1.0', appVersion: '0', paramsJson: { connectors: ['sandbox'], asOf: '', chain: 'fixture' }, summaryJson: null },
    links: [
      link('l1', 'jtestowy', 'NICK', A, 100),
      link('l2', 'jtestowy', 'NICK', B, 0, { excludedReason: 'EXCL_CEX', address: { chain: 'ETH', address: B, category: 'CEX_CUSTODIAL', labels: [], isContract: false } }),
      link('l3', 'jan@example.org', 'EMAIL', A, 95),
    ],
    evidence: [
      { id: 'e1', connectorId: 'sandbox', url: 'http://x/1', resourceId: null, fetchedAt: '', sha256: 'a'.repeat(64), snippet: 's', archiveUrl: null, sourceType: 'OFFICIAL_PROFILE', metaJson: { platform: 'site.example', origin: 'OWN_PROFILE', author: null, publishedAt: null, title: null, snapshotOf: null, round: 1 } },
    ],
    traces: [
      { id: 't1', evidenceId: 'e1', chain: 'ETH', address: A, contextType: 'DONATION', contextSnippet: '', position: 0 },
      { id: 't2', evidenceId: 'e1', chain: 'ETH', address: B, contextType: 'DISCUSSION', contextSnippet: '', position: 1 },
    ],
    chain: [
      {
        address: { chain: 'ETH', address: A, category: 'UNHOSTED' },
        provider: 'fixture',
        fetchedAt: '',
        indicators: {},
        flows: [
          flow('out', B, 100, 'CEX_CUSTODIAL', 'Binance'),
          flow('out', K, 50, 'CASP_KANTOR', 'Kantor'),
          flow('in', '0xaaa0000000000000000000000000000000000001', 10),
          flow('in', '0xaaa0000000000000000000000000000000000002', 20),
          flow('out', '0xaaa0000000000000000000000000000000000001', 5),
        ],
      },
    ],
  }) as unknown as RunResults;

describe('buildGraph', () => {
  it('draws identifiers, addresses, sources and counterparties with the right edges', () => {
    const g = buildGraph(base(), all, labels);
    const kinds = (k: string) => g.nodes.filter((x) => x.data.kind === k).map((x) => x.data.id);
    expect(kinds('identifier')).toHaveLength(2);
    expect(kinds('address')).toHaveLength(2);
    expect(kinds('source')).toEqual(['s:e1']);
    expect([...g.roots].sort()).toEqual(['i:jan@example.org', 'i:jtestowy']);
    const linked = g.edges.filter((e) => e.data.kind === 'linked');
    expect(linked.map((e) => [e.data.label, !!e.data.excluded]).sort()).toEqual([['0%', true], ['100%', false], ['95%', false]]);
  });

  it('flags excluded addresses and keeps the best score of an address', () => {
    const g = buildGraph(base(), all, labels);
    const a = g.nodes.find((x) => x.data.id === `a:ETH:${A}`)!;
    const b = g.nodes.find((x) => x.data.id === `a:ETH:${B}`)!;
    expect(a.data).toMatchObject({ score: 100, band: 'VERY_HIGH', excluded: false });
    expect(b.data).toMatchObject({ excluded: true, category: 'CEX_CUSTODIAL' });
    expect(g.edges.find((e) => e.data.target === b.data.id && e.data.kind === 'linked')?.data.excluded).toBe(true);
  });

  it('reuses an address node as a counterparty, adds recognised counterparties, and folds the rest into one node', () => {
    const g = buildGraph(base(), all, labels);
    const transfers = g.edges.filter((e) => e.data.kind === 'transfer');
    expect(transfers.map((e) => e.data.target).sort()).toEqual([`a:ETH:${B}`, `a:ETH:${K}`, `o:a:ETH:${A}`].sort());
    expect(g.nodes.find((x) => x.data.id === `a:ETH:${K}`)?.data).toMatchObject({ kind: 'counterparty', label: 'Kantor', category: 'CASP_KANTOR' });
    const others = g.nodes.find((x) => x.data.kind === 'others')!;
    expect(others.data.label).toBe('+2 others');
    expect(transfers.find((e) => e.data.target === others.data.id)?.data).toMatchObject({ label: '35 PLN', dir: 'both' });
    expect(transfers.find((e) => e.data.target === `a:ETH:${B}`)?.data).toMatchObject({ dir: 'out', label: '100 PLN' });
  });

  it('filters: excluded addresses, sources and counterparties can be hidden', () => {
    const noExcluded = buildGraph(base(), { ...all, showExcluded: false }, labels);
    expect(noExcluded.edges.some((e) => e.data.kind === 'linked' && e.data.excluded)).toBe(false);
    expect(noExcluded.nodes.some((x) => x.data.kind === 'address' && x.data.excluded)).toBe(false);
    const bare = buildGraph(base(), { showExcluded: true, showCounterparties: false, showSources: false }, labels);
    expect(bare.nodes.map((x) => x.data.kind).sort()).toEqual(['address', 'address', 'identifier', 'identifier']);
    expect(bare.edges.every((e) => e.data.kind === 'linked')).toBe(true);
  });

  it('address case: the searched address → accounts that published it → their other addresses', () => {
    const r = base();
    r.links = [];
    r.run.summaryJson = {
      stats: { evidence: 1, traces: 2, links: 0, chainSnapshots: 0, identities: 2 },
      connectorErrors: [],
      chainNotes: [],
      chainWarnings: [],
      identities: [
        { key: 'site|jtestowy', platform: 'site', handle: 'jtestowy', name: null, relation: 'PUBLISHER', evidenceIds: ['e1'], urls: [], targetAddress: A, score: { score: 90, band: 'VERY_HIGH' } as never, otherAddresses: [{ chain: 'ETH', address: B, category: 'CEX_CUSTODIAL', excluded: true, evidenceIds: ['e1'] }] },
        { key: 'other|jtestowy', platform: 'other', handle: 'jtestowy', name: null, relation: 'SAME_NICK_OTHER_PLATFORM', evidenceIds: ['e1'], urls: [], targetAddress: null, score: null, otherAddresses: [] },
      ],
    };
    const g = buildGraph(r, { ...all, showSources: false, showCounterparties: false }, labels);
    expect(g.roots).toEqual([`a:ETH:${A}`]);
    expect(g.nodes.filter((x) => x.data.kind === 'identity')).toHaveLength(2);
    expect(g.edges.find((e) => e.data.source === `a:ETH:${A}` && e.data.target === 'p:site|jtestowy')?.data).toMatchObject({ label: '90%', kind: 'published' });
    expect(g.edges.find((e) => e.data.target === 'p:other|jtestowy')?.data).toMatchObject({ excluded: true, label: '?' }); // dashed: possibly another person
    expect(g.nodes.find((x) => x.data.id === `a:ETH:${B}`)?.data.excluded).toBe(true);
  });

  it('an empty run gives an empty graph', () => {
    const r = base();
    r.links = [];
    r.traces = [];
    r.chain = [];
    r.evidence = [];
    expect(buildGraph(r, all, labels)).toEqual({ nodes: [], edges: [], roots: [] });
  });
});
