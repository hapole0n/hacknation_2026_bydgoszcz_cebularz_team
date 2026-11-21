import { useTranslation } from 'react-i18next';
import { useReport } from '@/api/client';
import type { ReportBlock, ReportSection, StatementKind } from '@/api/types';
import { LoadState, Panel } from '@/components/primitives';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { Link } from '@/router';

const KIND_STYLE: Record<StatementKind, string> = { FAKT: 'bg-steel', OBLICZENIE: 'bg-band-very-high', WNIOSEK: 'bg-band-medium' };

/** The label is a word, not only a colour: FAKT / OBLICZENIE / WNIOSEK. */
function Kind({ kind, className }: { kind: StatementKind; className?: string }) {
  return <span className={cn('inline-block shrink-0 rounded-sm px-2 py-0.5 text-[0.7rem] font-semibold tracking-wide text-white', KIND_STYLE[kind], className)}>{kind}</span>;
}

function Table({ b, section }: { b: Extract<ReportBlock, { type: 'table' }>; section: ReportSection }) {
  const weights = b.weights ?? b.columns.map(() => 1);
  const total = weights.reduce((s, w) => s + w, 0);
  return (
    <div className="my-3 overflow-x-auto">
      {b.kind && b.kind !== section.kind && <Kind kind={b.kind} className="mb-1" />}
      <table className="w-full border-collapse text-sm">
        <colgroup>{weights.map((w, i) => <col key={i} style={{ width: `${(w / total) * 100}%` }} />)}</colgroup>
        <thead>
          <tr className="bg-muted text-left">{b.columns.map((c) => <th key={c} scope="col" className="px-2 py-1.5 font-semibold">{c}</th>)}</tr>
        </thead>
        <tbody>
          {b.rows.map((r, ri) => (
            <tr key={ri} className="border-b align-top">
              {r.map((cell, ci) => <td key={ci} className={cn('px-2 py-1.5', b.mono?.includes(ci) ? 'break-all font-mono text-xs' : 'break-words')}>{cell}</td>)}
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
      return <h3 className="mt-5 text-sm font-semibold">{b.text}</h3>;
    case 'list':
      return <ul className="my-2 list-disc space-y-1 pl-5 text-sm">{b.items.map((i) => <li key={i}>{i}</li>)}</ul>;
    case 'table':
      return <Table b={b} section={section} />;
    case 'text':
      return (
        <div className="my-2 flex gap-3">
          {b.kind && <Kind kind={b.kind} className="mt-0.5 self-start" />}
          <div>
            <p className="text-sm">{b.text}</p>
            {b.basis && <p className="mt-0.5 text-xs italic text-muted-foreground">Podstawa: {b.basis}</p>}
          </div>
        </div>
      );
  }
}

/** The run report on screen (Polish, readable without IT knowledge); PDF and JSON are the same document. */
export function ReportPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const report = useReport(id);
  if (!report.data) return <LoadState isPending={report.isPending} error={report.error} onRetry={() => report.refetch()} />;
  const { doc, sha256, evidenceSha256, generatedAt } = report.data;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link to={`/runs/${id}`} className="text-sm text-steel underline underline-offset-2">{t('report.back')}</Link>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild><a href={`/api/runs/${id}/report.pdf`} download>{t('report.downloadPdf')}</a></Button>
          <Button asChild variant="outline"><a href={`/api/runs/${id}/report.json`} download>{t('report.downloadJson')}</a></Button>
          <Button variant="outline" onClick={() => window.print()}>{t('report.print')}</Button>
        </div>
      </div>
      <p className="text-sm text-muted-foreground print:hidden">{t('report.polishOnly')}</p>

      <Panel className="mx-auto max-w-4xl p-8 print:border-0 print:p-0">
        <article lang="pl">
          <p className="text-sm font-semibold text-muted-foreground">{doc.appName}</p>
          <h1 className="font-serif text-4xl font-semibold">{doc.title}</h1>
          <p className="mt-1 text-xl">{doc.caseTitle}</p>
          <dl className="mt-4 grid grid-cols-[10rem_1fr] gap-y-1 border-y py-3 text-sm">
            {doc.meta.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="break-all">{v}</dd>
              </div>
            ))}
          </dl>

          <h2 className="mt-8 font-serif text-2xl font-semibold">Podsumowanie</h2>
          <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-base">{doc.summary.map((s) => <li key={s}>{s}</li>)}</ol>

          <h2 className="mt-8 font-serif text-xl font-semibold">Jak czytać ten raport</h2>
          <ul className="mt-2 space-y-1.5 text-sm">
            {doc.legend.map((l) => (
              <li key={l.kind} className="flex items-start gap-3"><Kind kind={l.kind} className="mt-0.5" />{l.text}</li>
            ))}
          </ul>

          <nav aria-label="Spis treści" className="mt-8 print:hidden">
            <h2 className="font-serif text-xl font-semibold">Spis treści</h2>
            <ol className="mt-2 space-y-0.5 text-sm">
              {doc.sections.map((s) => <li key={s.id}><a href={`#sec-${s.id}`} className="text-steel underline underline-offset-2">{s.number}. {s.title}</a></li>)}
              <li><a href="#sec-glossary" className="text-steel underline underline-offset-2">Słowniczek</a></li>
            </ol>
          </nav>

          {doc.sections.map((s) => (
            <section key={s.id} id={`sec-${s.id}`} className="mt-10 scroll-mt-4">
              <div className="flex items-center justify-between gap-3 border-b pb-1">
                <h2 className="font-serif text-2xl font-semibold">{s.number}. {s.title}</h2>
                {s.kind && <Kind kind={s.kind} />}
              </div>
              {s.blocks.map((b, i) => <Block key={i} b={b} section={s} />)}
              {s.id === 'meta' && (
                <>
                  <h3 className="mt-5 text-sm font-semibold">Integralność raportu</h3>
                  <dl className="mt-1 grid grid-cols-[12rem_1fr] gap-y-1 border-y py-2 text-sm">
                    <dt className="text-muted-foreground">Raport wygenerowano</dt>
                    <dd>{formatDateTime(generatedAt, 'pl')}</dd>
                    <dt className="text-muted-foreground">SHA-256 danych raportu</dt>
                    <dd className="break-all font-mono text-xs" data-testid="report-sha">{sha256}</dd>
                    <dt className="text-muted-foreground">SHA-256 zbioru dowodów</dt>
                    <dd className="break-all font-mono text-xs">{evidenceSha256}</dd>
                  </dl>
                </>
              )}
            </section>
          ))}

          <section id="sec-glossary" className="mt-10 scroll-mt-4">
            <h2 className="border-b pb-1 font-serif text-2xl font-semibold">Słowniczek</h2>
            <dl className="mt-3 grid grid-cols-[11rem_1fr] gap-x-4 gap-y-2 text-sm">
              {doc.glossary.map((g) => (
                <div key={g.term} className="contents">
                  <dt className="font-semibold">{g.term}</dt>
                  <dd>{g.definition}</dd>
                </div>
              ))}
            </dl>
          </section>
        </article>
      </Panel>
    </div>
  );
}
