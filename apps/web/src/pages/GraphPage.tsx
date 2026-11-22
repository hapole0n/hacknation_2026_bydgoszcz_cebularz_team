import { useTranslation } from 'react-i18next';
import { useCase, useRun } from '@/api/client';
import { GraphView } from '@/components/GraphView';
import { Screen, type ShortcutItem } from '@/components/win/chrome';
import { BevelButton, BevelLink, LoadState, VtHeading } from '@/components/win/controls';
import { useShortcuts } from '@/lib/keys';
import { downloadPdf } from '@/lib/run';
import { openDialog } from '@/lib/ui';
import { addressPath, navigate } from '@/router';

/** "Graf powiązań" (F6): identifiers, sources, addresses and counterparties of one analysis. */
export function GraphPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const run = useRun(id);
  const kase = useCase(run.data?.run.caseId);
  const back = `/runs/${id}`;
  useShortcuts({ F7: () => downloadPdf(id), Esc: () => navigate(back) });
  const shortcuts: ShortcutItem[] = [
    { id: 'F1', label: t('keys.short.F1'), onClick: () => openDialog('help') },
    { id: 'F7', label: t('keys.short.F7'), onClick: () => downloadPdf(id) },
    { id: 'Esc', label: t('keys.short.back'), to: back },
  ];
  const signature = kase.data?.signature ?? '…';
  return (
    <Screen
      title={t('graph.windowTitle', { signature })}
      windowLabel={t('graph.taskbar')}
      runId={id}
      shortcuts={shortcuts}
      status={t('graph.status')}
      toolbar={
        <>
          <BevelLink to={back}>← Esc · {t('address.backToResult')}</BevelLink>
          <BevelButton primary onClick={() => downloadPdf(id)}>F7 · {t('keys.short.F7')}</BevelButton>
        </>
      }
    >
      <VtHeading>&gt; {t('graph.title')}</VtHeading>
      {!run.data ? (
        <LoadState pending={run.isPending} error={run.error} onRetry={() => void run.refetch()} retryLabel={t('common.retry')} loadingLabel={t('common.loading')} errorLabel={t('common.loadError')} />
      ) : (
        <GraphView results={run.data} onOpenAddress={(key) => { const [chain, ...rest] = key.split(':'); navigate(addressPath(id, chain!, rest.join(':'))); }} />
      )}
    </Screen>
  );
}
