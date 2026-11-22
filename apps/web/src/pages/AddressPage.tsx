import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCase, useRun } from '@/api/client';
import type { ChainDto, FlowEntry, Indicators, RunResults } from '@/api/types';
import { EvidenceItem } from '@/components/Ledger';
import { BandRange, CategoryTag } from '@/components/shared';
import { Screen, type ShortcutItem } from '@/components/win/chrome';
import { BevelButton, BevelLink, DataTable, EmptyState, GroupBox, LoadState, MeterBlocks, StepList, SunkenPanel, VtHeading } from '@/components/win/controls';
import { recommendedActions } from '@/lib/actions';
import { daysInMonth, formatAmount, formatDate, formatDateTime, formatDay, formatEur, formatEurInt, formatPln, monthTitle, shortAddress, warsawDayOfMonth, warsawYearMonth } from '@/lib/format';
import { useShortcuts } from '@/lib/keys';
import { noteText } from '@/lib/notes';
import { deriveRun, downloadPdf, keyOf } from '@/lib/run';
import { openDialog, showNotice } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { navigate } from '@/router';

const CASH_TAGS = ['TO_KANTOR', 'TO_GATEWAY', 'TO_CARD', 'TO_AD_ADDRESS', 'TO_CEX', 'TO_CEX_DEPOSIT'];
const THRESHOLDS = [1000, 10000, 15000];

/** "Karta adresu": what the address is and why, what the sources say, and what the blockchain shows (volume, cash-out signals, thresholds, chronology). */
export function AddressPage({ runId, chain, address }: { runId: string; chain: string; address: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const run = useRun(runId);
  const kase = useCase(run.data?.run.caseId);
  const [copied, setCopied] = useState(false);
  const view = useMemo(() => (run.data ? deriveRun(run.data) : null), [run.data]);
  const info = view?.addressInfo(`${chain}:${address}`);
  const back = `/runs/${runId}`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(address);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = address;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    setCopied(true);
    showNotice(t('address.copiedNotice'));
    window.setTimeout(() => setCopied(false), 2500);
  };
  useShortcuts({ F3: () => void copy(), F6: () => navigate(`/runs/${runId}/graph`), F7: () => downloadPdf(runId), Esc: () => navigate(back) });

  const shortcuts: ShortcutItem[] = [
    { id: 'F1', label: t('keys.short.F1'), onClick: () => openDialog('help') },
    { id: 'F3', label: t('keys.short.F3'), onClick: () => void copy() },
    { id: 'F6', label: t('keys.short.F6g'), to: `/runs/${runId}/graph` },
    { id: 'F7', label: t('keys.short.F7'), onClick: () => downloadPdf(runId) },
    { id: 'Esc', label: t('keys.short.back'), to: back },
  ];
  const signature = kase.data?.signature ?? '…';
  const short = shortAddress(address, 6, 4);

  return (
    <Screen
      title={t('address.windowTitle', { signature, chain })}
      windowLabel={t('address.taskbar', { address: short })}
      runId={runId}
      shortcuts={shortcuts}
      status={run.data ? t('address.status', { chain: t(`chains.${chain}`, { defaultValue: chain }), time: formatDateTime(run.data.run.finishedAt ?? run.data.run.startedAt, lang) }) : t('common.loading')}
      toolbar={
        <>
          <BevelLink to={back}>← Esc · {t('address.backToResult')}</BevelLink>
          <BevelButton onClick={() => void copy()}>F3 · {copied ? t('address.copied') : t('address.copy')}</BevelButton>
          <BevelButton onClick={() => navigate(`/runs/${runId}/graph`)}>F6 · {t('keys.short.F6g')}</BevelButton>
          <BevelButton primary onClick={() => downloadPdf(runId)}>F7 · {t('keys.short.F7')}</BevelButton>
        </>
      }
    >
      {!run.data || !info ? (
        <LoadState pending={run.isPending} error={run.error} onRetry={() => void run.refetch()} retryLabel={t('common.retry')} loadingLabel={t('common.loading')} errorLabel={t('common.loadError')} />
      ) : (
        <Card run={run.data} info={info} runId={runId} lang={lang} monitored={kase.data?.scheduleEveryMin != null} evidence={view!.evidence} />
      )}
    </Screen>
  );
}

type Info = NonNullable<ReturnType<ReturnType<typeof deriveRun>['addressInfo']>>;

