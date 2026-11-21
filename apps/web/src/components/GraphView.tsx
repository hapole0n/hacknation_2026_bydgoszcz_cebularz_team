import cytoscape, { type Core, type NodeDataDefinition } from 'cytoscape';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Band, EvidenceDto, RunResults } from '@/api/types';
import { BandChip, CategoryBadge, Panel } from '@/components/primitives';
import { EvidenceItem } from '@/components/EvidenceItem';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { BAND_STYLE, CATEGORY_HEX } from '@/lib/bands';
import { formatPln } from '@/lib/format';
import { buildGraph, type GraphNode } from '@/lib/graph';

const GREY = '#9aa3b2';
const INK = '#16233b';
const bandHex = (b?: Band) => (b ? BAND_STYLE[b].hex : undefined);

const STYLE: cytoscape.StylesheetJson = [
  { selector: 'node', style: { label: 'data(label)', 'font-family': 'IBM Plex Sans Variable, system-ui, sans-serif', 'font-size': 11, color: INK, 'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': '120px' } },
  { selector: 'node[kind = "identifier"]', style: { shape: 'round-rectangle', 'background-color': INK, color: '#ffffff', width: 'label', height: 'label', padding: '10px' } },
  { selector: 'node[kind = "identity"]', style: { shape: 'round-rectangle', 'background-color': '#2f5d8c', color: '#ffffff', width: 'label', height: 'label', padding: '10px' } },
  { selector: 'node[kind = "source"]', style: { shape: 'rectangle', 'background-color': '#eef0f4', 'border-width': 1, 'border-color': '#c3cad5', 'font-size': 10, width: 'label', height: 'label', padding: '7px' } },
  { selector: 'node[kind = "address"]', style: { shape: 'ellipse', 'background-color': '#ffffff', 'border-width': 3, 'border-color': (n: cytoscape.NodeSingular) => bandHex(n.data('band')) ?? CATEGORY_HEX[n.data('category')] ?? GREY, width: 'label', height: 'label', padding: '12px' } },
  { selector: 'node[kind = "counterparty"]', style: { shape: 'octagon', 'background-color': '#ffffff', 'border-width': 2, 'border-color': (n: cytoscape.NodeSingular) => CATEGORY_HEX[n.data('category')] ?? GREY, width: 'label', height: 'label', padding: '12px', 'font-size': 10 } },
  { selector: 'node[kind = "others"]', style: { shape: 'ellipse', 'background-color': '#eef0f4', 'border-width': 1, 'border-color': '#c3cad5', 'font-size': 10, color: '#56627a', width: 'label', height: 'label', padding: '10px' } },
  { selector: 'node[?excluded]', style: { 'background-color': '#edeef0', 'border-style': 'dashed', 'border-color': '#5f6978', color: '#5f6978' } },
  { selector: 'node:selected', style: { 'underlay-color': '#2f5d8c', 'underlay-opacity': 0.25, 'underlay-padding': 6 } },

  { selector: 'edge', style: { 'curve-style': 'bezier', width: 1.5, 'line-color': GREY, 'target-arrow-color': GREY, 'source-arrow-color': GREY, 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'font-size': 10, 'font-family': 'IBM Plex Sans Variable, system-ui, sans-serif', color: INK, 'text-background-color': '#f5f6f8', 'text-background-opacity': 1, 'text-background-padding': '2px', 'text-rotation': 'autorotate' } },
  { selector: 'edge[label]', style: { label: 'data(label)' } },
  { selector: 'edge[kind = "linked"]', style: { width: 2.5, 'line-color': (e: cytoscape.EdgeSingular) => bandHex(e.data('band')) ?? GREY, 'target-arrow-color': (e: cytoscape.EdgeSingular) => bandHex(e.data('band')) ?? GREY } },
  { selector: 'edge[kind = "mentioned_in"]', style: { width: 1, 'line-color': '#c3cad5', 'target-arrow-color': '#c3cad5' } },
  { selector: 'edge[kind = "transfer"]', style: { width: 1.5, 'line-color': '#b4531e', 'target-arrow-color': '#b4531e', 'source-arrow-color': '#b4531e', 'target-arrow-shape': 'triangle' } },
  { selector: 'edge[kind = "transfer"][dir = "in"]', style: { 'target-arrow-shape': 'none', 'source-arrow-shape': 'triangle' } },
  { selector: 'edge[kind = "transfer"][dir = "both"]', style: { 'source-arrow-shape': 'triangle' } },
  { selector: 'edge[kind = "published"]', style: { width: 2, 'line-color': '#2f5d8c', 'target-arrow-color': '#2f5d8c' } },
  { selector: 'edge[?excluded]', style: { 'line-style': 'dashed', 'line-color': GREY, 'target-arrow-color': GREY, 'source-arrow-color': GREY, color: '#5f6978' } },
];

