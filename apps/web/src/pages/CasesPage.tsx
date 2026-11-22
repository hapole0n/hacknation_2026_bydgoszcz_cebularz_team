import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCases } from '@/api/client';
import { ResultLine } from '@/components/shared';
import { Screen, type ShortcutItem } from '@/components/win/chrome';
import { BevelButton, DataTable, EmptyState, GroupBox, LoadState, VtHeading, inputClass } from '@/components/win/controls';
import { formatDate, formatDateTime } from '@/lib/format';
import { openDialog } from '@/lib/ui';
import { Link, navigate } from '@/router';

/** The register of cases (F4): every case with its file reference, proceedings number, latest result and monitoring. */
export function CasesPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const cases = useCases();
  const [filter, setFilter] = useState('');
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return (cases.data ?? []).filter((c) => !q || [c.signature, c.title, c.basis ?? '', ...c.identifiers.map((i) => i.value)].some((x) => x.toLowerCase().includes(q)));
  }, [cases.data, filter]);

  const shortcuts: ShortcutItem[] = [
    { id: 'F1', label: t('keys.short.F1'), onClick: () => openDialog('help') },
    { id: 'F2', label: t('keys.short.F2'), to: '/' },
    { id: 'F4', label: t('keys.short.F4'), to: '/cases' },
    { id: 'F8', label: t('keys.short.F8'), to: '/audit' },
    { id: 'F10', label: t('keys.short.F10'), onClick: () => openDialog('settings') },
  ];

  return (
    <Screen
      title={t('cases.title')}
      windowLabel={t('cases.title')}
      shortcuts={shortcuts}
      status={t('cases.status', { count: cases.data?.length ?? 0 })}
      toolbar={
        <>
          <BevelButton onClick={() => navigate('/')}>F2 · {t('keys.short.F2')}</BevelButton>
          <BevelButton pressed onClick={() => navigate('/cases')}>F4 · {t('keys.short.F4')}</BevelButton>
          <BevelButton onClick={() => navigate('/audit')}>F8 · {t('keys.short.F8')}</BevelButton>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <VtHeading>&gt; {t('cases.title')}</VtHeading>
        <p className="m-0 max-w-[800px] text-[15px] leading-relaxed">{t('cases.lead')}</p>
      </div>
      <LoadState pending={cases.isPending} error={cases.error} onRetry={() => void cases.refetch()} retryLabel={t('common.retry')} loadingLabel={t('common.loading')} errorLabel={t('common.loadError')} />

      {cases.data && cases.data.length === 0 && (
        <EmptyState title={t('cases.emptyTitle')} action={<BevelButton primary onClick={() => navigate('/')}>{t('keys.short.F2')}</BevelButton>}>
          {t('cases.emptyBody')}
        </EmptyState>
      )}

      {cases.data && cases.data.length > 0 && (
        <GroupBox id="rejestr-pelny" title={t('cases.register', { count: rows.length })}>
          <div className="mb-2.5 flex flex-col gap-1.5">
            <label htmlFor="filter" className="text-[14px] font-semibold">
              {t('cases.filter')}
            </label>
            <input id="filter" type="search" className={`${inputClass} max-w-[480px]`} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={t('cases.filterPlaceholder')} autoComplete="off" />
          </div>
          <DataTable minWidth={980} caption={t('cases.title')}>
            <thead>
              <tr>
                <th scope="col">{t('cases.columns.signature')}</th>
                <th scope="col">{t('cases.columns.person')}</th>
                <th scope="col">{t('cases.columns.basis')}</th>
                <th scope="col">{t('cases.columns.identifiers')}</th>
                <th scope="col">{t('cases.columns.createdAt')}</th>
                <th scope="col">{t('cases.columns.lastRun')}</th>
                <th scope="col">{t('cases.columns.result')}</th>
                <th scope="col">{t('cases.columns.monitoring')}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const last = c.runs[0];
                return (
                  <tr key={c.id}>
                    <td>
                      <Link to={`/cases/${c.id}`} className="font-semibold">
                        {c.signature}
                      </Link>
                    </td>
                    <td>{c.title}</td>
                    <td>{c.basis ?? <span className="text-sub">—</span>}</td>
                    <td className="text-sub">
                      {c.identifiers.slice(0, 3).map((i) => i.value).join(', ')}
                      {c.identifiers.length > 3 && ` ${t('cases.moreIdentifiers', { count: c.identifiers.length - 3 })}`}
                    </td>
                    <td className="whitespace-nowrap">{formatDate(c.createdAt, lang)}</td>
                    <td>
                      {last ? (
                        <Link to={`/runs/${last.id}`}>
                          {formatDateTime(last.startedAt, lang)} ({t(`common.status.${last.status}`)}; {t('cases.runsCount', { count: c._count.runs })})
                        </Link>
                      ) : (
                        <span className="text-sub">{t('cases.noRuns')}</span>
                      )}
                    </td>
                    <td>
                      <ResultLine result={c.result} />
                    </td>
                    <td>{c.scheduleEveryMin ? t(`case.scheduleShort.${c.scheduleEveryMin}`) : t('case.schedule.offShort')}</td>
                  </tr>
                );
              })}
            </tbody>
          </DataTable>
          {rows.length === 0 && <p className="m-0 mt-2 text-[14px] text-sub">{t('cases.noMatch')}</p>}
        </GroupBox>
      )}
    </Screen>
  );
}
