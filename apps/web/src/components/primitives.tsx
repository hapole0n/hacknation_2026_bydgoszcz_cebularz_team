import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import type { Band } from '@/api/types';
import { Button } from '@/components/ui/button';
import { BAND_STYLE } from '@/lib/bands';
import { cn } from '@/lib/utils';

/** A flat panel: a hairline border, no shadow. */
export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('rounded-lg border bg-card', className)}>{children}</section>;
}

export function SectionHeading({ title, note, kind, children }: { title: string; note?: string; kind?: 'fact' | 'calc'; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {(note || kind) && (
          <p className="mt-0.5 max-w-prose text-sm text-muted-foreground">
            {kind && <span className="font-medium text-foreground/80">{kind === 'fact' ? t('common.fact') : t('common.calc')}. </span>}
            {note}
          </p>
        )}
      </div>
      {children}
    </div>
  );
}

/** The score and its band: the colour is always accompanied by the band's name. */
export function BandChip({ band, score, className }: { band: Band; score?: number; className?: string }) {
  const { t } = useTranslation();
  const s = BAND_STYLE[band];
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-sm border px-2 py-0.5 text-xs font-medium', s.tint, s.border, s.text, className)}>
      {score !== undefined && <span className="font-semibold tabular-nums">{score}%</span>}
      {t(`bands.${band}`)}
    </span>
  );
}

export function CategoryBadge({ category }: { category: string }) {
  const { t } = useTranslation();
  return <span className="inline-block rounded-sm bg-secondary px-1.5 py-0.5 text-xs font-medium text-secondary-foreground">{t(`categories.${category}`, { defaultValue: category })}</span>;
}

export function Tag({ id }: { id: string }) {
  const { t } = useTranslation();
  return <span className="inline-block whitespace-nowrap rounded-sm border bg-background px-1.5 py-0.5 text-xs">{t(`tags.${id}`, { defaultValue: id })}</span>;
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed bg-card px-6 py-10 text-center">
      <p className="text-base font-medium">{title}</p>
      {children && <p className="mx-auto mt-1 max-w-prose text-sm text-muted-foreground">{children}</p>}
      {action && <div className="mt-4 flex justify-center gap-2">{action}</div>}
    </div>
  );
}

export function LoadState({ isPending, error, onRetry }: { isPending: boolean; error: Error | null; onRetry?: () => void }) {
  const { t } = useTranslation();
  if (isPending) return <p className="py-10 text-sm text-muted-foreground" role="status">{t('common.loading')}</p>;
  if (!error) return null;
  return (
    <div className="rounded-lg border border-destructive/40 bg-card p-4" role="alert">
      <p className="font-medium text-destructive">{t('common.loadError')}</p>
      <p className="mt-1 text-sm text-muted-foreground">{error.message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" className="mt-3" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      )}
    </div>
  );
}

export function ErrorNote({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-lg border border-destructive/40 bg-card p-3 text-sm" role="alert">
      <p className="font-medium text-destructive">{title}</p>
      <p className="mt-0.5 text-muted-foreground">{message}</p>
    </div>
  );
}

/** Pairs of label and value, the way a case file lists its particulars. */
export function Particulars({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-1.5 text-sm">
      {items.map((i) => (
        <div key={i.label} className="contents">
          <dt className="text-muted-foreground">{i.label}</dt>
          <dd className="min-w-0 break-words">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
