import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '@/api/client';
import { Screen, type ShortcutItem } from '@/components/win/chrome';
import { BevelButton, CheckField, DataTable, GroupBox, LoadState, VtHeading } from '@/components/win/controls';
import { auditStatus } from '@/lib/audit';
import { openDialog } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { Link, navigate } from '@/router';

const dateTime = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));

/** "Dziennik zapytań" (F8): every request the program sent to an outside service — when, for which case and under which proceedings, where, with what result. */
export function AuditPage() {
  const { t, i18n } = useTranslation();
  const [problems, setProblems] = useState(false);
  const log = useAuditLog(problems);
  const shortcuts: ShortcutItem[] = [
    { id: 'F1', label: t('keys.short.F1'), onClick: () => openDialog('help') },
    { id: 'F2', label: t('keys.short.F2'), to: '/' },
    { id: 'F4', label: t('keys.short.F4'), to: '/cases' },
    { id: 'F8', label: t('keys.short.F8'), to: '/audit' },
  ];
  const d = log.data;
  return (
    <Screen
      title={t('audit.title')}
      windowLabel={t('audit.title')}
      shortcuts={shortcuts}
      status={d ? t('audit.summary', { total: d.total, blocked: d.blocked, failed: d.failed }) : t('common.loading')}
      toolbar={
        <>
          <BevelButton onClick={() => navigate('/')}>F2 · {t('keys.short.F2')}</BevelButton>
          <BevelButton onClick={() => navigate('/cases')}>F4 · {t('keys.short.F4')}</BevelButton>
          <BevelButton pressed onClick={() => navigate('/audit')}>F8 · {t('keys.short.F8')}</BevelButton>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <VtHeading>&gt; {t('audit.title')}</VtHeading>
        <p className="m-0 max-w-[800px] text-[15px] leading-relaxed">{t('audit.lead')}</p>
      </div>
      {!d ? (
        <LoadState pending={log.isPending} error={log.error} onRetry={() => void log.refetch()} retryLabel={t('common.retry')} loadingLabel={t('common.loading')} errorLabel={t('common.loadError')} />
      ) : (
        <GroupBox id="dziennik-zapytan" title={t('audit.requests', { count: d.rows.length })}>
          <div className="mb-2 flex flex-wrap items-center gap-x-6">
            <p className="m-0 text-[14px]" role="status">{t('audit.summary', { total: d.total, blocked: d.blocked, failed: d.failed })}</p>
            <CheckField id="audit-problems" checked={problems} onChange={setProblems}>
              {t('audit.onlyProblems')}
            </CheckField>
          </div>
          {d.rows.length === 0 ? (
            <p className="sunken m-0 px-4 py-6 text-center text-[14px] text-sub">{t('audit.empty')}</p>
          ) : (
            <DataTable minWidth={1000} className="compact" caption={t('audit.title')}>
              <thead>
                <tr>
                  {(['time', 'case', 'basis', 'source', 'host', 'path', 'status', 'duration'] as const).map((c) => (
                    <th key={c} scope="col">{t(`audit.columns.${c}`)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {d.rows.map((r) => {
                  const s = auditStatus(r.status);
                  return (
                    <tr key={r.id} data-status={s.kind} className={cn(s.kind !== 'ok' && 'bg-[#f4e7e2]')}>
                      <td className="whitespace-nowrap">{dateTime(r.at, i18n.language)}</td>
                      <td>
                        {r.caseId ? (
                          <Link to={`/cases/${r.caseId}`} className="font-semibold">
                            {r.caseSignature ?? r.caseTitle ?? r.caseId.slice(0, 8)}
                          </Link>
                        ) : '—'}
                        {r.caseTitle && r.caseSignature && <span className="block text-[12px] text-sub">{r.caseTitle}</span>}
                      </td>
                      <td>{r.caseBasis ?? '—'}</td>
                      <td>{r.connectorId}</td>
                      <td>{r.host}</td>
                      <td className="text-[12px] [overflow-wrap:anywhere]">{r.path}</td>
                      <td className={cn('whitespace-nowrap font-semibold', s.kind !== 'ok' && 'text-alert')}>[ {s.kind === 'ok' || s.kind === 'http' ? r.status : t(`audit.status.${s.kind}`)} ]</td>
                      <td className="whitespace-nowrap text-right">{r.durationMs} ms</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
        </GroupBox>
      )}
    </Screen>
  );
}
