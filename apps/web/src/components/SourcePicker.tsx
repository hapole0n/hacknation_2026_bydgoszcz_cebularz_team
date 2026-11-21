import { useTranslation } from 'react-i18next';
import { useChainAdapters, useConnectors, type RunOptions } from '@/api/client';
import { noteText } from '@/lib/notes';
import type { ChainMode } from '@/api/types';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

export const DEFAULT_RUN_OPTIONS: RunOptions = { connectors: ['sandbox'], chain: 'fixture' };
const CHAIN_MODES: ChainMode[] = ['fixture', 'live', 'off'];

/** Which sources to search (the synthetic sandbox by default, live ones deliberately) and which blockchain data to use. */
export function SourcePicker({ value, onChange }: { value: RunOptions; onChange: (v: RunOptions) => void }) {
  const { t } = useTranslation();
  const connectors = useConnectors();
  const adapters = useChainAdapters();
  const toggle = (id: string, on: boolean) => onChange({ ...value, connectors: on ? [...value.connectors, id] : value.connectors.filter((c) => c !== id) });

  return (
    <div className="space-y-6">
      <fieldset>
        <legend className="text-sm font-semibold">{t('form.sources')}</legend>
        <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">{t('form.sourcesHint')}</p>
        <ul className="mt-3 divide-y rounded-lg border bg-card">
          {(connectors.data ?? []).map((c) => {
            const live = c.policy.method !== 'synthetic';
            const checked = value.connectors.includes(c.id);
            return (
              <li key={c.id} className={cn('flex gap-3 p-3', live && 'border-l-4 border-l-band-medium')}>
                <Checkbox id={`src-${c.id}`} checked={checked} onCheckedChange={(v) => toggle(c.id, v === true)} className="mt-0.5" />
                <div className="min-w-0 flex-1">
                  <Label htmlFor={`src-${c.id}`} className="text-sm font-medium">
                    {t(`form.connectorNames.${c.id}`, { defaultValue: c.id })}
                  </Label>
                  <p className="mt-0.5 text-sm text-muted-foreground">{t(`form.connectorNotes.${c.id}`, { defaultValue: '' })}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t(`form.methods.${c.policy.method}`)}
                    {'; '}
                    {c.policy.rateLimitPerSec > 0 ? t('form.rate', { count: c.policy.rateLimitPerSec }) : t('form.noRateLimit')}
                    {'; '}
                    <a href={c.policy.tosUrl} target="_blank" rel="noopener noreferrer" className="text-steel underline underline-offset-2">
                      {t('form.terms')}
                    </a>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <fieldset>
        <legend className="text-sm font-semibold">{t('form.chainTitle')}</legend>
        <div className="mt-2 space-y-2">
          {CHAIN_MODES.map((m) => (
            <label key={m} className="flex cursor-pointer items-start gap-2 text-sm">
              <input type="radio" name="chain-mode" className="mt-1 accent-[var(--steel)]" checked={value.chain === m} onChange={() => onChange({ ...value, chain: m })} />
              <span>{t(`form.chain.${m}`)}</span>
            </label>
          ))}
        </div>
        {value.chain === 'live' && (
          <div className="mt-3 rounded-lg border border-l-4 border-l-band-medium bg-card p-3 text-sm">
            <p className="text-muted-foreground">{t('form.chainLiveNote')}</p>
            <ul className="mt-2 space-y-0.5">
              {(adapters.data ?? []).filter((a) => a.live).map((a) => (
                <li key={a.id}>
                  <span className="font-medium">{a.id}</span>: {a.available ? t('form.adapterReady') : t('form.adapterUnavailable', { reason: a.reason ? noteText(t, a.reason) : '' })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </fieldset>
    </div>
  );
}
