import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLog } from '@/api/client';
import { LoadState, Panel } from '@/components/primitives';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { auditStatus } from '@/lib/audit';
import { cn } from '@/lib/utils';
import { Link } from '@/router';

const dateTime = (iso: string, lang: string) =>
  new Intl.DateTimeFormat(lang === 'en' ? 'en-GB' : 'pl-PL', { timeZone: 'Europe/Warsaw', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(iso));

/** Every request the program sent to an outside service (PLAN 3.9): when, for which case, where, with what result. */
export function AuditPage() {
  const { t, i18n } = useTranslation();
  const [problems, setProblems] = useState(false);
  const log = useAuditLog(problems);
  if (!log.data) return <LoadState isPending={log.isPending} error={log.error} onRetry={() => log.refetch()} />;
  const { rows, total, blocked, failed } = log.data;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-serif text-3xl font-semibold">{t('audit.title')}</h1>
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{t('audit.lead')}</p>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <p className="text-sm" role="status">{t('audit.summary', { total, blocked, failed })}</p>
        <div className="flex items-center gap-2">
          <Checkbox id="audit-problems" checked={problems} onCheckedChange={(v) => setProblems(v === true)} />
          <Label htmlFor="audit-problems">{t('audit.onlyProblems')}</Label>
        </div>
      </div>

      <Panel className="overflow-x-auto">
        {rows.length === 0 ? (
          <p className="p-8 text-center text-sm text-muted-foreground">{t('audit.empty')}</p>
        ) : (
          <table className="w-full min-w-[56rem] border-collapse text-sm">
            <thead>
              <tr className="bg-muted text-left">
                {(['time', 'case', 'source', 'host', 'path', 'status', 'duration'] as const).map((c) => (
                  <th key={c} scope="col" className="px-3 py-2 font-semibold">{t(`audit.columns.${c}`)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const s = auditStatus(r.status);
                return (
                  <tr key={r.id} className={cn('border-t align-top', s.kind !== 'ok' && 'bg-destructive/5')} data-status={s.kind}>
                    <td className="whitespace-nowrap px-3 py-2 tabular-nums">{dateTime(r.at, i18n.language)}</td>
                    <td className="px-3 py-2">{r.caseId ? <Link to={`/cases/${r.caseId}`} className="text-steel underline underline-offset-2">{r.caseTitle ?? r.caseId.slice(0, 8)}</Link> : '—'}</td>
                    <td className="px-3 py-2">{r.connectorId}</td>
                    <td className="px-3 py-2">{r.host}</td>
                    <td className="break-all px-3 py-2 font-mono text-xs">{r.path}</td>
                    <td className="px-3 py-2">
                      <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium', s.kind === 'ok' ? 'border-input bg-muted text-foreground' : 'border-destructive/50 bg-destructive/10 text-destructive')}>
                        {s.kind === 'ok' || s.kind === 'http' ? r.status : t(`audit.status.${s.kind}`)}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">{r.durationMs} ms</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
