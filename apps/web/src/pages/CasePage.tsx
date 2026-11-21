import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useCase, useDemoChange, useDemoState, useSetSchedule, useStartRun } from '@/api/client';
import { SCHEDULE_OPTIONS, type CaseDetail } from '@/api/types';
import { EmptyState, ErrorNote, LoadState, Panel, Particulars } from '@/components/primitives';
import { DEFAULT_RUN_OPTIONS, SourcePicker } from '@/components/SourcePicker';
import { Button } from '@/components/ui/button';
import { formatDate, formatDateTime } from '@/lib/format';
import { Link, navigate } from '@/router';

/** One line for the history table: what the comparison with the previous run found. */
function changesText(c: CaseDetail['runs'][number]['changes'], t: TFunction): string {
  if (!c) return t('changes.firstRun');
  const parts = (['addressesAdded', 'sourceChanges', 'scoreChanges', 'newTransactions', 'newThresholds'] as const).filter((k) => c[k] > 0).map((k) => t(`changes.summaryParts.${k}`, { n: c[k] }));
  return parts.length > 0 ? parts.join('; ') : t('changes.noChanges');
}

export function CasePage({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const kase = useCase(id);
  const startRun = useStartRun();
  const setSchedule = useSetSchedule(id);
  const demoState = useDemoState();
  const demoChange = useDemoChange();
  const [options, setOptions] = useState(DEFAULT_RUN_OPTIONS);
  const lang = i18n.language;

  const run = () => startRun.mutate({ caseId: id, options }, { onSuccess: (r) => navigate(`/runs/${r.run.id}`) });

  if (!kase.data) return <LoadState isPending={kase.isPending} error={kase.error} onRetry={() => kase.refetch()} />;
  const c = kase.data;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/" className="text-sm text-steel underline underline-offset-2">{t('common.back')}: {t('cases.title')}</Link>
        <h1 className="mt-2 font-serif text-3xl font-semibold">{c.title}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t('case.createdAt')} {formatDate(c.createdAt, lang)}; {t('case.createdBy').toLowerCase()}: {c.createdBy}
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_24rem]">
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-base font-semibold">{t('case.identifiers')}</h2>
            <Panel className="p-4">
              <Particulars items={c.identifiers.map((i) => ({ label: t(`identifierTypes.${i.type}`), value: <span className="font-medium">{i.value}</span> }))} />
            </Panel>
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold">{t('case.history')}</h2>
            {c.runs.length === 0 ? (
              <EmptyState title={t('case.noRuns')} />
            ) : (
              <Panel className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-muted-foreground">
                      <th scope="col" className="px-4 py-2.5 font-medium">{t('case.columns.startedAt')}</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">{t('case.columns.status')}</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">{t('case.columns.trigger')}</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">{t('case.columns.changes')}</th>
                      <th scope="col" className="px-4 py-2.5 font-medium">{t('case.columns.rules')}</th>
                      <th scope="col" className="px-4 py-2.5 font-medium"><span className="sr-only">{t('case.columns.open')}</span></th>
                    </tr>
                  </thead>
                  <tbody>
                    {c.runs.map((r) => (
                      <tr key={r.id} className="border-b last:border-b-0">
                        <td className="px-4 py-3 tabular-nums">{formatDateTime(r.startedAt, lang)}</td>
                        <td className="px-4 py-3">{t(`common.status.${r.status}`)}</td>
                        <td className="px-4 py-3">{t(`case.trigger.${r.trigger}`)}</td>
                        <td className="px-4 py-3 text-muted-foreground">{changesText(r.changes, t)}</td>
                        <td className="px-4 py-3 tabular-nums">{r.rulesVersion}</td>
                        <td className="px-4 py-3 text-right">
                          <Link to={`/runs/${r.id}`} className="text-steel underline underline-offset-2">{t('case.open')}</Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
            )}
          </section>
        </div>

        <aside className="space-y-5">
          <Panel className="space-y-2 p-4">
            <h2 className="text-sm font-semibold">{t('case.scheduleTitle')}</h2>
            <p className="text-sm text-muted-foreground">{t('case.scheduleHint')}</p>
            <label className="block text-sm">
              <span className="mr-2">{t('case.scheduleLabel')}</span>
              <select
                className="rounded-md border bg-background px-2 py-1.5 text-sm"
                value={c.scheduleEveryMin ?? ''}
                disabled={setSchedule.isPending}
                onChange={(e) => setSchedule.mutate(e.target.value === '' ? null : Number(e.target.value))}
              >
                {SCHEDULE_OPTIONS.map((m) => (
                  <option key={m ?? 'off'} value={m ?? ''}>{t(`case.schedule.${m ?? 'off'}`)}</option>
                ))}
              </select>
            </label>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              {c.scheduleEveryMin && c.nextRunAt ? `${t('case.nextRun')}: ${formatDateTime(c.nextRunAt, lang)}` : t('case.nextRunOff')}
            </p>
            {setSchedule.isError && <ErrorNote title={t('form.errors.server')} message={setSchedule.error.message} />}
          </Panel>
          {c.createdBy === 'demo' && demoState.data && (
            <Panel className="space-y-2 border-dashed p-4">
              <h2 className="text-sm font-semibold">{t('case.demoChange.title')}</h2>
              <p className="text-sm text-muted-foreground">{demoState.data.sandboxVersion === 2 ? t('case.demoChange.changed') : t('case.demoChange.original')}</p>
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" size="sm" disabled={demoChange.isPending || demoState.data.sandboxVersion === 2} onClick={() => demoChange.mutate(2)}>
                  {t('case.demoChange.simulate')}
                </Button>
                <Button variant="ghost" size="sm" disabled={demoChange.isPending || demoState.data.sandboxVersion === 1} onClick={() => demoChange.mutate(1)}>
                  {t('case.demoChange.undo')}
                </Button>
              </div>
            </Panel>
          )}
          <SourcePicker value={options} onChange={setOptions} />
          <Button onClick={run} disabled={startRun.isPending || options.connectors.length === 0}>
            {startRun.isPending ? t('form.running') : c.runs.length > 0 ? t('case.runAgain') : t('case.runNow')}
          </Button>
          {startRun.isError && <ErrorNote title={t('form.errors.server')} message={startRun.error.message} />}
        </aside>
      </div>
    </div>
  );
}
