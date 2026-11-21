import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useDecide } from '@/api/client';
import type { Decision, EvidenceDto, LinkDto, ScoreResult } from '@/api/types';
import { BandChip, ErrorNote } from '@/components/primitives';
import { EvidenceItem } from '@/components/EvidenceItem';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { formatDateTime, loc, shortAddress, signed } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * The score as an itemised statement, the way a tax assessment is laid out: every rule on its own line with its
 * reason, its points and the evidence behind it, the total under a double rule. Nothing in the number is hidden.
 */
export function ScoreLedger({
  entries,
  total,
  band,
  rulesVersion,
  evidence,
  hints,
  heading,
}: {
  entries: ScoreResult['breakdown'];
  total: number;
  band: LinkDto['band'];
  rulesVersion: string;
  evidence: Map<string, EvidenceDto>;
  hints?: { pl: string; en: string }[];
  heading?: React.ReactNode;
}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          {heading}
          <p className="font-serif text-6xl font-semibold leading-none tabular-nums">
            {total}
            <span className="text-3xl text-muted-foreground">%</span>
          </p>
        </div>
        <BandChip band={band} className="text-sm" />
      </div>

      <table className="mt-5 w-full text-sm">
        <caption className="sr-only">{t('score.title')}</caption>
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th scope="col" className="py-1.5 pr-3 font-medium">{t('score.columns.rule')}</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">{t('score.columns.reason')}</th>
            <th scope="col" className="py-1.5 text-right font-medium">{t('score.columns.points')}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e, i) => (
            <tr key={`${e.ruleId}-${i}`} className="border-b align-top last:border-b-0">
              <td className="py-2 pr-3">
                <span className="block font-medium">{t(`score.kinds.${e.kind}`)}</span>
                <span className="block break-all text-xs text-muted-foreground">{e.ruleId}</span>
              </td>
              <td className="py-2 pr-3">
                <span className="block">{lang === 'en' ? e.reasonEn : e.reasonPl}</span>
                {e.kind === 'chain' && <span className="block text-xs text-muted-foreground">{t('score.noEvidence')}</span>}
                {e.evidenceIds.length > 0 && (
                  <details className="mt-1">
                    <summary className="cursor-pointer text-xs text-steel underline underline-offset-2">{t('score.evidenceCount', { count: e.evidenceIds.length })}</summary>
                    <ul className="mt-2 space-y-3 border-l pl-3">
                      {e.evidenceIds.map((id) => {
                        const ev = evidence.get(id);
                        return ev && <li key={id}><EvidenceItem evidence={ev} /></li>;
                      })}
                    </ul>
                  </details>
                )}
              </td>
              <td className={cn('py-2 text-right text-base font-semibold tabular-nums', e.delta > 0 && 'text-band-very-high', e.delta < 0 && 'text-destructive')}>{signed(e.delta)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="ledger-total">
            <th scope="row" colSpan={2} className="pt-3 text-left">
              <span className="block text-base font-semibold">{t('score.total')}</span>
              <span className="block text-xs font-normal text-muted-foreground">{t('score.calculated')}, {t('score.rulesVersion', { version: rulesVersion })}</span>
            </th>
            <td className="pt-3 text-right font-serif text-3xl font-semibold tabular-nums">{total}%</td>
          </tr>
        </tfoot>
      </table>

      <div className="mt-5">
        <h4 className="text-sm font-semibold">{t('score.hints')}</h4>
        {hints && hints.length > 0 ? (
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm">
            {hints.map((h) => (
              <li key={h.pl}>{loc(h, lang)}</li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted-foreground">{t('score.noHints')}</p>
        )}
      </div>
    </div>
  );
}

const ANALYST_KEY = 'kropka.analyst';

/** The analyst's call on a link. Stored apart from the computed score, with name and time. */
export function DecisionForm({ link, runId }: { link: LinkDto; runId: string }) {
  const { t, i18n } = useTranslation();
  const decide = useDecide(runId);
  const [analyst, setAnalyst] = useState(() => localStorage.getItem(ANALYST_KEY) ?? '');
  const [note, setNote] = useState(link.analystNote ?? '');
  const [missingName, setMissingName] = useState(false);

  const submit = (decision: Decision | null) => {
    if (decision && !analyst.trim()) return setMissingName(true);
    setMissingName(false);
    if (analyst.trim()) localStorage.setItem(ANALYST_KEY, analyst.trim());
    decide.mutate({ linkId: link.id, decision, analyst: analyst.trim(), note: note.trim() });
  };

  return (
    <div className="space-y-3 border-t pt-4">
      <div>
        <h4 className="text-sm font-semibold">{t('decision.title')}</h4>
        <p className="text-sm text-muted-foreground">{t('decision.note')}</p>
      </div>

      <p className="rounded-sm bg-muted px-3 py-2 text-sm" aria-live="polite">
        <span className="font-medium">{link.analystDecision ? t(`decision.state.${link.analystDecision}`) : t('decision.state.none')}</span>
        {link.analystDecision && (
          <>
            {' — '}
            {t('decision.by', { name: link.analystName, date: formatDateTime(link.decidedAt, i18n.language) })}
            {link.analystNote && <span className="mt-1 block text-muted-foreground">„{link.analystNote}”</span>}
          </>
        )}
      </p>

      <div className="grid gap-3 sm:grid-cols-[14rem_1fr]">
        <div className="space-y-1.5">
          <Label htmlFor={`analyst-${link.id}`}>{t('decision.analyst')}</Label>
          <Input id={`analyst-${link.id}`} value={analyst} onChange={(e) => setAnalyst(e.target.value)} placeholder={t('decision.analystPlaceholder')} aria-invalid={missingName} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`note-${link.id}`}>{t('decision.comment')}</Label>
          <Textarea id={`note-${link.id}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder={t('decision.commentPlaceholder')} rows={2} maxLength={1000} />
        </div>
      </div>
      {missingName && <p className="text-sm text-destructive" role="alert">{t('decision.analystRequired')}</p>}

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => submit('CONFIRMED')} disabled={decide.isPending}>{t('decision.confirm')}</Button>
        <Button size="sm" variant="outline" onClick={() => submit('REJECTED')} disabled={decide.isPending}>{t('decision.reject')}</Button>
        {link.analystDecision && <Button size="sm" variant="ghost" onClick={() => submit(null)} disabled={decide.isPending}>{t('decision.withdraw')}</Button>}
      </div>
      {decide.isError && <ErrorNote title={t('decision.failed')} message={decide.error.message} />}
      {decide.isSuccess && !decide.isPending && <p className="text-sm text-band-very-high" role="status">{t('decision.saved')}</p>}
    </div>
  );
}

/** Heading of a link's ledger: which address, which identifier. */
export function LinkHeading({ link }: { link: LinkDto }) {
  const { t } = useTranslation();
  return (
    <p className="mb-1 text-sm text-muted-foreground">
      {t('score.for')}: <span className="font-medium text-foreground">{shortAddress(link.address.address, 10, 6)}</span> ({link.address.chain}), {t('score.mentionedBy').toLowerCase()}:{' '}
      <span className="font-medium text-foreground">{t(`identifierTypes.${link.identifier.type}`)}, {link.identifier.value}</span>
    </p>
  );
}
