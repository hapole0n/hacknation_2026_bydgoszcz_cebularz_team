import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCase, useRun } from '@/api/client';
import type { AddressDto, Band, ChainDto, EvidenceDto, Identity, LinkDto, RunResults } from '@/api/types';
import { AddressCard } from '@/components/AddressCard';
import { Drawer } from '@/components/Drawer';
import { EvidenceItem } from '@/components/EvidenceItem';
import { GraphView } from '@/components/GraphView';
import { BandChip, CategoryBadge, EmptyState, ErrorNote, LoadState, Panel, Particulars } from '@/components/primitives';
import { DecisionForm, LinkHeading, ScoreLedger } from '@/components/ScoreLedger';
import { Button } from '@/components/ui/button';
import { AiSuggestions } from '@/components/AiSuggestions';
import { RunChanges } from '@/components/RunChanges';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BAND_ORDER, BAND_STYLE } from '@/lib/bands';
import { addressKey, formatDateTime, formatPln, loc, shortAddress, shortHash } from '@/lib/format';
import { noteText } from '@/lib/notes';
import { cn } from '@/lib/utils';
import { Link } from '@/router';

const keyOf = (chain: string, address: string) => `${chain}:${addressKey(address)}`;

export function RunPage({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const run = useRun(id);
  const kase = useCase(run.data?.run.caseId);
  const [tab, setTab] = useState<string | null>(null);
  const [selectedLink, setSelectedLink] = useState<string | null>(null);
  const [drawer, setDrawer] = useState<string | null>(null);

  const data = run.data;
  const view = useMemo(() => (data ? derive(data) : null), [data]);
  if (!data || !view) return <LoadState isPending={run.isPending} error={run.error} onRetry={() => run.refetch()} />;

  const { run: head } = data;
  const summary = head.summaryJson;
  const hasIdentities = (summary?.identities.length ?? 0) > 0;
  const activeTab = tab ?? (data.links.length === 0 && hasIdentities ? 'identities' : 'links');
  const selected = view.scored.find((l) => l.id === selectedLink) ?? view.scored[0];
  const openAddress = (key: string) => setDrawer(key);
  const drawerInfo = drawer ? view.addressInfo(drawer) : null;

  const notes: string[] = [
    ...(summary?.connectorErrors.map((e) => t('run.connectorError', { connector: e.connector, message: (e.round > 1 ? `${t('run.round', { round: e.round })}: ` : '') + noteText(t, e.note) })) ?? []),
    ...(summary?.connectorNotes?.map((n) => t('run.connectorNote', { connector: n.connector, message: noteText(t, n.note) })) ?? []),
    ...(summary?.chainNotes.map((n) => t('run.chainNote', { address: shortAddress(n.address), note: n.notes.map((x) => noteText(t, x)).join(' ') })) ?? []),
    ...(summary?.chainWarnings.flatMap((w) => w.warnings.map((x) => t('run.chainWarning', { address: shortAddress(w.address), warning: noteText(t, x) }))) ?? []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <Link to={`/cases/${head.caseId}`} className="text-sm text-steel underline underline-offset-2">{t('run.backToCase')}</Link>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-serif text-3xl font-semibold">{kase.data?.title ?? '…'}</h1>
          <Button asChild><Link to={`/runs/${id}/report`}>{t('report.open')}</Link></Button>
        </div>
      </div>

      {head.status === 'FAILED' && <ErrorNote title={t('run.failed')} message={summary?.error ? noteText(t, summary.error) : ''} />}

      <Panel className="grid gap-6 p-5 lg:grid-cols-[1fr_1fr]">
        <Particulars
          items={[
            { label: t('run.analysisOf'), value: formatDateTime(head.startedAt, lang) },
            { label: t('run.rulesVersion'), value: head.rulesVersion },
            { label: t('run.sources'), value: head.paramsJson.connectors.map((c) => t(`form.connectorNames.${c}`, { defaultValue: c })).join(', ') },
            { label: t('run.chainMode'), value: t(`run.chainModes.${head.paramsJson.chain}`) },
          ]}
        />
        <div>
          <p className="text-sm text-muted-foreground">
            {data.links.length} {t('run.stats.links')}, {view.rejectedAddresses.length} {t('run.stats.excluded')}, {data.evidence.length} {t('run.stats.evidence')}, {data.chain.length} {t('run.stats.snapshots')}
          </p>
          <BandDistribution counts={view.counts} total={data.links.length} />
        </div>
      </Panel>

      <RunChanges runId={head.id} />

      {notes.length > 0 && (
        <Panel className="border-l-4 border-l-band-medium p-4">
          <h2 className="text-sm font-semibold">{t('run.notes')}</h2>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-muted-foreground">
            {notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </Panel>
      )}

      <SubjectsPanel run={head} chainOf={(s) => view.addressInfo(keyOf(s.chain, s.address)).chain} onOpenAddress={openAddress} />

      <Tabs value={activeTab} onValueChange={setTab}>
        <TabsList className="h-auto flex-wrap justify-start">
          {hasIdentities && <TabsTrigger value="identities">{t('run.tabs.identities')} ({summary!.identities.length})</TabsTrigger>}
          <TabsTrigger value="links">{t('run.tabs.links')} ({view.scored.length})</TabsTrigger>
          <TabsTrigger value="rejected">{t('run.tabs.rejected')} ({view.rejectedAddresses.length})</TabsTrigger>
          <TabsTrigger value="graph">{t('run.tabs.graph')}</TabsTrigger>
          <TabsTrigger value="evidence">{t('run.tabs.evidence')} ({data.evidence.length})</TabsTrigger>
        </TabsList>

        {hasIdentities && (
          <TabsContent value="identities" className="mt-4">
            <IdentitiesTab data={data} identities={summary!.identities} evidence={view.evidence} onOpenAddress={openAddress} />
          </TabsContent>
        )}

        <TabsContent value="links" className="mt-4">
          {view.scored.length === 0 ? (
            <EmptyState title={t('links.empty')}>{t('links.emptyHint')}</EmptyState>
          ) : (
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]">
              <LinksTable links={view.scored} selectedId={selected?.id} onSelect={setSelectedLink} />
              {selected && (
                <Panel className="space-y-5 p-5 xl:sticky xl:top-4 xl:max-h-[calc(100vh-2rem)] xl:overflow-y-auto">
                  <ScoreLedger
                    entries={selected.breakdownJson}
                    total={selected.score}
                    band={selected.band}
                    rulesVersion={head.rulesVersion}
                    evidence={view.evidence}
                    hints={selected.hintsJson}
                    heading={<LinkHeading link={selected} />}
                  />
                  <Button variant="outline" size="sm" onClick={() => openAddress(keyOf(selected.address.chain, selected.address.address))}>{t('score.tabs.address')}</Button>
                  <DecisionForm key={selected.id} link={selected} runId={head.id} />
                </Panel>
              )}
            </div>
          )}
        </TabsContent>

        <TabsContent value="rejected" className="mt-4">
          <RejectedTab groups={view.rejectedAddresses} evidence={view.evidence} onOpenAddress={openAddress} />
        </TabsContent>

        <TabsContent value="graph" className="mt-4">
          <GraphView results={data} onOpenAddress={openAddress} />
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          <EvidenceTab evidence={data.evidence} />
        </TabsContent>
      </Tabs>

      <Drawer open={!!drawerInfo} onClose={() => setDrawer(null)} label={t('address.title')}>
        {drawerInfo && <AddressCard address={drawerInfo.address} links={drawerInfo.links} traces={drawerInfo.traces} evidence={view.evidence} chain={drawerInfo.chain} run={head} />}
      </Drawer>
    </div>
  );
}

/** Everything the tabs share, computed once per run. */
function derive(data: RunResults) {
  const evidence = new Map<string, EvidenceDto>(data.evidence.map((e) => [e.id, e]));
  const scored = data.links.filter((l) => !l.excludedReason);
  const excluded = data.links.filter((l) => l.excludedReason);

  const counts = Object.fromEntries(BAND_ORDER.map((b) => [b, 0])) as Record<Band, number>;
  for (const l of data.links) counts[l.excludedReason ? 'EXCLUDED' : l.band]++;

  const groups = new Map<string, { address: AddressDto; links: LinkDto[] }>();
  for (const l of excluded) {
    const k = keyOf(l.address.chain, l.address.address);
    const g = groups.get(k) ?? { address: l.address, links: [] };
    g.links.push(l);
    groups.set(k, g);
  }

  const addressInfo = (key: string) => {
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
    const traces = data.traces.filter((tr) => keyOf(tr.chain, tr.address) === k);
    return { address: dto, links, traces, chain: snapshot };
  };

  return { evidence, scored, counts, rejectedAddresses: [...groups.values()], addressInfo };
}

/** The verdict on each address the analyst typed in — shown even when no source mentions it (then there are no links to show). */
function SubjectsPanel({ run, chainOf, onOpenAddress }: { run: RunResults['run']; chainOf: (s: AddressDto) => ChainDto | undefined; onOpenAddress: (key: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const subjects = run.summaryJson?.subjects ?? [];
  if (subjects.length === 0) return null;
  // Money that could not be valued is never shown as 0,00 zł.
  const money = (pln: number, unvalued: number) => (unvalued === 0 ? formatPln(pln, lang) : pln === 0 ? t('address.noValuation') : `${formatPln(pln, lang)} — ${t('address.partialValuation')}`);
  return (
    <Panel className="overflow-x-auto p-5">
      <h2 className="text-base font-semibold">{t('run.subjects.title')}</h2>
      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="px-3 py-2 font-medium">{t('rejected.columns.address')}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t('address.network')}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t('rejected.columns.category')}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t('run.subjects.exclusion')}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t('run.subjects.labelSource')}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t('address.kpi.tx')}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t('address.kpi.inPln')}</th>
            <th scope="col" className="px-3 py-2 font-medium">{t('address.kpi.outPln')}</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => {
            const chain = chainOf(s);
            const label = s.labels[0];
            const notes = run.summaryJson?.chainNotes.filter((n) => n.address.toLowerCase() === s.address.toLowerCase()).flatMap((n) => n.notes) ?? [];
            return (
              <tr key={keyOf(s.chain, s.address)} className="border-b align-top last:border-b-0">
                <td className="px-3 py-2.5">
                  <button type="button" className="break-all text-left font-medium text-steel underline underline-offset-2" onClick={() => onOpenAddress(keyOf(s.chain, s.address))}>{shortAddress(s.address, 10, 6)}</button>
                </td>
                <td className="px-3 py-2.5">{s.chain}</td>
                <td className="px-3 py-2.5">
                  <CategoryBadge category={s.category} />
                  {s.isContract && s.category !== 'CONTRACT' && <p className="mt-1 text-xs text-muted-foreground">{t('run.subjects.contract')}</p>}
                </td>
                <td className="max-w-xs px-3 py-2.5">
                  {s.exclusions.length === 0 ? t('run.subjects.notExcluded') : s.exclusions.map((e) => <p key={e.ruleId}><span className="font-medium">{t('run.subjects.excluded')}:</span> {loc(e, lang)} <span className="text-xs text-muted-foreground">({e.ruleId})</span></p>)}
                </td>
                <td className="px-3 py-2.5">
                  {!label ? '—' : (
                    <>
                      {label.name}{label.source === 'heuristic' && <span className="text-muted-foreground"> ({t('address.labelHeuristic')})</span>}
                      {label.sourceUrl && <a href={label.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-xs text-steel underline underline-offset-2">{t('rejected.labelSource')}</a>}
                    </>
                  )}
                </td>
                {chain ? (
                  <>
                    <td className="px-3 py-2.5 tabular-nums">{chain.indicators.txCount}</td>
                    <td className="px-3 py-2.5 tabular-nums">{money(chain.indicators.totals.inPln, chain.indicators.totals.unvalued)}</td>
                    <td className="px-3 py-2.5 tabular-nums">{money(chain.indicators.totals.outPln, chain.indicators.totals.unvalued)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="px-3 py-2.5 text-muted-foreground">
                    {notes.length > 0 ? notes.map((n, i) => <p key={i}>{t('run.subjects.noData')}: {noteText(t, n)}</p>) : <p>{label ? t('run.subjects.skipped') : t('run.subjects.noData')}</p>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function BandDistribution({ counts, total }: { counts: Record<Band, number>; total: number }) {
  const { t } = useTranslation();
  if (total === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1 text-xs text-muted-foreground">{t('run.distribution')}</p>
      <div className="flex h-3 overflow-hidden rounded-sm border" role="img" aria-label={BAND_ORDER.map((b) => `${t(`bands.${b}`)}: ${counts[b]}`).join(', ')}>
        {BAND_ORDER.filter((b) => counts[b] > 0).map((b) => (
          <div key={b} className={cn(BAND_STYLE[b].bar, b === 'EXCLUDED' && 'opacity-60')} style={{ width: `${(counts[b] / total) * 100}%` }} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {BAND_ORDER.filter((b) => counts[b] > 0).map((b) => (
          <li key={b} className="flex items-center gap-1.5">
            <span className={cn('inline-block h-2.5 w-2.5 rounded-sm', BAND_STYLE[b].bar)} />
            <span className="font-medium tabular-nums">{counts[b]}</span> {t(`bands.${b}`)} <span className="text-muted-foreground">({t(`bandHints.${b}`)})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function sourceTypeOf(l: LinkDto) {
  return l.breakdownJson.find((e) => e.kind === 'base')?.ruleId.replace(/^BASE_/, '');
}

function LinksTable({ links, selectedId, onSelect }: { links: LinkDto[]; selectedId?: string; onSelect: (id: string) => void }) {
  const { t } = useTranslation();
  return (
    <Panel className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('run.tabs.links')}</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="px-3 py-2.5 font-medium">{t('links.columns.address')}</th>
            <th scope="col" className="px-3 py-2.5 font-medium">{t('links.columns.network')}</th>
            <th scope="col" className="px-3 py-2.5 font-medium">{t('links.columns.identifier')}</th>
            <th scope="col" className="px-3 py-2.5 font-medium">{t('links.columns.score')}</th>
            <th scope="col" className="px-3 py-2.5 font-medium">{t('links.columns.source')}</th>
            <th scope="col" className="px-3 py-2.5 font-medium">{t('links.columns.decision')}</th>
          </tr>
        </thead>
        <tbody>
          {links.map((l) => {
            const source = sourceTypeOf(l);
            const active = l.id === selectedId;
            return (
              <tr key={l.id} onClick={() => onSelect(l.id)} className={cn('cursor-pointer border-b align-top last:border-b-0 hover:bg-muted/50', active && 'bg-accent')}>
                <td className="px-3 py-2.5">
                  <button type="button" className="text-left font-medium text-steel underline underline-offset-2" aria-pressed={active} aria-label={t('links.select', { address: shortAddress(l.address.address) })} onClick={() => onSelect(l.id)}>
                    {shortAddress(l.address.address)}
                  </button>
                  <span className="mt-1 block"><CategoryBadge category={l.address.category} /></span>
                </td>
                <td className="px-3 py-2.5">{l.address.chain}</td>
                <td className="px-3 py-2.5">
                  <span className="block">{l.identifier.value}</span>
                  <span className="block text-xs text-muted-foreground">{t(`identifierTypes.${l.identifier.type}`)}</span>
                </td>
                <td className="px-3 py-2.5">
                  <BandChip band={l.band} score={l.score} />
                  <div className="mt-1.5 h-1 w-28 overflow-hidden rounded-sm bg-muted" aria-hidden="true">
                    <div className={cn('h-full', BAND_STYLE[l.band].bar)} style={{ width: `${l.score}%` }} />
                  </div>
                </td>
                <td className="px-3 py-2.5">{source ? t(`sourceTypes.${source}`, { defaultValue: source }) : '—'}</td>
                <td className="px-3 py-2.5">{l.analystDecision ? t(`decision.state.${l.analystDecision}`) : <span className="text-muted-foreground">{t('decision.state.none')}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Panel>
  );
}

function RejectedTab({ groups, evidence, onOpenAddress }: { groups: { address: AddressDto; links: LinkDto[] }[]; evidence: Map<string, EvidenceDto>; onOpenAddress: (key: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t('rejected.title')}</h2>
        <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{t('rejected.lead')}</p>
      </div>
      {groups.length === 0 ? (
        <EmptyState title={t('rejected.empty')} />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">{t('rejected.columns.address')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('rejected.columns.category')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('rejected.columns.reason')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('rejected.columns.mentionedWith')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('rejected.columns.evidence')}</th>
              </tr>
            </thead>
            <tbody>
              {groups.map(({ address, links }) => {
                const reason = links[0]!.breakdownJson.find((e) => e.kind === 'exclusion');
                const ids = [...new Set(links.flatMap((l) => l.breakdownJson.flatMap((e) => e.evidenceIds)))];
                const label = address.labels[0];
                return (
                  <tr key={address.address} className="border-b align-top last:border-b-0">
                    <td className="px-4 py-3">
                      <p className="font-medium">{shortAddress(address.address, 10, 6)}</p>
                      <p className="text-xs text-muted-foreground">{address.chain}</p>
                      <Button variant="link" size="sm" className="h-auto px-0" onClick={() => onOpenAddress(keyOf(address.chain, address.address))}>{t('score.tabs.address')}</Button>
                    </td>
                    <td className="px-4 py-3">
                      <CategoryBadge category={address.category} />
                      {label?.name && <p className="mt-1">{label.name}</p>}
                      {label?.sourceUrl && (
                        <a href={label.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 block text-xs text-steel underline underline-offset-2">{t('rejected.labelSource')}</a>
                      )}
                    </td>
                    <td className="max-w-xs px-4 py-3">
                      <p>{reason ? loc({ pl: reason.reasonPl, en: reason.reasonEn }, lang) : '—'}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{reason?.ruleId}; {t('rejected.recorded').toLowerCase()}</p>
                    </td>
                    <td className="px-4 py-3">
                      {[...new Set(links.map((l) => `${t(`identifierTypes.${l.identifier.type}`)}: ${l.identifier.value}`))].map((x) => <p key={x}>{x}</p>)}
                    </td>
                    <td className="px-4 py-3">
                      <details>
                        <summary className="cursor-pointer text-steel underline underline-offset-2">{t('score.evidenceCount', { count: ids.length })}</summary>
                        <ul className="mt-2 space-y-3">
                          {ids.map((id) => {
                            const ev = evidence.get(id);
                            return ev && <li key={id}><EvidenceItem evidence={ev} /></li>;
                          })}
                        </ul>
                      </details>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

function EvidenceTab({ evidence }: { evidence: EvidenceDto[] }) {
  const { t, i18n } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t('evidence.title')}</h2>
        <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{t('evidence.lead')}</p>
      </div>
      {evidence.length === 0 ? (
        <EmptyState title={t('evidence.empty')} />
      ) : (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">{t('evidence.columns.platform')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('evidence.columns.type')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('evidence.columns.url')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('evidence.columns.fetched')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('evidence.columns.sha')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('evidence.columns.round')}</th>
              </tr>
            </thead>
            <tbody>
              {evidence.map((e) => (
                <EvidenceRow key={e.id} e={e} lang={i18n.language} />
              ))}
            </tbody>
          </table>
        </Panel>
      )}
    </div>
  );
}

function EvidenceRow({ e, lang }: { e: EvidenceDto; lang: string }) {
  const { t } = useTranslation();
  return (
    <>
      <tr className="border-t align-top">
        <td className="px-4 pt-3 font-medium">{e.metaJson.platform}</td>
        <td className="px-4 pt-3">{t(`sourceTypes.${e.sourceType}`, { defaultValue: e.sourceType })}</td>
        <td className="max-w-xs break-all px-4 pt-3">{e.url && <a href={e.url} target="_blank" rel="noopener noreferrer" className="text-steel underline underline-offset-2">{e.url}</a>}</td>
        <td className="whitespace-nowrap px-4 pt-3 tabular-nums">{formatDateTime(e.fetchedAt, lang)}</td>
        <td className="px-4 pt-3" title={e.sha256}>{shortHash(e.sha256)}</td>
        <td className="px-4 pt-3">{t(`evidence.rounds.${e.metaJson.round}`)}</td>
      </tr>
      <tr>
        <td colSpan={6} className="px-4 pb-3">
          <details>
            <summary className="cursor-pointer text-xs text-steel underline underline-offset-2">{t('evidence.snippet')}</summary>
            <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-2 pl-3 text-sm">{e.snippet}</blockquote>
            <AiSuggestions evidence={e} />
            {e.metaJson.snapshotOf && <p className="mt-1 text-xs text-muted-foreground">{t('evidence.snapshotOf')}: {e.metaJson.snapshotOf}</p>}
          </details>
        </td>
      </tr>
    </>
  );
}

function IdentitiesTab({ data, identities, evidence, onOpenAddress }: { data: RunResults; identities: Identity[]; evidence: Map<string, EvidenceDto>; onOpenAddress: (key: string) => void }) {
  const { t } = useTranslation();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-base font-semibold">{t('identities.title')}</h2>
        <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{t('identities.lead')}</p>
      </div>
      {identities.length === 0 && <EmptyState title={t('identities.empty')} />}
      <ul className="space-y-4">
        {identities.map((id) => (
          <li key={id.key}>
            <Panel className="space-y-3 p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-base font-semibold">{id.handle ?? id.name}</p>
                  <p className="text-sm text-muted-foreground">{id.platform}{id.handle && id.name ? `; ${id.name}` : ''}</p>
                  <p className="mt-1 text-sm">{t(`identities.relation.${id.relation}`)}</p>
                </div>
                {id.score && <BandChip band={id.score.band as Band} score={id.score.score} className="text-sm" />}
              </div>

              <div>
                <h3 className="mb-1 text-sm font-semibold">{t('identities.columns.other')}</h3>
                {id.otherAddresses.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{t('identities.noOther')}</p>
                ) : (
                  <ul className="space-y-1 text-sm">
                    {id.otherAddresses.map((o) => (
                      <li key={o.address} className="flex flex-wrap items-center gap-2">
                        <span className="font-medium">{shortAddress(o.address, 10, 6)}</span> {o.chain} <CategoryBadge category={o.category} />
                        {o.excluded && <span className="text-xs text-muted-foreground">{t('graph.excludedNote')}</span>}
                        <Button variant="link" size="sm" className="h-auto px-0" onClick={() => onOpenAddress(keyOf(o.chain, o.address))}>{t('score.tabs.address')}</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {id.score && (
                <details>
                  <summary className="cursor-pointer text-sm text-steel underline underline-offset-2">{t('score.title')}</summary>
                  <div className="mt-4">
                    <ScoreLedger entries={id.score.breakdown} total={id.score.score} band={id.score.band as Band} rulesVersion={data.run.rulesVersion} evidence={evidence} hints={id.score.hints} />
                  </div>
                </details>
              )}
              {id.urls.length > 0 && <p className="break-all text-xs text-muted-foreground">{id.urls.join(', ')}</p>}
            </Panel>
          </li>
        ))}
      </ul>
    </div>
  );
}
