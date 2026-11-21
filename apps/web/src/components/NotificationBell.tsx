import { Bell } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useMarkNotificationsRead, useNotifications } from '@/api/client';
import { Button } from '@/components/ui/button';
import { formatDateTime } from '@/lib/format';
import { notificationText } from '@/lib/notifications';
import { cn } from '@/lib/utils';
import { navigate } from '@/router';

/** The bell in the header: in-app notifications (a new address, a changed address, a threshold, a cash-out signal). */
export function NotificationBell() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const { data } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', away);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', away);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);

  return (
    <div className="relative" ref={box}>
      <Button
        variant="outline"
        size="icon"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.bell')}
        onClick={() => setOpen((v) => !v)}
        className="relative"
      >
        <Bell className="size-4" aria-hidden />
        {unread > 0 && (
          <span className="absolute -right-1.5 -top-1.5 min-w-4 rounded-full bg-destructive px-1 text-center text-[10px] font-semibold leading-4 tabular-nums text-white">{unread > 99 ? '99+' : unread}</span>
        )}
      </Button>

      {open && (
        <div role="region" aria-label={t('notifications.title')} className="absolute right-0 z-30 mt-2 w-[26rem] max-w-[calc(100vw-2rem)] rounded-lg border bg-card shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b px-4 py-2.5">
            <h2 className="text-sm font-semibold">{t('notifications.title')}</h2>
            <Button variant="ghost" size="sm" disabled={unread === 0 || markRead.isPending} onClick={() => markRead.mutate(undefined)}>
              {t('notifications.markAll')}
            </Button>
          </div>
          {!data || data.items.length === 0 ? (
            <p className="px-4 py-6 text-sm text-muted-foreground">{t('notifications.empty')}</p>
          ) : (
            <ul className="max-h-96 divide-y overflow-y-auto">
              {data.items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    className={cn('block w-full px-4 py-3 text-left text-sm hover:bg-secondary/60', !n.readAt && 'bg-band-medium/10')}
                    onClick={() => {
                      if (!n.readAt) markRead.mutate([n.id]);
                      setOpen(false);
                      navigate(n.runId ? `/runs/${n.runId}` : `/cases/${n.caseId}`);
                    }}
                  >
                    <span className={cn('block', !n.readAt && 'font-medium')}>{notificationText(t, lang, n)}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {n.caseTitle ?? '—'} · {formatDateTime(n.createdAt, lang)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
