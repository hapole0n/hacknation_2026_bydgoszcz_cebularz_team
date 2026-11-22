import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchCase, putSchedule, useCases, useConnectors, useCreateCase, useDemoCase, useHealth, useStartRun } from '@/api/client';
import { IDENTIFIER_TYPES, type IdentifierType } from '@/api/types';
import { ResultLine } from '@/components/shared';
import { DEFAULT_RUN_OPTIONS, SYNTHETIC_SOURCE, SourcePicker } from '@/components/SourcePicker';
import { Screen, type ShortcutItem } from '@/components/win/chrome';
import { BevelButton, CheckField, DataTable, ErrorNote, GroupBox, StepList, SunkenPanel, inputClass } from '@/components/win/controls';
import { formatDateTime } from '@/lib/format';
import { deriveTitle, parseIdentifiers } from '@/lib/identifiers';
import { openDialog } from '@/lib/ui';
import { navigate, Link } from '@/router';

/** The start screen: one field for every identifier (the kind is detected), the proceedings number, the sources, and the register of cases. */
export function NewCasePage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [query, setQuery] = useState('');
  const [basis, setBasis] = useState('');
  const [title, setTitle] = useState('');
  const [overrides, setOverrides] = useState<Partial<Record<string, IdentifierType>>>({});
  const [options, setOptions] = useState(DEFAULT_RUN_OPTIONS);
  const [monitor, setMonitor] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const connectors = useConnectors().data ?? [];
  const health = useHealth().data;
  const cases = useCases();
  const createCase = useCreateCase();
  const startRun = useStartRun();
  const demo = useDemoCase();
  const busy = createCase.isPending || startRun.isPending || demo.isPending;

  const parsed = useMemo(() => parseIdentifiers(query, overrides), [query, overrides]);
  const live = connectors.filter((c) => c.id !== SYNTHETIC_SOURCE);
  const liveOn = live.length > 0 && live.every((c) => options.connectors.includes(c.id));
  const setLive = (on: boolean) =>
    setOptions((o) => ({ ...o, connectors: on ? [...new Set([...o.connectors, ...live.map((c) => c.id)])] : o.connectors.filter((c) => c === SYNTHETIC_SOURCE) }));

  async function submit(run: boolean) {
    if (parsed.length === 0) return setProblem(t('form.errors.identifiers'));
    if (parsed.some((p) => p.error)) return setProblem(t('form.errors.invalid'));
    if (run && options.connectors.length === 0) return setProblem(t('form.errors.connectors'));
    setProblem(null);
    try {
      const kase = await createCase.mutateAsync({ title: title.trim() || deriveTitle(parsed), basis: basis.trim() || undefined, identifiers: parsed.map((p) => ({ type: p.type, value: p.value })) });
      if (monitor) await putSchedule(kase.id, 1440);
      if (!run) return navigate(`/cases/${kase.id}`);
      const result = await startRun.mutateAsync({ caseId: kase.id, options });
      navigate(`/runs/${result.run.id}`);
    } catch {
      /* shown below from the mutation state */
    }
  }

  /** The demo case: opens its latest analysis, or runs the first one (synthetic sources only). */
  async function openDemo(variant: 'identifiers' | 'address') {
    try {
      const kase = await demo.mutateAsync(variant);
      const detail = await fetchCase(kase.id);
      const last = detail.runs[0];
      if (last) return navigate(`/runs/${last.id}`);
      const result = await startRun.mutateAsync({ caseId: kase.id, options: DEFAULT_RUN_OPTIONS });
      navigate(`/runs/${result.run.id}`);
    } catch {
      /* shown below */
    }
  }

  const shortcuts: ShortcutItem[] = [
    { id: 'F1', label: t('keys.short.F1'), onClick: () => openDialog('help') },
    { id: 'F2', label: t('keys.short.F2'), to: '/' },
    { id: 'F4', label: t('keys.short.F4'), to: '/cases' },
    { id: 'F8', label: t('keys.short.F8'), to: '/audit' },
    { id: 'F10', label: t('keys.short.F10'), onClick: () => openDialog('settings') },
  ];
  const serverError = createCase.error ?? startRun.error ?? demo.error;
  const recent = (cases.data ?? []).slice(0, 5);

  return (
    <Screen
      title={t('start.windowTitle')}
      windowLabel={t('start.windowTitle')}
      shortcuts={shortcuts}
      status={busy ? t('start.busy') : t('start.ready')}
      toolbar={
        <>
          <BevelButton pressed onClick={() => navigate('/')} aria-current="page">F2 · {t('keys.short.F2')}</BevelButton>
          <BevelButton onClick={() => navigate('/cases')}>F4 · {t('keys.short.F4')}</BevelButton>
          <BevelButton onClick={() => navigate('/audit')}>F8 · {t('keys.short.F8')}</BevelButton>
        </>
      }
    >
      <SunkenPanel className="px-4 py-3 text-[14px] leading-[1.65]">
        <div>
          <b>{t('start.console1Name')}</b> — {t('start.console1')}
        </div>
        <div>{t('start.console2')}</div>
        <div>{t('start.console3', { rules: health?.rulesVersion ?? '…' })}</div>
        <div>&gt; {t('start.systemReady')}</div>
      </SunkenPanel>

      <form
        className="flex flex-col gap-[22px]"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void submit(true);
        }}
      >
        <div className="flex flex-col gap-2.5">
          <h1 className="m-0 font-vt text-[50px] font-normal leading-none text-navy">
            <label htmlFor="q">
              &gt; {t('start.enter')}
              <span aria-hidden="true" className="ml-1.5 inline-block h-[0.85em] w-[0.5em] bg-navy align-[-0.08em]" />
            </label>
          </h1>
          <p className="m-0 max-w-[800px] text-[15px] leading-relaxed">{t('start.lead')}</p>
        </div>

        <div className="flex flex-wrap items-stretch gap-2.5">
          <input id="q" type="text" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('start.placeholder')} autoComplete="off" spellCheck={false} className={`${inputClass} min-h-[52px] flex-[1_1_360px] text-[18px]`} />
          <BevelButton type="submit" primary disabled={busy} className="min-h-[52px] px-[22px] text-[16px]">
            {t('start.submit')}
          </BevelButton>
        </div>

        <div className="flex flex-wrap items-start gap-x-[22px] gap-y-[18px]">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-1.5">
            <span className="text-[14px] font-semibold">{t('start.recognised', { count: parsed.length })}</span>
            <SunkenPanel className="py-1.5 text-[15px]" aria-live="polite">
              {parsed.map((p) => (
                <div key={p.value} className="grid grid-cols-[190px_minmax(0,1fr)] gap-3 px-3.5 py-[5px]">
                  <span className="font-semibold text-navy">[{t(`identifierTypes.${p.type}`).toUpperCase()}]</span>
                  <span className="[overflow-wrap:anywhere]">
                    {p.value}
                    {p.error && <span className="ml-2 font-semibold text-alert">— {t(`form.errors.${p.error}`)}</span>}
                  </span>
                </div>
              ))}
              {parsed.length === 0 && <div className="px-3.5 py-[5px] text-sub">&gt; {t('start.none')}</div>}
            </SunkenPanel>
          </div>
          <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-1.5">
            <label htmlFor="podstawa" className="text-[14px] font-semibold">
              {t('start.basis')}
            </label>
            <input id="podstawa" type="text" value={basis} maxLength={200} onChange={(e) => setBasis(e.target.value)} placeholder={t('start.basisPlaceholder')} autoComplete="off" className={inputClass} />
            <span className="text-[12px] leading-normal">{t('start.basisHint')}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-x-[26px]">
          <CheckField id="opt-synthetic" checked={options.connectors.includes(SYNTHETIC_SOURCE)} onChange={(v) => setOptions((o) => ({ ...o, connectors: v ? [...new Set([...o.connectors, SYNTHETIC_SOURCE])] : o.connectors.filter((c) => c !== SYNTHETIC_SOURCE) }))}>
            {t('start.optSynthetic')}
          </CheckField>
          <CheckField id="opt-live" checked={liveOn} onChange={setLive}>
            {t('start.optLive', { count: live.length })}
          </CheckField>
          <CheckField id="opt-chain" checked={options.chain === 'live'} onChange={(v) => setOptions((o) => ({ ...o, chain: v ? 'live' : 'fixture' }))}>
            {t('start.optChain')}
          </CheckField>
          <CheckField id="opt-monitor" checked={monitor} onChange={setMonitor}>
            {t('start.optMonitor')}
          </CheckField>
        </div>
        {(liveOn || options.chain === 'live') && <p className="m-0 max-w-[900px] text-[13px] leading-relaxed text-alert">{t('start.liveWarning')}</p>}

        <details className="group">
          <summary className="inline-flex min-h-[44px] cursor-pointer items-center text-[14px] font-semibold text-navy underline">{t('start.advanced')}</summary>
          <div className="mt-2.5 flex flex-col gap-[22px]">
            <GroupBox id="adv-title" title={t('start.advancedTitle')}>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="case-title" className="text-[14px] font-semibold">
                  {t('form.caseTitle')}
                </label>
                <input id="case-title" className={inputClass} value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} placeholder={deriveTitle(parsed) || t('form.caseTitlePlaceholder')} />
                <span className="text-[12px] text-sub">{t('start.titleHint')}</span>
              </div>
            </GroupBox>
            {parsed.length > 0 && (
              <GroupBox id="adv-types" title={t('start.typesTitle')}>
                <p className="m-0 mb-2 max-w-[80ch] text-[13px] leading-relaxed">{t('start.typesHint')}</p>
                <div className="flex flex-col gap-1.5">
                  {parsed.map((p) => (
                    <div key={p.value} className="grid grid-cols-[minmax(0,1fr)_220px] items-center gap-3">
                      <span className="[overflow-wrap:anywhere]">{p.value}</span>
                      <select aria-label={`${t('form.type')}: ${p.value}`} className={`${inputClass} min-h-[44px]`} value={p.type} onChange={(e) => setOverrides((o) => ({ ...o, [p.value]: e.target.value as IdentifierType }))}>
                        {IDENTIFIER_TYPES.map((ty) => (
                          <option key={ty} value={ty}>
                            {t(`identifierTypes.${ty}`)}
                            {ty === p.detected ? ` (${t('start.detected')})` : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </GroupBox>
            )}
            <SourcePicker value={options} onChange={setOptions} />
            <div>
              <BevelButton disabled={busy} onClick={() => void submit(false)}>
                {t('form.submitSave')}
              </BevelButton>
            </div>
          </div>
        </details>
      </form>

      {problem && <ErrorNote title={problem} />}
      {serverError && <ErrorNote title={t('form.errors.server')} message={serverError.message} />}

      <p className="m-0 flex flex-wrap items-center gap-x-4 text-[14px] leading-relaxed">
        <span>
          {t('start.demoLead')}{' '}
          <button type="button" className="min-h-[44px] cursor-pointer font-[inherit] font-semibold text-navy underline" onClick={() => void openDemo('identifiers')} disabled={busy}>
            {t('start.demoOpen')}
          </button>{' '}
          — {t('start.demoNote')}
        </span>
        <button type="button" className="min-h-[44px] cursor-pointer font-[inherit] font-semibold text-navy underline" onClick={() => void openDemo('address')} disabled={busy}>
          {t('cases.loadDemoAddress')}
        </button>
      </p>

      <div className="flex flex-wrap items-start gap-[22px]">
        <GroupBox id="przebieg" title={t('start.flow')} className="flex-[1_1_340px]">
          <StepList current={busy ? 1 : 0} steps={[t('start.step1'), t('start.step2'), t('start.step3', { rules: health?.rulesVersion ?? '…' }), t('start.step4')]} />
        </GroupBox>

        <GroupBox id="rejestr" title={t('start.register')} className="min-w-0 flex-[999_1_600px]">
          {recent.length === 0 ? (
            <p className="sunken m-0 px-3.5 py-3 text-[14px] text-sub">{t('cases.emptyBody')}</p>
          ) : (
            <DataTable minWidth={700}>
              <thead>
                <tr>
                  <th>{t('cases.columns.signature')}</th>
                  <th>{t('cases.columns.person')}</th>
                  <th>{t('cases.columns.lastRun')}</th>
                  <th>{t('cases.columns.result')}</th>
                  <th>{t('cases.columns.monitoring')}</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((c) => {
                  const last = c.runs[0];
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link to={last ? `/runs/${last.id}` : `/cases/${c.id}`} className="font-semibold">
                          {c.signature}
                        </Link>
                      </td>
                      <td>{c.title}</td>
                      <td>{last ? formatDateTime(last.startedAt, lang) : <span className="text-sub">{t('cases.noRuns')}</span>}</td>
                      <td>
                        <ResultLine result={c.result} />
                      </td>
                      <td>{c.scheduleEveryMin ? t(`case.scheduleShort.${c.scheduleEveryMin}`) : t('case.schedule.offShort')}</td>
                    </tr>
                  );
                })}
              </tbody>
            </DataTable>
          )}
          <p className="m-0 mt-2 text-[13px]">
            <Link to="/cases">{t('start.registerAll')}</Link>
          </p>
        </GroupBox>
      </div>
    </Screen>
  );
}

