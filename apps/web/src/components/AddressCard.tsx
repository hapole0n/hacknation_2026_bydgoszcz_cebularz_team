import { useTranslation } from 'react-i18next';
import type { AddressDto, ChainDto, EvidenceDto, LinkDto, RunResults, TraceDto } from '@/api/types';
import { BandChip, CategoryBadge, Particulars, SectionHeading, Tag } from '@/components/primitives';
import { formatAmount, formatDate, formatDateTime, formatEur, formatPln, shortAddress } from '@/lib/format';

const THRESHOLD_KEYS = [1000, 10000, 15000];

/**
 * Everything known about one address: what it is and why, where it was published (source facts), and what the
 * blockchain shows (calculated): activity, services it touched, cash-out signals, AML thresholds, chronology.
 */
export function AddressCard({
  address,
  links,
  traces,
  evidence,
  chain,
  run,
}: {
  address: AddressDto;
  links: LinkDto[];
  traces: TraceDto[];
  evidence: Map<string, EvidenceDto>;
  chain?: ChainDto;
  run: RunResults['run'];
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const notes = run.summaryJson?.chainNotes.filter((n) => n.address.toLowerCase() === address.address.toLowerCase()) ?? [];
  const warnings = run.summaryJson?.chainWarnings.filter((n) => n.address.toLowerCase() === address.address.toLowerCase()).flatMap((n) => n.warnings) ?? [];

  return (
    <div className="space-y-7">
      <div>
        <h3 className="font-serif text-xl font-semibold">{t('address.title')}</h3>
        <p className="mt-1 break-all text-sm font-medium" data-testid="address-full">{address.address}</p>
        <div className="mt-3">
          <Particulars
            items={[
              { label: t('address.network'), value: t(`chains.${address.chain}`) },
              { label: t('address.category'), value: <CategoryBadge category={address.category} /> },
              ...(address.isContract ? [{ label: '', value: t('address.contract') }] : []),
            ]}
          />
        </div>
      </div>

      <section>
        <SectionHeading title={t('address.labels')} />
        {address.labels.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('address.noLabels')}</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {address.labels.map((l, i) => (
              <li key={i} className="rounded-sm bg-muted px-3 py-2">
                <span className="font-medium">{l.name}</span> <CategoryBadge category={l.category} /> <span className="text-muted-foreground">({l.source === 'heuristic' ? t('address.labelHeuristic') : t('address.labelStatic')})</span>
                {l.sourceUrl && (
                  <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 block break-all text-xs text-steel underline underline-offset-2">
                    {l.sourceUrl}
                  </a>
                )}
                {l.note && <span className="mt-1 block text-xs text-muted-foreground">{l.note}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {links.length > 0 && (
        <section>
          <SectionHeading title={t('address.links')} kind="calc" />
          <ul className="space-y-1 text-sm">
            {links.map((l) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2">
                <BandChip band={l.band} score={l.score} />
                <span>{t(`identifierTypes.${l.identifier.type}`)}: {l.identifier.value}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <SectionHeading title={t('address.published')} note={t('address.publishedNote')} kind="fact" />
        <ul className="space-y-4">
          {traces.map((tr) => {
            const ev = evidence.get(tr.evidenceId);
            return (
              ev && (
                <li key={tr.id} className="text-sm">
                  <p className="font-medium">
                    {ev.metaJson.platform} <span className="font-normal text-muted-foreground">({t(`contextTypes.${tr.contextType}`, { defaultValue: tr.contextType })})</span>
                  </p>
                  {ev.url && <p className="break-all text-xs text-muted-foreground">{ev.url}</p>}
                  <blockquote className="mt-1 whitespace-pre-wrap break-words border-l-2 pl-3">{tr.contextSnippet}</blockquote>
                </li>
              )
            );
          })}
        </ul>
      </section>

      <section>
        <SectionHeading title={t('address.onchain')} note={t('address.onchainNote')} kind="calc" />
        {!chain ? (
          <div className="rounded-lg border border-dashed p-4 text-sm">
            <p className="font-medium">{t('address.noChain')}</p>
            {notes.map((n) => <p key={n.note} className="mt-1 text-muted-foreground">{n.note}</p>)}
            <p className="mt-1 text-muted-foreground">{t('address.noChainWhy', { mode: t(`run.chainModes.${run.paramsJson.chain}`) })}</p>
          </div>
        ) : (
          <ChainSection chain={chain} lang={lang} warnings={warnings} />
        )}
      </section>
    </div>
  );
}

function ChainSection({ chain, lang, warnings }: { chain: ChainDto; lang: string; warnings: string[] }) {
  const { t } = useTranslation();
  const ind = chain.indicators;
  const tagsOf = Object.entries(ind.interactions);
  return (
    <div className="space-y-6">
      <Particulars
        items={[
          { label: t('address.kpi.tx'), value: ind.txCount },
          { label: t('address.kpi.first'), value: formatDate(ind.firstActivity, lang) },
          { label: t('address.kpi.last'), value: formatDate(ind.lastActivity, lang) },
          { label: t('address.kpi.inPln'), value: `${formatPln(ind.totals.inPln, lang)} (${formatEur(ind.totals.inEur, lang)})` },
          { label: t('address.kpi.outPln'), value: `${formatPln(ind.totals.outPln, lang)} (${formatEur(ind.totals.outEur, lang)})` },
          { label: t('address.kpi.stableIn'), value: `${formatAmount(ind.stablecoin.inUsd, lang)} USD` },
          { label: t('address.kpi.stableOut'), value: `${formatAmount(ind.stablecoin.outUsd, lang)} USD` },
          { label: t('address.kpi.counterparties'), value: `${ind.counterparties.total} (${t('address.kpi.known', { count: ind.counterparties.known })})` },
          { label: t('address.kpi.provider'), value: `${chain.provider}, ${t('address.kpi.fetched').toLowerCase()} ${formatDateTime(chain.fetchedAt, lang)}` },
        ]}
      />
      {ind.totals.unvalued > 0 && <p className="text-sm text-muted-foreground">{t('address.unvalued', { count: ind.totals.unvalued })}</p>}
      {warnings.map((w) => <p key={w} className="text-sm text-muted-foreground">{w}</p>)}

      {tagsOf.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold">{t('address.interactions')}</h4>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="py-1 font-medium">{t('address.interactionColumns.kind')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('address.interactionColumns.count')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('address.interactionColumns.inPln')}</th>
                <th scope="col" className="py-1 text-right font-medium">{t('address.interactionColumns.outPln')}</th>
              </tr>
            </thead>
            <tbody>
              {tagsOf.map(([kind, i]) => (
                <tr key={kind} className="border-b last:border-b-0">
                  <td className="py-1.5"><CategoryBadge category={kind} /></td>
                  <td className="py-1.5 text-right tabular-nums">{i!.count}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatPln(i!.inPln, lang)}</td>
                  <td className="py-1.5 text-right tabular-nums">{formatPln(i!.outPln, lang)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {ind.swaps.length > 0 && (
        <div>
          <h4 className="mb-1 text-sm font-semibold">{t('address.swaps')}</h4>
          <ul className="space-y-1 text-sm">
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
        </div>
      )}

      <div>
        <h4 className="mb-1 text-sm font-semibold">{t('address.cashOut')}</h4>
        {ind.cashOut.detected ? (
          <div className="space-y-2 text-sm">
            <p>{t('address.cashOutDetected')}</p>
            <p className="flex flex-wrap gap-1">{ind.cashOut.patterns.map((p) => <Tag key={p} id={p} />)}</p>
            <p>
              {t('address.cashOutTotal')}: <span className="font-medium tabular-nums">{formatPln(ind.cashOut.totalPln, lang)}</span> ({formatEur(ind.cashOut.totalEur, lang)})
            </p>
            <table className="w-full">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-1 font-medium">{t('address.endpointColumns.address')}</th>
                  <th scope="col" className="py-1 font-medium">{t('address.endpointColumns.kind')}</th>
                  <th scope="col" className="py-1 text-right font-medium">{t('address.endpointColumns.count')}</th>
                  <th scope="col" className="py-1 text-right font-medium">{t('address.endpointColumns.total')}</th>
                </tr>
              </thead>
              <tbody>
                {ind.cashOut.endpoints.map((e) => (
                  <tr key={e.address} className="border-b last:border-b-0">
                    <td className="py-1.5">{e.name ?? shortAddress(e.address)}</td>
                    <td className="py-1.5">{e.kind === 'AD_ADDRESS' ? t('address.adAddress') : <CategoryBadge category={e.kind} />}</td>
                    <td className="py-1.5 text-right tabular-nums">{e.count}</td>
                    <td className="py-1.5 text-right tabular-nums">{formatPln(e.totalPln, lang)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">{t('address.cashOutNone')}</p>
        )}
      </div>

      <div>
        <h4 className="mb-1 text-sm font-semibold">{t('address.thresholds')}</h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th scope="col" className="py-1 font-medium">{t('address.thresholdColumns.threshold')}</th>
              <th scope="col" className="py-1 font-medium">{t('address.thresholdColumns.max')}</th>
              <th scope="col" className="py-1 font-medium">{t('address.thresholdColumns.single')}</th>
              <th scope="col" className="py-1 font-medium">{t('address.thresholdColumns.cumulative')}</th>
            </tr>
          </thead>
          <tbody>
            {ind.thresholds.filter((th) => THRESHOLD_KEYS.includes(th.eur)).map((th) => (
              <tr key={th.eur} className="border-b align-top last:border-b-0">
                <td className="py-1.5 font-medium tabular-nums">{formatEur(th.eur, lang)}</td>
                <td className="py-1.5 tabular-nums">{formatEur(th.maxSingleEur, lang)}</td>
                <td className="py-1.5">{th.singleCrossedAt ? t('address.reachedAt', { date: formatDate(th.singleCrossedAt, lang) }) : <span className="text-muted-foreground">{t('address.notReached')}</span>}</td>
                <td className="py-1.5">{th.cumulativeCrossedAt ? t('address.reachedAt', { date: formatDate(th.cumulativeCrossedAt, lang) }) : <span className="text-muted-foreground">{t('address.notReached')}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-1 text-xs text-muted-foreground">{lang === 'en' ? ind.note.en : ind.note.pl}</p>
      </div>

      <div>
        <h4 className="mb-1 text-sm font-semibold">{t('address.chronology')}</h4>
        {chain.flows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('address.noChain')}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th scope="col" className="py-1 pr-3 font-medium">{t('address.chronologyColumns.time')}</th>
                  <th scope="col" className="py-1 pr-3 font-medium">{t('address.chronologyColumns.direction')}</th>
                  <th scope="col" className="py-1 pr-3 font-medium">{t('address.chronologyColumns.counterparty')}</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">{t('address.chronologyColumns.amount')}</th>
                  <th scope="col" className="py-1 pr-3 text-right font-medium">{t('address.chronologyColumns.pln')}</th>
                  <th scope="col" className="py-1 font-medium">{t('address.chronologyColumns.tags')}</th>
                </tr>
              </thead>
              <tbody>
                {chain.flows.map((f, i) => (
                  <tr key={`${f.tx}-${i}`} className="border-b align-top last:border-b-0">
                    <td className="whitespace-nowrap py-1.5 pr-3 tabular-nums">{formatDate(f.time, lang)}</td>
                    <td className="py-1.5 pr-3">{f.direction === 'in' ? t('address.in') : t('address.out')}</td>
                    <td className="py-1.5 pr-3">
                      <span className="block">{f.counterparty.name ?? shortAddress(f.counterparty.address)}</span>
                      {f.counterparty.category && <CategoryBadge category={f.counterparty.category} />}
                    </td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">{formatAmount(f.amount, lang)} {f.asset}</td>
                    <td className="whitespace-nowrap py-1.5 pr-3 text-right tabular-nums">{formatPln(f.valuePln, lang)}</td>
                    <td className="py-1.5"><span className="flex flex-wrap gap-1">{f.tags.map((tag) => <Tag key={tag} id={tag} />)}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
