import type { TFunction } from 'i18next';
import { formatDateTime, shortAddress } from '@/lib/format';

export interface NotificationDto {
  id: string;
  caseId: string;
  caseTitle: string | null;
  runId: string | null;
  kind: string;
  params: Record<string, string | number>;
  createdAt: string;
  readAt: string | null;
}

/** Notifications are `kind` + `params` (codes from the backend); the sentence lives in i18n `notifications.<kind>`. */
export function notificationText(t: TFunction, lang: string, n: Pick<NotificationDto, 'kind' | 'params'>): string {
  const p = n.params;
  const shortList = (v: unknown) => String(v ?? '').split(',').map((a) => shortAddress(a.trim())).join(', ');
  return t(`notifications.${n.kind}`, {
    defaultValue: n.kind,
    chain: p.chain,
    address: shortAddress(String(p.address ?? '')),
    score: p.score,
    platform: p.platform,
    from: shortList(p.from),
    to: shortList(p.to),
    thresholdEur: new Intl.NumberFormat(lang === 'en' ? 'en-GB' : 'pl-PL').format(Number(p.thresholdEur ?? 0)),
    at: typeof p.at === 'string' ? formatDateTime(p.at, lang) : '',
    tags: String(p.tags ?? '')
      .split(',')
      .filter(Boolean)
      .map((tag) => t(`tags.${tag}`, { defaultValue: tag }))
      .join(', '),
  });
}
