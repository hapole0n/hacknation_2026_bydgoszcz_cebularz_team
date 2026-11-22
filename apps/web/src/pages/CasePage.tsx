import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { useCase, useDemoChange, useDemoState, useSetSchedule, useStartRun } from '@/api/client';
import { SCHEDULE_OPTIONS, type CaseDetail } from '@/api/types';
import { DEFAULT_RUN_OPTIONS, SourcePicker } from '@/components/SourcePicker';
import { Particulars } from '@/components/shared';
import { Screen, type ShortcutItem } from '@/components/win/chrome';
import { BevelButton, DataTable, EmptyState, ErrorNote, GroupBox, LoadState, VtHeading, inputClass } from '@/components/win/controls';
import { formatDate, formatDateTime } from '@/lib/format';
import { useShortcuts } from '@/lib/keys';
import { openDialog } from '@/lib/ui';
import { Link, navigate } from '@/router';

/** One line for the history table: what the comparison with the previous run found. */
function changesText(c: CaseDetail['runs'][number]['changes'], t: TFunction): string {
  if (!c) return t('changes.firstRun');
  const parts = (['addressesAdded', 'addressesRemoved', 'sourceChanges', 'scoreChanges', 'newTransactions', 'newThresholds', 'valuationCompleted'] as const).filter((k) => (c[k] ?? 0) > 0).map((k) => t(`changes.summaryParts.${k}`, { n: c[k] }));
  return parts.length > 0 ? parts.join('; ') : t('changes.noChanges');
}

