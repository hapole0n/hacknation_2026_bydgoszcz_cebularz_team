import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCase, useRun, useSetSchedule, useStartRun } from '@/api/client';
import type { AddressDto, Band, ChainDto, Identity, RunResults, SearchLogEntry } from '@/api/types';
import { AiSuggestions } from '@/components/AiSuggestions';
import { DecisionBox, EvidenceItem, Ledger } from '@/components/Ledger';
import { RunChanges } from '@/components/RunChanges';
import { BandName, CategoryTag } from '@/components/shared';
import { Screen, type ShortcutItem } from '@/components/win/chrome';
import { BevelButton, BevelLink, CheckField, ChildWindow, DataTable, EmptyState, ErrorNote, GroupBox, LoadState, MeterBlocks, ScoreBlocks, VtHeading, leader } from '@/components/win/controls';
import { BAND_ORDER, BAND_RANGE } from '@/lib/bands';
import { formatDate, formatDateTime, formatEur, formatEurInt, formatPln, loc, shortAddress, shortHash } from '@/lib/format';
import { useShortcuts } from '@/lib/keys';
import { noteText } from '@/lib/notes';
import { deriveRun, downloadPdf, formatTime, keyOf, verdictOf, type AddressRow, type RunView } from '@/lib/run';
import { openDialog } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { addressPath, navigate } from '@/router';

