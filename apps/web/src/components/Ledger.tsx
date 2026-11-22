import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecide } from '@/api/client';
import type { Band, BreakdownEntry, Decision, EvidenceDto, LinkDto } from '@/api/types';
import { AiSuggestions } from '@/components/AiSuggestions';
import { BandRange } from '@/components/shared';
import { BevelButton, ErrorNote, inputClass } from '@/components/win/controls';
import { formatDateTime, loc, shortHash, signed } from '@/lib/format';
import { ANALYST_KEY } from '@/lib/ui';
import { cn } from '@/lib/utils';

/** One piece of evidence: where it came from, when, the hash of its full content, and the stored snippet. */
export function EvidenceItem({ evidence, context }: { evidence: EvidenceDto; context?: string }) {
  const { t, i18n } = useTranslation();
  const m = evidence.metaJson;
  return (
    <div className="flex flex-col gap-1 text-[13px] leading-relaxed">
      <p className="m-0 font-semibold">
        {m.platform} <span className="font-normal text-sub">({t(`sourceTypes.${evidence.sourceType}`, { defaultValue: evidence.sourceType })})</span>
      </p>
      {evidence.url && (
        <p className="m-0 [overflow-wrap:anywhere]">
          <a href={evidence.url} target="_blank" rel="noopener noreferrer">
            {evidence.url}
          </a>
        </p>
      )}
      <p className="m-0 text-sub">
        {t('evidence.columns.fetched')}: {formatDateTime(evidence.fetchedAt, i18n.language)}
        {m.publishedAt && ` — ${t('evidence.columns.published')}: ${m.publishedAt}`}
        {m.author && ` — ${t('evidence.author')}: ${m.author.handle ?? m.author.name}`}
      </p>
      <p className="m-0 text-sub" title={evidence.sha256}>
        SHA-256: {shortHash(evidence.sha256)}
      </p>
      <blockquote className="m-0 whitespace-pre-wrap border-l-2 border-shadow pl-3 [overflow-wrap:anywhere]">{context ?? evidence.snippet}</blockquote>
      <AiSuggestions evidence={evidence} />
    </div>
  );
}

/** [FAKT] = what a source or the chain says; [OBLICZENIE] = what the rules computed. */
const kindTag = (e: BreakdownEntry) => (e.kind === 'base' || e.kind === 'chain' ? 'fact' : 'calc');

/**
 * The score as an itemised statement: every rule on its own line with its reason, points, kind of statement and the
 * evidence behind it; the total under a double rule. `clamp` is not a line but the note under the total.
 */
export function Ledger({ entries, total, band, evidence, hints }: { entries: BreakdownEntry[]; total: number; band: Band; evidence: Map<string, EvidenceDto>; hints?: { pl: string; en: string }[] }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const lines = entries.filter((e) => e.kind !== 'clamp');
  const raw = lines.reduce((s, e) => s + e.delta, 0);
  const clamped = entries.some((e) => e.kind === 'clamp') && raw !== total;
  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-semibold text-navy">
        {t('result.scoreLine', { score: total })} — <BandRange band={band} />
      </span>
      <div className="flex flex-col border-t-[3px] border-double border-ink">
        {lines.map((e, i) => (
          <div key={`${e.ruleId}-${i}`} className="border-b border-dashed border-rule py-[7px]">
            <div className="grid grid-cols-[44px_minmax(0,1fr)_auto] items-baseline gap-2">
              <span className={cn('font-bold', e.delta < 0 ? 'text-alert' : 'text-navy')}>{signed(e.delta)}</span>
              <span className="leading-snug">
                {lang === 'en' ? e.reasonEn : e.reasonPl}
                <span className="block text-[11px] text-sub [overflow-wrap:anywhere]">{e.ruleId}</span>
              </span>
              <span className="text-[12px] font-semibold text-navy">[{t(`statement.${kindTag(e)}`)}]</span>
            </div>
            {e.evidenceIds.length > 0 && (
              <details className="mt-1 pl-[52px]">
                <summary className="cursor-pointer text-[12px] font-semibold text-navy underline">{t('score.evidenceCount', { count: e.evidenceIds.length })}</summary>
                <ul className="m-0 mt-2 flex list-none flex-col gap-3 border-l border-shadow p-0 pl-3">
                  {e.evidenceIds.map((id) => {
                    const ev = evidence.get(id);
                    return ev && <li key={id}><EvidenceItem evidence={ev} /></li>;
                  })}
                </ul>
              </details>
            )}
            {e.kind === 'chain' && e.evidenceIds.length === 0 && <p className="m-0 pl-[52px] text-[12px] text-sub">{t('score.noEvidence')}</p>}
          </div>
        ))}
        <div className="flex justify-between gap-2.5 py-2 font-bold">
          <span>{t('result.total')}</span>
          <span>= {clamped ? t('result.totalClamped', { raw, total }) : total}</span>
        </div>
      </div>
      {hints && hints.length > 0 ? (
        hints.map((h) => (
          <p key={h.pl} className="m-0 border border-dashed border-navy px-2.5 py-2 leading-normal text-navy">
            {t('result.hint')}: {loc(h, lang)}
          </p>
        ))
      ) : null}
    </div>
  );
}

