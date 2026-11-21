import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { APP_NAME } from '@/config/app';
import { LANGUAGES } from '@/i18n';
import { CasePage } from '@/pages/CasePage';
import { CasesPage } from '@/pages/CasesPage';
import { NewCasePage } from '@/pages/NewCasePage';
import { ReportPage } from '@/pages/ReportPage';
import { RunPage } from '@/pages/RunPage';
import { Link, matchPath, usePath } from '@/router';
import { cn } from '@/lib/utils';

export function App() {
  const { t, i18n } = useTranslation();
  const path = usePath();
  const match = matchPath(path);

  const nav = [
    { to: '/', label: t('app.navCases'), active: match.page === 'cases' || match.page === 'case' || match.page === 'run' || match.page === 'report' },
    { to: '/cases/new', label: t('app.navNew'), active: match.page === 'new' },
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b bg-card print:hidden">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-8 gap-y-2 px-6 py-3">
          <Link to="/" className="flex items-baseline gap-3">
            <span className="font-serif text-2xl font-semibold">{APP_NAME}</span>
            <span className="hidden text-sm text-muted-foreground md:inline">{t('app.subtitle')}</span>
          </Link>
          <div className="flex items-center gap-6">
            <nav aria-label="Menu" className="flex gap-5 text-sm">
              {nav.map((n) => (
                <Link key={n.to} to={n.to} aria-current={n.active ? 'page' : undefined} className={cn('border-b-2 py-1 font-medium', n.active ? 'border-steel text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="flex items-center gap-1" role="group" aria-label={t('app.language')}>
              {LANGUAGES.map((lng) => (
                <Button key={lng} size="sm" variant={i18n.language === lng ? 'default' : 'outline'} onClick={() => i18n.changeLanguage(lng)} aria-pressed={i18n.language === lng}>
                  {lng.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-8">
        {match.page === 'cases' && <CasesPage />}
        {match.page === 'new' && <NewCasePage />}
        {match.page === 'case' && <CasePage key={match.id} id={match.id!} />}
        {match.page === 'run' && <RunPage key={match.id} id={match.id!} />}
        {match.page === 'report' && <ReportPage key={match.id} id={match.id!} />}
        {match.page === 'notFound' && (
          <div className="py-16">
            <h1 className="font-serif text-3xl font-semibold">{t('app.notFound')}</h1>
            <p className="mt-2 text-muted-foreground">{t('app.notFoundBody')}</p>
            <Link to="/" className="mt-4 inline-block text-steel underline underline-offset-2">{t('app.navCases')}</Link>
          </div>
        )}
      </main>

      <footer className="border-t bg-card">
        <p className="mx-auto max-w-7xl px-6 py-3 text-xs text-muted-foreground">{t('app.footer')}</p>
      </footer>
    </div>
  );
}