/** "Wynik analizy": the verdict, the addresses assigned to the person with the reasoning for each, cash-out signals, exclusions and the sources searched. */
export function RunPage({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const run = useRun(id);
  const kase = useCase(run.data?.run.caseId);
  const startRun = useStartRun();
  const setSchedule = useSetSchedule(run.data?.run.caseId ?? '');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [linkId, setLinkId] = useState<string | null>(null);

  const data = run.data;
  const view = useMemo(() => (data ? deriveRun(data) : null), [data]);

  const rerun = () => {
    if (!data) return;
    const { connectors, chain } = data.run.paramsJson;
    startRun.mutate({ caseId: data.run.caseId, options: { connectors, chain } }, { onSuccess: (r) => navigate(`/runs/${r.run.id}`) });
  };
  useShortcuts({
    F5: data ? rerun : undefined,
    F6: data ? () => navigate(`/runs/${id}/graph`) : undefined,
    F7: data ? () => downloadPdf(id) : undefined,
    Esc: () => navigate('/cases'),
  });

  const shortcuts: ShortcutItem[] = [
    { id: 'F1', label: t('keys.short.F1'), onClick: () => openDialog('help') },
    { id: 'F5', label: t('keys.short.F5'), onClick: rerun },
    { id: 'F6', label: t('keys.short.F6'), to: `/runs/${id}/graph` },
    { id: 'F7', label: t('keys.short.F7'), onClick: () => downloadPdf(id) },
    { id: 'Esc', label: t('keys.short.Esc'), to: '/cases' },
  ];

  const c = kase.data;
  const ordinal = c && data ? c.runs.length - c.runs.findIndex((r) => r.id === id) : null;
  const signature = c?.signature ?? '…';

  const body =
    !data || !view ? (
      <LoadState pending={run.isPending} error={run.error} onRetry={() => void run.refetch()} retryLabel={t('common.retry')} loadingLabel={t('common.loading')} errorLabel={t('common.loadError')} />
    ) : (
      <RunBody data={data} view={view} id={id} lang={lang} signature={signature} caseTitle={c?.title} ordinal={ordinal} selectedKey={selectedKey} setSelectedKey={(k) => { setSelectedKey(k); setLinkId(null); }} linkId={linkId} setLinkId={setLinkId} />
    );

  const monitored = c?.scheduleEveryMin ?? null;
  return (
    <Screen
      title={t('result.windowTitle', { signature })}
      windowLabel={signature}
      runId={id}
      shortcuts={shortcuts}
      status={
        data
          ? t('result.status', { n: ordinal ?? '—', time: formatDateTime(data.run.finishedAt ?? data.run.startedAt, lang), rules: data.run.rulesVersion, sources: data.run.paramsJson.connectors.length, errors: data.run.summaryJson?.connectorErrors.length ?? 0 })
          : t('common.loading')
      }
      toolbar={
        <>
          <BevelButton onClick={() => navigate('/')}>F2 · {t('keys.short.F2')}</BevelButton>
          <BevelButton disabled={!data || startRun.isPending} onClick={rerun}>
            F5 · {t('result.rerun')}
          </BevelButton>
          <BevelButton onClick={() => navigate(`/runs/${id}/graph`)}>F6 · {t('keys.short.F6')}</BevelButton>
          <BevelButton primary onClick={() => downloadPdf(id)}>F7 · {t('keys.short.F7')}</BevelButton>
          <BevelButton onClick={() => navigate('/audit')}>F8 · {t('keys.short.F8')}</BevelButton>
          <CheckField id="monitor24" checked={monitored !== null} disabled={!c || setSchedule.isPending} onChange={(v) => setSchedule.mutate(v ? 1440 : null)}>
            {monitored && monitored !== 1440 ? t('result.monitorOther', { minutes: monitored }) : t('result.monitor24')}
          </CheckField>
        </>
      }
    >
      {startRun.isError && <ErrorNote title={t('form.errors.server')} message={startRun.error.message} />}
      {body}
    </Screen>
  );
}

function RunBody({ data, view, id, lang, signature, caseTitle, ordinal, selectedKey, setSelectedKey, linkId, setLinkId }: { data: RunResults; view: RunView; id: string; lang: string; signature: string; caseTitle?: string; ordinal: number | null; selectedKey: string | null; setSelectedKey: (k: string) => void; linkId: string | null; setLinkId: (id: string) => void }) {
  const { t } = useTranslation();
  const { run: head } = data;
  const summary = head.summaryJson;
  const identities = summary?.identities ?? [];
  const verdict = verdictOf(view, head, { identities: identities.length, subjects: summary?.subjects?.length ?? 0 });
  const bestBand = BAND_ORDER.find((b) => b !== 'EXCLUDED' && view.counts[b] > 0);
  const assignedCount = view.rows.length;

  const notes: string[] = [
    ...(summary?.connectorErrors.map((e) => t('run.connectorError', { connector: e.connector, message: (e.round > 1 ? `${t('run.round', { round: e.round })}: ` : '') + noteText(t, e.note) })) ?? []),
    ...(summary?.connectorNotes?.map((n) => t('run.connectorNote', { connector: n.connector, message: noteText(t, n.note) })) ?? []),
    ...(summary?.chainNotes.map((n) => t('run.chainNote', { address: shortAddress(n.address), note: n.notes.map((x) => noteText(t, x)).join(' ') })) ?? []),
    ...(summary?.chainWarnings.flatMap((w) => w.warnings.map((x) => t('run.chainWarning', { address: shortAddress(w.address), warning: noteText(t, x) }))) ?? []),
  ];

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 text-[14px]">
        <span className="font-semibold">
          {t('result.caseLine', { signature, title: caseTitle ?? '…', n: ordinal ?? '—', date: formatDateTime(head.startedAt, lang) })}
        </span>
        <span>[1] {t('result.steps.data')} ✓</span>
        <span>[2] {t('result.steps.search')} ✓</span>
        <span>[3] {t('result.steps.score')} ✓</span>
        <span aria-current="step" className="bg-navy px-2.5 py-[3px] text-white">[4] {t('result.steps.result')}</span>
        <Link5 id={id} label={t('result.steps.report')} />
        <span className="ml-auto inline-flex items-center gap-2">
          <MeterBlocks blocks={8} />
          <span>4/5</span>
        </span>
      </div>

      <section aria-labelledby="werdykt" className="flex flex-col gap-3">
        <VtHeading id="werdykt" size="m" className="leading-[1.05]">
          {head.status === 'FAILED' ? t(verdict.key) : t(verdict.key, { count: verdict.count })}
        </VtHeading>
        {head.status === 'FAILED' && summary?.error && <ErrorNote title={t('run.failed')} message={noteText(t, summary.error)} />}
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3.5">
          <pre className="sunken m-0 px-[18px] py-2.5 font-[inherit] text-[15px] leading-[1.6]">
            {leader(t('result.counters.found'), view.found)}
            {'\n'}
            {leader(t('result.counters.band', { range: bestBand ? BAND_RANGE[bestBand] : '80–100' }), bestBand ? view.counts[bestBand] : 0)}
            {'\n'}
            <span className={cn(view.cashOut.length > 0 && 'font-semibold text-alert')}>{leader(t('result.counters.cashOut'), view.cashOut.length)}</span>
            {'\n'}
            {leader(t('result.counters.excluded'), view.counts.EXCLUDED)}
          </pre>
          <p className="m-0 flex-[1_1_280px] pt-2 text-[14px] leading-relaxed">{t('result.disclaimer')}</p>
        </div>
      </section>

      {notes.length > 0 && (
        <GroupBox id="uwagi" title={t('run.notes')}>
          <ul className="sunken m-0 list-disc py-2.5 pl-8 pr-3.5 text-[14px] leading-relaxed">
            {notes.map((n) => <li key={n}>{n}</li>)}
          </ul>
        </GroupBox>
      )}

      <RunChanges runId={head.id} />

      <SubjectsSection run={head} chainOf={(s) => view.addressInfo(keyOf(s.chain, s.address)).chain} runId={id} />

      {identities.length > 0 && <IdentitiesSection identities={identities} view={view} runId={id} />}

      {(view.rows.length > 0 || identities.length === 0) && (
        <AssignedSection view={view} runId={id} selectedKey={selectedKey} setSelectedKey={setSelectedKey} linkId={linkId} setLinkId={setLinkId} assignedCount={assignedCount} />
      )}

      {view.cashOut.length > 0 && <CashOutSection snapshots={view.cashOut} runId={id} lang={lang} />}

      <RejectedSection view={view} runId={id} />
      <SearchedSection run={head} foundAddresses={data.traces.length > 0} />
      <EvidenceSection data={data} lang={lang} />
    </>
  );
}

