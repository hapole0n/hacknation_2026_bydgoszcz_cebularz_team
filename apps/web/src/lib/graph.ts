import type { AddressCategory, Band, RunResults } from '@/api/types';
import { addressKey, shortAddress } from './format';

export type NodeKind = 'identifier' | 'identity' | 'source' | 'address' | 'counterparty' | 'others';
export type EdgeKind = 'linked' | 'mentioned_in' | 'transfer' | 'published';

export interface GraphNode {
  data: {
    id: string;
    kind: NodeKind;
    label: string;
    /** Address nodes: the attributed score (best of its links) and its band. */
    score?: number;
    band?: Band;
    excluded?: boolean;
    category?: AddressCategory | string;
    /** Details key: identifier id, evidence id, "chain:address" or identity key. */
    ref: string;
  };
}

export interface GraphEdge {
  data: { id: string; source: string; target: string; kind: EdgeKind; label?: string; band?: Band; excluded?: boolean; dir?: 'in' | 'out' | 'both' };
}

export interface GraphOptions {
  showExcluded: boolean;
  showCounterparties: boolean;
  showSources: boolean;
}

export interface GraphLabels {
  others: (count: number) => string;
  pln: (value: number) => string;
}

export interface Graph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Layout roots: the identifiers (or the searched address in an address case). */
  roots: string[];
}

const addrId = (chain: string, address: string) => `a:${chain}:${addressKey(address)}`;

/**
 * The graph of one run (PLAN §3.6): identifiers → linked(score) → addresses; addresses → mentioned_in → sources;
 * addresses → transfer(amount) → counterparties. Excluded attributions are kept but flagged (grey, dashed).
 * Address case (no links): searched address → accounts that published it → their other addresses.
 */
export function buildGraph(r: RunResults, opts: GraphOptions, labels: GraphLabels): Graph {
  const nodes = new Map<string, GraphNode>();
  const edges = new Map<string, GraphEdge>();
  const addNode = (n: GraphNode) => void (nodes.has(n.data.id) || nodes.set(n.data.id, n));
  const addEdge = (e: GraphEdge) => void (edges.has(e.data.id) || edges.set(e.data.id, e));
  const roots: string[] = [];

  const links = r.links.filter((l) => opts.showExcluded || !l.excludedReason);
  const addressNodes = new Map<string, { chain: string; address: string }>();

  for (const l of links) {
    const aid = addrId(l.address.chain, l.address.address);
    const prev = nodes.get(aid);
    const excluded = !!l.excludedReason || !!prev?.data.excluded;
    if (!prev || l.score > (prev.data.score ?? -1)) {
      nodes.set(aid, { data: { id: aid, kind: 'address', label: shortAddress(l.address.address), score: l.score, band: l.band, excluded, category: l.address.category, ref: `${l.address.chain}:${l.address.address}` } });
    } else if (excluded) prev.data.excluded = true;
    if (excluded) nodes.get(aid)!.data.excluded = true;
    addressNodes.set(aid, { chain: l.address.chain, address: l.address.address });

    const iid = `i:${l.identifier.id}`;
    addNode({ data: { id: iid, kind: 'identifier', label: l.identifier.value, ref: l.identifier.id } });
    if (!roots.includes(iid)) roots.push(iid);
    addEdge({ data: { id: `${iid}>${aid}`, source: iid, target: aid, kind: 'linked', label: l.excludedReason ? '0%' : `${l.score}%`, band: l.band, excluded: !!l.excludedReason } });
  }

  if (links.length === 0) addIdentityGraph(r, addNode, addEdge, roots, addressNodes);

  if (opts.showSources) {
    const evidence = new Map(r.evidence.map((e) => [e.id, e]));
    for (const t of r.traces) {
      const aid = addrId(t.chain, t.address);
      const ev = evidence.get(t.evidenceId);
      if (!ev || !nodes.has(aid)) continue;
      addNode({ data: { id: `s:${ev.id}`, kind: 'source', label: ev.metaJson.platform, ref: ev.id } });
      addEdge({ data: { id: `${aid}>s:${ev.id}`, source: aid, target: `s:${ev.id}`, kind: 'mentioned_in', excluded: !!nodes.get(aid)!.data.excluded } });
    }
  }

  if (opts.showCounterparties) {
    for (const snap of r.chain) {
      const subject = addrId(snap.address.chain, snap.address.address);
      if (!nodes.has(subject)) continue;
      const byCp = new Map<string, { address: string; name?: string; category?: string; inPln: number; outPln: number; n: number }>();
      for (const f of snap.flows) {
        const k = addressKey(f.counterparty.address);
        const e = byCp.get(k) ?? { address: f.counterparty.address, name: f.counterparty.name, category: f.counterparty.category, inPln: 0, outPln: 0, n: 0 };
        e[f.direction === 'in' ? 'inPln' : 'outPln'] += f.valuePln ?? 0;
        e.n++;
        byCp.set(k, e);
      }
      const unknown = { inPln: 0, outPln: 0, n: 0, count: 0 };
      for (const cp of byCp.values()) {
        const nid = addrId(snap.address.chain, cp.address);
        const dir = cp.inPln > 0 && cp.outPln > 0 ? 'both' : cp.outPln > 0 || cp.inPln === 0 ? 'out' : 'in';
        if (nodes.has(nid) || cp.category) {
          addNode({ data: { id: nid, kind: 'counterparty', label: cp.name ?? shortAddress(cp.address), category: cp.category, ref: `${snap.address.chain}:${cp.address}` } });
          addEdge({ data: { id: `${subject}~${nid}`, source: subject, target: nid, kind: 'transfer', label: labels.pln(cp.inPln + cp.outPln), dir } });
        } else {
          unknown.inPln += cp.inPln;
          unknown.outPln += cp.outPln;
          unknown.n += cp.n;
          unknown.count++;
        }
      }
      if (unknown.count > 0) {
        const oid = `o:${subject}`;
        const dir = unknown.inPln > 0 && unknown.outPln > 0 ? 'both' : unknown.outPln > 0 ? 'out' : 'in';
        addNode({ data: { id: oid, kind: 'others', label: labels.others(unknown.count), ref: subject } });
        addEdge({ data: { id: `${subject}~${oid}`, source: subject, target: oid, kind: 'transfer', label: labels.pln(unknown.inPln + unknown.outPln), dir } });
      }
    }
  }

  return { nodes: [...nodes.values()], edges: [...edges.values()], roots };
}

