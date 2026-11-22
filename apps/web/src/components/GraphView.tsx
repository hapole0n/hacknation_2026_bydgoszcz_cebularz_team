import cytoscape, { type Core, type NodeDataDefinition } from 'cytoscape';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Band, EvidenceDto, RunResults } from '@/api/types';
import { EvidenceItem } from '@/components/Ledger';
import { CategoryTag } from '@/components/shared';
import { BevelButton, CheckField, GroupBox, SunkenPanel } from '@/components/win/controls';
import { GRAPH_COLOR as C } from '@/lib/bands';
import { formatPln } from '@/lib/format';
import { buildGraph, type GraphNode } from '@/lib/graph';

const FONT = 'IBM Plex Mono, ui-monospace, monospace';
/** Categories of cash-out services: their nodes and transfers use the alert colour. */
const CASH_CATEGORIES = ['CEX_CUSTODIAL', 'CEX_DEPOSIT', 'CASP_KANTOR', 'PAYMENT_GATEWAY', 'CRYPTO_CARD'];

const STYLE: cytoscape.StylesheetJson = [
  { selector: 'node', style: { label: 'data(label)', 'font-family': FONT, 'font-size': 11, color: C.ink, 'text-valign': 'center', 'text-halign': 'center', 'text-wrap': 'wrap', 'text-max-width': '120px' } },
  { selector: 'node[kind = "identifier"]', style: { shape: 'rectangle', 'background-color': C.navy, color: '#ffffff', width: 'label', height: 'label', padding: '10px' } },
  { selector: 'node[kind = "identity"]', style: { shape: 'rectangle', 'background-color': C.face, 'border-width': 2, 'border-color': C.navy, width: 'label', height: 'label', padding: '10px' } },
  { selector: 'node[kind = "source"]', style: { shape: 'rectangle', 'background-color': C.paper, 'border-width': 1, 'border-color': C.shadow, 'font-size': 10, width: 'label', height: 'label', padding: '7px' } },
  { selector: 'node[kind = "address"]', style: { shape: 'ellipse', 'background-color': C.paper, 'border-width': 3, 'border-color': C.navy, width: 'label', height: 'label', padding: '12px' } },
  { selector: 'node[kind = "counterparty"]', style: { shape: 'octagon', 'background-color': C.paper, 'border-width': 2, 'border-color': (n: cytoscape.NodeSingular) => (CASH_CATEGORIES.includes(n.data('category')) ? C.alert : C.shadow), width: 'label', height: 'label', padding: '12px', 'font-size': 10 } },
  { selector: 'node[kind = "others"]', style: { shape: 'ellipse', 'background-color': C.face, 'border-width': 1, 'border-color': C.shadow, 'font-size': 10, width: 'label', height: 'label', padding: '10px' } },
  { selector: 'node[?excluded]', style: { 'background-color': C.paper, 'border-style': 'dashed', 'border-color': C.alert, color: C.alert } },
  { selector: 'node:selected', style: { 'underlay-color': C.navy, 'underlay-opacity': 0.25, 'underlay-padding': 6 } },

  { selector: 'edge', style: { 'curve-style': 'bezier', width: 1.5, 'line-color': C.shadow, 'target-arrow-color': C.shadow, 'source-arrow-color': C.shadow, 'target-arrow-shape': 'triangle', 'arrow-scale': 0.8, 'font-size': 10, 'font-family': FONT, color: C.ink, 'text-background-color': C.face, 'text-background-opacity': 1, 'text-background-padding': '2px', 'text-rotation': 'autorotate' } },
  { selector: 'edge[label]', style: { label: 'data(label)' } },
  { selector: 'edge[kind = "linked"]', style: { width: 2.5, 'line-color': C.navy, 'target-arrow-color': C.navy } },
  { selector: 'edge[kind = "mentioned_in"]', style: { width: 1, 'line-color': C.rule, 'target-arrow-color': C.rule } },
  { selector: 'edge[kind = "transfer"]', style: { width: 1.5, 'line-color': C.shadow, 'target-arrow-color': C.shadow, 'source-arrow-color': C.shadow, 'target-arrow-shape': 'triangle' } },
  { selector: 'edge[kind = "transfer"][dir = "in"]', style: { 'target-arrow-shape': 'none', 'source-arrow-shape': 'triangle' } },
  { selector: 'edge[kind = "transfer"][dir = "both"]', style: { 'source-arrow-shape': 'triangle' } },
  { selector: 'edge[kind = "published"]', style: { width: 2, 'line-color': C.navy, 'target-arrow-color': C.navy, 'line-style': 'dotted' } },
  { selector: 'edge[?excluded]', style: { 'line-style': 'dashed', 'line-color': C.alert, 'target-arrow-color': C.alert, 'source-arrow-color': C.alert, color: C.alert } },
];