/** Step [5] of the strip: the report is a separate screen. */
function Link5({ id, label }: { id: string; label: string }) {
  return (
    <BevelLink to={`/runs/${id}/report`} compact className="min-h-[28px] px-2 text-[13px]">
      [5] {label}
    </BevelLink>
  );
}

// ---- the addresses assigned to the person, with the reasoning ---------------------------------------------------------

function AssignedSection({ view, runId, selectedKey, setSelectedKey, linkId, setLinkId, assignedCount }: { view: RunView; runId: string; selectedKey: string | null; setSelectedKey: (k: string) => void; linkId: string | null; setLinkId: (id: string) => void; assignedCount: number }) {
  const { t } = useTranslation();
  const rows = view.rows;
  const selected = rows.find((r) => r.key === selectedKey) ?? rows[0];
  const link = selected ? (selected.links.find((l) => l.id === linkId) ?? selected.best) : undefined;

  return (
    <div className="flex flex-wrap items-start gap-[22px]">
      <GroupBox id="adresy" title={t('result.assigned', { count: assignedCount })} className="min-w-0 flex-[999_1_600px]">
        {rows.length === 0 ? (
          <EmptyState title={t('links.empty')}>{t('links.emptyHint')}</EmptyState>
        ) : (
          <div className="sunken overflow-x-auto">
            <div className="min-w-[720px]">
              <div className="grid grid-cols-[196px_138px_56px_minmax(0,1fr)_112px] gap-x-3 border-b-[3px] border-double border-ink px-3 py-[9px] text-[13px] font-semibold">
                <span>{t('result.cols.score')}</span>
                <span>{t('result.cols.address')}</span>
                <span>{t('result.cols.network')}</span>
                <span>{t('result.cols.basis')}</span>
                <span />
              </div>
              {rows.map((r) => (
                <AssignedRow key={r.key} row={r} selected={r.key === selected?.key} onPick={() => setSelectedKey(r.key)} />
              ))}
            </div>
          </div>
        )}
      </GroupBox>

      {selected && link && (
        <ChildWindow id="dlaczego" title={t('result.reasoning', { address: shortAddress(selected.address.address, 6, 4) })} className="min-w-0 flex-[1_1_380px]">
          <div className="flex flex-col gap-0.5">
            <span className="font-bold [overflow-wrap:anywhere]">
              {selected.address.address} · {selected.address.chain}
            </span>
            <span className="text-sub">
              {t('result.identifier')}: {t(`identifierTypes.${link.identifier.type}`)}, {link.identifier.value}
            </span>
          </div>
          {selected.links.length > 1 && (
            <div role="group" aria-label={t('result.pickIdentifier')} className="flex flex-wrap gap-1.5">
              {selected.links.map((l) => (
                <BevelButton key={l.id} compact pressed={l.id === link.id} className="px-2 text-[12px]" onClick={() => setLinkId(l.id)}>
                  {l.identifier.value} · {l.score}
                </BevelButton>
              ))}
            </div>
          )}
          <Ledger entries={link.breakdownJson} total={link.score} band={link.band} evidence={view.evidence} hints={link.hintsJson} />
          <p className="m-0 leading-normal">
            <b className="text-navy">[{t('statement.conclusion')}]</b> {t(`result.conclusion.${link.band}`)}
          </p>
          <DecisionBox key={link.id} link={link} runId={runId} />
          <a href={addressPath(runId, selected.address.chain, selected.address.address)} onClick={(e) => { e.preventDefault(); navigate(addressPath(runId, selected.address.chain, selected.address.address)); }} className="inline-flex min-h-[44px] items-center font-semibold">
            {t('result.addressCard')} →
          </a>
        </ChildWindow>
      )}
    </div>
  );
}

