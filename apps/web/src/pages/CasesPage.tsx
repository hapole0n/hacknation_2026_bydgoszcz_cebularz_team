import { useTranslation } from 'react-i18next';
import { useCases, useDemoCase } from '@/api/client';
import { EmptyState, ErrorNote, LoadState, Panel } from '@/components/primitives';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime } from '@/lib/format';
import { Link, navigate } from '@/router';

export function CasesPage() {
  const { t, i18n } = useTranslation();
  const cases = useCases();
  const demo = useDemoCase();
  const loadDemo = (variant: 'identifiers' | 'address') => demo.mutate(variant, { onSuccess: (c) => navigate(`/cases/${c.id}`) });

  const actions = (
    <>
      <Button onClick={() => navigate('/cases/new')}>{t('cases.new')}</Button>
      <Button variant="outline" onClick={() => loadDemo('identifiers')} disabled={demo.isPending}>{t('cases.loadDemo')}</Button>
    </>
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-semibold">{t('cases.title')}</h1>
          <p className="mt-1 max-w-prose text-muted-foreground">{t('cases.lead')}</p>
        </div>
        <div className="flex flex-wrap gap-2">{actions}</div>
      </div>

      <LoadState isPending={cases.isPending} error={cases.error} onRetry={() => cases.refetch()} />
      {demo.isError && <ErrorNote title={t('common.loadError')} message={demo.error.message} />}

      {cases.data && cases.data.length === 0 && (
        <EmptyState title={t('cases.emptyTitle')} action={actions}>{t('cases.emptyBody')}</EmptyState>
      )}

      {cases.data && cases.data.length > 0 && (
        <Panel className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th scope="col" className="px-4 py-2.5 font-medium">{t('cases.columns.title')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('cases.columns.identifiers')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('cases.columns.createdAt')}</th>
                <th scope="col" className="px-4 py-2.5 font-medium">{t('cases.columns.lastRun')}</th>
                <th scope="col" className="px-4 py-2.5 text-right font-medium">{t('cases.columns.runs')}</th>
              </tr>
            </thead>
            <tbody>
              {cases.data.map((c) => {
                const last = c.runs[0];
                return (
                  <tr key={c.id} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="px-4 py-3">
                      <Link to={`/cases/${c.id}`} className="font-medium text-steel underline underline-offset-2">{c.title}</Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {c.identifiers.slice(0, 3).map((i) => i.value).join(', ')}
                      {c.identifiers.length > 3 && ` ${t('cases.moreIdentifiers', { count: c.identifiers.length - 3 })}`}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatDate(c.createdAt, i18n.language)}</td>
                    <td className="px-4 py-3">
                      {last ? (
                        <Link to={`/runs/${last.id}`} className="text-steel underline underline-offset-2">
                          {formatDateTime(last.startedAt, i18n.language)} ({t(`common.status.${last.status}`)})
                        </Link>
                      ) : (
                        <span className="text-muted-foreground">{t('cases.noRuns')}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c._count.runs}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Panel>
      )}

      <div className="flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
        <p>{t('cases.demoHint')}</p>
        <Button variant="link" size="sm" className="px-0" onClick={() => loadDemo('address')} disabled={demo.isPending}>{t('cases.loadDemoAddress')}</Button>
      </div>
    </div>
  );
}