/** The link graph (PLAN §3.6): identifiers, sources, addresses by category and counterparties; click a node for details. */
export function GraphView({ results, onOpenAddress }: { results: RunResults; onOpenAddress: (key: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [opts, setOpts] = useState({ showExcluded: true, showCounterparties: true, showSources: true });
  const [selected, setSelected] = useState<NodeDataDefinition | null>(null);

  const graph = useMemo(
    () => buildGraph(results, opts, { others: (count) => t('graph.others', { count }), pln: (v) => formatPln(v, lang) }),
    [results, opts, lang],
  );

  useEffect(() => {
    if (!container.current || graph.nodes.length === 0) return;
    const cy = cytoscape({
      container: container.current,
      elements: [...graph.nodes, ...graph.edges],
      style: STYLE,
      // shortcut: force-directed layout is fine up to ~100 nodes; beyond that fold more counterparties into "others".
      layout: { name: 'cose', animate: false, randomize: false, fit: true, padding: 30, nodeDimensionsIncludeLabels: true, idealEdgeLength: () => 90, nodeRepulsion: () => 12000, numIter: 1500 } as cytoscape.LayoutOptions,
      minZoom: 0.2,
      maxZoom: 2.5,
    });
    cy.on('tap', 'node', (e) => setSelected(e.target.data()));
    cy.on('tap', (e) => e.target === cy && setSelected(null));
    cyRef.current = cy;
    setSelected(null);
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [graph]);

  const toggle = (k: keyof typeof opts) => (v: boolean | 'indeterminate') => setOpts((o) => ({ ...o, [k]: v === true }));

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-base font-semibold">{t('graph.title')}</h3>
        <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{t('graph.lead')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        {(['showExcluded', 'showCounterparties', 'showSources'] as const).map((k) => (
          <div key={k} className="flex items-center gap-2">
            <Checkbox id={`g-${k}`} checked={opts[k]} onCheckedChange={toggle(k)} />
            <Label htmlFor={`g-${k}`}>{t(`graph.${k}`)}</Label>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => cyRef.current?.fit(undefined, 30)}>{t('graph.fit')}</Button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
        <Panel className="overflow-hidden">
          {graph.nodes.length === 0 ? (
            <p className="p-10 text-center text-sm text-muted-foreground">{t('graph.empty')}</p>
          ) : (
            <div ref={container} className="h-[640px] w-full" role="img" aria-label={t('graph.title')} data-testid="graph-canvas" />
          )}
        </Panel>

        <div className="space-y-4">
          <Panel className="p-4" >
            <h4 className="text-sm font-semibold">{t('graph.details')}</h4>
            {selected ? <NodeDetails node={selected} results={results} onOpenAddress={onOpenAddress} /> : <p className="mt-1 text-sm text-muted-foreground">{t('graph.selectHint')}</p>}
          </Panel>
          <Legend />
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  const items: [string, React.ReactNode][] = [
    ['identifier', <span className="inline-block h-3.5 w-6 rounded-sm bg-[#16233b]" />],
    ['identity', <span className="inline-block h-3.5 w-6 rounded-sm bg-steel" />],
    ['source', <span className="inline-block h-3.5 w-6 border border-input bg-muted" />],
    ['address', <span className="inline-block h-4 w-4 rounded-full border-[3px] border-band-very-high bg-white" />],
    ['counterparty', <span className="inline-block h-4 w-4 rounded-sm border-2 border-[#b4531e] bg-white" />],
    ['linked', <span className="inline-block h-0 w-6 border-t-[3px] border-band-very-high" />],
    ['mentioned', <span className="inline-block h-0 w-6 border-t border-input" />],
    ['transfer', <span className="inline-block h-0 w-6 border-t-2 border-[#b4531e]" />],
    ['excluded', <span className="inline-block h-0 w-6 border-t-2 border-dashed border-band-excluded" />],
  ];
  return (
    <Panel className="p-4">
      <h4 className="text-sm font-semibold">{t('graph.legend')}</h4>
      <ul className="mt-2 space-y-1.5 text-xs text-muted-foreground">
        {items.map(([k, swatch]) => (
          <li key={k} className="flex items-center gap-2">
            <span className="flex w-7 justify-center">{swatch}</span>
            {t(`graph.legendItems.${k}`)}
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function NodeDetails({ node, results, onOpenAddress }: { node: NodeDataDefinition; results: RunResults; onOpenAddress: (key: string) => void }) {
  const { t } = useTranslation();
  const d = node as GraphNode['data'];
  const evidence = new Map<string, EvidenceDto>(results.evidence.map((e) => [e.id, e]));
  let body: React.ReactNode = null;

  if (d.kind === 'identifier') {
    const link = results.links.find((l) => l.identifier.id === d.ref);
    body = link && <p className="text-sm">{t(`identifierTypes.${link.identifier.type}`)}: <span className="font-medium">{link.identifier.value}</span></p>;
  } else if (d.kind === 'source') {
    const ev = evidence.get(d.ref);
    body = ev && <EvidenceItem evidence={ev} />;
  } else if (d.kind === 'identity') {
    const id = results.run.summaryJson?.identities.find((i) => i.key === d.ref);
    body = id && (
      <div className="space-y-1 text-sm">
        <p className="font-medium">{id.handle ?? id.name} <span className="font-normal text-muted-foreground">({id.platform})</span></p>
        <p className="text-muted-foreground">{t(`identities.relation.${id.relation}`)}</p>
        {id.score && <BandChip band={id.score.band as Band} score={id.score.score} />}
      </div>
    );
  } else if (d.kind === 'address' || d.kind === 'counterparty') {
    const [chain, ...rest] = d.ref.split(':');
    const address = rest.join(':');
    body = (
      <div className="space-y-2 text-sm">
        <p className="break-all font-medium">{address}</p>
        <p className="text-muted-foreground">{t(`chains.${chain}`, { defaultValue: chain })}</p>
        {d.category && <CategoryBadge category={String(d.category)} />}
        {d.score !== undefined && d.band && (
          <p>{t('graph.bestScore')}: <BandChip band={d.band} score={d.score} /></p>
        )}
        {d.excluded && <p className="text-muted-foreground">{t('graph.excludedNote')}</p>}
        <Button size="sm" variant="outline" onClick={() => onOpenAddress(d.ref)}>{t('graph.openAddress')}</Button>
      </div>
    );
  } else {
    body = <p className="text-sm">{d.label}</p>;
  }
  return (
    <div className="mt-2 space-y-2">
      <p className="text-xs text-muted-foreground">{t(`graph.kind.${d.kind}`)}</p>
      {body}
    </div>
  );
}