function Card({ run, info, runId, lang, monitored, evidence }: { run: RunResults; info: Info; runId: string; lang: string; monitored: boolean; evidence: ReturnType<typeof deriveRun>['evidence'] }) {
  const { t } = useTranslation();
  const { address, links, traces, chain } = info;
  const best = [...links].filter((l) => !l.excludedReason).sort((a, b) => b.score - a.score)[0];
  const excludedLink = links.find((l) => l.excludedReason);
  const exclusion = excludedLink?.breakdownJson.find((e) => e.kind === 'exclusion') ?? run.run.summaryJson?.subjects?.find((s) => keyOf(s.chain, s.address) === keyOf(address.chain, address.address))?.exclusions[0];
  const cash = chain?.indicators.cashOut.detected === true;
  const notes = run.run.summaryJson?.chainNotes.filter((n) => n.address.toLowerCase() === address.address.toLowerCase()) ?? [];
  const warnings = run.run.summaryJson?.chainWarnings.filter((n) => n.address.toLowerCase() === address.address.toLowerCase()).flatMap((n) => n.warnings) ?? [];
  const sources = [...new Set(traces.map((tr) => evidence.get(tr.evidenceId)?.metaJson.platform).filter(Boolean))];
  const fetched = traces.map((tr) => evidence.get(tr.evidenceId)?.fetchedAt).filter((x): x is string => !!x).sort()[0];
  const actions = recommendedActions(chain, { monitored, lang });

  return (
    <>
      <section aria-labelledby="adres" className="flex flex-col gap-3">
        <VtHeading id="adres" className="text-[44px]" data-testid="address-full">
          {address.address}
        </VtHeading>
        <div className="flex flex-wrap gap-x-3.5 gap-y-2 text-[14px] font-semibold">
          <CategoryTag category={address.category} />
          {address.isContract && address.category !== 'CONTRACT' && <span>[ {t('address.contract')} ]</span>}
          {best && (
            <span className="text-navy">
              [ {t('address.scoreTag', { score: best.score })} · <BandRange band={best.band} /> ]
            </span>
          )}
          {exclusion && <span className="text-alert">[ {t('address.excludedTag')} ]</span>}
          {cash && <span className="bg-alert px-1.5 text-white">! {t('address.cashOutTag')}</span>}
        </div>
        <p className="m-0 max-w-[860px] text-[14px] leading-relaxed">
          {best
            ? t('address.basisText', { sources: sources.join(', ') || '—', date: formatDateTime(fetched, lang) })
            : exclusion
              ? t('address.excludedText', { reason: reasonText(exclusion, lang) })
              : t('address.noBasis')}
        </p>
        <div className="flex flex-wrap gap-2">
          <BevelLink to={`/runs/${runId}`} compact>
            {t('address.backToResult')}
          </BevelLink>
        </div>
      </section>

      {chain ? <Totals ind={chain.indicators} lang={lang} /> : <NoChain notes={notes.flatMap((n) => n.notes)} mode={run.run.paramsJson.chain} />}

      <div className="flex flex-wrap items-start gap-[22px]">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-[22px]">
          {chain && <Course chain={chain} lang={lang} />}
          <Labels address={address} />
          {links.length > 0 && (
            <GroupBox id="powiazania" title={t('address.links')}>
              <ul className="sunken m-0 list-none px-3.5 py-2 text-[14px]">
                {links.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-2 py-1">
                    <span className="font-bold">{l.score}</span> <BandRange band={l.band} /> · {t(`identifierTypes.${l.identifier.type}`)}: {l.identifier.value}
                    {l.excludedReason && <span className="text-alert">[ {t('address.excludedTag')} ]</span>}
                  </li>
                ))}
              </ul>
            </GroupBox>
          )}
          {traces.length > 0 && (
            <GroupBox id="opublikowano" title={t('address.published')}>
              <p className="m-0 mb-2 text-[13px] leading-relaxed">
                <b className="text-navy">[{t('statement.fact')}]</b> {t('address.publishedNote')}
              </p>
              <ul className="sunken m-0 flex list-none flex-col gap-3 px-3.5 py-3">
                {traces.map((tr) => {
                  const ev = evidence.get(tr.evidenceId);
                  return ev && (
                    <li key={tr.id}>
                      <EvidenceItem evidence={ev} context={tr.contextSnippet} />
                      <p className="m-0 mt-0.5 text-[12px] text-sub">{t('address.context')}: {t(`contextTypes.${tr.contextType}`, { defaultValue: tr.contextType })}</p>
                    </li>
                  );
                })}
              </ul>
            </GroupBox>
          )}
          {chain && <Interactions chain={chain} lang={lang} />}
        </div>

        <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-[22px]">
          {chain && <Thresholds ind={chain.indicators} lang={lang} />}
          {chain && <Counterparties flows={chain.flows} lang={lang} />}
          <GroupBox id="dalej" title={t('address.nextSteps')}>
            <StepList current={0} steps={actions.map((a) => t(`address.actions.${a.key}`, a.params ?? {}))} />
          </GroupBox>
          {warnings.filter((w) => w.code !== 'UNVALUED_TRANSFERS').map((w, i) => <p key={i} className="m-0 text-[13px] text-sub">{noteText(t, w)}</p>)}
        </div>
      </div>
    </>
  );
}