/** The analyst's call on a link, with a comment. Stored apart from the computed score, with name and time. */
export function DecisionBox({ link, runId }: { link: LinkDto; runId: string }) {
  const { t, i18n } = useTranslation();
  const decide = useDecide(runId);
  const [analyst, setAnalyst] = useState(() => localStorage.getItem(ANALYST_KEY) ?? '');
  const [note, setNote] = useState(link.analystNote ?? '');
  const [missingName, setMissingName] = useState(false);
  const id = link.id;

  const submit = (decision: Decision | null) => {
    if (decision && !analyst.trim()) return setMissingName(true);
    setMissingName(false);
    if (analyst.trim()) localStorage.setItem(ANALYST_KEY, analyst.trim());
    decide.mutate({ linkId: link.id, decision, analyst: analyst.trim(), note: note.trim() });
  };

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`komentarz-${id}`} className="text-[13px] font-semibold">
          {t('decision.comment')}
        </label>
        <textarea id={`komentarz-${id}`} rows={2} maxLength={1000} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('decision.commentPlaceholder')} className={`${inputClass} min-h-0 resize-y py-2 text-[14px]`} />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`analityk-${id}`} className="text-[13px] font-semibold">
          {t('decision.analyst')}
        </label>
        <input id={`analityk-${id}`} className={inputClass} value={analyst} maxLength={100} onChange={(e) => setAnalyst(e.target.value)} placeholder={t('decision.analystPlaceholder')} aria-invalid={missingName} />
        {missingName && <span role="alert" className="font-semibold text-alert">{t('decision.analystRequired')}</span>}
      </div>
      <p className="m-0 border border-dashed border-shadow px-2.5 py-1.5 leading-normal" aria-live="polite">
        <b>{link.analystDecision ? t(`decision.state.${link.analystDecision}`) : t('decision.state.none')}</b>
        {link.analystDecision && (
          <>
            {' — '}
            {t('decision.by', { name: link.analystName, date: formatDateTime(link.decidedAt, i18n.language) })}
            {link.analystNote && <span className="block text-sub">„{link.analystNote}”</span>}
          </>
        )}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <BevelButton primary disabled={decide.isPending} onClick={() => submit('CONFIRMED')}>
          {t('decision.confirm')}
        </BevelButton>
        <BevelButton disabled={decide.isPending} onClick={() => submit('REJECTED')}>
          {t('decision.reject')}
        </BevelButton>
        {link.analystDecision && (
          <BevelButton disabled={decide.isPending} onClick={() => submit(null)}>
            {t('decision.withdraw')}
          </BevelButton>
        )}
      </div>
      {decide.isError && <ErrorNote title={t('decision.failed')} message={decide.error.message} />}
      {decide.isSuccess && !decide.isPending && <p role="status" className="m-0 font-semibold text-navy">{t('decision.saved')}</p>}
      <p className="m-0 text-[12px] leading-normal">{t('decision.note')}</p>
    </>
  );
}