function addIdentityGraph(
  r: RunResults,
  addNode: (n: GraphNode) => void,
  addEdge: (e: GraphEdge) => void,
  roots: string[],
  addressNodes: Map<string, { chain: string; address: string }>,
) {
  const identities = r.run.summaryJson?.identities ?? [];
  const categoryOf = new Map(r.chain.map((c) => [addrId(c.address.chain, c.address.address), c.address.category]));
  for (const id of identities) {
    const nid = `p:${id.key}`;
    addNode({ data: { id: nid, kind: 'identity', label: id.handle ?? id.name ?? id.platform, score: id.score?.score, band: (id.score?.band as Band | undefined) ?? undefined, ref: id.key } });
    for (const o of id.otherAddresses) {
      const oid = addrId(o.chain, o.address);
      addNode({ data: { id: oid, kind: 'address', label: shortAddress(o.address), category: o.category, excluded: o.excluded, ref: `${o.chain}:${o.address}` } });
      addEdge({ data: { id: `${nid}>${oid}`, source: nid, target: oid, kind: 'published', excluded: o.excluded } });
    }
    if (id.targetAddress) {
      const chain = r.traces.find((t) => t.address === id.targetAddress)?.chain ?? 'ETH';
      const tid = addrId(chain, id.targetAddress);
      addNode({ data: { id: tid, kind: 'address', label: shortAddress(id.targetAddress), category: categoryOf.get(tid) ?? 'UNHOSTED', ref: `${chain}:${id.targetAddress}` } });
      addressNodes.set(tid, { chain, address: id.targetAddress });
      if (!roots.includes(tid)) roots.push(tid);
      addEdge({ data: { id: `${tid}>${nid}`, source: tid, target: nid, kind: 'published', label: id.score ? `${id.score.score}%` : undefined, band: (id.score?.band as Band | undefined) ?? undefined } });
    } else {
      // same nick elsewhere: hang it off the searched address with a dashed "possibly another person" edge
      const root = roots[0];
      if (root) addEdge({ data: { id: `${root}>${nid}`, source: root, target: nid, kind: 'published', excluded: true, label: '?' } });
    }
  }
}