function AssignedRow({ row, selected, onPick }: { row: AddressRow; selected: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  const { best } = row;
  return (
    <div className={cn('grid grid-cols-[196px_138px_56px_minmax(0,1fr)_112px] items-center gap-x-3 border-b border-dashed border-rule px-3 py-[7px] text-[14px] last:border-b-0', selected && 'sel bg-navy text-white')}>
      <span className="flex flex-col gap-[3px]">
        <span className="flex items-center gap-2">
          <ScoreBlocks score={best.score} size="s" />
          <span className="font-bold">{best.score}</span>
        </span>
        <span className="text-[11px] tracking-[0.04em]">
          <BandName band={best.band} />
        </span>
      </span>
      <span className="font-semibold">{shortAddress(row.address.address, 6, 4)}</span>
      <span>{row.address.chain}</span>
      <span className="leading-snug">
        {row.sourceTypes.map((s) => t(`sourceTypes.${s}`, { defaultValue: s })).join(', ') || '—'}
        {row.platforms.length > 0 && <span className={cn('block text-[12px]', selected ? 'text-white' : 'text-sub')}>{row.platforms.join(', ')}</span>}
        {best.analystDecision && <span className="block text-[12px] font-semibold">{t(`decision.state.${best.analystDecision}`)}</span>}
      </span>
      <button
        type="button"
        onClick={onPick}
        aria-pressed={selected}
        aria-label={t('result.showReasoning', { address: shortAddress(row.address.address) })}
        className="bevel min-h-[40px] cursor-pointer px-2.5 font-[inherit] text-[13px] font-semibold text-ink"
      >
        {t('result.reasoningButton')}
      </button>
    </div>
  );
}

// ---- cash-out signals -----------------------------------------------------------------------------------------------------

function CashOutSection({ snapshots, runId, lang }: { snapshots: ChainDto[]; runId: string; lang: string }) {
  const { t } = useTranslation();
  return (
    <GroupBox id="sygnaly" title={t('result.cashOut', { count: snapshots.length })} tone="alert">
      <div className="flex flex-col gap-3">
        {snapshots.map((s) => {
          const co = s.indicators.cashOut;
          const crossed = s.indicators.thresholds.filter((th) => th.singleCrossedAt || th.cumulativeCrossedAt);
          const where = co.endpoints.map((e) => e.name ?? (e.kind === 'AD_ADDRESS' ? t('address.adAddress') : t(`categoryTags.${e.kind}`, { defaultValue: e.kind }))).join(', ');
          return (
            <div key={s.address.address} className="sunken flex flex-wrap items-start gap-x-[18px] gap-y-3 px-3.5 py-3 text-[14px] leading-[1.6]">
              <span aria-hidden="true" className="flex size-[34px] flex-none items-center justify-center bg-alert text-[18px] font-bold text-white">!</span>
              <div className="min-w-0 flex-[1_1_520px]">
                <div>
                  <b>{shortAddress(s.address.address, 6, 4)} → {where}</b>
                </div>
                <div>{t('result.cashOutText', { count: co.endpoints.reduce((n, e) => n + e.count, 0), pln: formatPln(co.totalPln, lang), eur: formatEur(co.totalEur, lang) })}</div>
                {crossed.map((th) => (
                  <div key={th.eur} className="font-semibold text-alert">
                    [ {t('result.thresholdCrossed', { eur: formatEurInt(th.eur, lang) })} ] {th.singleCrossedAt ? t('result.single', { date: formatDate(th.singleCrossedAt, lang), max: formatEur(th.maxSingleEur, lang) }) : t('result.cumulative', { date: formatDate(th.cumulativeCrossedAt, lang) })}
                  </div>
                ))}
                <a href={addressPath(runId, s.address.chain, s.address.address)} onClick={(e) => { e.preventDefault(); navigate(addressPath(runId, s.address.chain, s.address.address)); }} className="inline-flex min-h-[44px] items-center font-semibold">
                  {t('result.txCourse')} →
                </a>
              </div>
            </div>
          );
        })}
      </div>
    </GroupBox>
  );
}

// ---- exclusions ------------------------------------------------------------------------------------------------------------------

function RejectedSection({ view, runId }: { view: RunView; runId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <GroupBox id="odrzucone" title={t('result.excluded', { count: view.rejected.length })}>
      <p className="m-0 mb-2 max-w-[80ch] text-[13px] leading-relaxed">{t('rejected.lead')}</p>
      {view.rejected.length === 0 ? (
        <EmptyState title={t('rejected.empty')} />
      ) : (
        <DataTable minWidth={720} caption={t('rejected.title')}>
          <thead>
            <tr>
              <th scope="col">{t('rejected.columns.address')}</th>
              <th scope="col">{t('address.network')}</th>
              <th scope="col">{t('rejected.columns.reason')}</th>
              <th scope="col">{t('rejected.columns.labelSource')}</th>
            </tr>
          </thead>
          <tbody>
            {view.rejected.map(({ address, links }) => {
              const reason = links[0]!.breakdownJson.find((e) => e.kind === 'exclusion');
              const ids = [...new Set(links.flatMap((l) => l.breakdownJson.flatMap((e) => e.evidenceIds)))];
              const label = address.labels[0];
              return (
                <tr key={address.address}>
                  <td>
                    <a href={addressPath(runId, address.chain, address.address)} onClick={(e) => { e.preventDefault(); navigate(addressPath(runId, address.chain, address.address)); }} className="whitespace-nowrap line-through">
                      {shortAddress(address.address, 6, 4)}
                    </a>
                  </td>
                  <td>{address.chain}</td>
                  <td>
                    <CategoryTag category={address.category} />
                    <span className="block text-[13px] leading-snug">{reason ? loc({ pl: reason.reasonPl, en: reason.reasonEn }, lang) : '—'}</span>
                    <span className="block text-[12px] text-sub">{reason?.ruleId}; {t('rejected.recorded').toLowerCase()}</span>
                  </td>
                  <td>
                    {label?.name ?? '—'}
                    {label?.sourceUrl && (
                      <a href={label.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-[12px]">{t('rejected.labelSource')}</a>
                    )}
                    {ids.length > 0 && (
                      <details className="mt-1">
                        <summary className="cursor-pointer text-[12px] font-semibold text-navy underline">{t('rejected.mentions', { count: ids.length })}</summary>
                        <ul className="m-0 mt-2 flex list-none flex-col gap-3 p-0">
                          {ids.map((eid) => {
                            const ev = view.evidence.get(eid);
                            return ev && <li key={eid}><EvidenceItem evidence={ev} /></li>;
                          })}
                        </ul>
                      </details>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </DataTable>
      )}
    </GroupBox>
  );
}

// ---- the sources searched, with the time of each query --------------------------------------------------------------------

function SearchedSection({ run, foundAddresses }: { run: RunResults['run']; foundAddresses: boolean }) {
  const { t } = useTranslation();
  const log = run.summaryJson?.searches ?? [];
  if (log.length === 0) return null;
  const asked = new Set(log.filter((e) => e.outcome === 'FOUND' || e.outcome === 'NONE' || e.outcome === 'ERROR').map((e) => e.connector)).size;
  const PROFILE_LOOKUPS = ['NICK', 'SOCIAL_LOGIN', 'MESSENGER', 'EMAIL'];
  const query = (e: SearchLogEntry) =>
    e.round === 1 && e.identifier
      ? `${t(`identifierTypes.${e.identifier.type}`)}: ${e.identifier.value}`
      : t(`run.searched.round.${e.round}`, { queries: t('run.searched.queriesCount', { count: e.queries ?? 0 }), pages: t('run.searched.pagesCount', { count: e.queries ?? 0 }) });
  const result = (e: SearchLogEntry) =>
    e.outcome === 'FOUND'
      ? t('run.searched.outcome.FOUND', { resources: t('run.searched.resourcesCount', { count: e.resources }), addresses: t('run.searched.addressesCount', { count: e.addresses }) })
      : e.outcome === 'NONE'
        ? t(e.identifier && PROFILE_LOOKUPS.includes(e.identifier.type) ? 'run.searched.outcome.NONE_profile' : 'run.searched.outcome.NONE')
        : t(`run.searched.outcome.${e.outcome}`, { key: e.note?.params?.key, detail: e.note ? noteText(t, e.note) : '' });
  return (
    <GroupBox id="zrodla" title={t('result.searched', { count: log.length })}>
      <p className="m-0 mb-2 text-[14px]">{asked === 0 ? t('run.searched.summaryNothing') : t(foundAddresses ? 'run.searched.summaryFound' : 'run.searched.summaryEmpty', { count: asked })}</p>
      <DataTable minWidth={640} className="compact" caption={t('run.searched.title')}>
        <thead>
          <tr>
            <th scope="col">{t('run.searched.columns.source')}</th>
            <th scope="col">{t('run.searched.columns.query')}</th>
            <th scope="col">{t('run.searched.columns.result')}</th>
            <th scope="col">{t('run.searched.columns.time')}</th>
          </tr>
        </thead>
        <tbody>
          {log.map((e, i) => (
            <tr key={i} className={cn(e.outcome === 'UNSUPPORTED' && 'text-sub')}>
              <td>{t(`form.connectorNames.${e.connector}`, { defaultValue: e.connector })}</td>
              <td className="[overflow-wrap:anywhere]">{query(e)}</td>
              <td className={cn(e.outcome === 'FOUND' && 'font-semibold text-navy', e.outcome === 'ERROR' && 'font-semibold text-alert')}>[ {result(e)} ]</td>
              <td className="whitespace-nowrap">{formatTime(e.at)}</td>
            </tr>
          ))}
        </tbody>
      </DataTable>
    </GroupBox>
  );
}

// ---- addresses typed in by the analyst --------------------------------------------------------------------------------

function SubjectsSection({ run, chainOf, runId }: { run: RunResults['run']; chainOf: (s: AddressDto) => ChainDto | undefined; runId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const subjects = run.summaryJson?.subjects ?? [];
  if (subjects.length === 0) return null;
  // Money that could not be valued is never shown as 0,00 zł.
  const money = (pln: number, unvalued: number) => (unvalued === 0 ? formatPln(pln, lang) : pln === 0 ? t('address.noValuation') : `${formatPln(pln, lang)} — ${t('address.partialValuation')}`);
  return (
    <GroupBox id="badane" title={t('run.subjects.title')}>
      <DataTable minWidth={900} caption={t('run.subjects.title')}>
        <thead>
          <tr>
            <th scope="col">{t('rejected.columns.address')}</th>
            <th scope="col">{t('address.network')}</th>
            <th scope="col">{t('rejected.columns.category')}</th>
            <th scope="col">{t('run.subjects.exclusion')}</th>
            <th scope="col">{t('run.subjects.labelSource')}</th>
            <th scope="col">{t('address.kpi.tx')}</th>
            <th scope="col">{t('address.kpi.inPln')}</th>
            <th scope="col">{t('address.kpi.outPln')}</th>
          </tr>
        </thead>
        <tbody>
          {subjects.map((s) => {
            const chain = chainOf(s);
            const label = s.labels[0];
            const notes = run.summaryJson?.chainNotes.filter((n) => n.address.toLowerCase() === s.address.toLowerCase()).flatMap((n) => n.notes) ?? [];
            return (
              <tr key={keyOf(s.chain, s.address)}>
                <td>
                  <a href={addressPath(runId, s.chain, s.address)} onClick={(e) => { e.preventDefault(); navigate(addressPath(runId, s.chain, s.address)); }} className="font-semibold [overflow-wrap:anywhere]">
                    {shortAddress(s.address, 10, 6)}
                  </a>
                </td>
                <td>{s.chain}</td>
                <td>
                  {s.known === false ? <span className="text-sub">{t('run.subjects.unknown')}</span> : <CategoryTag category={s.category} />}
                  {s.isContract && s.category !== 'CONTRACT' && <p className="m-0 mt-1 text-[12px] text-sub">{t('run.subjects.contract')}</p>}
                </td>
                <td className="max-w-xs">
                  {s.known === false ? '—' : s.exclusions.length === 0 ? t('run.subjects.notExcluded') : s.exclusions.map((e) => <p key={e.ruleId} className="m-0"><b>{t('run.subjects.excluded')}:</b> {loc(e, lang)} <span className="text-[12px] text-sub">({e.ruleId})</span></p>)}
                </td>
                <td>
                  {!label ? '—' : (
                    <>
                      {label.name}
                      {label.source === 'heuristic' && <span className="text-sub"> ({t('address.labelHeuristic')})</span>}
                      {label.sourceUrl && <a href={label.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-[12px]">{t('rejected.labelSource')}</a>}
                    </>
                  )}
                </td>
                {chain ? (
                  <>
                    <td>{chain.indicators.txCount}</td>
                    <td>{money(chain.indicators.totals.inPln, chain.indicators.totals.unvalued)}</td>
                    <td>{money(chain.indicators.totals.outPln, chain.indicators.totals.unvalued)}</td>
                  </>
                ) : (
                  <td colSpan={3} className="text-sub">
                    {notes.length > 0 ? notes.map((n, i) => <p key={i} className="m-0">{t('run.subjects.noData')}: {noteText(t, n)}</p>) : <p className="m-0">{label ? t('run.subjects.skipped') : t('run.subjects.noData')}</p>}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </DataTable>
    </GroupBox>
  );
}

// ---- address case: the accounts that published the address ------------------------------------------------------------

function IdentitiesSection({ identities, view, runId }: { identities: Identity[]; view: RunView; runId: string }) {
  const { t } = useTranslation();
  return (
    <GroupBox id="konta" title={t('identities.titleCount', { count: identities.length })}>
      <p className="m-0 mb-2.5 max-w-[80ch] text-[13px] leading-relaxed">{t('identities.lead')}</p>
      <ul className="m-0 flex list-none flex-col gap-3 p-0">
        {identities.map((id) => (
          <li key={id.key} className="sunken flex flex-col gap-2.5 px-3.5 py-3 text-[14px]">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="m-0 font-bold">{id.handle ?? id.name}</p>
                <p className="m-0 text-sub">{id.platform}{id.handle && id.name ? `; ${id.name}` : ''}</p>
                <p className="m-0 mt-1">{t(`identities.relation.${id.relation}`)}</p>
              </div>
              {id.score && (
                <span className="flex flex-col items-end gap-1">
                  <span className="flex items-center gap-2"><ScoreBlocks score={id.score.score} size="s" /><b>{id.score.score}</b></span>
                  <span className="text-[11px]"><BandName band={id.score.band as Band} /></span>
                </span>
              )}
            </div>
            <div>
              <h3 className="m-0 mb-1 text-[14px] font-semibold">{t('identities.columns.other')}</h3>
              {id.otherAddresses.length === 0 ? (
                <p className="m-0 text-sub">{t('identities.noOther')}</p>
              ) : (
                <ul className="m-0 flex list-none flex-col gap-1 p-0">
                  {id.otherAddresses.map((o) => (
                    <li key={o.address} className="flex flex-wrap items-center gap-2">
                      <b>{shortAddress(o.address, 10, 6)}</b> {o.chain} <CategoryTag category={o.category} />
                      {o.excluded && <span className="text-[12px] text-sub">{t('graph.excludedNote')}</span>}
                      <a href={addressPath(runId, o.chain, o.address)} onClick={(e) => { e.preventDefault(); navigate(addressPath(runId, o.chain, o.address)); }} className="font-semibold">{t('score.tabs.address')}</a>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {id.score && (
              <details>
                <summary className="cursor-pointer text-[13px] font-semibold text-navy underline">{t('score.title')}</summary>
                <div className="mt-3">
                  <Ledger entries={id.score.breakdown} total={id.score.score} band={id.score.band as Band} evidence={view.evidence} hints={id.score.hints} />
                </div>
              </details>
            )}
            {id.urls.length > 0 && <p className="m-0 text-[12px] text-sub [overflow-wrap:anywhere]">{id.urls.join(', ')}</p>}
          </li>
        ))}
      </ul>
    </GroupBox>
  );
}

// ---- the evidence ------------------------------------------------------------------------------------------------------------------

function EvidenceSection({ data, lang }: { data: RunResults; lang: string }) {
  const { t } = useTranslation();
  if (data.evidence.length === 0) return null;
  return (
    <GroupBox id="dowody" title={t('evidence.titleCount', { count: data.evidence.length })}>
      <details>
        <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-[14px] font-semibold text-navy underline">{t('evidence.show')}</summary>
        <p className="m-0 mb-2 max-w-[80ch] text-[13px] leading-relaxed">{t('evidence.lead')}</p>
        <DataTable minWidth={860} className="compact" caption={t('evidence.title')}>
          <thead>
            <tr>
              <th scope="col">{t('evidence.columns.platform')}</th>
              <th scope="col">{t('evidence.columns.type')}</th>
              <th scope="col">{t('evidence.columns.url')}</th>
              <th scope="col">{t('evidence.columns.fetched')}</th>
              <th scope="col">{t('evidence.columns.sha')}</th>
              <th scope="col">{t('evidence.columns.round')}</th>
            </tr>
          </thead>
          <tbody>
            {data.evidence.map((e) => (
              <tr key={e.id}>
                <td className="font-semibold">{e.metaJson.platform}</td>
                <td>{t(`sourceTypes.${e.sourceType}`, { defaultValue: e.sourceType })}</td>
                <td className="max-w-xs [overflow-wrap:anywhere]">{e.url && <a href={e.url} target="_blank" rel="noopener noreferrer">{e.url}</a>}</td>
                <td className="whitespace-nowrap">{formatDateTime(e.fetchedAt, lang)}</td>
                <td title={e.sha256}>{shortHash(e.sha256)}</td>
                <td>{t(`evidence.rounds.${e.metaJson.round}`)}</td>
              </tr>
            ))}
          </tbody>
        </DataTable>
        <div className="mt-2.5 flex flex-col gap-2">
          {data.evidence.map((e) => (
            <details key={e.id} className="text-[13px]">
              <summary className="cursor-pointer text-[12px] font-semibold text-navy underline">
                {t('evidence.snippet')}: {e.metaJson.platform}
              </summary>
              <blockquote className="m-0 mt-1 whitespace-pre-wrap border-l-2 border-shadow pl-3 [overflow-wrap:anywhere]">{e.snippet}</blockquote>
              <AiSuggestions evidence={e} />
              {e.metaJson.snapshotOf && <p className="m-0 mt-1 text-[12px] text-sub">{t('evidence.snapshotOf')}: {e.metaJson.snapshotOf}</p>}
            </details>
          ))}
        </div>
      </details>
    </GroupBox>
  );
}

