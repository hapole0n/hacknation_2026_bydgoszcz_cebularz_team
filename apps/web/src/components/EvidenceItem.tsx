import { useTranslation } from 'react-i18next';
import type { EvidenceDto } from '@/api/types';
import { AiSuggestions } from '@/components/AiSuggestions';
import { formatDateTime, shortHash } from '@/lib/format';

/** One piece of evidence: where it came from, when, the hash of its full content, and the stored snippet. */
export function EvidenceItem({ evidence, context }: { evidence: EvidenceDto; context?: string }) {
  const { t, i18n } = useTranslation();
  const m = evidence.metaJson;
  return (
    <div className="space-y-1 text-sm">
      <p className="font-medium">
        {m.platform} <span className="font-normal text-muted-foreground">({t(`sourceTypes.${evidence.sourceType}`, { defaultValue: evidence.sourceType })})</span>
      </p>
      {evidence.url && (
        <p className="break-all">
          <a href={evidence.url} target="_blank" rel="noopener noreferrer" className="text-steel underline underline-offset-2">
            {evidence.url}
          </a>
        </p>
      )}
      <p className="text-muted-foreground">
        {t('evidence.columns.fetched')}: {formatDateTime(evidence.fetchedAt, i18n.language)}
        {m.publishedAt && ` — ${t('evidence.columns.published')}: ${m.publishedAt}`}
        {m.author && ` — ${t('evidence.author')}: ${m.author.handle ?? m.author.name}`}
      </p>
      <p className="text-muted-foreground" title={evidence.sha256}>
        SHA-256: {shortHash(evidence.sha256)}
      </p>
      <blockquote className="whitespace-pre-wrap break-words border-l-2 pl-3 text-foreground/90">{context ?? evidence.snippet}</blockquote>
      <AiSuggestions evidence={evidence} />
    </div>
  );
}
