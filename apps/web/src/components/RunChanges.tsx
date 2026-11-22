import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRunDiff } from '@/api/client';
import type { AddrRef, RunDiffDoc } from '@/api/types';
import { CategoryTag } from '@/components/shared';
import { GroupBox, Tag } from '@/components/win/controls';
import { formatDateTime, formatEur, loc, shortAddress, signed } from '@/lib/format';

const addr = (a: AddrRef) => `${a.chain} ${shortAddress(a.address)}`;
const addrs = (xs: AddrRef[]) => xs.map(addr).join(', ');

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="m-0 text-[14px] font-semibold">{title}</h3>
      <ul className="m-0 mt-1 flex list-none flex-col gap-1 p-0 text-[14px]">{children}</ul>
    </div>
  );
}

/** "Zmiany od poprzedniego przebiegu": what the comparison with the run before found. */
export function RunChanges({ runId }: { runId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const q = useRunDiff(runId);
  if (!q.data) return null;
  const d: RunDiffDoc | null = q.data.diff;
  const mono = 'text-[12px]';
  const changed = d && !d.empty;

  return (
    <GroupBox id="zmiany" title={t('changes.title')} tone={changed ? 'alert' : undefined}>
      <p className="m-0 text-[14px] leading-relaxed">
        {!d ? t('changes.first') : d.empty ? t('changes.none', { date: formatDateTime(d.fromAt, lang) }) : t('changes.comparedWith', { date: formatDateTime(d.fromAt, lang) })}
        {d && !d.params.same && <span className="block text-sub">{t('changes.differentSources')}</span>}
      </p>

      {changed && (
        <div className="sunken mt-2.5 grid gap-x-8 gap-y-4 px-3.5 py-3 lg:grid-cols-2">
          {d.sourceChanges.length > 0 && (
            <Group title={t('changes.sourceChanges')}>
              {d.sourceChanges.map((s) => (
                <li key={s.url}>
                  <b>{s.title ?? s.platform ?? s.url}</b>: {t(`changes.sourceKind.${s.kind}`)}{' '}
                  <span className={mono}>
                    {s.from.length > 0 && `${addrs(s.from)} → `}
                    {addrs(s.to) || '—'}
                  </span>
                </li>
              ))}
            </Group>
          )}
          {d.addresses.added.length > 0 && (
            <Group title={t('changes.added')}>
              {d.addresses.added.map((a) => (
                <li key={`${a.chain}:${a.address}`} className="flex flex-wrap items-center gap-2">
                  <span className={mono}>{addr(a)}</span>
                  {a.category && <CategoryTag category={a.category} />}
                  {a.excluded ? <Tag alert>{t('bandNames.EXCLUDED')}</Tag> : a.bestScore !== null && <span className="text-sub">{a.bestScore}/100</span>}
                </li>
              ))}
            </Group>
          )}
          {d.addresses.removed.length > 0 && (
            <Group title={t('changes.removed')}>
              {d.addresses.removed.map((a) => (
                <li key={`${a.chain}:${a.address}`} className="flex flex-wrap items-center gap-2">
                  <span className={mono}>{addr(a)}</span>
                  {a.category && <CategoryTag category={a.category} />}
                </li>
              ))}
            </Group>
          )}
          {d.scoreChanges.length > 0 && (
            <Group title={t('changes.scoreChanges')}>
              {d.scoreChanges.map((s) => (
                <li key={`${s.identifier.type}:${s.identifier.value}:${s.address}`}>
                  <span className={mono}>{addr(s)}</span> · {s.identifier.value}:{' '}
                  <b>
                    {s.fromScore === null ? t('changes.newLink') : s.fromScore} → {s.toScore === null ? t('changes.linkGone') : s.toScore}
                  </b>
                  {s.rules.length > 0 && (
                    <ul className="m-0 ml-4 list-disc p-0 text-sub">
                      {s.rules.map((r) => (
                        <li key={r.ruleId}>
                          {t(`changes.rule.${r.change}`)}: {loc({ pl: r.reasonPl, en: r.reasonEn }, lang)}{' '}
                          <span className={mono}>({r.ruleId}: {r.fromDelta !== null && r.toDelta !== null ? `${signed(r.fromDelta)} → ${signed(r.toDelta)}` : signed((r.toDelta ?? r.fromDelta)!)})</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </Group>
          )}
          {d.categoryChanges.length > 0 && (
            <Group title={t('changes.categoryChanges')}>
              {d.categoryChanges.map((c) => (
                <li key={`${c.chain}:${c.address}`} className="flex flex-wrap items-center gap-2">
                  <span className={mono}>{addr(c)}</span> <CategoryTag category={c.from} /> → <CategoryTag category={c.to} />
                </li>
              ))}
            </Group>
          )}
          {d.newTransactions.length > 0 && (
            <Group title={t('changes.newTransactions')}>
              {d.newTransactions.map((x) => (
                <li key={`${x.chain}:${x.address}`}>
                  <span className={mono}>{addr(x)}</span>: {t('changes.txCount', { count: x.count })}, {formatDateTime(x.firstAt, lang)}
                  {x.firstAt !== x.lastAt && ` – ${formatDateTime(x.lastAt, lang)}`}
                  {x.isNewAddress && <span className="text-sub"> ({t('changes.newAddress')})</span>}
                </li>
              ))}
            </Group>
          )}
          {d.newThresholds.length > 0 && (
            <Group title={t('changes.newThresholds')}>
              {d.newThresholds.map((x) => (
                <li key={`${x.chain}:${x.address}:${x.thresholdEur}:${x.kind}`}>
                  <span className={mono}>{addr(x)}</span>: <b className="text-alert">{formatEur(x.thresholdEur, lang)}</b> — {t(`changes.thresholdKind.${x.kind}`)}, {formatDateTime(x.at, lang)}
                </li>
              ))}
            </Group>
          )}
          {(d.valuationCompleted ?? []).length > 0 && (
            <Group title={t('changes.valuationCompleted')}>
              {d.valuationCompleted!.map((v) => (
                <li key={`${v.chain}:${v.address}`}>
                  <span className={mono}>{addr(v)}</span>: {t('changes.valuationNote', { count: v.previouslyUnvalued })}{' '}
                  {v.thresholds.map((x) => `${formatEur(x.thresholdEur, lang)} — ${t(`changes.thresholdKind.${x.kind}`)}, ${formatDateTime(x.at, lang)}`).join('; ')}
                </li>
              ))}
            </Group>
          )}
          {d.newIndicators.filter((i) => i.cashOut).length > 0 && (
            <Group title={t('changes.newCashOut')}>
              {d.newIndicators.filter((i) => i.cashOut).map((i) => (
                <li key={`${i.chain}:${i.address}:${i.tag}`} className="flex flex-wrap items-center gap-2">
                  <span className={mono}>{addr(i)}</span> <Tag alert>{t(`tags.${i.tag}`, { defaultValue: i.tag })}</Tag>
                </li>
              ))}
            </Group>
          )}
        </div>
      )}
    </GroupBox>
  );
}