/** One case: its particulars, the history of analyses, monitoring and the button that runs a new analysis. */
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
  const canRun = !startRun.isPending && options.connectors.length > 0;
  useShortcuts({ F5: canRun ? run : undefined, Esc: () => navigate('/cases') });

  const c = kase.data;
  const shortcuts: ShortcutItem[] = [
    { id: 'F1', label: t('keys.short.F1'), onClick: () => openDialog('help') },
    { id: 'F2', label: t('keys.short.F2'), to: '/' },
    { id: 'F4', label: t('keys.short.F4'), to: '/cases' },
    { id: 'F5', label: t('keys.short.F5'), onClick: canRun ? run : undefined },
    { id: 'F8', label: t('keys.short.F8'), to: '/audit' },
    { id: 'Esc', label: t('keys.short.Esc'), to: '/cases' },
  ];

  return (
    <Screen
      title={c ? t('case.windowTitle', { signature: c.signature }) : t('common.loading')}
      windowLabel={c?.signature ?? '…'}
      shortcuts={shortcuts}
      status={startRun.isPending ? t('start.busy') : t('start.ready')}
      toolbar={
        <>
          <BevelButton onClick={() => navigate('/')}>F2 · {t('keys.short.F2')}</BevelButton>
          <BevelButton primary disabled={!canRun} onClick={run}>
            F5 · {c && c.runs.length > 0 ? t('case.runAgain') : t('case.runNow')}
          </BevelButton>
          <BevelButton onClick={() => navigate('/cases')}>Esc · {t('keys.short.F4')}</BevelButton>
        </>
      }
    >
      {!c ? (
        <LoadState pending={kase.isPending} error={kase.error} onRetry={() => void kase.refetch()} retryLabel={t('common.retry')} loadingLabel={t('common.loading')} errorLabel={t('common.loadError')} />
      ) : (
        <>
          <div className="flex flex-col gap-2.5">
            <VtHeading>&gt; {c.signature}</VtHeading>
            <p className="m-0 text-[15px] font-semibold">{c.title}</p>
            <Particulars
              items={[
                { label: t('case.basis'), value: c.basis ?? '—' },
                { label: t('case.createdAt'), value: `${formatDate(c.createdAt, lang)}; ${t('case.createdBy').toLowerCase()}: ${c.createdBy}` },
              ]}
            />
          </div>

          <div className="flex flex-wrap items-start gap-[22px]">
            <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-[22px]">
              <GroupBox id="c-ident" title={t('case.identifiers')}>
                <div className="sunken py-1.5 text-[15px]">
                  {c.identifiers.map((i) => (
                    <div key={i.id} className="grid grid-cols-[190px_minmax(0,1fr)] gap-3 px-3.5 py-[5px]">
                      <span className="font-semibold text-navy">[{t(`identifierTypes.${i.type}`).toUpperCase()}]</span>
                      <span className="[overflow-wrap:anywhere]">{i.value}</span>
                    </div>
                  ))}
                </div>
              </GroupBox>

              <GroupBox id="c-hist" title={t('case.history')}>
                {c.runs.length === 0 ? (
                  <EmptyState title={t('case.noRuns')} />
                ) : (
                  <DataTable minWidth={720} caption={t('case.history')}>
                    <thead>
                      <tr>
                        <th scope="col">{t('case.columns.startedAt')}</th>
                        <th scope="col">{t('case.columns.status')}</th>
                        <th scope="col">{t('case.columns.trigger')}</th>
                        <th scope="col">{t('case.columns.changes')}</th>
                        <th scope="col">{t('case.columns.rules')}</th>
                        <th scope="col">
                          <span className="sr-only">{t('case.columns.open')}</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {c.runs.map((r) => (
                        <tr key={r.id}>
                          <td className="whitespace-nowrap">{formatDateTime(r.startedAt, lang)}</td>
                          <td>{t(`common.status.${r.status}`)}</td>
                          <td>{t(`case.trigger.${r.trigger}`)}</td>
                          <td className="text-sub">{changesText(r.changes, t)}</td>
                          <td>{r.rulesVersion}</td>
                          <td className="text-right">
                            <Link to={`/runs/${r.id}`} className="font-semibold">
                              {t('case.open')}
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </DataTable>
                )}
              </GroupBox>
            </div>

            <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-[22px]">
              <GroupBox id="c-monitor" title={t('case.scheduleTitle')}>
                <p className="m-0 mb-2 text-[13px] leading-relaxed">{t('case.scheduleHint')}</p>
                <label htmlFor="schedule" className="mb-1 block text-[14px] font-semibold">
                  {t('case.scheduleLabel')}
                </label>
                <select
                  id="schedule"
                  className={inputClass}
                  value={c.scheduleEveryMin ?? ''}
                  disabled={setSchedule.isPending}
                  onChange={(e) => setSchedule.mutate(e.target.value === '' ? null : Number(e.target.value))}
                >
                  {SCHEDULE_OPTIONS.map((m) => (
                    <option key={m ?? 'off'} value={m ?? ''}>
                      {t(`case.schedule.${m ?? 'off'}`)}
                    </option>
                  ))}
                </select>
                <p className="m-0 mt-2 text-[13px]" aria-live="polite">
                  {c.scheduleEveryMin && c.nextRunAt ? `${t('case.nextRun')}: ${formatDateTime(c.nextRunAt, lang)}` : t('case.nextRunOff')}
                </p>
                {setSchedule.isError && <ErrorNote title={t('form.errors.server')} message={setSchedule.error.message} />}
              </GroupBox>

              {c.createdBy === 'demo' && demoState.data && (
                <GroupBox id="c-demo" title={t('case.demoChange.title')}>
                  <p className="m-0 mb-2 text-[13px] leading-relaxed">{demoState.data.sandboxVersion === 2 ? t('case.demoChange.changed') : t('case.demoChange.original')}</p>
                  <div className="flex flex-wrap gap-2">
                    <BevelButton disabled={demoChange.isPending || demoState.data.sandboxVersion === 2} onClick={() => demoChange.mutate(2)}>
                      {t('case.demoChange.simulate')}
                    </BevelButton>
                    <BevelButton disabled={demoChange.isPending || demoState.data.sandboxVersion === 1} onClick={() => demoChange.mutate(1)}>
                      {t('case.demoChange.undo')}
                    </BevelButton>
                  </div>
                </GroupBox>
              )}
            </div>
          </div>

          <SourcePicker value={options} onChange={setOptions} />
          <div>
            <BevelButton primary onClick={run} disabled={!canRun}>
              {startRun.isPending ? t('form.running') : c.runs.length > 0 ? t('case.runAgain') : t('case.runNow')}
            </BevelButton>
          </div>
          {startRun.isError && <ErrorNote title={t('form.errors.server')} message={startRun.error.message} />}
        </>
      )}
    </Screen>
  );
}
