import { useTranslation } from 'react-i18next';
import { useChainAdapters, useConnectors, type RunOptions } from '@/api/client';
import type { ChainMode } from '@/api/types';
import { CheckField, GroupBox } from '@/components/win/controls';
import { noteText } from '@/lib/notes';

export const DEFAULT_RUN_OPTIONS: RunOptions = { connectors: ['sandbox'], chain: 'fixture' };
const CHAIN_MODES: ChainMode[] = ['fixture', 'live', 'off'];

/** The source that answers with synthetic data (the demo "mini-internet"); every other connector asks a real public service. */
export const SYNTHETIC_SOURCE = 'sandbox';

/** Which sources to search (the synthetic sandbox by default, live ones deliberately) and which blockchain data to use. */
export function SourcePicker({ value, onChange }: { value: RunOptions; onChange: (v: RunOptions) => void }) {
  const { t } = useTranslation();
  const connectors = useConnectors();
  const adapters = useChainAdapters();
  const toggle = (id: string, on: boolean) => onChange({ ...value, connectors: on ? [...value.connectors, id] : value.connectors.filter((c) => c !== id) });

  return (
    <div className="flex flex-col gap-[22px]">
      <GroupBox id="src-sources" title={t('form.sources')}>
        <p className="m-0 mb-2 max-w-[80ch] text-[13px] leading-relaxed">{t('form.sourcesHint')}</p>
        <ul className="sunken m-0 list-none p-0">
          {(connectors.data ?? []).map((c) => {
            const live = c.policy.method !== 'synthetic';
            return (
              <li key={c.id} className="border-b border-dashed border-rule px-3 py-1 last:border-b-0">
                <CheckField id={`src-${c.id}`} checked={value.connectors.includes(c.id)} onChange={(v) => toggle(c.id, v)}>
                  <span className="font-semibold">{t(`form.connectorNames.${c.id}`, { defaultValue: c.id })}</span>
                  {live && <span className="font-semibold text-navy">[ {t('form.liveTag')} ]</span>}
                </CheckField>
                <p className="m-0 pl-7 text-[13px] leading-relaxed text-sub">
                  {t(`form.connectorNotes.${c.id}`, { defaultValue: '' })} {t(`form.methods.${c.policy.method}`)}; {c.policy.rateLimitPerSec > 0 ? t('form.rate', { count: c.policy.rateLimitPerSec }) : t('form.noRateLimit')};{' '}
                  <a href={c.policy.tosUrl} target="_blank" rel="noopener noreferrer">
                    {t('form.terms')}
                  </a>
                </p>
              </li>
            );
          })}
        </ul>
      </GroupBox>

      <GroupBox id="src-chain" title={t('form.chainTitle')}>
        <div className="flex flex-col">
          {CHAIN_MODES.map((m) => (
            <label key={m} className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[14px]">
              <input type="radio" name="chain-mode" className="m-0 size-[18px] accent-navy" checked={value.chain === m} onChange={() => onChange({ ...value, chain: m })} />
              <span>{t(`form.chain.${m}`)}</span>
            </label>
          ))}
        </div>
        {value.chain === 'live' && (
          <div className="sunken mt-2 px-3 py-2 text-[13px] leading-relaxed">
            <p className="m-0">{t('form.chainLiveNote')}</p>
            <ul className="m-0 mt-1.5 list-none p-0">
              {(adapters.data ?? []).filter((a) => a.live).map((a) => (
                <li key={a.id}>
                  <b>{a.id}</b>: {a.available ? t('form.adapterReady') : t('form.adapterUnavailable', { reason: a.reason ? noteText(t, a.reason) : '' })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </GroupBox>
    </div>
  );
}
