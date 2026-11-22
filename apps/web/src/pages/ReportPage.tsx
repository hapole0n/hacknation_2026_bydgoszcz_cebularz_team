import { useTranslation } from 'react-i18next';
import { useReport } from '@/api/client';
import type { ReportBlock, ReportSection, StatementKind } from '@/api/types';
import { Screen, type ShortcutItem } from '@/components/win/chrome';
import { BevelButton, BevelDownload, BevelLink, LoadState } from '@/components/win/controls';
import { formatDateTime } from '@/lib/format';
import { useShortcuts } from '@/lib/keys';
import { downloadPdf } from '@/lib/run';
import { openDialog } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { navigate } from '@/router';

/** The label is a word, not only a colour: [FAKT] / [OBLICZENIE] / [WNIOSEK]. */
function Kind({ kind, className }: { kind: StatementKind; className?: string }) {
  return <span className={cn('inline-block shrink-0 font-semibold text-navy', className)}>[{kind}]</span>;
}

function Table({ b, section }: { b: Extract<ReportBlock, { type: 'table' }>; section: ReportSection }) {
  const weights = b.weights ?? b.columns.map(() => 1);
  const total = weights.reduce((s, w) => s + w, 0);
  return (
    <div className="my-3 overflow-x-auto">
      {b.kind && b.kind !== section.kind && <Kind kind={b.kind} className="mb-1" />}
      <table className="dt compact min-w-[560px] border border-shadow">
        <colgroup>{weights.map((w, i) => <col key={i} style={{ width: `${(w / total) * 100}%` }} />)}</colgroup>
        <thead>
          <tr>{b.columns.map((c) => <th key={c} scope="col">{c}</th>)}</tr>
        </thead>
        <tbody>
          {b.rows.map((r, ri) => (
            <tr key={ri}>
              {r.map((cell, ci) => <td key={ci} className={cn('[overflow-wrap:anywhere]', b.mono?.includes(ci) && 'text-[12px]')}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Block({ b, section }: { b: ReportBlock; section: ReportSection }) {
  switch (b.type) {
    case 'heading':
      return <h3 className="m-0 mt-5 text-[14px] font-semibold">{b.text}</h3>;
    case 'list':
      return <ul className="my-2 flex list-disc flex-col gap-1 pl-5 text-[14px]">{b.items.map((i) => <li key={i}>{i}</li>)}</ul>;
    case 'table':
      return <Table b={b} section={section} />;
    case 'text':
      return (
        <div className="my-2 flex gap-3">
          {b.kind && <Kind kind={b.kind} className="mt-0.5 self-start" />}
          <div>
            <p className="m-0 text-[14px] leading-relaxed">{b.text}</p>
            {b.basis && <p className="m-0 mt-0.5 text-[12px] italic text-sub">Podstawa: {b.basis}</p>}
          </div>
        </div>
      );
  }
}

/** The run report on screen (Polish, readable without IT knowledge); PDF and JSON are the same document. */
export function ReportPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const report = useReport(id);
  const run = report.data;
  const back = `/runs/${id}`;
  useShortcuts({ F7: () => downloadPdf(id), Esc: () => navigate(back) });
  const shortcuts: ShortcutItem[] = [
    { id: 'F1', label: t('keys.short.F1'), onClick: () => openDialog('help') },
    { id: 'F7', label: t('keys.short.F7'), onClick: () => downloadPdf(id) },
    { id: 'Esc', label: t('keys.short.back'), to: back },
  ];
  return (
    <Screen
      title={t('report.windowTitle')}
      windowLabel={t('report.taskbar')}
      runId={id}
      shortcuts={shortcuts}
      status={run ? t('report.status', { sha: run.sha256.slice(0, 12) }) : t('common.loading')}
      toolbar={
        <>
          <BevelLink to={back}>← Esc · {t('address.backToResult')}</BevelLink>
          <BevelDownload href={`/api/runs/${id}/report.pdf`} primary>F7 · {t('keys.short.F7')}</BevelDownload>
          <BevelDownload href={`/api/runs/${id}/report.json`}>{t('report.downloadJson')}</BevelDownload>
          <BevelButton onClick={() => window.print()}>{t('report.print')}</BevelButton>
        </>
      }
    >
      <p className="no-print m-0 text-[13px] text-sub-face">{t('report.polishOnly')}</p>
      {!run ? (
        <LoadState pending={report.isPending} error={report.error} onRetry={() => void report.refetch()} retryLabel={t('common.retry')} loadingLabel={t('common.loading')} errorLabel={t('common.loadError')} />
      ) : (
        <ReportBody run={run} />
      )}
    </Screen>
  );
}

function ReportBody({ run }: { run: NonNullable<ReturnType<typeof useReport>['data']> }) {
  const { doc, sha256, evidenceSha256, generatedAt } = run;
  return (
    <article lang="pl" className="sunken mx-auto w-full max-w-[920px] p-8 text-ink print:border-0 print:p-0 print:shadow-none">
      <p className="m-0 text-[13px] font-semibold text-sub">{doc.appName}</p>
      <h2 className="m-0 mt-1 font-vt text-[46px] font-normal leading-none text-navy">{doc.title}</h2>
      <p className="m-0 mt-1 text-[18px] font-semibold">{doc.caseTitle}</p>
      <dl className="m-0 mt-4 grid grid-cols-[13rem_1fr] gap-y-1 border-y border-shadow py-3 text-[14px]">
        {doc.meta.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-sub">{k}</dt>
            <dd className="m-0 [overflow-wrap:anywhere]">{v}</dd>
          </div>
        ))}
      </dl>

      <h2 className="m-0 mt-8 font-vt text-[34px] font-normal leading-none text-navy">Podsumowanie</h2>
      <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5 text-[15px] leading-relaxed">{doc.summary.map((s) => <li key={s}>{s}</li>)}</ol>

      <h2 className="m-0 mt-8 text-[16px] font-semibold">Jak czytać ten raport</h2>
      <ul className="m-0 mt-2 flex list-none flex-col gap-1.5 p-0 text-[14px]">
        {doc.legend.map((l) => (
          <li key={l.kind} className="flex items-start gap-3"><Kind kind={l.kind} className="mt-0.5" />{l.text}</li>
        ))}
      </ul>

      <nav aria-label="Spis treści" className="no-print mt-8">
        <h2 className="m-0 text-[16px] font-semibold">Spis treści</h2>
        <ol className="m-0 mt-2 flex list-none flex-col gap-0.5 p-0 text-[14px]">
          {doc.sections.map((s) => <li key={s.id}><a href={`#sec-${s.id}`} className="inline-flex min-h-[32px] items-center">{s.number}. {s.title}</a></li>)}
          <li><a href="#sec-glossary" className="inline-flex min-h-[32px] items-center">Słowniczek</a></li>
        </ol>
      </nav>

      {doc.sections.map((s) => (
        <section key={s.id} id={`sec-${s.id}`} className="mt-10 scroll-mt-4">
          <div className="flex items-center justify-between gap-3 border-b-[3px] border-double border-ink pb-1">
            <h2 className="m-0 font-vt text-[34px] font-normal leading-none text-navy">{s.number}. {s.title}</h2>
            {s.kind && <Kind kind={s.kind} />}
          </div>
          {s.blocks.map((b, i) => <Block key={i} b={b} section={s} />)}
          {s.id === 'meta' && (
            <>
              <h3 className="m-0 mt-5 text-[14px] font-semibold">Integralność raportu</h3>
              <dl className="m-0 mt-1 grid grid-cols-[13rem_1fr] gap-y-1 border-y border-shadow py-2 text-[14px]">
                <dt className="text-sub">Raport wygenerowano</dt>
                <dd className="m-0">{formatDateTime(generatedAt, 'pl')}</dd>
                <dt className="text-sub">SHA-256 danych raportu</dt>
                <dd className="m-0 text-[12px] [overflow-wrap:anywhere]" data-testid="report-sha">{sha256}</dd>
                <dt className="text-sub">SHA-256 zbioru dowodów</dt>
                <dd className="m-0 text-[12px] [overflow-wrap:anywhere]">{evidenceSha256}</dd>
              </dl>
            </>
          )}
        </section>
      ))}

      <section id="sec-glossary" className="mt-10 scroll-mt-4">
        <h2 className="m-0 border-b-[3px] border-double border-ink pb-1 font-vt text-[34px] font-normal leading-none text-navy">Słowniczek</h2>
        <dl className="m-0 mt-3 grid grid-cols-[12rem_1fr] gap-x-4 gap-y-2 text-[14px]">
          {doc.glossary.map((g) => (
            <div key={g.term} className="contents">
              <dt className="font-semibold">{g.term}</dt>
              <dd className="m-0">{g.definition}</dd>
            </div>
          ))}
        </dl>
      </section>
    </article>
  );
}