/** The link graph: identifiers, sources, addresses by category and counterparties; click a node for details. */
export function GraphView({ results, onOpenAddress }: { results: RunResults; onOpenAddress: (key: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const container = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [opts, setOpts] = useState({ showExcluded: true, showCounterparties: true, showSources: true });
  const [selected, setSelected] = useState<NodeDataDefinition | null>(null);

  const graph = useMemo(() => buildGraph(results, opts, { others: (count) => t('graph.others', { count }), pln: (v) => formatPln(v, lang) }), [results, opts, lang]);

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

  return (
    <div className="flex flex-col gap-3.5">
      <p className="m-0 max-w-[80ch] text-[14px] leading-relaxed">{t('graph.lead')}</p>
      <div className="flex flex-wrap items-center gap-x-6">
        {(['showExcluded', 'showCounterparties', 'showSources'] as const).map((k) => (
          <CheckField key={k} id={`g-${k}`} checked={opts[k]} onChange={(v) => setOpts((o) => ({ ...o, [k]: v }))}>
            {t(`graph.${k}`)}
          </CheckField>
        ))}
        <BevelButton onClick={() => cyRef.current?.fit(undefined, 30)}>{t('graph.fit')}</BevelButton>
      </div>

      <div className="flex flex-wrap items-start gap-[22px]">
        <SunkenPanel className="min-w-0 flex-[999_1_560px] overflow-hidden">
          {graph.nodes.length === 0 ? (
            <p className="m-0 p-10 text-center text-[14px] text-sub">{t('graph.empty')}</p>
          ) : (
            <div ref={container} className="h-[640px] w-full bg-paper" role="img" aria-label={t('graph.title')} data-testid="graph-canvas" />
          )}
        </SunkenPanel>

        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-[22px]">
          <GroupBox id="g-details" title={t('graph.details')}>
            {selected ? <NodeDetails node={selected} results={results} onOpenAddress={onOpenAddress} /> : <p className="m-0 text-[14px] text-sub">{t('graph.selectHint')}</p>}
          </GroupBox>
          <Legend />
        </div>
      </div>
    </div>
  );
}

function Legend() {
  const { t } = useTranslation();
  const sw = 'inline-block';
  const items: [string, React.ReactNode][] = [
    ['identifier', <span key="a" className={`${sw} h-3.5 w-6 bg-navy`} />],
    ['identity', <span key="a" className={`${sw} h-3.5 w-6 border-2 border-navy bg-face`} />],
    ['source', <span key="a" className={`${sw} h-3.5 w-6 border border-shadow bg-paper`} />],
    ['address', <span key="a" className={`${sw} size-4 rounded-full border-[3px] border-navy bg-paper`} />],
    ['counterparty', <span key="a" className={`${sw} size-4 border-2 border-alert bg-paper`} />],
    ['linked', <span key="a" className={`${sw} h-0 w-6 border-t-[3px] border-navy`} />],
    ['mentioned', <span key="a" className={`${sw} h-0 w-6 border-t border-rule`} />],
    ['transfer', <span key="a" className={`${sw} h-0 w-6 border-t-2 border-shadow`} />],
    ['excluded', <span key="a" className={`${sw} h-0 w-6 border-t-2 border-dashed border-alert`} />],
  ];
  return (
    <GroupBox id="g-legend" title={t('graph.legend')}>
      <ul className="m-0 flex list-none flex-col gap-1.5 p-0 text-[12px]">
        {items.map(([k, swatch]) => (
          <li key={k} className="flex items-center gap-2">
            <span className="flex w-7 justify-center">{swatch}</span>
            {t(`graph.legendItems.${k}`)}
          </li>
        ))}
      </ul>
    </GroupBox>
  );
}

function NodeDetails({ node, results, onOpenAddress }: { node: NodeDataDefinition; results: RunResults; onOpenAddress: (key: string) => void }) {
  const { t } = useTranslation();
  const d = node as GraphNode['data'];
  const evidence = new Map<string, EvidenceDto>(results.evidence.map((e) => [e.id, e]));
  let body: React.ReactNode = null;

  if (d.kind === 'identifier') {
    const link = results.links.find((l) => l.identifier.id === d.ref);
    body = link && <p className="m-0 text-[14px]">{t(`identifierTypes.${link.identifier.type}`)}: <b>{link.identifier.value}</b></p>;
  } else if (d.kind === 'source') {
    const ev = evidence.get(d.ref);
    body = ev && <EvidenceItem evidence={ev} />;
  } else if (d.kind === 'identity') {
    const id = results.run.summaryJson?.identities.find((i) => i.key === d.ref);
    body = id && (
      <div className="flex flex-col gap-1 text-[14px]">
        <p className="m-0 font-semibold">{id.handle ?? id.name} <span className="font-normal text-sub">({id.platform})</span></p>
        <p className="m-0 text-sub">{t(`identities.relation.${id.relation}`)}</p>
        {id.score && <p className="m-0">{t('graph.bestScore')}: <b>{id.score.score}</b> — {t(`bandNames.${id.score.band as Band}`)}</p>}
      </div>
    );
  } else if (d.kind === 'address' || d.kind === 'counterparty') {
    const [chain, ...rest] = d.ref.split(':');
    const address = rest.join(':');
    body = (
      <div className="flex flex-col gap-2 text-[14px]">
        <p className="m-0 font-semibold [overflow-wrap:anywhere]">{address}</p>
        <p className="m-0 text-sub">{t(`chains.${chain}`, { defaultValue: chain })}</p>
        {d.category && <p className="m-0"><CategoryTag category={String(d.category)} /></p>}
        {d.score !== undefined && d.band && <p className="m-0">{t('graph.bestScore')}: <b>{d.score}</b> — {t(`bandNames.${d.band}`)}</p>}
        {d.excluded && <p className="m-0 text-alert">{t('graph.excludedNote')}</p>}
        <div>
          <BevelButton compact onClick={() => onOpenAddress(d.ref)}>{t('graph.openAddress')}</BevelButton>
        </div>
      </div>
    );
  } else {
    body = <p className="m-0 text-[14px]">{d.label}</p>;
  }
  return (
    <div className="flex flex-col gap-2">
      <p className="m-0 text-[12px] text-sub">{t(`graph.kind.${d.kind}`)}</p>
      {body}
    </div>
  );
}
