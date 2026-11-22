import { useTranslation } from 'react-i18next';
import { useMarkNotificationsRead, useNotifications } from '@/api/client';
import { Screen, type ShortcutItem } from '@/components/win/chrome';
import { BevelButton, EmptyState, GroupBox, LoadState, VtHeading } from '@/components/win/controls';
import { formatDateTime } from '@/lib/format';
import { notificationText } from '@/lib/notifications';
import { useShortcuts } from '@/lib/keys';
import { openDialog } from '@/lib/ui';
import { cn } from '@/lib/utils';
import { navigate } from '@/router';

/** "Powiadomienia" (F9): in-app notifications — a new address, a changed address, a threshold, a cash-out signal. Nothing is sent outside. */
export function NotificationsPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const q = useNotifications();
  const markRead = useMarkNotificationsRead();
  const unread = q.data?.unread ?? 0;
  useShortcuts({ Esc: () => navigate('/cases') });
  const shortcuts: ShortcutItem[] = [
    { id: 'F1', label: t('keys.short.F1'), onClick: () => openDialog('help') },
    { id: 'F2', label: t('keys.short.F2'), to: '/' },
    { id: 'F4', label: t('keys.short.F4'), to: '/cases' },
    { id: 'F9', label: t('keys.short.F9'), to: '/notifications' },
    { id: 'Esc', label: t('keys.short.Esc'), to: '/cases' },
  ];
  return (
    <Screen
      title={t('notifications.title')}
      windowLabel={t('notifications.title')}
      shortcuts={shortcuts}
      status={t('notifications.status', { count: unread })}
      toolbar={
        <>
          <BevelButton onClick={() => navigate('/')}>F2 · {t('keys.short.F2')}</BevelButton>
          <BevelButton onClick={() => navigate('/cases')}>F4 · {t('keys.short.F4')}</BevelButton>
          <BevelButton disabled={unread === 0 || markRead.isPending} onClick={() => markRead.mutate(undefined)}>
            {t('notifications.markAll')}
          </BevelButton>
        </>
      }
    >
      <div className="flex flex-col gap-2.5">
        <VtHeading>&gt; {t('notifications.title')}</VtHeading>
        <p className="m-0 max-w-[800px] text-[15px] leading-relaxed">{t('notifications.lead')}</p>
      </div>
      {!q.data ? (
        <LoadState pending={q.isPending} error={q.error} onRetry={() => void q.refetch()} retryLabel={t('common.retry')} loadingLabel={t('common.loading')} errorLabel={t('common.loadError')} />
      ) : q.data.items.length === 0 ? (
        <EmptyState title={t('notifications.empty')} />
      ) : (
        <GroupBox id="lista-powiadomien" title={t('notifications.list', { count: q.data.items.length })}>
          <ul className="sunken m-0 list-none p-0">
            {q.data.items.map((n) => (
              <li key={n.id} className="border-b border-dashed border-rule last:border-b-0">
                <button
                  type="button"
                  className={cn('block min-h-[44px] w-full cursor-pointer px-3.5 py-2.5 text-left font-[inherit] text-[14px] hover:bg-face', !n.readAt && 'bg-[#e7e9f4]')}
                  onClick={() => {
                    if (!n.readAt) markRead.mutate([n.id]);
                    navigate(n.runId ? `/runs/${n.runId}` : `/cases/${n.caseId}`);
                  }}
                >
                  <span className={cn('block', !n.readAt && 'font-semibold')}>
                    {!n.readAt && <span className="mr-2 bg-navy px-1.5 text-[12px] font-bold text-white">{t('notifications.new')}</span>}
                    {notificationText(t, lang, n)}
                  </span>
                  <span className="mt-0.5 block text-[12px] text-sub">
                    {n.caseTitle ?? '—'} · {formatDateTime(n.createdAt, lang)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </GroupBox>
      )}
    </Screen>
  );
}
