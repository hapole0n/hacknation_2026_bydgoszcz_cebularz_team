import { useTranslation } from 'react-i18next';
import type { EvidenceDto } from '@/api/types';
import { shortAddress } from '@/lib/format';

/** "Sugestia AI": what the optional local model thinks the context of an address is. Marked, dashed, and never part of the score. */
export function AiSuggestions({ evidence }: { evidence: EvidenceDto }) {
  const { t } = useTranslation();
  const list = evidence.metaJson.aiSuggestions ?? [];
  if (list.length === 0) return null;
  return (
    <ul className="mt-1 space-y-1 text-xs">
      {list.map((s) => (
        <li key={`${s.address}:${s.contextType}`}>
          <span className="rounded-sm border border-dashed px-1.5 py-0.5 font-medium">{t('evidence.aiSuggestion', { type: t(`contextTypes.${s.contextType}`, { defaultValue: s.contextType }) })}</span>{' '}
          <span className="text-muted-foreground">
            {shortAddress(s.address)} · {s.model} · {t('evidence.aiHint')}
          </span>
        </li>
      ))}
    </ul>
  );
}
