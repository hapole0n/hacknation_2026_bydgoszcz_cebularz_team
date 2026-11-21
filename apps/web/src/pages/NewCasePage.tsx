import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateCase, useStartRun } from '@/api/client';
import { IDENTIFIER_TYPES, type IdentifierType } from '@/api/types';
import { ErrorNote } from '@/components/primitives';
import { DEFAULT_RUN_OPTIONS, SourcePicker } from '@/components/SourcePicker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { navigate } from '@/router';

interface Row {
  key: number;
  type: IdentifierType;
  value: string;
}

let nextKey = 1;
const blank = (type: IdentifierType = 'NICK'): Row => ({ key: nextKey++, type, value: '' });

export function NewCasePage() {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const [rows, setRows] = useState<Row[]>(() => [blank('NICK')]);
  const [options, setOptions] = useState(DEFAULT_RUN_OPTIONS);
  const [problem, setProblem] = useState<string | null>(null);
  const createCase = useCreateCase();
  const startRun = useStartRun();
  const busy = createCase.isPending || startRun.isPending;

  const update = (key: number, patch: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  async function submit(run: boolean) {
    const identifiers = rows.filter((r) => r.value.trim()).map((r) => ({ type: r.type, value: r.value.trim() }));
    if (!title.trim()) return setProblem(t('form.errors.title'));
    if (identifiers.length === 0) return setProblem(t('form.errors.identifiers'));
    if (run && options.connectors.length === 0) return setProblem(t('form.errors.connectors'));
    setProblem(null);
    try {
      const kase = await createCase.mutateAsync({ title: title.trim(), identifiers });
      if (!run) return navigate(`/cases/${kase.id}`);
      const result = await startRun.mutateAsync({ caseId: kase.id, options });
      navigate(`/runs/${result.run.id}`);
    } catch {
      /* shown below from the mutation state */
    }
  }

  const serverError = createCase.error ?? startRun.error;

  return (
    <form
      className="mx-auto max-w-3xl space-y-8"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(true);
      }}
      noValidate
    >
      <div>
        <h1 className="font-serif text-3xl font-semibold">{t('form.title')}</h1>
        <p className="mt-1 max-w-prose text-muted-foreground">{t('form.lead')}</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="case-title">{t('form.caseTitle')}</Label>
        <Input id="case-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={t('form.caseTitlePlaceholder')} maxLength={200} />
      </div>

      <fieldset className="space-y-3">
        <legend className="text-sm font-semibold">{t('form.identifiers')}</legend>
        <p className="max-w-prose text-sm text-muted-foreground">{t('form.identifiersHint')}</p>
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.key} className="rounded-lg border bg-card p-3">
              <div className="grid gap-3 sm:grid-cols-[15rem_1fr_auto] sm:items-end">
                <div className="space-y-1.5">
                  <Label htmlFor={`type-${r.key}`}>{t('form.type')}</Label>
                  <select
                    id={`type-${r.key}`}
                    value={r.type}
                    onChange={(e) => update(r.key, { type: e.target.value as IdentifierType })}
                    className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
                  >
                    {IDENTIFIER_TYPES.map((ty) => (
                      <option key={ty} value={ty}>{t(`identifierTypes.${ty}`)}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor={`value-${r.key}`}>{t('form.value')}</Label>
                  <Input id={`value-${r.key}`} value={r.value} onChange={(e) => update(r.key, { value: e.target.value })} placeholder={t(`identifierPlaceholders.${r.type}`)} maxLength={300} />
                </div>
                <Button type="button" variant="ghost" size="sm" onClick={() => setRows((rs) => rs.filter((x) => x.key !== r.key))} disabled={rows.length === 1} aria-label={`${t('form.remove')} ${i + 1}`}>
                  {t('form.remove')}
                </Button>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">{t(`identifierHints.${r.type}`)}</p>
            </li>
          ))}
        </ul>
        <Button type="button" variant="outline" size="sm" onClick={() => setRows((rs) => [...rs, blank('EMAIL')])}>{t('form.addIdentifier')}</Button>
      </fieldset>

      <SourcePicker value={options} onChange={setOptions} />

      {problem && <ErrorNote title={problem} message="" />}
      {serverError && <ErrorNote title={t('form.errors.server')} message={serverError.message} />}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy}>{busy ? t('form.running') : t('form.submitRun')}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void submit(false)}>{t('form.submitSave')}</Button>
      </div>
    </form>
  );
}