const reasonText = (e: { pl: string; en: string } | { reasonPl: string; reasonEn: string }, lang: string) => ('reasonPl' in e ? (lang === 'en' ? e.reasonEn : e.reasonPl) : lang === 'en' ? e.en : e.pl);

function NoChain({ notes, mode }: { notes: { code: string; params?: Record<string, string | number> }[]; mode: string }) {
  const { t } = useTranslation();
  return (
    <EmptyState title={t('address.noChain')}>
      {notes.map((n) => noteText(t, n)).join(' ')} {t('address.noChainWhy', { mode: t(`run.chainModes.${mode}`) })}
    </EmptyState>
  );
}

// ---- the four totals ------------------------------------------------------------------------------------------------------------

function Totals({ ind, lang }: { ind: Indicators; lang: string }) {
  const { t } = useTranslation();
  const assets = (dir: 'in' | 'out') =>
    Object.entries(ind.byAsset)
      .filter(([, v]) => v[dir] > 0)
      .map(([a, v]) => `${formatAmount(v[dir], lang)} ${a}`)
      .join(', ') || '—';
  const left =
    Object.entries(ind.byAsset)
      .map(([a, v]) => [a, Math.round((v.in - v.out) * 100) / 100] as const)
      .filter(([, n]) => n > 0)
      .map(([a, n]) => `${formatAmount(n, lang)} ${a}`)
      .join(', ') || '—';
  // Money that could not be valued is never shown as 0,00 zł.
  const money = (pln: number, eur: number) => (ind.totals.unvalued > 0 && pln === 0 ? t('address.noValuation') : `≈ ${formatPln(pln, lang)}${eur ? ` (≈ ${formatEur(eur, lang)})` : ''}`);
  const tile = (label: string, big: string, small: string, alert = false) => (
    <div className="flex flex-col gap-1 border-l border-dashed border-rule px-4 py-3 first:border-l-0">
      <span className={cn('text-[12px] font-semibold', alert && 'text-alert')}>{label}</span>
      <span className={cn('font-vt text-[34px] leading-none', alert ? 'text-alert' : 'text-navy')}>{big}</span>
      <span className="text-[13px]">{small}</span>
    </div>
  );
  return (
    <div className="flex flex-col gap-2">
      <SunkenPanel className="grid grid-cols-2 lg:grid-cols-4">
        {tile(t('address.tiles.in'), assets('in'), money(ind.totals.inPln, ind.totals.inEur))}
        {tile(t('address.tiles.out'), assets('out'), money(ind.totals.outPln, ind.totals.outEur))}
        {tile(t('address.tiles.left'), left, t('address.tiles.onAddress'))}
        {tile(t('address.tiles.toService'), ind.cashOut.detected ? formatPln(ind.cashOut.totalPln, lang) : '—', ind.cashOut.detected ? `≈ ${formatEur(ind.cashOut.totalEur, lang)}` : t('address.cashOutNone'), ind.cashOut.detected)}
      </SunkenPanel>
      {ind.totals.unvalued > 0 && <p className="m-0 text-[13px] text-sub">{t('address.unvalued', { count: ind.totals.unvalued })}</p>}
    </div>
  );
}

// ---- the course of transactions: month strip and list --------------------------------------------------------------------

