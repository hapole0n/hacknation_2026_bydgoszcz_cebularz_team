import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useRunDiff } from '@/api/client';
import type { AddrRef, RunDiffDoc } from '@/api/types';
import { BandChip, CategoryBadge, Panel, Tag } from '@/components/primitives';
import { formatDateTime, formatEur, loc, shortAddress, signed } from '@/lib/format';
import { cn } from '@/lib/utils';

const addr = (a: AddrRef) => `${a.chain} ${shortAddress(a.address)}`;
const addrs = (xs: AddrRef[]) => xs.map(addr).join(', ');

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold">{title}</h3>
      <ul className="mt-1 space-y-1 text-sm">{children}</ul>
    </div>
  );
}

/** "Zmiany od poprzedniego przebiegu": what the comparison with the run before found (PLAN 3.8). */
export function RunChanges({ runId }: { runId: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const q = useRunDiff(runId);
  if (!q.data) return null;
  const d: RunDiffDoc | null = q.data.diff;
  const mono = 'font-mono text-xs';

  return (
    <Panel className={cn('space-y-4 p-5', d && !d.empty && 'border-l-4 border-l-band-medium')}>
      <div>
        <h2 className="text-base font-semibold">{t('changes.title')}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {!d ? t('changes.first') : d.empty ? t('changes.none', { date: formatDateTime(d.fromAt, lang) }) : t('changes.comparedWith', { date: formatDateTime(d.fromAt, lang) })}
        </p>
        {d && !d.params.same && <p className="mt-1 text-sm text-muted-foreground">{t('changes.differentSources')}</p>}
      </div>

      {d && !d.empty && (
        <div className="grid gap-x-8 gap-y-4 lg:grid-cols-2">
          {d.sourceChanges.length > 0 && (
            <Group title={t('changes.sourceChanges')}>
              {d.sourceChanges.map((s) => (
                <li key={s.url}>
                  <span className="font-medium">{s.title ?? s.platform ?? s.url}</span>: {t(`changes.sourceKind.${s.kind}`)}{' '}
                  <span className={mono}>{s.from.length > 0 && `${addrs(s.from)} → `}{addrs(s.to) || '—'}</span>
                </li>
              ))}
            </Group>
          )}
          {d.addresses.added.length > 0 && (
            <Group title={t('changes.added')}>
              {d.addresses.added.map((a) => (
                <li key={`${a.chain}:${a.address}`} className="flex flex-wrap items-center gap-2">
                  <span className={mono}>{addr(a)}</span>
                  {a.category && <CategoryBadge category={a.category} />}
                  {a.excluded ? <BandChip band="EXCLUDED" /> : a.bestScore !== null && <span className="tabular-nums text-muted-foreground">{a.bestScore}%</span>}
                </li>
              ))}
            </Group>
          )}
          {d.addresses.removed.length > 0 && (
            <Group title={t('changes.removed')}>
              {d.addresses.removed.map((a) => (
                <li key={`${a.chain}:${a.address}`} className="flex flex-wrap items-center gap-2">
                  <span className={mono}>{addr(a)}</span>
                  {a.category && <CategoryBadge category={a.category} />}
                </li>
              ))}
            </Group>
          )}
          {d.scoreChanges.length > 0 && (
            <Group title={t('changes.scoreChanges')}>
              {d.scoreChanges.map((s) => (
                <li key={`${s.identifier.type}:${s.identifier.value}:${s.address}`}>
                  <span className={mono}>{addr(s)}</span> · {s.identifier.value}:{' '}
                  <span className="font-medium tabular-nums">{s.fromScore === null ? t('changes.newLink') : `${s.fromScore}%`} → {s.toScore === null ? t('changes.linkGone') : `${s.toScore}%`}</span>
                  {s.rules.length > 0 && (
                    <ul className="ml-4 list-disc text-muted-foreground">
                      {s.rules.map((r) => (
                        <li key={r.ruleId}>
                          {t(`changes.rule.${r.change}`)}: {loc({ pl: r.reasonPl, en: r.reasonEn }, lang)} <span className={mono}>({r.ruleId}: {r.fromDelta !== null && r.toDelta !== null ? `${signed(r.fromDelta)} → ${signed(r.toDelta)}` : signed((r.toDelta ?? r.fromDelta)!)})</span>
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
                  <span className={mono}>{addr(c)}</span> <CategoryBadge category={c.from} /> → <CategoryBadge category={c.to} />
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
                  {x.isNewAddress && <span className="text-muted-foreground"> ({t('changes.newAddress')})</span>}
                </li>
              ))}
            </Group>
          )}
          {d.newThresholds.length > 0 && (
            <Group title={t('changes.newThresholds')}>
              {d.newThresholds.map((x) => (
                <li key={`${x.chain}:${x.address}:${x.thresholdEur}:${x.kind}`}>
                  <span className={mono}>{addr(x)}</span>: <span className="font-medium">{formatEur(x.thresholdEur, lang)}</span> — {t(`changes.thresholdKind.${x.kind}`)}, {formatDateTime(x.at, lang)}
                </li>
              ))}
            </Group>
          )}
          {d.newIndicators.filter((i) => i.cashOut).length > 0 && (
            <Group title={t('changes.newCashOut')}>
              {d.newIndicators.filter((i) => i.cashOut).map((i) => (
                <li key={`${i.chain}:${i.address}:${i.tag}`} className="flex flex-wrap items-center gap-2">
                  <span className={mono}>{addr(i)}</span> <Tag id={i.tag} />
                </li>
              ))}
            </Group>
          )}
        </div>
      )}
    </Panel>
  );
}
