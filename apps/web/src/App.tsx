import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { go } from '@/components/win/chrome';
import { AddressPage } from '@/pages/AddressPage';
import { AuditPage } from '@/pages/AuditPage';
import { CasePage } from '@/pages/CasePage';
import { CasesPage } from '@/pages/CasesPage';
import { GraphPage } from '@/pages/GraphPage';
import { NewCasePage } from '@/pages/NewCasePage';
import { NotificationsPage } from '@/pages/NotificationsPage';
import { ReportPage } from '@/pages/ReportPage';
import { RunPage } from '@/pages/RunPage';
import { installGlobalKeys } from '@/lib/keys';
import { openDialog } from '@/lib/ui';
import { Link, matchPath, usePath } from '@/router';
import { Screen } from '@/components/win/chrome';
import { VtHeading } from '@/components/win/controls';

export function App() {
  const { t } = useTranslation();
  const path = usePath();
  const match = matchPath(path);

  // F-keys that mean the same everywhere; a screen's own handler (F5 re-run, F6 graph, F7 report, Esc back …) takes precedence.
  useEffect(
    () =>
      installGlobalKeys(
        { F1: () => openDialog('help'), F2: go('/'), F4: go('/cases'), F8: go('/audit'), F9: go('/notifications'), F10: () => openDialog('settings') },
        (f, alt) => t('keys.taken', { key: f, alt }),
      ),
    [t],
  );

  return (
    <>
      {match.page === 'new' && <NewCasePage />}
      {match.page === 'cases' && <CasesPage />}
      {match.page === 'audit' && <AuditPage />}
      {match.page === 'notifications' && <NotificationsPage />}
      {match.page === 'case' && <CasePage key={match.id} id={match.id!} />}
      {match.page === 'run' && <RunPage key={match.id} id={match.id!} />}
      {match.page === 'address' && <AddressPage key={`${match.id}:${match.chain}:${match.address}`} runId={match.id!} chain={match.chain!} address={match.address!} />}
      {match.page === 'graph' && <GraphPage key={match.id} id={match.id!} />}
      {match.page === 'report' && <ReportPage key={match.id} id={match.id!} />}
      {match.page === 'notFound' && (
        <Screen title={t('app.notFound')} windowLabel={t('app.notFound')} shortcuts={[{ id: 'F2', label: t('keys.short.F2'), to: '/' }]}>
          <VtHeading>&gt; {t('app.notFound')}</VtHeading>
          <p className="m-0 text-[15px]">{t('app.notFoundBody')}</p>
          <Link to="/cases" className="inline-flex min-h-[44px] items-center font-semibold">{t('keys.short.F4')}</Link>
        </Screen>
      )}
    </>
  );
}