function MonthStrip({ month, flows, lang }: { month: string; flows: FlowEntry[]; lang: string }) {
  const { t } = useTranslation();
  const days = daysInMonth(month);
  const rank = { out: 1, in: 2, cash: 3 } as const; // a day with a transfer to a cash-out service shows as that, then as an inflow
  const kind = new Map<number, keyof typeof rank>();
  for (const f of flows) {
    const d = warsawDayOfMonth(f.time);
    const k: keyof typeof rank = f.direction === 'out' ? (f.tags.some((x) => CASH_TAGS.includes(x)) ? 'cash' : 'out') : 'in';
    const prev = kind.get(d);
    if (!prev || rank[k] > rank[prev]) kind.set(d, k);
  }
  const color = { cash: 'bg-alert', in: 'bg-navy', out: 'bg-shadow' } as const;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex justify-between text-[12px] font-semibold">
        <span>{monthTitle(month, lang)}</span>
      </div>
      <div aria-hidden="true" className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${days}, minmax(0, 1fr))` }}>
        {Array.from({ length: days }, (_, i) => (
          <span key={i} className={cn('h-4', kind.has(i + 1) ? color[kind.get(i + 1)!] : 'bg-day')} />
        ))}
      </div>
      <div aria-hidden="true" className="flex justify-between text-[11px]">
        <span>1</span>
        <span>10</span>
        <span>20</span>
        <span>{days}</span>
      </div>
      <span className="sr-only">{t('address.stripLabel', { month: monthTitle(month, lang) })}</span>
    </div>
  );
}

function Course({ chain, lang }: { chain: ChainDto; lang: string }) {
  const { t } = useTranslation();
  const flows = chain.flows;
  const months = [...new Set(flows.map((f) => warsawYearMonth(f.time)))].sort().slice(-3);
  const range = months.length === 0 ? '' : months.length === 1 ? monthTitle(months[0]!, lang) : `${monthTitle(months[0]!, lang)} – ${monthTitle(months[months.length - 1]!, lang)}`;
  const party = (f: FlowEntry) => {
    const name = f.counterparty.name ?? (f.counterparty.category ? t(`categories.${f.counterparty.category}`, { defaultValue: f.counterparty.category }).toLowerCase() : undefined);
    return name ? `${name} (${shortAddress(f.counterparty.address, 6, 4)})` : t(f.direction === 'in' ? 'address.unknownSender' : 'address.unknownRecipient');
  };
  return (
    <GroupBox id="os" title={t('address.course', { range })}>
      {flows.length === 0 ? (
        <p className="m-0 text-[14px] text-sub">{t('address.noChain')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <SunkenPanel className="flex flex-col gap-3 px-3 py-2.5">
            <div className="flex justify-end gap-3.5 text-[12px] font-semibold">
              <span className="text-navy">■ {t('address.legend.in')}</span>
              <span className="text-alert">■ {t('address.legend.cash')}</span>
              <span className="text-shadow">■ {t('address.legend.out')}</span>
            </div>
            {months.map((m) => (
              <MonthStrip key={m} month={m} flows={flows.filter((f) => warsawYearMonth(f.time) === m)} lang={lang} />
            ))}
          </SunkenPanel>
          <ol className="sunken m-0 list-none px-3 py-1">
            {flows.map((f, i) => {
              const rate = f.valuePln !== null && f.amount > 0 ? f.valuePln / f.amount : null;
              const alertTags = f.tags.filter((x) => CASH_TAGS.includes(x) || x.startsWith('OVER_'));
              const cashOut = f.tags.some((x) => CASH_TAGS.includes(x));
              return (
                <li key={`${f.tx}-${i}`} className="grid grid-cols-[106px_20px_minmax(0,1fr)] gap-x-3 border-b border-dashed border-rule py-[11px] text-[14px] last:border-b-0">
                  <span>{formatDay(f.time, lang)}</span>
                  <span aria-hidden="true" className={cn('font-bold', f.direction === 'in' ? 'text-navy' : 'text-alert')}>{f.direction === 'in' ? '←' : '→'}</span>
                  <div className="flex min-w-0 flex-col gap-1">
                    <span>
                      <b>
                        {t(f.direction === 'in' ? 'address.tx.in' : 'address.tx.out')} {formatAmount(f.amount, lang)} {f.asset}
                      </b>{' '}
                      {t(f.direction === 'in' ? 'address.tx.from' : 'address.tx.to')} {party(f)}
                    </span>
                    <span>
                      {f.valuePln !== null ? `≈ ${formatPln(f.valuePln, lang)}` : t('address.noValuation')}
                      {f.valueEur !== null && f.valuePln !== null && ` · ≈ ${formatEur(f.valueEur, lang)}`}
                    </span>
                    <span className="text-[12px] leading-normal">
                      <b className="text-navy">[{t('statement.fact')}]</b> {t('address.tx.fact', { chain: t(`chains.${chain.address.chain}`, { defaultValue: chain.address.chain }) })} ·{' '}
                      <b className="text-navy">[{t('statement.calc')}]</b>{' '}
                      {rate !== null ? t('address.tx.calc', { amount: formatAmount(f.amount, lang), rate: new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'pl-PL', { minimumFractionDigits: 4, maximumFractionDigits: 4 }).format(rate), date: formatDay(f.time, lang) }) : t('address.noValuation')}
                    </span>
                    {cashOut && (
                      <span className="self-start bg-alert px-2 py-0.5 text-[12px] font-bold text-white">! {alertTags.map((x) => t(`tags.${x}`, { defaultValue: x })).join(' · ')}</span>
                    )}
                    {!cashOut && f.tags.length > 0 && <span className="text-[12px] text-sub">{f.tags.map((x) => t(`tags.${x}`, { defaultValue: x })).join(' · ')}</span>}
                  </div>
                </li>
              );
            })}
          </ol>
          <p className="m-0 text-[12px] leading-normal">{t('address.valuationNote')}</p>
        </div>
      )}
    </GroupBox>
  );
}

// ---- thresholds, counterparties, labels ---------------------------------------------------------------------------------

function Thresholds({ ind, lang }: { ind: Indicators; lang: string }) {
  const { t } = useTranslation();
  return (
    <GroupBox id="progi" title={t('address.thresholdsTitle')} tone="alert">
      <div className="flex flex-col gap-3.5 text-[14px]">
        {ind.thresholds.filter((th) => THRESHOLDS.includes(th.eur)).map((th) => {
          const crossed = !!(th.singleCrossedAt || th.cumulativeCrossedAt);
          const pct = Math.min(100, Math.floor((ind.cashOut.totalEur / th.eur) * 100));
          const state = th.singleCrossedAt
            ? t('address.thState.single', { date: formatDate(th.singleCrossedAt, lang), max: formatEur(th.maxSingleEur, lang) })
            : th.cumulativeCrossedAt
              ? t('address.thState.cumulative', { date: formatDate(th.cumulativeCrossedAt, lang) })
              : t('address.thState.below', { pct, eur: formatEur(ind.cashOut.totalEur, lang) });
          return (
            <div key={th.eur} className="flex flex-col gap-1.5">
              <span>
                <b>{formatEurInt(th.eur, lang)}</b> — {t(`address.thresholdDesc.${th.eur}`)}
              </span>
              <span className="flex flex-wrap items-center gap-2.5">
                <MeterBlocks blocks={crossed ? 10 : Math.floor(pct / 10)} alert={crossed} />
                <span className={cn('font-semibold', crossed && 'text-alert')}>{state}</span>
              </span>
            </div>
          );
        })}
        <p className="m-0 text-[12px] leading-normal text-sub">{lang === 'en' ? ind.note.en : ind.note.pl}</p>
      </div>
    </GroupBox>
  );
}

function Counterparties({ flows, lang }: { flows: FlowEntry[]; lang: string }) {
  const { t } = useTranslation();
  const by = new Map<string, { f: FlowEntry; in: number; out: number; amounts: Map<string, number> }>();
  // senders and recipients nobody could name or classify are one line, not one per address
  const unknown = { n: new Set<string>(), in: 0, out: 0, amounts: new Map<string, number>() };
  for (const f of flows) {
    if (!f.counterparty.name && !f.counterparty.category) {
      unknown.n.add(f.counterparty.address.toLowerCase());
      unknown[f.direction]++;
      unknown.amounts.set(f.asset, (unknown.amounts.get(f.asset) ?? 0) + f.amount);
      continue;
    }
    const k = f.counterparty.address.toLowerCase();
    const e = by.get(k) ?? { f, in: 0, out: 0, amounts: new Map() };
    e[f.direction]++;
    e.amounts.set(f.asset, (e.amounts.get(f.asset) ?? 0) + f.amount);
    by.set(k, e);
  }
  return (
    <GroupBox id="kontrahenci" title={t('address.counterparties')}>
      <div className="sunken px-3.5 py-1 text-[14px]">
        {[...by.values()].map(({ f, in: nIn, out: nOut, amounts }) => (
          <div key={f.counterparty.address} className="flex flex-col gap-[3px] border-b border-dashed border-rule py-[9px] last:border-b-0">
            <span>
              <b>{f.counterparty.name ?? (f.counterparty.category ? t(`categories.${f.counterparty.category}`) : t('address.unknownParty'))}</b> {f.counterparty.category && <CategoryTag category={f.counterparty.category} />}
            </span>
            <span className="text-[13px]">
              {shortAddress(f.counterparty.address, 6, 4)} · {[nIn > 0 && t('address.cpIn', { count: nIn }), nOut > 0 && t('address.cpOut', { count: nOut })].filter(Boolean).join(', ')} · {[...amounts].map(([a, n]) => `${formatAmount(n, lang)} ${a}`).join(', ')}
            </span>
          </div>
        ))}
        {unknown.n.size > 0 && (
          <div className="flex flex-col gap-[3px] border-b border-dashed border-rule py-[9px] last:border-b-0">
            <span><b>{t('address.unknownParties', { count: unknown.n.size })}</b></span>
            <span className="text-[13px]">
              {[unknown.in > 0 && t('address.cpIn', { count: unknown.in }), unknown.out > 0 && t('address.cpOut', { count: unknown.out })].filter(Boolean).join(', ')} · {[...unknown.amounts].map(([a, n]) => `${formatAmount(n, lang)} ${a}`).join(', ')}
            </span>
          </div>
        )}
      </div>
    </GroupBox>
  );
}

function Labels({ address }: { address: Info['address'] }) {
  const { t } = useTranslation();
  return (
    <GroupBox id="etykiety" title={t('address.labels')}>
      {address.labels.length === 0 ? (
        <p className="m-0 text-[14px] text-sub">{t('address.noLabels')}</p>
      ) : (
        <ul className="sunken m-0 flex list-none flex-col gap-2 px-3.5 py-2.5 text-[14px]">
          {address.labels.map((l, i) => (
            <li key={i}>
              <b>{l.name}</b> <CategoryTag category={l.category} /> <span className="text-sub">({l.source === 'heuristic' ? t('address.labelHeuristic') : t('address.labelStatic')})</span>
              {l.sourceUrl && <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="block text-[12px] [overflow-wrap:anywhere]">{l.sourceUrl}</a>}
              {l.note && <span className="block text-[12px] text-sub">{l.note}</span>}
            </li>
          ))}
        </ul>
      )}
    </GroupBox>
  );
}

function Interactions({ chain, lang }: { chain: ChainDto; lang: string }) {
  const { t } = useTranslation();
  const ind = chain.indicators;
  const kinds = Object.entries(ind.interactions);
  if (kinds.length === 0 && ind.swaps.length === 0) return null;
  return (
    <GroupBox id="interakcje" title={t('address.interactions')}>
      <div className="flex flex-col gap-3">
        {kinds.length > 0 && (
          <DataTable minWidth={520} className="compact" caption={t('address.interactions')}>
            <thead>
              <tr>
                <th scope="col">{t('address.interactionColumns.kind')}</th>
                <th scope="col">{t('address.interactionColumns.count')}</th>
                <th scope="col">{t('address.interactionColumns.inPln')}</th>
                <th scope="col">{t('address.interactionColumns.outPln')}</th>
              </tr>
            </thead>
            <tbody>
              {kinds.map(([kind, i]) => (
                <tr key={kind}>
                  <td><CategoryTag category={kind} /></td>
                  <td>{i!.count}</td>
                  <td>{formatPln(i!.inPln, lang)}</td>
                  <td>{formatPln(i!.outPln, lang)}</td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
        {ind.swaps.length > 0 && (
          <ul className="sunken m-0 flex list-none flex-col gap-1 px-3.5 py-2.5 text-[14px]">
            {ind.swaps.map((s) => (
              <li key={s.tx}>
                {t('address.swapLine', {
                  date: formatDate(s.time, lang),
                  sold: Object.entries(s.sold).map(([a, n]) => `${formatAmount(n, lang)} ${a}`).join(', '),
                  bought: Object.entries(s.bought).map(([a, n]) => `${formatAmount(n, lang)} ${a}`).join(', '),
                  via: s.via,
                })}
              </li>
            ))}
          </ul>
        )}
      </div>
    </GroupBox>
  );
}

